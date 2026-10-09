import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerToken, cleanName, isRecoveryToken, PASSWORD_RULE, passwordProblem, toAuthFailure } from "./authRules";

describe("toAuthFailure", () => {
  it("maps known Supabase codes to Turkish messages and a status", () => {
    const failure = toAuthFailure({ code: "invalid_credentials", status: 400 });
    assert.equal(failure.status, 401);
    assert.match(failure.message, /hatalı/);
  });

  it("falls back on the HTTP status and never leaks the raw message", () => {
    assert.equal(toAuthFailure({ status: 429, message: "secret" }).status, 429);
    const unknown = toAuthFailure({ status: 500, message: "db password is x" });
    assert.equal(unknown.status, 502);
    assert.doesNotMatch(unknown.message, /db password/);
  });
});

describe("passwordProblem", () => {
  it("wants 8+ characters with upper-case, lower-case and a digit", () => {
    for (const weak of ["Kisa1", "hepsikucuk1", "HEPSIBUYUK1", "HarfVeSayisiz"]) assert.equal(passwordProblem(weak), PASSWORD_RULE);
    assert.equal(passwordProblem("Yeterli123"), null);
    assert.equal(passwordProblem("Şifrem2026"), null);
  });
});

describe("isRecoveryToken", () => {
  const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  const now = 1_000_000;

  it("accepts a fresh token that came from an e-mailed link", () => {
    assert.equal(isRecoveryToken(token({ iat: now - 60, amr: [{ method: "recovery" }] }), now), true);
    assert.equal(isRecoveryToken(token({ iat: now - 60, amr: [{ method: "otp" }] }), now), true);
  });

  it("rejects ordinary sign-in tokens, stale tokens and junk", () => {
    assert.equal(isRecoveryToken(token({ iat: now - 60, amr: [{ method: "password" }] }), now), false);
    assert.equal(isRecoveryToken(token({ iat: now - 60, amr: [{ method: "oauth" }] }), now), false);
    assert.equal(isRecoveryToken(token({ iat: now - 3600, amr: [{ method: "recovery" }] }), now), false);
    assert.equal(isRecoveryToken(token({ iat: now - 60 }), now), false);
    assert.equal(isRecoveryToken("not-a-jwt", now), false);
  });
});

describe("bearerToken", () => {
  it("reads a Bearer header and rejects anything else", () => {
    assert.equal(bearerToken("Bearer abc.def"), "abc.def");
    assert.equal(bearerToken("bearer abc"), "abc");
    assert.equal(bearerToken("Basic abc"), null);
    assert.equal(bearerToken(undefined), null);
  });
});

describe("cleanName", () => {
  it("trims, collapses spaces and caps the length", () => {
    assert.equal(cleanName("  Ayşe   Nur "), "Ayşe Nur");
    assert.equal(cleanName("a".repeat(100)).length, 40);
  });
});
