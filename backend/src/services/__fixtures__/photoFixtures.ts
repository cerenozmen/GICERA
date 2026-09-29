import { readdirSync, readFileSync } from "fs";
import path from "path";
import { ScoringResult } from "../../types/product";
import { analyzeFrames } from "../frameMerge";
import { analyzePhotoIngredients, buildVocabulary, PhotoAnalysis } from "../ingredientCoverage";
import { parseIngredientsText } from "../scoringService";

/** Real photos of one product, recorded with `npm run photo:fixture` (see src/scripts/photoFixture.ts). */
export interface PhotoFixture {
  product: { slug: string; name: string; packaging: string; print: string; listLength: string };
  label: string[] | null;
  shots: {
    id: string;
    lighting: string;
    status: string;
    text: string | null;
    /** Multi-frame captures: every frame's extraction (status/text above are the first frame's). */
    frames?: { status: string; text: string | null }[];
  }[];
  vocabulary: { inventory: string[]; flagged: string[] };
  penalties: Record<string, number>;
  pregnancyUnsafe: string[];
}

const FIXTURE_DIR = path.join(__dirname, "photo");

export function photoFixtureSlugs(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));
}

export function loadPhotoFixture(slug: string): PhotoFixture {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${slug}.json`), "utf8"));
}

/** Analyses a text with the fixture's vocabulary slice, deducting what the real scorer deducted when recorded. */
export function fixtureAnalyzer(fixture: PhotoFixture): (text: string) => PhotoAnalysis {
  const { vocabulary, score } = fixtureScoring(fixture);
  return (text) => analyzePhotoIngredients(parseIngredientsText(text), vocabulary, score);
}

/** The same for a multi-frame shot: its frames merged (see frameMerge.ts). */
export function fixtureFrameAnalyzer(fixture: PhotoFixture): (frames: { status: string; text: string | null }[]) => PhotoAnalysis | null {
  const { vocabulary, score } = fixtureScoring(fixture);
  return (frames) =>
    analyzeFrames(
      frames.map((frame) => ({ status: frame.status, tokens: parseIngredientsText(frame.text) })),
      vocabulary,
      score
    ).merged;
}

function fixtureScoring(fixture: PhotoFixture) {
  const vocabulary = buildVocabulary(fixture.vocabulary.inventory, fixture.vocabulary.flagged);
  const score = (names: string[]): ScoringResult => {
    const flagged = names.filter((name) => fixture.penalties[name]);
    const cleanScore = Math.max(0, 100 - flagged.reduce((sum, name) => sum + fixture.penalties[name], 0));
    return {
      cleanScore,
      cleanRating: cleanScore >= 80 ? "clean" : cleanScore >= 50 ? "moderate" : "riskli",
      pregnancySafe: !names.some((name) => fixture.pregnancyUnsafe.includes(name)),
      flaggedIngredients: flagged.map((inciName) => ({ inciName, restrictionType: "restricted", notes: null })),
    };
  };
  return { vocabulary, score };
}
