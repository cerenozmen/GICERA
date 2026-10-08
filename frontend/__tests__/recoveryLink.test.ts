import { parseRecoveryLink } from "../src/recoveryLink";

describe("parseRecoveryLink", () => {
  it("reads the session from a recovery link's fragment", () => {
    expect(parseRecoveryLink("gicera://reset-password#access_token=aaa.bbb.ccc&refresh_token=rrr&expires_in=3600&type=recovery")).toEqual({
      accessToken: "aaa.bbb.ccc",
      refreshToken: "rrr",
    });
  });

  it("reports an expired or used link as failed", () => {
    expect(parseRecoveryLink("gicera://reset-password#error=access_denied&error_code=otp_expired&error_description=Link+expired")).toEqual({ failed: true });
  });

  it("ignores other links, other link types and half a session", () => {
    expect(parseRecoveryLink(null)).toBeNull();
    expect(parseRecoveryLink("https://example.com/#access_token=a&refresh_token=b")).toBeNull();
    expect(parseRecoveryLink("gicera://reset-passwordx#access_token=a&refresh_token=b")).toBeNull();
    expect(parseRecoveryLink("gicera://reset-password#access_token=a")).toBeNull();
    expect(parseRecoveryLink("gicera://reset-password#access_token=a&refresh_token=b&type=signup")).toBeNull();
    expect(parseRecoveryLink("gicera://reset-password#access_token=%E0%A4%A")).toBeNull();
  });
});
