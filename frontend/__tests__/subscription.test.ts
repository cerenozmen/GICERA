import { canScan, formatPrice, FREE_SCANS, freeScansLeft, PLANS, reconcileScans, yearlyPerMonth, yearlySavingsPercent } from "../src/subscription";

describe("free barcode reads", () => {
  it("gives a new install three reads, then closes", () => {
    expect(FREE_SCANS).toBe(3);
    expect(freeScansLeft(0)).toBe(3);
    expect(freeScansLeft(2)).toBe(1);
    expect(canScan(0, null)).toBe(true);
    expect(canScan(2, null)).toBe(true);
    expect(canScan(3, null)).toBe(false);
    expect(canScan(7, null)).toBe(false);
  });

  it("never reports negative reads left", () => {
    expect(freeScansLeft(10)).toBe(0);
  });

  it("lets a plan holder scan without limit", () => {
    expect(canScan(3, "monthly")).toBe(true);
    expect(canScan(50, "yearly")).toBe(true);
  });
});

describe("plans", () => {
  it("makes the yearly plan cheaper than twelve months", () => {
    expect(PLANS.yearly.price).toBeLessThan(PLANS.monthly.price * 12);
    expect(yearlySavingsPercent()).toBeGreaterThan(0);
    expect(yearlyPerMonth()).toBeLessThan(PLANS.monthly.price);
  });

  it("formats prices the Turkish way", () => {
    expect(formatPrice(79.99)).toBe("79,99 ₺");
    expect(formatPrice(50)).toBe("50,00 ₺");
  });
});

describe("reconcileScans", () => {
  it("keeps the higher count and uploads only when the account is behind", () => {
    expect(reconcileScans(0, 0)).toEqual({ local: 0, upload: false });
    expect(reconcileScans(2, 0)).toEqual({ local: 2, upload: true });
    expect(reconcileScans(1, 3)).toEqual({ local: 3, upload: false });
    expect(reconcileScans(3, 3)).toEqual({ local: 3, upload: false });
  });

  it("treats a missing account count as zero", () => {
    expect(reconcileScans(0, undefined)).toEqual({ local: 0, upload: false });
    expect(reconcileScans(2, undefined)).toEqual({ local: 2, upload: true });
  });
});
