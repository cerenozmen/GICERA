import { Router } from "express";
import { contributionsRouter } from "./contributions";
import { productsRouter } from "./products";

export const apiRouter = Router();

apiRouter.use("/products", productsRouter);
apiRouter.use("/contributions", contributionsRouter);
