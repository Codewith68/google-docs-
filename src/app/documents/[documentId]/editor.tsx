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

export const Editor = ({
  documentId,
  initialContent,
  userName,
  userColor,
  role,
}: EditorProps) => {
  const { getToken } = useAuth();
  const { setEditor } = useEditorStore();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [leftMargin] = useState(LEFT_MARGIN_DEFAULT);
  const [rightMargin] = useState(RIGHT_MARGIN_DEFAULT);
  const ydocRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const idbProviderRef = useRef<IndexeddbPersistence | null>(null);

  // Create Yjs document (stable reference)
  const ydoc = useMemo(() => {
    const doc = new Y.Doc();
    ydocRef.current = doc;
    return doc;
  }, []);

  // Set up IndexedDB persistence (local-first)
  useEffect(() => {
    const idb = new IndexeddbPersistence(`doc-${documentId}`, ydoc);
    idbProviderRef.current = idb;

    idb.on("synced", () => {
      console.log("📦 Local IndexedDB synced");
    });

    return () => {
      idb.destroy();
    };
  }, [documentId, ydoc]);

  // Set up WebSocket provider for real-time collaboration
  useEffect(() => {
    let provider: WebsocketProvider | null = null;
    let mounted = true;

    const connectWs = async () => {
      const token = await getToken();
      if (!token || !mounted) return;

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234";

      provider = new WebsocketProvider(wsUrl, documentId, ydoc, {
        params: { token, room: documentId },
        connect: true,
      });

      wsProviderRef.current = provider;

      // Set user awareness info
      provider.awareness.setLocalStateField("user", {
        name: userName,
        color: userColor,
      });

      // Track connection status
      provider.on("status", ({ status }: { status: string }) => {
        if (!mounted) return;
        switch (status) {
          case "connected":
            setConnectionStatus("connected");
            break;
          case "connecting":
            setConnectionStatus("connecting");
            break;
          case "disconnected":
            setConnectionStatus("disconnected");
            break;
        }
      });

      provider.on("sync", (isSynced: boolean) => {
        if (!mounted) return;
        if (isSynced) {
          setConnectionStatus("connected");
        } else {
          setConnectionStatus("syncing");
        }
      });
    };

    connectWs();

    // Handle browser online/offline
    const handleOffline = () => setConnectionStatus("disconnected");
    const handleOnline = () => {
      setConnectionStatus("connecting");
      // Reconnect WebSocket
      if (provider && !provider.wsconnected) {
        provider.connect();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (provider) {
        provider.awareness.setLocalState(null);
        provider.destroy();
      }
    };
  }, [documentId, ydoc, getToken, userName, userColor]);

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
        provider: wsProviderRef.current,
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

  // Update collaboration cursor provider when it becomes available
  useEffect(() => {
    if (editor && wsProviderRef.current) {
      // The provider is already configured, awareness is set
    }
  }, [editor]);

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
          👁️ You have view-only access to this document
        </div>
      )}
    </div>
  );
};
