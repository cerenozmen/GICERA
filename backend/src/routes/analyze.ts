import { Router } from "express";
import { z } from "zod";
import {
  extractIngredientsFromImage,
  ImageReadingFailedError,
  ImageReadingUnavailableError,
} from "../services/ingredientImageService";
import { analyzeFrames, MultiFrameAnalysis } from "../services/frameMerge";
import { analyzePhotoIngredients, MIN_PHOTO_COVERAGE, PhotoAnalysis } from "../services/ingredientCoverage";
import { getIngredientVocabulary } from "../services/ingredientInventoryCache";
import { ocrSuspect, outcome, validateScan } from "../services/scanValidation";
import { parseIngredientsText, scoreIngredients } from "../services/scoringService";
import { asyncHandler } from "../utils/asyncHandler";

export const analyzeRouter = Router();

const textSchema = z.object({
  ingredientsText: z.string().trim().min(3, "İçerik listesi çok kısa.").max(20000, "İçerik listesi çok uzun."),
});

function logPhotoAnalysis(text: string, analysis: PhotoAnalysis): void {
  const lines = analysis.ingredients.map((item) =>
    item.status === "matched"
      ? `  ${item.text} -> ${item.matchedName} -> ${item.contribution ? `-${item.contribution}` : "0"}`
      : `  ${item.text} -> UNKNOWN ${item.kind}${item.nearest ? ` (~${item.nearest}, distance ${item.distance})` : ""}` +
        `${item.suspected !== "none" ? ` [${item.suspected}]` : ""}`
  );
  const unknown = analysis.ingredients.filter((item) => item.status === "unknown");
  const failing = (kind: string) => unknown.filter((item) => item.kind === kind).map((item) => `"${item.text}"`);
  const gate = (ok: boolean, label: string, detail: string) => `  ${label}: ${detail} ${ok ? "PASS" : "FAIL"}`;
  console.log(
    `[photo-analysis] detected=${analysis.detected} matched=${analysis.matched} unknown=${analysis.unknown} ` +
      `coverage=${analysis.coverage.toFixed(3)}\n  text: ${text}\n${lines.join("\n")}\n` +
      [
        gate(analysis.readCoverage >= MIN_PHOTO_COVERAGE, "readCoverage", `${analysis.readCoverage.toFixed(3)} vs ${MIN_PHOTO_COVERAGE}`),
        gate(!failing("resembles_flagged").length, "flagged look-alike unknowns", failing("resembles_flagged").join(", ") || "none"),
        gate(!failing("unrecognizable").length, "unrecognizable unknowns", failing("unrecognizable").join(", ") || "none"),
      ].join("\n") +
      `\n  => scoreAllowed = ${analysis.scoring ? `true, score ${analysis.scoring.cleanScore}` : `false because ${analysis.withheldReason}`}`
  );
}

// POST /api/analyze/text - scores an ingredient list read from a packaging photo. Nothing is stored.
// The score is withheld (reliable: false) unless the unreadable names provably can't change it.
analyzeRouter.post(
  "/text",
  asyncHandler(async (req, res) => {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }

    const vocabulary = getIngredientVocabulary();
    if (!vocabulary) {
      res.status(503).json({ error: "İçerik sözlüğü sunucuda yüklü değil, fotoğraftan analiz şu an yapılamıyor." });
      return;
    }

    const tokens = parseIngredientsText(parsed.data.ingredientsText);
    if (tokens.length === 0) {
      res.status(400).json({ error: "İçerik listesinde madde bulunamadı." });
      return;
    }

    const analysis = analyzePhotoIngredients(tokens, vocabulary, scoreIngredients);
    if (process.env.NODE_ENV !== "production") logPhotoAnalysis(parsed.data.ingredientsText, analysis);

    const { scoring, ...details } = analysis;
    res.json({ ingredientsText: parsed.data.ingredientsText, reliable: scoring !== null, ...details, ...scoring });
  })
);

const framesSchema = z.object({
  frames: z
    .array(
      z.object({
        status: z.string(),
        ingredientsText: z.string().max(20000).nullable(),
        role: z.enum(["complete", "evidence"]).optional(),
      })
    )
    .min(1, "Kare yok.")
    .max(80, "En fazla 80 kare."),
});

function logMultiFrame(multi: MultiFrameAnalysis): void {
  const frame = (analysis: PhotoAnalysis | null, status: string) => {
    if (!analysis) return status;
    const suspicious = analysis.ingredients.filter((i) => i.status === "unknown" && i.kind !== "resembles_safe" && i.kind !== "unlisted").map((i) => `"${i.text}" ${i.kind}`);
    return (
      `coverage ${analysis.coverage.toFixed(3)} read ${analysis.readCoverage.toFixed(3)} unknown ${analysis.unknown}` +
      ` suspicious [${suspicious.join(", ")}] -> ${analysis.scoring ? `score ${analysis.scoring.cleanScore}` : analysis.withheldReason}`
    );
  };
  const frames = (list: number[]) => list.map((index) => `F${index + 1}`).join(", ");
  const merged = multi.merged;
  console.log(
    `[photo-frames] ${multi.frames.map((f, i) => `\n  Frame ${i + 1}${f.role === "evidence" ? " (evidence)" : ""} -> ${frame(f.analysis, f.status)}`).join("")}` +
      `${multi.corrections.map((c) => `\n  #${c.position + 1} "${c.read}" -> ${c.names[0]} (exact in ${frames(c.frames)})`).join("")}` +
      `${multi.insertions.map((c) => `\n  #${c.position + 1} + ${c.names[0]} (exact in ${frames(c.frames)}, missing in base)`).join("")}` +
      `${multi.conflicts.map((c) => `\n  #${c.position + 1} conflict "${c.read}": ${c.names.join(" vs ")}`).join("")}` +
      `\n  Merged (base ${multi.base === null ? "-" : `F${multi.base + 1}`}) -> ${frame(merged, multi.status)}` +
      `\n  single-frame: ${frame(multi.frames[0].analysis, multi.frames[0].status)}`
  );
}

// POST /api/analyze/frames - experimental: several frames of one shot, merged (see frameMerge.ts).
// Answers like /analyze/text for the merged list, plus per-frame details. Nothing is stored.
analyzeRouter.post(
  "/frames",
  asyncHandler(async (req, res) => {
    const parsed = framesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }
    const vocabulary = getIngredientVocabulary();
    if (!vocabulary) {
      res.status(503).json({ error: "İçerik sözlüğü sunucuda yüklü değil, fotoğraftan analiz şu an yapılamıyor." });
      return;
    }

    const inputs = parsed.data.frames.map((frame) => ({
      status: frame.status,
      tokens: parseIngredientsText(frame.ingredientsText),
      role: frame.role,
    }));
    const multi = analyzeFrames(inputs, vocabulary, scoreIngredients);
    if (process.env.NODE_ENV !== "production") logMultiFrame(multi);

    if (!multi.merged) {
      res.json({ reliable: false, status: multi.status });
      return;
    }
    const { scoring, ...details } = multi.merged;
    const ingredientsText = multi.merged.ingredients.map((item) => item.matchedName ?? item.text).join(", ");
    res.json({ ingredientsText, reliable: scoring !== null, status: "ok", ...details, ...scoring });
  })
);

const scanSchema = z.object({
  readings: z
    .array(z.object({ rows: z.array(z.string().max(2000)).min(1, "Satır yok.").max(80), heading: z.boolean() }))
    .min(1, "Okuma yok.")
    .max(10),
  edges: z.array(z.object({ starts: z.array(z.string().max(2000)).max(6), ends: z.array(z.string().max(2000)).max(6) })).max(80).optional(),
  ingredientsText: z.string().trim().min(3, "İçerik listesi çok kısa.").max(20000, "İçerik listesi çok uzun."),
  evidence: z.array(z.array(z.string().max(500)).max(100)).max(200).default([]),
  /** Development logs: how the scanner got the list ("full_frame" / "multi_view", photo or snapshot). */
  path: z.string().max(40).optional(),
});

// POST /api/analyze/scan - the ingredient scanner's candidate list: first checked for being read
// whole (scanValidation.ts), then, only if so, analysed like /analyze/frames. Nothing is stored.
analyzeRouter.post(
  "/scan",
  asyncHandler(async (req, res) => {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }
    const vocabulary = getIngredientVocabulary();
    if (!vocabulary) {
      res.status(503).json({ error: "İçerik sözlüğü sunucuda yüklü değil, fotoğraftan analiz şu an yapılamıyor." });
      return;
    }
    const started = Date.now();
    const validation = validateScan(parsed.data, vocabulary);
    const serverMs = Date.now() - started;
    if (process.env.NODE_ENV !== "production") {
      const failed = validation.boundaries.checks.filter((check) => !check.verified);
      console.log(
        `[scan] ${parsed.data.path ?? "-"} ${serverMs} ms readings=${parsed.data.readings.length} rows=${parsed.data.readings[0].rows.length} ` +
          `heading=${parsed.data.readings[0].heading} ` +
          `complete=${validation.complete}${failed.map((c) => `\n  ${c.kind} row ${c.row + 1}: ${c.reason} ["${c.before}" | "${c.after}"]`).join("")}`
      );
      if (validation.analysis) logMultiFrame(validation.analysis);
    }
    const boundaries = validation.boundaries.checks.filter((check) => !check.verified).map(({ kind, row, reason }) => ({ kind, row, reason }));
    const merged = validation.analysis?.merged;
    const statuses = outcome(validation);
    if (!validation.complete || !merged) {
      res.json({ complete: validation.complete, ...statuses, reliable: false, unverifiedBoundaries: boundaries, status: validation.analysis?.status ?? "incomplete", serverMs });
      return;
    }
    const { scoring, ingredients, ...details } = merged;
    const ingredientsText = ingredients.map((item) => item.matchedName ?? item.text).join(", ");
    // Unknown names OCR visibly misread: the app may take one more photo of where they are.
    const marked = ingredients.map((item) => (item.status === "unknown" ? { ...item, ocrSuspect: item.kind !== "unlisted" && ocrSuspect(item.text, item.suspected, vocabulary) } : item));
    res.json({ complete: true, ...statuses, unverifiedBoundaries: [], ingredientsText, reliable: scoring !== null, status: "ok", ...details, ingredients: marked, ...scoring, serverMs });
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
