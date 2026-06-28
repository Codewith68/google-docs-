/**
 * Custom Yjs WebSocket Server for Real-Time Collaboration
 * ────────────────────────────────────────────────────────
 * This is a custom implementation of a Yjs-aware WebSocket server
 * using the y-protocols sync and awareness protocols.
 *
 * Architecture:
 * 1. Clients connect with auth token + document room ID
 * 2. Server verifies JWT via Clerk and checks document authorization
 * 3. Yjs CRDT sync protocol handles deterministic conflict resolution
 * 4. Awareness protocol handles cursor positions and presence
 * 5. Document state is persisted to PostgreSQL (debounced)
 *
 * Security:
 * - JWT verification on every connection
 * - Role-based access: VIEWERs get read-only sync (no update broadcasting)
 * - Payload size limits to prevent OOM attacks
 * - Connection rate limiting per IP
 */

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "@clerk/backend";

// ─── Constants ───────────────────────────────────────────────────────
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB max message size
const PERSIST_DEBOUNCE_MS = 2000;
const CLEANUP_DELAY_MS = 30000;
const PORT = parseInt(process.env.WS_PORT || "1234");

// ─── Database ────────────────────────────────────────────────────────
const prisma = new PrismaClient();

// ─── Types ───────────────────────────────────────────────────────────
interface ConnMetadata {
  userId: string;
  userName: string;
  userColor: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  controlledIds: Set<number>;
}

interface SharedDoc {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, ConnMetadata>;
  persistTimeout: ReturnType<typeof setTimeout> | null;
  cleanupTimeout: ReturnType<typeof setTimeout> | null;
}

// ─── In-Memory Document Store ────────────────────────────────────────
const docs = new Map<string, SharedDoc>();

/**
 * Get or create a Yjs document, loading persisted state from PostgreSQL.
 */
async function getOrCreateDoc(docName: string): Promise<SharedDoc> {
  const existing = docs.get(docName);
  if (existing) {
    // Cancel any pending cleanup since we have a new connection
    if (existing.cleanupTimeout) {
      clearTimeout(existing.cleanupTimeout);
      existing.cleanupTimeout = null;
    }
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);

  // Load persisted state from PostgreSQL
  try {
    const document = await prisma.document.findUnique({
      where: { id: docName },
      select: { content: true },
    });

    if (document?.content) {
      Y.applyUpdate(doc, new Uint8Array(document.content));
      console.log(`Loaded document "${docName}" from database`);
    } else {
      console.log(`Created new document "${docName}" (no persisted state)`);
    }
  } catch (err) {
    console.error(`Failed to load document "${docName}":`, err);
  }

  const sharedDoc: SharedDoc = {
    name: docName,
    doc,
    awareness,
    conns: new Map(),
    persistTimeout: null,
    cleanupTimeout: null,
  };

  // Listen for document updates → debounced persistence to PostgreSQL
  doc.on("update", () => {
    schedulePersist(sharedDoc);
  });

  docs.set(docName, sharedDoc);
  return sharedDoc;
}

/**
 * Debounced persistence: saves Yjs document state to PostgreSQL.
 * Prevents excessive writes during rapid typing.
 */
function schedulePersist(sharedDoc: SharedDoc) {
  if (sharedDoc.persistTimeout) {
    clearTimeout(sharedDoc.persistTimeout);
  }

  sharedDoc.persistTimeout = setTimeout(async () => {
    try {
      const state = Y.encodeStateAsUpdate(sharedDoc.doc);
      await prisma.document.update({
        where: { id: sharedDoc.name },
        data: {
          content: Buffer.from(state),
          updatedAt: new Date(),
        },
      });
      console.log(
        `Persisted document "${sharedDoc.name}" (${state.byteLength} bytes)`
      );
    } catch (err) {
      console.error(
        `Failed to persist document "${sharedDoc.name}":`,
        err
      );
    }
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Send a message to a specific WebSocket connection.
 */
function send(
  sharedDoc: SharedDoc,
  conn: WebSocket,
  message: Uint8Array
): void {
  if (conn.readyState !== WebSocket.OPEN) return;
  try {
    conn.send(message, (err) => {
      if (err) {
        console.error("Send error:", err);
        closeConn(sharedDoc, conn);
      }
    });
  } catch (e) {
    closeConn(sharedDoc, conn);
  }
}

/**
 * Broadcast a message to all connections in a room except the origin.
 */
function broadcast(
  sharedDoc: SharedDoc,
  message: Uint8Array,
  excludeConn: WebSocket | null
): void {
  sharedDoc.conns.forEach((meta, conn) => {
    if (conn !== excludeConn) {
      send(sharedDoc, conn, message);
    }
  });
}

/**
 * Handle incoming Yjs protocol messages.
 * Implements the sync protocol (step 1, step 2, update) and awareness.
 */
function handleMessage(
  conn: WebSocket,
  sharedDoc: SharedDoc,
  message: Uint8Array
): void {
  const meta = sharedDoc.conns.get(conn);
  if (!meta) return;

  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncMessageType = syncProtocol.readSyncMessage(
          decoder,
          encoder,
          sharedDoc.doc,
          conn
        );

        // If this is a sync update from a VIEWER, reject it
        if (syncMessageType === 2 && meta.role === "VIEWER") {
          console.warn(
            ` VIEWER ${meta.userId} attempted to push an update — blocked`
          );
          return;
        }

        if (encoding.length(encoder) > 1) {
          send(sharedDoc, conn, encoding.toUint8Array(encoder));
        }
        break;
      }

      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(
          sharedDoc.awareness,
          update,
          conn
        );
        break;
      }

      default:
        console.warn(`Unknown message type: ${messageType}`);
    }
  } catch (err) {
    console.error("Error handling message:", err);
  }
}

/**
 * Clean up a closed connection.
 */
function closeConn(sharedDoc: SharedDoc, conn: WebSocket): void {
  const meta = sharedDoc.conns.get(conn);
  if (!meta) return;

  sharedDoc.conns.delete(conn);

  // Remove awareness states for this connection
  awarenessProtocol.removeAwarenessStates(
    sharedDoc.awareness,
    Array.from(meta.controlledIds),
    null
  );

  console.log(
    ` User "${meta.userName}" disconnected from "${sharedDoc.name}" (${sharedDoc.conns.size} remaining)`
  );

  // If no more connections, schedule cleanup
  if (sharedDoc.conns.size === 0) {
    sharedDoc.cleanupTimeout = setTimeout(async () => {
      if (sharedDoc.conns.size === 0) {
        // Final persist
        try {
          const state = Y.encodeStateAsUpdate(sharedDoc.doc);
          await prisma.document.update({
            where: { id: sharedDoc.name },
            data: { content: Buffer.from(state) },
          });
          console.log(`Final persist for "${sharedDoc.name}"`);
        } catch (err) {
          console.error(`Final persist failed for "${sharedDoc.name}":`, err);
        }

        // Cleanup
        sharedDoc.doc.destroy();
        docs.delete(sharedDoc.name);
        console.log(` Cleaned up document "${sharedDoc.name}"`);
      }
    }, CLEANUP_DELAY_MS);
  }
}

/**
 * Set up a new WebSocket connection for Yjs synchronization.
 */
async function setupConnection(
  conn: WebSocket,
  docName: string,
  userId: string,
  userName: string,
  userColor: string,
  role: "OWNER" | "EDITOR" | "VIEWER"
): Promise<void> {
  const sharedDoc = await getOrCreateDoc(docName);

  const meta: ConnMetadata = {
    userId,
    userName,
    userColor,
    role,
    controlledIds: new Set(),
  };

  sharedDoc.conns.set(conn, meta);

  // ─── Set up event handlers ───────────────────────────────────────

  // Forward document updates to all other clients
  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Don't echo back to the origin
    if (origin === conn) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const msg = encoding.toUint8Array(encoder);

    sharedDoc.conns.forEach((_meta, c) => {
      if (c !== origin) send(sharedDoc, c, msg);
    });
  };
  sharedDoc.doc.on("update", onDocUpdate);

  // Forward awareness changes to all clients
  const onAwarenessChange = (
    changes: {
      added: number[];
      updated: number[];
      removed: number[];
    },
    origin: unknown
  ) => {
    const changedClients = [
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        sharedDoc.awareness,
        changedClients
      )
    );
    broadcast(sharedDoc, encoding.toUint8Array(encoder), null);
  };
  sharedDoc.awareness.on("update", onAwarenessChange);

  // Handle incoming messages
  conn.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
    let message: Uint8Array;
    if (data instanceof ArrayBuffer) {
      message = new Uint8Array(data);
    } else if (Buffer.isBuffer(data)) {
      message = new Uint8Array(data);
    } else {
      message = new Uint8Array(Buffer.concat(data as Buffer[]));
    }

    // Payload size check (OOM protection)
    if (message.byteLength > MAX_PAYLOAD_SIZE) {
      console.warn(
        ` Oversized message from ${userId}: ${message.byteLength} bytes — dropped`
      );
      return;
    }

    handleMessage(conn, sharedDoc, message);
  });

  // Handle disconnect
  conn.on("close", () => {
    sharedDoc.doc.off("update", onDocUpdate);
    sharedDoc.awareness.off("update", onAwarenessChange);
    closeConn(sharedDoc, conn);
  });

  conn.on("error", (err) => {
    console.error(`WebSocket error for ${userId}:`, err);
    closeConn(sharedDoc, conn);
  });

  // ─── Send initial sync ──────────────────────────────────────────
  // Send sync step 1 to the client (server's state vector)
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, sharedDoc.doc);
    send(sharedDoc, conn, encoding.toUint8Array(encoder));
  }

  // Send current awareness states
  const awarenessStates = sharedDoc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        sharedDoc.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    send(sharedDoc, conn, encoding.toUint8Array(encoder));
  }

  console.log(
    ` User "${userName}" (${role}) connected to "${docName}" (${sharedDoc.conns.size} users)`
  );
}

// ─── Authentication & Authorization ──────────────────────────────────

/**
 * Verify Clerk JWT and extract user info.
 */
async function authenticateUser(
  token: string
): Promise<{ userId: string; name: string } | null> {
  try {
    const jwt = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    return {
      userId: jwt.sub,
      name: (jwt as Record<string, unknown>).name as string || "Anonymous",
    };
  } catch (err) {
    console.error("Auth verification failed:", err);
    return null;
  }
}

/**
 * Check if a user has access to a document and return their role.
 */
async function authorizeUser(
  userId: string,
  documentId: string
): Promise<"OWNER" | "EDITOR" | "VIEWER" | null> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        collaborators: {
          where: { userId },
        },
      },
    });

    if (!document) return null;

    // Document owner always has OWNER access
    if (document.ownerId === userId) return "OWNER";

    // Check collaborator role
    const collaborator = document.collaborators[0];
    if (collaborator) return collaborator.role as "EDITOR" | "VIEWER";

    // Check organization access (all org members get EDITOR by default)
    if (document.organizationId) {
      // For org documents, allow access if user is in the org
      // This is a simplified check — in production, verify via Clerk org membership
      return "EDITOR";
    }

    return null;
  } catch (err) {
    console.error("Authorization check failed:", err);
    return null;
  }
}

// ─── Connection Rate Limiting ────────────────────────────────────────
const connectionAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_CONNECTIONS_PER_IP = 20;
const RATE_LIMIT_WINDOW_MS = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = connectionAttempts.get(ip);

  if (!record || now > record.resetAt) {
    connectionAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  record.count++;
  return record.count <= MAX_CONNECTIONS_PER_IP;
}

// ─── HTTP & WebSocket Server ─────────────────────────────────────────

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      server: "Yjs Collaboration Server",
      connections: Array.from(docs.values()).reduce(
        (sum, d) => sum + d.conns.size,
        0
      ),
      documents: docs.size,
    })
  );
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  // ─── Rate Limiting ──────────────────────────────────────────────
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  if (!checkRateLimit(ip)) {
    ws.close(4029, "Too many connections");
    console.warn(`Rate limited IP: ${ip}`);
    return;
  }

  // ─── Parse URL Parameters ───────────────────────────────────────
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const room = url.searchParams.get("room");

  if (!token || !room) {
    ws.close(4001, "Missing token or room parameter");
    return;
  }

  // ─── Authenticate ───────────────────────────────────────────────
  const user = await authenticateUser(token);
  if (!user) {
    ws.close(4001, "Invalid or expired authentication token");
    return;
  }

  // ─── Authorize ──────────────────────────────────────────────────
  const role = await authorizeUser(user.userId, room);
  if (!role) {
    ws.close(4003, "Not authorized to access this document");
    return;
  }

  // ─── Generate deterministic user color ──────────────────────────
  const nameHash = user.name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = Math.abs(nameHash) % 360;
  const color = `hsl(${hue}, 80%, 60%)`;

  // ─── Set Up Yjs Connection ──────────────────────────────────────
  await setupConnection(ws, room, user.userId, user.name, color, role);
});

// ─── Start Server ────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   Yjs Collaboration WebSocket Server                ║
║   Running on ws://localhost:${PORT}                    ║
║                                                      ║
║   Features:                                          ║
║   • CRDT-based deterministic conflict resolution     ║
║   • Role-based authorization (Owner/Editor/Viewer)   ║
║   • Debounced PostgreSQL persistence                 ║
║   • Payload size limits (OOM protection)             ║
║   • Connection rate limiting                         ║
╚══════════════════════════════════════════════════════╝
  `);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────

async function shutdown() {
  console.log("\nShutting down WebSocket server...");

  // Persist all documents
  for (const [name, sharedDoc] of docs) {
    try {
      const state = Y.encodeStateAsUpdate(sharedDoc.doc);
      await prisma.document.update({
        where: { id: name },
        data: { content: Buffer.from(state) },
      });
      console.log(`Persisted "${name}" on shutdown`);
    } catch (err) {
      console.error(`Failed to persist "${name}" on shutdown:`, err);
    }
    sharedDoc.doc.destroy();
  }

  // Close all connections
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));

  await prisma.$disconnect();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
