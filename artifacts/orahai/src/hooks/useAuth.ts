import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { AuthUser } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("orahai_token");
    if (!token) { setIsLoading(false); return; }

    api.get<{ data: AuthUser }>("/api/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem("orahai_token"))
      .finally(() => setIsLoading(false));
  }, []);

  return { user, isLoading };
}
