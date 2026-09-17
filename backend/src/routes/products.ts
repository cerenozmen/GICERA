import { Router } from "express";
import { z } from "zod";
import { lookupProductByBarcode } from "../services/productService";
import { asyncHandler } from "../utils/asyncHandler";

const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/, "Barkod 8-14 haneli rakamlardan oluşmalıdır.");

export const productsRouter = Router();

// GET /api/products/:barcode
productsRouter.get(
  "/:barcode",
  asyncHandler(async (req, res) => {
    const parseResult = barcodeSchema.safeParse(req.params.barcode);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.issues[0]?.message ?? "Geçersiz barkod." });
      return;
    }

    const result = await lookupProductByBarcode(parseResult.data);
    res.status(result.found ? 200 : 404).json(result);
  })
);
