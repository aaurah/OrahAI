import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, getToken, setToken, removeToken } from "@/lib/api";
import type { AuthUser, ApiResponse, AuthResponse } from "@/lib/types";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.get<ApiResponse<AuthUser>>("/api/auth/me");
      setUser(res.data);
    } catch {
      await removeToken();
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      const stored = await getToken();
      if (!stored) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await api.get<ApiResponse<AuthUser>>("/api/auth/me");
        setUser(res.data);
      } catch {
        await removeToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<ApiResponse<AuthResponse>>("/api/auth/login", { email, password });
    await setToken(res.data.token);
    setUser(res.data.user);
  };

  const register = async (email: string, password: string, username: string, name?: string) => {
    const res = await api.post<ApiResponse<AuthResponse>>("/api/auth/register", {
      email, password, username, name,
    });
    await setToken(res.data.token);
    setUser(res.data.user);
  };

  const logout = async () => {
    await removeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
