import { Router } from "express";
import { analyzeRouter } from "./analyze";
import { authRouter } from "./auth";
import { contributionsRouter } from "./contributions";
import { forumRouter } from "./forum";
import { productsRouter } from "./products";

export const apiRouter = Router();

apiRouter.use("/products", productsRouter);
apiRouter.use("/contributions", contributionsRouter);
apiRouter.use("/analyze", analyzeRouter);
apiRouter.use("/forum", forumRouter);
apiRouter.use("/auth", authRouter);
