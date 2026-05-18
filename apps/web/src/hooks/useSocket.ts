"use client";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/** Ref-counted shared socket — auto-disconnects when all consumers unmount */
let sharedSocket: Socket | null = null;
let consumerCount = 0;

export function useSocket(): Socket | null {
  const [, forceUpdate] = useState(0);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("orahai_token") : null;
    if (!token) return;

    consumerCount += 1;

    if (!sharedSocket || !sharedSocket.connected) {
      sharedSocket?.removeAllListeners();
      sharedSocket = io(
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
        { auth: { token }, transports: ["websocket"], reconnectionAttempts: 5 }
      );
      sharedSocket.on("connect", () => forceUpdate((n) => n + 1));
    }

    ref.current = sharedSocket;
    forceUpdate((n) => n + 1);

    return () => {
      consumerCount -= 1;
      if (consumerCount <= 0) {
        sharedSocket?.disconnect();
        sharedSocket = null;
        consumerCount = 0;
      }
      ref.current = null;
    };
  }, []);

  return ref.current;
}
