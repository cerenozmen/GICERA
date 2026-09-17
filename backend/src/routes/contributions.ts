import { Router } from "express";
import { z } from "zod";
import { submitContribution } from "../services/contributionService";
import { asyncHandler } from "../utils/asyncHandler";

const contributionSchema = z.object({
  barcode: z.string().trim().regex(/^\d{8,14}$/, "Barkod 8-14 haneli rakamlardan oluşmalıdır."),
  productName: z.string().trim().min(1, "Ürün adı gerekli."),
  brands: z.string().trim().optional(),
  ingredientsText: z.string().trim().min(1, "İçindekiler listesi gerekli."),
  contributorEmail: z.string().trim().email().optional(),
});

export const contributionsRouter = Router();

// POST /api/contributions
// Veritabanında ve Open Beauty Facts'te bulunamayan ürünler için kullanıcı katkısı.
contributionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parseResult = contributionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }

    const contribution = await submitContribution(parseResult.data);
    res.status(201).json({ contribution });
  })
);
