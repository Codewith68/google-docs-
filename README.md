# CollabDocs — Local-First Collaborative Document Editor

A production-grade, local-first collaborative document editor with offline synchronization, deterministic conflict resolution (CRDTs), granular version control, and AI-powered writing assistance.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (Frontend)                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  TipTap      │  │  Yjs CRDT    │  │  IndexedDB     │  │
│  │  Rich Text   │◄─┤  Document    │──┤  (Local-First  │  │
│  │  Editor      │  │  State       │  │   Persistence) │  │
│  └─────────────┘  └──────┬───────┘  └────────────────┘  │
│                          │ y-websocket                    │
└──────────────────────────┼──────────────────────────────┘
                           │ WebSocket (ws://)
┌──────────────────────────┼──────────────────────────────┐
│              Custom WebSocket Server                     │
│  ┌───────────────┐  ┌────┴──────────┐  ┌─────────────┐  │
│  │ Clerk JWT     │  │  Yjs Sync     │  │  Debounced   │  │
│  │ Auth +        │──┤  Protocol     │──┤  PostgreSQL  │  │
│  │ Role-Based    │  │  (y-protocols)│  │  Persistence │  │
│  │ Authorization │  └───────────────┘  └──────┬──────┘  │
│  └───────────────┘                            │          │
└───────────────────────────────────────────────┼─────────┘
                                                │
┌───────────────────────────────────────────────┼─────────┐
│                  PostgreSQL Database                     │
│  ┌──────┐  ┌──────────┐  ┌─────────────┐  ┌──────────┐  │
│  │Users │  │Documents │  │DocumentVer- │  │Document  │  │
│  │      │  │(Yjs      │  │sions (Time  │  │Collabora-│  │
│  │      │  │ Binary)  │  │ Travel)     │  │tors/RLS) │  │
│  └──────┘  └──────────┘  └─────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### Local-First Architecture
- **IndexedDB** as the primary source of truth via `y-indexeddb`
- Zero network requests blocking the UI — open, edit, and close documents fully offline
- Changes automatically sync when connectivity resumes

### Deterministic Conflict Resolution
- **Yjs CRDTs** (Conflict-free Replicated Data Types) ensure deterministic merging
- Multiple users can edit the same document simultaneously without conflicts
- No data loss — operations are commutative and idempotent

### Custom WebSocket Server
- Built from scratch using `ws` + `y-protocols`
- Implements the full Yjs sync protocol (sync step 1/2 + incremental updates)
- Awareness protocol for real-time cursor positions and presence
- Debounced PostgreSQL persistence (2s)
- Graceful shutdown with final document persistence

### Version History & Time Travel
- Create named snapshots of document state
- Browse timeline of past versions
- Restore to any previous state (auto-saves current state before restoring)
- Safe for active collaborators — creates new version, doesn't overwrite

### Granular Authorization
- **Owner**: Full control — edit, share, delete, manage collaborators
- **Editor**: Edit content, create versions
- **Viewer**: Read-only access, can view but not modify
- Enforced at both API and WebSocket levels

### AI Writing Assistant (Gemini)
- Improve writing, fix grammar, summarize, expand, simplify
- Translate to any language
- Custom AI prompts
- Streaming responses for real-time UX

### Security
- Clerk JWT verification on all connections
- Payload size limits (5MB max) to prevent OOM attacks
- Connection rate limiting (20 connections/minute/IP)
- Zod validation on all API inputs
- Role-based access enforcement at every layer

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript |
| Editor | TipTap with Yjs collaboration extensions |
| CRDT Engine | Yjs (y-indexeddb, y-websocket, y-protocols) |
| Real-time | Custom WebSocket server (ws + y-protocols) |
| Database | PostgreSQL via Prisma ORM |
| Auth | Clerk (JWT-based) |
| AI | Google Gemini via Vercel AI SDK |
| Styling | Tailwind CSS + shadcn/ui + Radix UI |
| State | Zustand |

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (local or cloud — [Neon](https://neon.tech), [Supabase](https://supabase.com))

### Setup

1. Install dependencies:
```bash
npm install --legacy-peer-deps
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```
Fill in: `DATABASE_URL`, Clerk keys, and optionally `GOOGLE_GENERATIVE_AI_API_KEY`.

3. Push database schema:
```bash
npx prisma db push
```

4. Start development servers (Next.js + WebSocket):
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Security Considerations

### OOM Prevention
The WebSocket server enforces a **5MB max payload size** on all incoming messages. Oversized payloads are dropped with a warning log.

### Tenant Isolation
PostgreSQL queries are scoped by `ownerId` and `DocumentCollaborator` records. Users can only access documents they own or have been explicitly invited to.

### Authentication
All WebSocket connections require a valid Clerk JWT token passed as a URL parameter. Invalid or expired tokens result in immediate connection closure (code 4001).

### Rate Limiting
Connection attempts are limited to 20 per IP per minute to prevent connection flooding.

## Deployment

### Vercel (Frontend)
```bash
vercel deploy
```

### WebSocket Server (Railway/Render)
Deploy the `server/` directory as a separate Node.js service.

Set environment variables:
- `DATABASE_URL` — same PostgreSQL database
- `CLERK_SECRET_KEY` — for JWT verification
- `WS_PORT` — port to listen on
