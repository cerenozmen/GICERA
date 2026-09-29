import { inciKey } from "../services/ingredientCoverage";

/*
 * Scan results against the product's label (development measurements: photoPoc.ts, ocrBench.ts).
 */

/** Against the label: a name recovered is one the analysis matched exactly (no fuzzy matching). */
export function compare(analysis: { ingredients: { text: string; status: string; matchedName?: string; nearest?: string }[] } | null, label: string[]) {
  const matchedList = analysis?.ingredients.filter((i) => i.matchedName).map((i) => inciKey(i.matchedName!)) ?? [];
  // A label name the analysis splits into two known names ("Iron Oxide CI 77492" → iron oxide, ci
  // 77492) counts as recovered when both were matched, one after the other.
  const pairs = new Set(matchedList.slice(1).map((key, i) => matchedList[i] + key));
  const matched = new Set([...matchedList, ...pairs]);
  const parts = new Set(label.filter((l) => pairs.has(inciKey(l))).flatMap((l) => matchedList.filter((key, i) => (matchedList[i + 1] && key + matchedList[i + 1] === inciKey(l)) || (i > 0 && matchedList[i - 1] + key === inciKey(l)))));
  const recovered = label.filter((l) => matched.has(inciKey(l)));
  const unknownItems = analysis?.ingredients.filter((i) => i.status === "unknown") ?? [];
  // Read but misread: an unknown item sharing a 4+ letter word with a label name not recovered.
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const notRecovered = label.filter((l) => !matched.has(inciKey(l)));
  const resembles = (i: { text: string; nearest?: string }, l: string) => words(l).some((w) => words(i.text).includes(w)) || (!!i.nearest && inciKey(i.nearest) === inciKey(l));
  const incorrect = unknownItems.filter((i) => notRecovered.some((l) => resembles(i, l)));
  const missing = notRecovered.filter((l) => !incorrect.some((i) => resembles(i, l)));
  const extra = [
    ...(analysis?.ingredients.filter((i) => i.matchedName && !parts.has(inciKey(i.matchedName)) && !label.some((l) => inciKey(l) === inciKey(i.matchedName!))).map((i) => i.text) ?? []),
    ...unknownItems.filter((i) => !incorrect.includes(i)).map((i) => i.text),
  ];
  return { recovered, missing, incorrect: incorrect.map((i) => i.text), extra, unknown: unknownItems.map((i) => i.text) };
}

