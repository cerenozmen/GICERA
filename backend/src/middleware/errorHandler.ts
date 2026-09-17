import { NextFunction, Request, Response } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const message = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
  res.status(500).json({ error: message });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Endpoint bulunamadı." });
}
