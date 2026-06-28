"use client";

import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Table from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import ImageResize from "tiptap-extension-resize-image";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { useEditor, EditorContent } from "@tiptap/react";
import { useAuth } from "@clerk/nextjs";

import { useEditorStore } from "@/store/use-editor-store";
import { FontSizeExtension } from "@/extensions/font-size";
import { LineHeightExtension } from "@/extensions/line-height";
import { LEFT_MARGIN_DEFAULT, RIGHT_MARGIN_DEFAULT } from "@/constants/margins";
import {
  ConnectionStatusIndicator,
} from "@/components/connection-status";
import { type ConnectionStatus } from "@/hooks/use-connection-status";

import { Ruler } from "./ruler";

interface EditorProps {
  documentId: string;
  initialContent?: string | null;
  userName: string;
  userColor: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export const Editor = (props: EditorProps) => {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    let mounted = true;
    getToken().then((t) => {
      if (mounted && t) setToken(t);
    });
    return () => {
      mounted = false;
    };
  }, [getToken]);

  useEffect(() => {
    if (!token) return;
    
    const ydoc = new Y.Doc();
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234";
    const wsProvider = new WebsocketProvider(wsUrl, props.documentId, ydoc, {
      params: { token, room: props.documentId },
      connect: true,
    });
    
    wsProvider.awareness.setLocalStateField("user", {
      name: props.userName,
      color: props.userColor,
    });
    
    setProvider(wsProvider);

    return () => {
      wsProvider.awareness.setLocalState(null);
      wsProvider.destroy();
    };
  }, [token, props.documentId, props.userName, props.userColor]);

  if (!token || !provider) {
    return (
      <div className="flex size-full items-center justify-center bg-[#F9FBFD]">
        <p className="text-sm text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  return <EditorInner {...props} token={token} provider={provider} ydoc={provider.doc} />;
};

const EditorInner = ({
  documentId,
  initialContent,
  userName,
  userColor,
  role,
  token,
  provider,
  ydoc,
}: EditorProps & { token: string; provider: WebsocketProvider; ydoc: Y.Doc }) => {
  const { getToken } = useAuth();
  const { setEditor } = useEditorStore();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [leftMargin] = useState(LEFT_MARGIN_DEFAULT);
  const [rightMargin] = useState(RIGHT_MARGIN_DEFAULT);
  const idbProviderRef = useRef<IndexeddbPersistence | null>(null);

  // Set up IndexedDB persistence (local-first)
  useEffect(() => {
    const idb = new IndexeddbPersistence(`doc-${documentId}`, ydoc);
    idbProviderRef.current = idb;

    idb.on("synced", () => {
      console.log("Local IndexedDB synced");
    });

    return () => {
      idb.destroy();
    };
  }, [documentId, ydoc]);

  // Set up WebSocket provider event listeners
  useEffect(() => {
    let mounted = true;
    const handleStatus = async ({ status }: { status: string }) => {
      if (!mounted) return;
      if (status === "connected") setConnectionStatus("connected");
      else if (status === "connecting") setConnectionStatus("connecting");
      else if (status === "disconnected") {
        setConnectionStatus("disconnected");
        // Fetch a fresh token for the next reconnect attempt
        const newToken = await getToken();
        if (newToken && mounted) {
          const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234";
          const url = new URL(wsUrl);
          url.searchParams.set("token", newToken);
          url.searchParams.set("room", documentId);
          (provider as any).url = url.toString();
        }
      }
    };

    const handleSync = (isSynced: boolean) => {
      if (isSynced) setConnectionStatus("connected");
      else setConnectionStatus("syncing");
    };

    provider.on("status", handleStatus);
    provider.on("sync", handleSync);

    // Handle browser online/offline
    const handleOffline = () => setConnectionStatus("disconnected");
    const handleOnline = () => {
      setConnectionStatus("connecting");
      if (!provider.wsconnected) {
        provider.connect();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      provider.off("status", handleStatus);
      provider.off("sync", handleSync);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [provider]);

  // Initialize editor with initial content if this is a new document
  const handleCreate = useCallback(
    ({ editor: editorInstance }: { editor: ReturnType<typeof useEditor> extends infer T ? NonNullable<T> : never }) => {
      setEditor(editorInstance);

      // If document is empty and we have initial content, set it
      if (initialContent && editorInstance.isEmpty) {
        // Small delay to allow Yjs sync to complete first
        setTimeout(() => {
          if (editorInstance.isEmpty) {
            editorInstance.commands.setContent(initialContent);
          }
        }, 500);
      }
    },
    [initialContent, setEditor]
  );

  const editor = useEditor({
    autofocus: true,
    immediatelyRender: false,
    editable: role !== "VIEWER",
    onCreate: handleCreate,
    onDestroy() {
      setEditor(null);
    },
    onUpdate({ editor: e }) {
      setEditor(e);
    },
    onSelectionUpdate({ editor: e }) {
      setEditor(e);
    },
    onTransaction({ editor: e }) {
      setEditor(e);
    },
    onFocus({ editor: e }) {
      setEditor(e);
    },
    onBlur({ editor: e }) {
      setEditor(e);
    },
    editorProps: {
      attributes: {
        style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px;`,
        class:
          "focus:outline-none print:border-0 bg-white border border-[#C7C7C7] flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text",
      },
    },
    extensions: [
      StarterKit.configure({
        history: false, // Yjs handles undo/redo via CRDT
      }),
      // Yjs Collaboration — CRDT-based conflict resolution
      Collaboration.configure({
        document: ydoc,
      }),
      // Collaborative Cursors — shows other users' selections in real-time
      CollaborationCursor.configure({
        provider,
        user: { name: userName, color: userColor },
      }),
      LineHeightExtension,
      FontSizeExtension,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      TextStyle,
      Underline,
      Image,
      ImageResize,
      Table,
      TableCell,
      TableHeader,
      TableRow,
      TaskItem.configure({ nested: true }),
      TaskList,
    ],
  });


  return (
    <div className="size-full overflow-x-auto bg-[#F9FBFD] px-4 print:p-0 print:bg-white print:overflow-visible">
      {/* Connection Status Bar */}
      <div className="sticky top-0 z-10 flex justify-between items-center py-2 print:hidden">
        <Ruler />
        <ConnectionStatusIndicator status={connectionStatus} />
      </div>
      <div className="min-w-max flex justify-center w-[816px] py-4 print:py-0 mx-auto print:w-full print:min-w-0">
        <EditorContent editor={editor} />
      </div>
      {role === "VIEWER" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-800 px-4 py-2 rounded-full text-sm font-medium border border-amber-300 shadow-lg print:hidden">
          You have view-only access to this document
        </div>
      )}
    </div>
  );
};
