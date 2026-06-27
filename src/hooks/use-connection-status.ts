"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "syncing";

/**
 * Hook to track WebSocket connection status and browser online/offline state.
 * Provides a unified status indicator for the UI.
 */
export function useConnectionStatus(ws: WebSocket | null) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setStatus("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!ws) {
      setStatus(isOnline ? "connecting" : "disconnected");
      return;
    }

    const handleOpen = () => setStatus("connected");
    const handleClose = () =>
      setStatus(isOnline ? "connecting" : "disconnected");
    const handleError = () =>
      setStatus(isOnline ? "connecting" : "disconnected");

    // Set initial status based on readyState
    switch (ws.readyState) {
      case WebSocket.CONNECTING:
        setStatus("connecting");
        break;
      case WebSocket.OPEN:
        setStatus("connected");
        break;
      default:
        setStatus("disconnected");
    }

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("close", handleClose);
    ws.addEventListener("error", handleError);

    return () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("close", handleClose);
      ws.removeEventListener("error", handleError);
    };
  }, [ws, isOnline]);

  return { status, isOnline };
}

/**
 * Hook for managing the Yjs WebSocket provider lifecycle.
 * Handles auth token passing, auto-reconnection, and cleanup.
 */
export function useYjsConnection(
  documentId: string,
  getToken: () => Promise<string | null>
) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isCleaningUpRef = useRef(false);

  const connect = useCallback(async () => {
    if (isCleaningUpRef.current) return;

    const token = await getToken();
    if (!token) {
      console.error("No auth token available");
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234";
    const url = `${wsUrl}?token=${encodeURIComponent(token)}&room=${encodeURIComponent(documentId)}`;

    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      reconnectAttemptRef.current = 0;
      setWs(socket);
    };

    socket.onclose = (event) => {
      if (isCleaningUpRef.current) return;
      setWs(null);

      // Auto-reconnect with exponential backoff
      if (event.code !== 4001 && event.code !== 4003) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptRef.current),
          30000
        );
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    socket.onerror = () => {
      // onclose will handle reconnection
    };
  }, [documentId, getToken]);

  const disconnect = useCallback(() => {
    isCleaningUpRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (ws) {
      ws.close();
      setWs(null);
    }
  }, [ws]);

  useEffect(() => {
    isCleaningUpRef.current = false;
    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return { ws, connect, disconnect };
}
