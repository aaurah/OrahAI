export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  language: string;
  isPublic: boolean;
  workspaceId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithCounts extends Project {
  _count: { files: number; runs: number; chats: number };
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  name: string;
  content: string;
  mimeType: string;
  isDir: boolean;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string | null;
  role: MessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
}

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const LANGUAGE_COLORS: Record<string, string> = {
  python: "#3b82f6",
  nodejs: "#22c55e",
  typescript: "#6366f1",
  html: "#f59e0b",
  go: "#06b6d4",
  rust: "#f97316",
  java: "#ef4444",
  ruby: "#ec4899",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  python: "Python",
  nodejs: "Node.js",
  typescript: "TypeScript",
  html: "HTML/CSS",
  go: "Go",
  rust: "Rust",
  java: "Java",
  ruby: "Ruby",
};
