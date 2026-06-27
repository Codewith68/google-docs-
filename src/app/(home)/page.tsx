import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { Navbar } from "./navbar";
import { DocumentsTable } from "./documents-table";
import { TemplatesGallery } from "./templates-gallery";

interface HomeProps {
  searchParams: Promise<{ search?: string }>;
}

const Home = async ({ searchParams }: HomeProps) => {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Ensure user exists in our DB
  await prisma.user.upsert({
    where: { id: userId },
    update: {
      name: (sessionClaims as Record<string, string>)?.name || "Anonymous",
      avatar: (sessionClaims as Record<string, string>)?.image_url || null,
    },
    create: {
      id: userId,
      email: (sessionClaims as Record<string, string>)?.email || `${userId}@user.local`,
      name: (sessionClaims as Record<string, string>)?.name || "Anonymous",
      avatar: (sessionClaims as Record<string, string>)?.image_url || null,
    },
  });

  const { search } = await searchParams;
  const orgId = (sessionClaims as Record<string, string | undefined>)?.org_id;

  const whereClause = search
    ? {
        AND: [
          {
            OR: [
              { ownerId: userId },
              { collaborators: { some: { userId } } },
              ...(orgId ? [{ organizationId: orgId }] : []),
            ],
          },
          { title: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId } } },
          ...(orgId ? [{ organizationId: orgId }] : []),
        ],
      };

  const documents = await prisma.document.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      ownerId: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { name: true, avatar: true } },
    },
    take: 50,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-10 h-16 bg-white p-4">
        <Navbar />
      </div>
      <div className="mt-16">
        <TemplatesGallery />
        <DocumentsTable documents={documents} />
      </div>
    </div>
  );
};

export default Home;
