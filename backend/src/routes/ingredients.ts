import { Router } from "express";
import { z } from "zod";
import { createRateLimiter } from "../services/forumRules";
import { describeIngredients } from "../services/ingredientDetails";
import { ExplanationUnavailableError, explainIngredient } from "../services/ingredientExplanationService";
import { asyncHandler } from "../utils/asyncHandler";

export const ingredientsRouter = Router();

// Per client IP: 30 explanations a minute (only names not yet in the table reach Groq).
const allowExplain = createRateLimiter(30, 60_000);

const explainSchema = z.object({
  name: z.string().trim().min(1, "Madde adı boş olamaz.").max(100, "Madde adı çok uzun."),
});

// GET /api/ingredients/explanation?name=Sodyum%20Benzoat
ingredientsRouter.get(
  "/explanation",
  asyncHandler(async (req, res) => {
    const parsed = explainSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }
    if (!allowExplain(req.ip ?? "unknown")) {
      res.status(429).json({ error: "Çok fazla istek. Biraz bekleyip tekrar dene." });
      return;
    }
    try {
      const result = await explainIngredient(parsed.data.name);
      if (!result) {
        res.status(404).json({ error: "Bu madde için açıklama bulunamadı." });
        return;
      }
      res.json(result);
    } catch (err) {
      if (err instanceof ExplanationUnavailableError) {
        res.status(503).json({ error: "Açıklama şu an alınamıyor. Daha sonra tekrar dene." });
        return;
      }
      throw err;
    }
  })
);

const detailsSchema = z.object({
  ingredients: z.array(z.string().max(300)).max(300),
  flagged: z.array(z.string().max(200)).max(100).default([]),
});

// POST /api/ingredients/details { ingredients: the list's rows, flagged: the product's flagged INCI names }
// -> per row: its INCI name, what it does (Turkish tags), which flagged substances it is.
ingredientsRouter.post("/details", (req, res) => {
  const parsed = detailsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz istek." });
    return;
  }
  res.json(describeIngredients(parsed.data.ingredients, parsed.data.flagged));
});
