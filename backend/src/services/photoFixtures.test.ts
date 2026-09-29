import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureAnalyzer, fixtureFrameAnalyzer, loadPhotoFixture, photoFixtureSlugs } from "./__fixtures__/photoFixtures";
import { inciKey } from "./ingredientCoverage";

// Every product recorded with `npm run photo:fixture` is checked against the rules that must hold for
// any product, whatever its packaging, print size, list length or lighting.
for (const slug of photoFixtureSlugs()) {
  const fixture = loadPhotoFixture(slug);
  const analyze = fixtureAnalyzer(fixture);
  const analyzeFrames = fixtureFrameAnalyzer(fixture);
  const { packaging, print, listLength } = fixture.product;
  // Single-frame shots, and multi-frame shots both as read from their first frame and merged: every
  // scored result must satisfy the same rules.
  const scored = fixture.shots.flatMap((shot) => {
    const results = [shot.text ? analyze(shot.text) : null, shot.frames ? analyzeFrames(shot.frames) : null];
    return results.flatMap((analysis) => (analysis?.scoring ? [{ shot, analysis }] : []));
  });

  describe(`${fixture.product.name} (${packaging}, ${print} print, ${listLength} list)`, () => {
    it("gives every scored shot the same score from the same flagged ingredients", () => {
      const summaries = scored.map(({ shot, analysis }) => ({
        shot: shot.id,
        score: analysis.scoring!.cleanScore,
        contributions: analysis.ingredients.filter((i) => i.contribution).map((i) => `${i.matchedName}:${i.contribution}`).sort(),
      }));
      for (const summary of summaries) {
        assert.deepEqual({ ...summary, shot: "" }, { ...summaries[0], shot: "" }, `${summary.shot} differs from ${summaries[0].shot}`);
      }
    });

    if (fixture.label) {
      const label = new Set(fixture.label.map(inciKey));
      it("never matches a read name to an ingredient that isn't on the label", () => {
        for (const { shot, analysis } of scored) {
          for (const item of analysis.ingredients) {
            if (item.matchedName) assert.ok(label.has(inciKey(item.matchedName)), `${shot.id}: ${item.text} → ${item.matchedName}`);
          }
        }
      });

      it("only scores shots in which every label ingredient left a trace", () => {
        for (const { shot, analysis } of scored) {
          const traced = new Set(analysis.ingredients.map((i) => inciKey(i.matchedName ?? i.nearest ?? "")));
          assert.deepEqual(fixture.label!.filter((name) => !traced.has(inciKey(name))), [], shot.id);
        }
      });
    }
  });
}
