import { Router, type Response, type NextFunction } from "express";
import { db, users, projects, projectStars } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";

const router = Router();

// GET /api/users/:username/profile — public user profile
router.get("/:username/profile", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const username = String(req.params["username"]).toLowerCase();

    const [user] = await db.select({
      id:        users.id,
      name:      users.name,
      username:  users.username,
      bio:       users.bio,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
    }).from(users).where(and(
      sql`lower(${users.username}) = ${username}`,
      isNull(users.deletedAt),
    )).limit(1);

    if (!user) return next(createError("User not found", 404));

    const publicProjects = await db.select({
      id:          projects.id,
      name:        projects.name,
      description: projects.description,
      language:    projects.language,
      updatedAt:   projects.updatedAt,
      starCount:   sql<number>`(SELECT COUNT(*) FROM project_stars WHERE project_id = ${projects.id})`,
      fileCount:   sql<number>`(SELECT COUNT(*) FROM files WHERE project_id = ${projects.id} AND deleted_at IS NULL AND is_dir = false)`,
    }).from(projects).where(and(
      eq(projects.ownerId, user.id),
      isNull(projects.deletedAt),
      sql`${projects.isPublic} = true`,
    )).orderBy(sql`${projects.updatedAt} DESC`).limit(30);

    const projectCountRes = await db.execute(sql`
      SELECT COUNT(*) AS project_count FROM projects WHERE owner_id = ${user.id} AND deleted_at IS NULL
    `);
    const starCountRes = await db.execute(sql`
      SELECT COUNT(*) AS star_count FROM project_stars ps
      JOIN projects p ON p.id = ps.project_id
      WHERE p.owner_id = ${user.id} AND p.deleted_at IS NULL
    `);

    const projectCount = Number((projectCountRes.rows[0] as { project_count: string })?.project_count ?? 0);
    const starCount = Number((starCountRes.rows[0] as { star_count: string })?.star_count ?? 0);

    res.json({
      data: {
        user,
        projects: publicProjects,
        stats: { projectCount, starCount },
      },
    });
  } catch (err) { next(err); }
});

// GET /api/users/:username/stars — projects this user has starred
router.get("/:username/stars", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const username = String(req.params["username"]).toLowerCase();

    const [user] = await db.select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = ${username}`, isNull(users.deletedAt)))
      .limit(1);

    if (!user) return next(createError("User not found", 404));

    const starred = await db.select({
      id:          projects.id,
      name:        projects.name,
      description: projects.description,
      language:    projects.language,
      updatedAt:   projects.updatedAt,
      ownerUsername: sql<string>`(SELECT username FROM users WHERE id = ${projects.ownerId})`,
      starCount:   sql<number>`(SELECT COUNT(*) FROM project_stars WHERE project_id = ${projects.id})`,
    }).from(projectStars)
      .innerJoin(projects, and(eq(projects.id, projectStars.projectId), isNull(projects.deletedAt), sql`${projects.isPublic} = true`))
      .where(eq(projectStars.userId, user.id))
      .orderBy(sql`${projectStars.createdAt} DESC`)
      .limit(30);

    res.json({ data: starred });
  } catch (err) { next(err); }
});

export default router;
