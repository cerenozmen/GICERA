import assert from "node:assert/strict";
import { test } from "node:test";
import { nameFromReply } from "./productNameRules";

test("keeps a plain name and strips quotes and the full stop", () => {
  assert.equal(nameFromReply('"Splat Diş Macunu".'), "Splat Diş Macunu");
});

test("takes the first line and drops a label", () => {
  assert.equal(nameFromReply("Ad: Yüz Serumu\nÇünkü içinde niasinamid var"), "Yüz Serumu");
});

test("returns null for BILINMIYOR, empty or overlong replies", () => {
  assert.equal(nameFromReply("BILINMIYOR"), null);
  assert.equal(nameFromReply("  "), null);
  assert.equal(nameFromReply(null), null);
  assert.equal(nameFromReply("Kendi taramam Serum"), null);
  assert.equal(nameFromReply("x".repeat(80)), null);
});
