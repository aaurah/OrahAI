export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  name?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export type MemberRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceWithRole extends Workspace {
  role: MemberRole;
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

export interface CreateProjectRequest {
  name: string;
  description?: string;
  language?: string;
  isPublic?: boolean;
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

export interface FileNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  mimeType?: string;
  size?: number;
  children?: FileNode[];
}

export type RunStatus = "queued" | "running" | "success" | "error";

export interface Run {
  id: string;
  projectId: string;
  command: string;
  status: RunStatus;
  output: string | null;
  exitCode: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string | null;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  icon: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: "nodejs",     name: "Node.js",      description: "Blank Node.js project",       language: "nodejs",     icon: "🟩" },
  { id: "python",     name: "Python",        description: "Blank Python project",         language: "python",     icon: "🐍" },
  { id: "typescript", name: "TypeScript",    description: "TypeScript (Node) project",    language: "typescript", icon: "🔷" },
  { id: "html",       name: "HTML/CSS/JS",   description: "Static web page",             language: "html",       icon: "🌐" },
  { id: "express",    name: "Express API",   description: "REST API with Express",        language: "nodejs",     icon: "🚀" },
];
