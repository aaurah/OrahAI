import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;
let consumerCount = 0;

export function useSocket(): Socket | null {
  const [, forceUpdate] = useState(0);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("orahai_token");
    if (!token) return;

    consumerCount += 1;

    // Only create a new socket if one doesn't exist at all.
    // Don't recreate just because connected=false — it may still be connecting.
    if (!sharedSocket) {
      sharedSocket = io(
        import.meta.env.VITE_API_URL ?? "",
        {
          auth: { token },
          transports: ["websocket"],
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
        }
      );
      sharedSocket.on("connect", () => forceUpdate((n) => n + 1));
      sharedSocket.on("disconnect", () => forceUpdate((n) => n + 1));
      sharedSocket.on("connect_error", () => forceUpdate((n) => n + 1));
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
