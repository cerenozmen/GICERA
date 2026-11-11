jest.mock("../src/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../src/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import { dataSyncAction } from "../src/DataSync";

const has = (at: number) => ({ empty: false, at });
const none = { empty: true, at: 0 };

describe("dataSyncAction: the phone's data follows the signed-in account", () => {
  it("does nothing without an account, and clears the phone's copy on signing out", () => {
    expect(dataSyncAction(undefined, null, has(5), null)).toBe("none");
    expect(dataSyncAction(null, null, has(5), null)).toBe("none");
    expect(dataSyncAction("u1", null, has(5), null)).toBe("clear");
  });

  it("uploads the phone's data when the account has none yet", () => {
    expect(dataSyncAction(undefined, "u1", has(5), null)).toBe("upload");
    expect(dataSyncAction(null, "u1", has(5), null)).toBe("clear"); // made without an account: not this account's
    expect(dataSyncAction(undefined, "u1", none, null)).toBe("none");
  });

  it("loads the account's copy on a fresh phone", () => {
    expect(dataSyncAction(undefined, "u1", none, { at: 9 })).toBe("load");
  });

  it("the newer copy wins for the same account", () => {
    expect(dataSyncAction(undefined, "u1", has(5), { at: 9 })).toBe("load");
    expect(dataSyncAction(undefined, "u1", has(9), { at: 5 })).toBe("upload");
    expect(dataSyncAction(undefined, "u1", has(7), { at: 7 })).toBe("none");
  });

  it("a deliberately emptied phone is uploaded, not refilled", () => {
    expect(dataSyncAction(undefined, "u1", { empty: true, at: 9 }, { at: 5 })).toBe("upload");
  });

  it("another account never inherits the previous account's data", () => {
    expect(dataSyncAction("u1", "u2", has(9), { at: 5 })).toBe("load");
    expect(dataSyncAction("u1", "u2", has(9), null)).toBe("clear");
    expect(dataSyncAction(null, "u2", has(9), { at: 5 })).toBe("load");
  });
});
