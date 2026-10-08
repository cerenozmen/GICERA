import { displayName, isEmail, PASSWORD_RULE, passwordProblem } from "../src/formRules";

describe("isEmail", () => {
  it("accepts ordinary addresses and rejects obvious typos", () => {
    expect(isEmail("ayse@gmail.com")).toBe(true);
    expect(isEmail("  ayse@gmail.com ")).toBe(true);
    expect(isEmail("ayse@gmail")).toBe(false);
    expect(isEmail("ayse gmail.com")).toBe(false);
    expect(isEmail("")).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("wants 8+ characters with upper-case, lower-case and a digit", () => {
    expect(passwordProblem("Kisa1")).toBe(PASSWORD_RULE);
    expect(passwordProblem("hepsikucuk1")).toBe(PASSWORD_RULE);
    expect(passwordProblem("HEPSIBUYUK1")).toBe(PASSWORD_RULE);
    expect(passwordProblem("HarfVeSayisiz")).toBe(PASSWORD_RULE);
    expect(passwordProblem("Yeterli123")).toBeNull();
  });

  it("counts Turkish letters", () => {
    expect(passwordProblem("Şifrem2026")).toBeNull();
    expect(passwordProblem("şifrem2026")).toBe(PASSWORD_RULE);
  });
});

describe("displayName", () => {
  it("prefers the full name, then the e-mail's name part", () => {
    expect(displayName({ firstName: "Ayşe", lastName: "Nur", email: "a@b.co" })).toBe("Ayşe Nur");
    expect(displayName({ firstName: "", lastName: "", email: "ayse@b.co" })).toBe("ayse");
  });
});
