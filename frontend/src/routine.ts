export interface RoutineStep {
  key: string;
  title: string;
  text: string;
}

/** Quick picks offered when adding a step; any other name can be typed too. */
export const STEP_SUGGESTIONS = ["Temizleyici", "Tonik", "Serum", "Göz kremi", "Nemlendirici", "Güneş koruyucu", "Maske"];

/** A product placed on a routine step ("Ürünü Rutine Ekle"). */
export interface RoutineProduct {
  barcode: string;
  productName: string | null;
}
