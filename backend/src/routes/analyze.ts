import { Router } from "express";
import { z } from "zod";
import {
  extractIngredientsFromImage,
  ImageReadingFailedError,
  ImageReadingUnavailableError,
} from "../services/ingredientImageService";
import { scoreIngredientsText } from "../services/scoringService";
import { asyncHandler } from "../utils/asyncHandler";

export const analyzeRouter = Router();

const textSchema = z.object({
  ingredientsText: z.string().trim().min(3, "İçerik listesi çok kısa.").max(20000, "İçerik listesi çok uzun."),
});

// POST /api/analyze/text - scores a pasted/edited ingredient list. Nothing is stored.
analyzeRouter.post(
  "/text",
  asyncHandler(async (req, res) => {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }

    const scoring = scoreIngredientsText(parsed.data.ingredientsText);
    if (!scoring) {
      res.status(400).json({ error: "İçerik listesinde madde bulunamadı." });
      return;
    }
    res.json({ ingredientsText: parsed.data.ingredientsText, ...scoring });
  })
);

const imageSchema = z.object({
  imageBase64: z.string().min(100, "Görsel verisi eksik."),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).default("image/jpeg"),
});

// POST /api/analyze/image - reads the ingredient list from a packaging photo. Nothing is stored.
analyzeRouter.post(
  "/image",
  asyncHandler(async (req, res) => {
    const parsed = imageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }

    try {
      const ingredientsText = await extractIngredientsFromImage(parsed.data.imageBase64, parsed.data.mediaType);
      res.json({ ingredientsText });
    } catch (error) {
      if (error instanceof ImageReadingUnavailableError) {
        res.status(503).json({ error: error.message });
      } else if (error instanceof ImageReadingFailedError) {
        res.status(error.status).json({ error: error.message });
      } else {
        throw error;
      }
    }
  })
);
