import { z } from "zod";

// ─── Payload Size Limits ─────────────────────────────────────────────
// Prevents OOM attacks from malicious actors sending massive payloads
export const MAX_TITLE_LENGTH = 255;
export const MAX_INITIAL_CONTENT_LENGTH = 500_000; // ~500KB HTML
export const MAX_SYNC_PAYLOAD_SIZE = 5_000_000; // ~5MB Yjs binary update
export const MAX_VERSION_NAME_LENGTH = 100;

// ─── Document Schemas ────────────────────────────────────────────────

export const createDocumentSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(MAX_TITLE_LENGTH, `Title must be under ${MAX_TITLE_LENGTH} characters`)
    .default("Untitled Document"),
  initialContent: z
    .string()
    .max(
      MAX_INITIAL_CONTENT_LENGTH,
      `Initial content too large (max ${MAX_INITIAL_CONTENT_LENGTH / 1000}KB)`
    )
    .optional(),
  organizationId: z.string().optional(),
});

export const updateDocumentSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(MAX_TITLE_LENGTH, `Title must be under ${MAX_TITLE_LENGTH} characters`)
    .optional(),
});

export const searchDocumentsSchema = z.object({
  search: z.string().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

// ─── Version Schemas ─────────────────────────────────────────────────

export const createVersionSchema = z.object({
  name: z
    .string()
    .max(
      MAX_VERSION_NAME_LENGTH,
      `Version name must be under ${MAX_VERSION_NAME_LENGTH} characters`
    )
    .default("Untitled Snapshot"),
});

export const restoreVersionSchema = z.object({
  versionId: z.string().min(1, "Version ID is required"),
});

// ─── Collaborator Schemas ────────────────────────────────────────────

export const addCollaboratorSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["EDITOR", "VIEWER"], {
    errorMap: () => ({ message: "Role must be EDITOR or VIEWER" }),
  }),
});

export const updateCollaboratorRoleSchema = z.object({
  collaboratorId: z.string().min(1),
  role: z.enum(["EDITOR", "VIEWER"]),
});

// ─── Sync Payload Schema ────────────────────────────────────────────
// Validates WebSocket sync messages to prevent malformed data

export const syncPayloadSchema = z.object({
  type: z.enum(["update", "awareness", "sync-step-1", "sync-step-2"]),
  data: z
    .string() // base64 encoded binary
    .max(MAX_SYNC_PAYLOAD_SIZE, "Sync payload too large — possible OOM attack"),
  documentId: z.string().min(1),
});

// ─── AI Schemas ──────────────────────────────────────────────────────

export const aiRequestSchema = z.object({
  prompt: z.string().min(1).max(10_000, "Prompt too long"),
  context: z.string().max(50_000, "Context too long").optional(),
  action: z.enum([
    "improve",
    "fix-grammar",
    "summarize",
    "expand",
    "simplify",
    "translate",
    "custom",
  ]),
  language: z.string().max(50).optional(), // For translate action
});

// ─── Type Exports ────────────────────────────────────────────────────

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type SearchDocumentsInput = z.infer<typeof searchDocumentsSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type RestoreVersionInput = z.infer<typeof restoreVersionSchema>;
export type AddCollaboratorInput = z.infer<typeof addCollaboratorSchema>;
export type UpdateCollaboratorRoleInput = z.infer<typeof updateCollaboratorRoleSchema>;
export type SyncPayloadInput = z.infer<typeof syncPayloadSchema>;
export type AIRequestInput = z.infer<typeof aiRequestSchema>;
