export interface RoutineStep {
  key: string;
  title: string;
  text: string;
}

export const ROUTINES: Record<"Sabah" | "Akşam", RoutineStep[]> = {
  Sabah: [
    { key: "am-cleanser", title: "Temizleyici", text: "Cildini nazikçe temizle." },
    { key: "am-toner", title: "Tonik", text: "Cildini dengele." },
    { key: "am-moisturizer", title: "Nemlendirici", text: "Nemini destekle." },
    { key: "am-spf", title: "Güneş koruyucu", text: "Cildini koru." },
  ],
  Akşam: [
    { key: "pm-cleanser", title: "Temizleyici", text: "Günün kirini ve makyajı temizle." },
    { key: "pm-serum", title: "Serum", text: "Odak konuna uygun bakımı uygula." },
    { key: "pm-moisturizer", title: "Nemlendirici", text: "Gece boyunca onarımı destekle." },
  ],
};

export type Period = keyof typeof ROUTINES;

/** A product placed on a routine step ("Ürünü Rutine Ekle"). */
export interface RoutineProduct {
  barcode: string;
  productName: string | null;
}
