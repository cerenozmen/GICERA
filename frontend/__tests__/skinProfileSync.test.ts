jest.mock("../src/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../src/AuthContext", () => ({ useAuth: jest.fn() }));

import { sameProfile, syncAction } from "../src/SkinProfileSync";
import type { SkinProfile } from "../src/storage";

const HASSAS: SkinProfile = {
  skinType: "Hassas",
  concerns: ["Kızarıklık"],
  reactionFrequency: "Sık sık",
  sunBurns: "Evet",
  ageRange: "25-34",
  routineLevel: "Orta",
  pregnant: "Hayır",
  skinCondition: "Hayır",
};
const KURU: SkinProfile = { ...HASSAS, skinType: "Kuru" };
// As the server hands it back: same answers, keys sorted.
const HASSAS_FROM_SERVER = Object.fromEntries(Object.entries(HASSAS).sort(([a], [b]) => a.localeCompare(b))) as unknown as SkinProfile;

describe("syncAction: the phone's skin profile follows the signed-in account", () => {
  it("treats the server's key order as the same profile (no endless re-uploads)", () => {
    expect(sameProfile(HASSAS, HASSAS_FROM_SERVER)).toBe(true);
    expect(syncAction("u1", "u1", HASSAS, HASSAS_FROM_SERVER)).toBe("none");
  });

  it("without an account the profile stays on the phone", () => {
    expect(syncAction(undefined, null, HASSAS, undefined)).toBe("none");
    expect(syncAction(null, null, HASSAS, undefined)).toBe("none");
  });

  it("signing out clears the account's profile from the phone", () => {
    expect(syncAction("u1", null, HASSAS, undefined)).toBe("clear");
  });

  it("signing in loads the account's profile", () => {
    expect(syncAction(null, "u1", null, HASSAS)).toBe("load");
    expect(syncAction(null, "u1", KURU, HASSAS)).toBe("load");
  });

  it("the quiz taken before signing up becomes the new account's", () => {
    expect(syncAction(null, "u1", HASSAS, null)).toBe("upload");
  });

  it("another account's profile never carries over to an account without one", () => {
    expect(syncAction("u1", "u2", HASSAS, null)).toBe("clear");
  });

  it("while signed in: a changed profile is saved; a missing one comes from the account", () => {
    expect(syncAction("u1", "u1", KURU, HASSAS)).toBe("upload");
    expect(syncAction("u1", "u1", null, HASSAS)).toBe("load");
    expect(syncAction(undefined, "u1", HASSAS, undefined)).toBe("upload");
  });
});
