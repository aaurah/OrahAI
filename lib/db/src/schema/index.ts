import {
  pgTable, text, boolean, integer, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:           text("id").primaryKey(),
  email:        text("email").notNull(),
  name:         text("name"),
  username:     text("username").notNull().unique(),
  avatarUrl:    text("avatar_url"),
  bio:          text("bio"),
  passwordHash: text("password_hash"),
  githubToken:  text("github_token"),
  isAdmin:      boolean("is_admin").notNull().default(false),
  isFreeAccess: boolean("is_free_access").notNull().default(false),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
  deletedAt:    timestamp("deleted_at"),
}, (t) => [
  uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
]);

export type User = typeof users.$inferSelect;

// ── Workspaces ────────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  avatarUrl:   text("avatar_url"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
  deletedAt:   timestamp("deleted_at"),
});

export type Workspace = typeof workspaces.$inferSelect;

// ── Memberships ───────────────────────────────────────────────────────────────

export const memberships = pgTable("memberships", {
  id:          text("id").primaryKey(),
  role:        text("role").notNull().default("member"),
  userId:      text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("memberships_user_workspace_idx").on(t.userId, t.workspaceId)]);

export type Membership = typeof memberships.$inferSelect;

// ── Projects ──────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id:             text("id").primaryKey(),
  name:           text("name").notNull(),
  slug:           text("slug").notNull(),
  description:    text("description"),
  language:       text("language").notNull().default("nodejs"),
  isPublic:       boolean("is_public").notNull().default(false),
  workspaceId:    text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId:        text("owner_id").notNull().references(() => users.id),
  githubRepo:     text("github_repo"),
  githubBranch:   text("github_branch"),
  githubSha:      text("github_sha"),
  githubSyncedAt: timestamp("github_synced_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
  deletedAt:      timestamp("deleted_at"),
}, (t) => [uniqueIndex("projects_workspace_slug_idx").on(t.workspaceId, t.slug).where(sql`deleted_at IS NULL`)]);

export type Project = typeof projects.$inferSelect;

// ── Files ─────────────────────────────────────────────────────────────────────

export const files = pgTable("files", {
  id:        text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  path:      text("path").notNull(),
  name:      text("name").notNull(),
  content:   text("content").notNull().default(""),
  mimeType:  text("mime_type").notNull().default("text/plain"),
  isDir:     boolean("is_dir").notNull().default(false),
  size:      integer("size").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [uniqueIndex("files_project_path_idx").on(t.projectId, t.path)]);

export type File = typeof files.$inferSelect;

// ── Runs ──────────────────────────────────────────────────────────────────────

export const runs = pgTable("runs", {
  id:          text("id").primaryKey(),
  projectId:   text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  command:     text("command").notNull(),
  status:      text("status").notNull().default("queued"),
  output:      text("output"),
  exitCode:    integer("exit_code"),
  startedAt:   timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export type Run = typeof runs.$inferSelect;

// ── Project Secrets ───────────────────────────────────────────────────────────

export const projectSecrets = pgTable("project_secrets", {
  id:        text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key:       text("key").notNull(),
  value:     text("value").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("project_secrets_project_key_idx").on(t.projectId, t.key)]);

export type ProjectSecret = typeof projectSecrets.$inferSelect;

// ── Deployments ───────────────────────────────────────────────────────────────

export const deployments = pgTable("deployments", {
  id:          text("id").primaryKey(),
  projectId:   text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider:    text("provider").notNull().default("github_pages"),
  status:      text("status").notNull().default("pending"),
  url:         text("url"),
  sha:         text("sha"),
  commitMsg:   text("commit_msg"),
  error:       text("error"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export type Deployment = typeof deployments.$inferSelect;

// ── Chat Messages ─────────────────────────────────────────────────────────────

export const chatMessages = pgTable("chat_messages", {
  id:        text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId:    text("user_id").references(() => users.id),
  role:      text("role").notNull(),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

// ── API Keys ──────────────────────────────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  keyHash:   text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt:  timestamp("expires_at"),
  revokedAt:  timestamp("revoked_at"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export type ApiKey = typeof apiKeys.$inferSelect;

// ── Project Domains ───────────────────────────────────────────────────────────

export const projectDomains = pgTable("project_domains", {
  id:                text("id").primaryKey(),
  projectId:         text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain:            text("domain").notNull(),
  status:            text("status").notNull().default("pending"),
  verificationToken: text("verification_token").notNull(),
  verifiedAt:        timestamp("verified_at"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("project_domains_project_domain_idx").on(t.projectId, t.domain)]);

export type ProjectDomain = typeof projectDomains.$inferSelect;
