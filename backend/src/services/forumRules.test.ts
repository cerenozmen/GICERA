import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRateLimiter, DEVICE_ID, embeddedCount, sanitizeSearch } from "./forumRules";

describe("sanitizeSearch: text inside a PostgREST or=(...) filter", () => {
  it("keeps ordinary Turkish search words", () => {
    assert.equal(sanitizeSearch("  C vitamini   serum "), "C vitamini serum");
    assert.equal(sanitizeSearch("güneş kremi"), "güneş kremi");
  });

  it("drops the filter's separators so a query can't add conditions", () => {
    assert.equal(sanitizeSearch("x%,device_id.eq.abc"), "x device id eq abc");
    assert.equal(sanitizeSearch("a),or(title.ilike.*"), "a or title ilike");
  });

  it("drops LIKE wildcards and caps the length", () => {
    assert.equal(sanitizeSearch("%_%"), "");
    assert.equal(sanitizeSearch("a".repeat(200)).length, 80);
  });
});

describe("embeddedCount", () => {
  it("reads Supabase's [{ count }] and defaults to 0", () => {
    assert.equal(embeddedCount([{ count: 4 }]), 4);
    assert.equal(embeddedCount([]), 0);
    assert.equal(embeddedCount(null), 0);
  });
});

describe("DEVICE_ID", () => {
  it("accepts server-issued UUIDs only", () => {
    assert.ok(DEVICE_ID.test("3f2b8c1e-9d4a-4c1b-8e2f-0a1b2c3d4e5f"));
    assert.ok(!DEVICE_ID.test("me"));
    assert.ok(!DEVICE_ID.test("3f2b8c1e-9d4a-4c1b-8e2f-0a1b2c3d4e5f,x"));
  });
});

describe("createRateLimiter", () => {
  it("allows `limit` writes per window per device, then again once the window passes", () => {
    let now = 0;
    const allow = createRateLimiter(2, 1000, () => now);
    assert.ok(allow("a"));
    assert.ok(allow("a"));
    assert.ok(!allow("a"));
    assert.ok(allow("b"));
    now = 1001;
    assert.ok(allow("a"));
  });
});
