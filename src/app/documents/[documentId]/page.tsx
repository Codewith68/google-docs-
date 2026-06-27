import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { Document } from "./document";

interface DocumentIdPageProps {
  params: Promise<{ documentId: string }>;
}

const DocumentIdPage = async ({ params }: DocumentIdPageProps) => {
  const { documentId } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch document from PostgreSQL
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      initialContent: true,
      ownerId: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, avatar: true } },
      collaborators: {
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    },
  });

  if (!document) {
    redirect("/");
  }

  // Check access
  const isOwner = document.ownerId === userId;
  const collaborator = document.collaborators.find(
    (c) => c.user.id === userId
  );

  if (!isOwner && !collaborator && !document.organizationId) {
    redirect("/");
  }

  // Determine role
  let role: "OWNER" | "EDITOR" | "VIEWER" = "VIEWER";
  if (isOwner) role = "OWNER";
  else if (collaborator) role = collaborator.role as "EDITOR" | "VIEWER";
  else if (document.organizationId) role = "EDITOR";

  // Get current user info
  const user = await currentUser();
  const userName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "Anonymous";
  const nameHash = userName
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = Math.abs(nameHash) % 360;
  const userColor = `hsl(${hue}, 80%, 60%)`;

  return (
    <Document
      document={{
        id: document.id,
        title: document.title,
        initialContent: document.initialContent,
        ownerId: document.ownerId,
        organizationId: document.organizationId,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        owner: document.owner,
        collaborators: document.collaborators,
      }}
      userName={userName}
      userColor={userColor}
      role={role}
    />
  );
};

export default DocumentIdPage;
