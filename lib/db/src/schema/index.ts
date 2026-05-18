import {
  pgTable, text, boolean, integer, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:           text("id").primaryKey(),
  email:        text("email").notNull().unique(),
  name:         text("name"),
  username:     text("username").notNull().unique(),
  avatarUrl:    text("avatar_url"),
  bio:          text("bio"),
  passwordHash: text("password_hash"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
  deletedAt:    timestamp("deleted_at"),
});

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
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull(),
  description: text("description"),
  language:    text("language").notNull().default("nodejs"),
  isPublic:    boolean("is_public").notNull().default(false),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId:     text("owner_id").notNull().references(() => users.id),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
  deletedAt:   timestamp("deleted_at"),
}, (t) => [uniqueIndex("projects_workspace_slug_idx").on(t.workspaceId, t.slug)]);

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
