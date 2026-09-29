/**
 * INCI names found on real labels that the CosIng inventory (cosing_ingredients) doesn't list yet,
 * kept by hand. They join the photo-analysis vocabulary as ordinary known names: matched exactly,
 * scored like any unflagged name (only restricted substances carry penalties).
 *
 * Add a name only as printed on a label, spelled in full, after checking it is a real ingredient
 * and not a restricted substance.
 */
export const SUPPLEMENTARY_INCI: readonly string[] = [
  // Skin Sensual eye cream (2026-09): a Deinococcus radiodurans ferment.
  "Deinococcus Ferment Extract Filtrate",
];
