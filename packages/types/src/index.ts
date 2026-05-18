// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  role: UserRole;
  plan: PlanTier;
}

export type UserRole = "FREE" | "PRO" | "TEAM" | "ADMIN" | "SUPER_ADMIN";
export type PlanTier = "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
export type OrgRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

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

// ─── Organization ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  description: string | null;
  plan: PlanTier;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgRole;
  user: Pick<AuthUser, "id" | "email" | "name" | "username" | "avatarUrl">;
  joinedAt: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  language: string;
  template: string | null;
  isPublic: boolean;
  isArchived: boolean;
  ownerId: string;
  organizationId: string | null;
  gitRepoUrl: string | null;
  gitBranch: string;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<AuthUser, "id" | "username" | "avatarUrl">;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  language: string;
  template?: string;
  isPublic?: boolean;
  organizationId?: string;
}

// ─── Project Files ────────────────────────────────────────────────────────────

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
  isDir: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
  mimeType?: string;
  size?: number;
}

export interface WriteFileRequest {
  path: string;
  content: string;
  mimeType?: string;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export type WorkspaceStatus =
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "ERROR"
  | "HIBERNATING";

export interface Workspace {
  id: string;
  projectId: string;
  userId: string;
  status: WorkspaceStatus;
  containerId: string | null;
  port: number | null;
  previewUrl: string | null;
  cpuUsage: number;
  memoryUsage: number;
  startedAt: string | null;
  stoppedAt: string | null;
}

export interface WorkspaceLog {
  id: string;
  workspaceId: string;
  stream: "STDOUT" | "STDERR" | "SYSTEM";
  message: string;
  createdAt: string;
}

export interface RunCommandRequest {
  command: string;
  workspaceId: string;
}

export interface RunCommandResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

// ─── AI / Agent ───────────────────────────────────────────────────────────────

export interface AIConversation {
  id: string;
  userId: string;
  projectId: string | null;
  title: string | null;
  model: string;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";

export interface AIMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[] | null;
  toolResults?: ToolResult[] | null;
  tokenCount: number;
  createdAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  error?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  projectId?: string;
  model?: string;
  systemPrompt?: string;
}

export interface ChatStreamEvent {
  type: "delta" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  conversationId?: string;
  messageId?: string;
  error?: string;
}

export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface AgentTask {
  id: string;
  conversationId: string;
  title: string;
  status: TaskStatus;
  steps: AgentStep[];
  result: unknown | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AgentStep {
  index: number;
  type: "think" | "tool_call" | "edit_file" | "run_command" | "done";
  description: string;
  status: "pending" | "running" | "done" | "error";
  data?: unknown;
}

// ─── Deployment ───────────────────────────────────────────────────────────────

export type DeployEnvironment = "PREVIEW" | "STAGING" | "PRODUCTION";
export type DeployStatus =
  | "PENDING"
  | "BUILDING"
  | "DEPLOYING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "ROLLED_BACK";

export interface Deployment {
  id: string;
  projectId: string;
  userId: string;
  version: string;
  environment: DeployEnvironment;
  status: DeployStatus;
  url: string | null;
  buildLog: string | null;
  commitSha: string | null;
  commitMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface CreateDeploymentRequest {
  projectId: string;
  environment?: DeployEnvironment;
  commitSha?: string;
  commitMsg?: string;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  plan: PlanTier;
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING" | "PAUSED";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  icon: string;
  tags: string[];
  isOfficial: boolean;
}
