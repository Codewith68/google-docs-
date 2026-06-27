"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  createDocumentSchema,
  updateDocumentSchema,
  addCollaboratorSchema,
  updateCollaboratorRoleSchema,
  createVersionSchema,
} from "@/lib/validators/document";

// ─── Helper: Get authenticated user ID ────────────────────────────────

async function getAuthUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ─── Helper: Check document access ────────────────────────────────────

async function checkAccess(
  documentId: string,
  userId: string,
  requiredRole: ("OWNER" | "EDITOR" | "VIEWER")[] = ["OWNER", "EDITOR", "VIEWER"]
) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { collaborators: { where: { userId } } },
  });

  if (!doc) throw new Error("Document not found");

  let role: "OWNER" | "EDITOR" | "VIEWER" | null = null;
  if (doc.ownerId === userId) role = "OWNER";
  else if (doc.collaborators[0]) role = doc.collaborators[0].role as "OWNER" | "EDITOR" | "VIEWER";
  else if (doc.organizationId) role = "EDITOR"; // Org members default

  if (!role || !requiredRole.includes(role)) {
    throw new Error("Forbidden: insufficient permissions");
  }

  return { doc, role };
}

// ─── Document CRUD ────────────────────────────────────────────────────

export async function createDocument(formData: {
  title?: string;
  initialContent?: string;
}) {
  const userId = await getAuthUserId();
  const parsed = createDocumentSchema.parse(formData);

  // Ensure user exists in our DB (upsert from Clerk)
  const { sessionClaims } = await auth();
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: (sessionClaims as Record<string, string>)?.email || `${userId}@user.local`,
      name: (sessionClaims as Record<string, string>)?.name || "Anonymous",
      avatar: (sessionClaims as Record<string, string>)?.image_url || null,
    },
  });

  const document = await prisma.document.create({
    data: {
      title: parsed.title || "Untitled Document",
      initialContent: parsed.initialContent,
      ownerId: userId,
      organizationId: (sessionClaims as Record<string, string | undefined>)?.org_id || undefined,
    },
  });

  revalidatePath("/");
  return document.id;
}

export async function getDocuments(search?: string) {
  const userId = await getAuthUserId();
  const { sessionClaims } = await auth();
  const orgId = (sessionClaims as Record<string, string | undefined>)?.org_id;

  const where = search
    ? {
        AND: [
          {
            OR: [
              { ownerId: userId },
              { collaborators: { some: { userId } } },
              ...(orgId ? [{ organizationId: orgId }] : []),
            ],
          },
          {
            title: { contains: search, mode: "insensitive" as const },
          },
        ],
      }
    : {
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId } } },
          ...(orgId ? [{ organizationId: orgId }] : []),
        ],
      };

  return prisma.document.findMany({
    where,
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
}

export async function getDocumentById(id: string) {
  const userId = await getAuthUserId();
  await checkAccess(id, userId);

  return prisma.document.findUnique({
    where: { id },
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
}

export async function updateDocument(id: string, data: { title?: string }) {
  const userId = await getAuthUserId();
  await checkAccess(id, userId, ["OWNER", "EDITOR"]);
  const parsed = updateDocumentSchema.parse(data);

  await prisma.document.update({
    where: { id },
    data: { title: parsed.title },
  });

  revalidatePath("/");
  revalidatePath(`/documents/${id}`);
}

export async function deleteDocument(id: string) {
  const userId = await getAuthUserId();
  await checkAccess(id, userId, ["OWNER"]);

  await prisma.document.delete({ where: { id } });
  revalidatePath("/");
}

// ─── Version History ──────────────────────────────────────────────────

export async function getVersions(documentId: string) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId);

  return prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      author: { select: { name: true, avatar: true } },
    },
    take: 50,
  });
}

export async function createVersion(
  documentId: string,
  data: { name?: string }
) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId, ["OWNER", "EDITOR"]);
  const parsed = createVersionSchema.parse(data);

  // Get current document state
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { content: true },
  });

  if (!doc?.content) {
    throw new Error("Document has no content to snapshot");
  }

  // Ensure user exists
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@user.local`,
      name: "Anonymous",
    },
  });

  return prisma.documentVersion.create({
    data: {
      documentId,
      name: parsed.name || `Snapshot ${new Date().toLocaleString()}`,
      content: doc.content,
      createdBy: userId,
    },
  });
}

export async function getVersionContent(documentId: string, versionId: string) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId);

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId, documentId },
    select: { content: true, name: true, createdAt: true },
  });

  if (!version) throw new Error("Version not found");

  // Return content as base64 for the client to decode
  return {
    name: version.name,
    createdAt: version.createdAt,
    content: Buffer.from(version.content).toString("base64"),
  };
}

export async function restoreVersion(documentId: string, versionId: string) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId, ["OWNER", "EDITOR"]);

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId, documentId },
    select: { content: true },
  });

  if (!version) throw new Error("Version not found");

  // First, create a snapshot of the current state (safety net)
  const currentDoc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { content: true },
  });

  if (currentDoc?.content) {
    await prisma.documentVersion.create({
      data: {
        documentId,
        name: `Auto-save before restore (${new Date().toLocaleString()})`,
        content: currentDoc.content,
        createdBy: userId,
      },
    });
  }

  // Restore the version's content as the current document state
  await prisma.document.update({
    where: { id: documentId },
    data: { content: version.content },
  });

  return { success: true };
}

// ─── Collaborators ────────────────────────────────────────────────────

export async function addCollaborator(
  documentId: string,
  data: { email: string; role: "EDITOR" | "VIEWER" }
) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId, ["OWNER"]);
  const parsed = addCollaboratorSchema.parse(data);

  // Find user by email
  const targetUser = await prisma.user.findUnique({
    where: { email: parsed.email },
  });

  if (!targetUser) {
    throw new Error("User not found. They must sign in first.");
  }

  if (targetUser.id === userId) {
    throw new Error("You cannot add yourself as a collaborator");
  }

  await prisma.documentCollaborator.upsert({
    where: {
      documentId_userId: {
        documentId,
        userId: targetUser.id,
      },
    },
    update: { role: parsed.role },
    create: {
      documentId,
      userId: targetUser.id,
      role: parsed.role,
    },
  });

  revalidatePath(`/documents/${documentId}`);
}

export async function removeCollaborator(
  documentId: string,
  collaboratorId: string
) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId, ["OWNER"]);

  await prisma.documentCollaborator.delete({
    where: { id: collaboratorId },
  });

  revalidatePath(`/documents/${documentId}`);
}

export async function updateCollaboratorRole(
  documentId: string,
  data: { collaboratorId: string; role: "EDITOR" | "VIEWER" }
) {
  const userId = await getAuthUserId();
  await checkAccess(documentId, userId, ["OWNER"]);
  const parsed = updateCollaboratorRoleSchema.parse(data);

  await prisma.documentCollaborator.update({
    where: { id: parsed.collaboratorId },
    data: { role: parsed.role },
  });

  revalidatePath(`/documents/${documentId}`);
}

// ─── Get User Role for a Document ─────────────────────────────────────

export async function getUserRole(
  documentId: string
): Promise<"OWNER" | "EDITOR" | "VIEWER" | null> {
  try {
    const userId = await getAuthUserId();
    const { role } = await checkAccess(documentId, userId);
    return role;
  } catch {
    return null;
  }
}
