/**
 * WorkspaceService
 * Thin helpers used by workspace routes. Kept minimal for MVP —
 * container lifecycle and WorkspaceLogs are Phase 2.
 */
import { prisma } from "@orahai/db";

export class WorkspaceService {
  /** List all workspaces a user belongs to */
  async listForUser(userId: string) {
    return prisma.membership.findMany({
      where: { userId },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, description: true, avatarUrl: true, createdAt: true, updatedAt: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Verify a user is a member of a workspace with one of the allowed roles */
  async assertRole(workspaceId: string, userId: string, allowed: string[]) {
    const m = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!m) throw Object.assign(new Error("Workspace not found"), { statusCode: 404 });
    if (!allowed.includes(m.role)) throw Object.assign(new Error("Insufficient permissions"), { statusCode: 403 });
    return m;
  }

  /** List files for a project (flat array) */
  async listFiles(projectId: string) {
    return prisma.file.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ isDir: "desc" }, { path: "asc" }],
      select: { id: true, path: true, name: true, mimeType: true, size: true, isDir: true },
    });
  }
}
