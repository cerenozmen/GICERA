import { supabase } from "../db/supabaseClient";

export interface NewContribution {
  barcode: string;
  productName: string;
  brands?: string;
  ingredientsText: string;
  contributorEmail?: string;
}

export interface ContributionRecord {
  id: string;
  barcode: string;
  productName: string;
  brands: string | null;
  ingredientsText: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export async function submitContribution(input: NewContribution): Promise<ContributionRecord> {
  const { data, error } = await supabase
    .from("user_contributions")
    .insert({
      barcode: input.barcode,
      product_name: input.productName,
      brands: input.brands ?? null,
      ingredients_text: input.ingredientsText,
      contributor_email: input.contributorEmail ?? null,
    })
    .select("id, barcode, product_name, brands, ingredients_text, status, created_at")
    .single();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return {
    id: data.id,
    barcode: data.barcode,
    productName: data.product_name,
    brands: data.brands,
    ingredientsText: data.ingredients_text,
    status: data.status,
    createdAt: data.created_at,
  };
}
