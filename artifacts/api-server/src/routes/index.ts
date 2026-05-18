import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import workspacesRouter from "./workspaces";
import filesRouter from "./files";
import runsRouter from "./runs";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/projects", projectsRouter);
router.use("/workspaces", workspacesRouter);
router.use("/files", filesRouter);
router.use("/runs", runsRouter);
router.use("/ai", aiRouter);

export default router;
