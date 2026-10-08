import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDisposableEmail } from "./disposableDomains";

describe("isDisposableEmail", () => {
  it("blocks known throwaway providers, whatever the case", () => {
    assert.equal(isDisposableEmail("biri@mailinator.com"), true);
    assert.equal(isDisposableEmail("Biri@YOPMAIL.com"), true);
    assert.equal(isDisposableEmail("  x@10minutemail.com "), true);
  });

  it("blocks subdomains of a throwaway provider", () => {
    assert.equal(isDisposableEmail("x@abc.mailinator.com"), true);
  });

  it("lets ordinary providers and look-alike names through", () => {
    for (const ok of ["a@gmail.com", "a@outlook.com", "a@icloud.com", "a@hotmail.com", "a@firma.com.tr", "a@notmailinator.org", "a@mymailinator.com"]) {
      assert.equal(isDisposableEmail(ok), false, ok);
    }
  });

  it("handles input without a domain", () => {
    assert.equal(isDisposableEmail(""), false);
    assert.equal(isDisposableEmail("yazi"), false);
  });
});
