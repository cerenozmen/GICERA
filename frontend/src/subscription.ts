/** Barcode reads every new install gets before the paywall. */
export const FREE_SCANS = 3;

export type PlanId = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  label: string;
  /** Price in TL for one billing period. PLACEHOLDER: set the real store prices before release. */
  price: number;
  /** Billing period as shown after the price. */
  period: string;
}

export const PLANS: Record<PlanId, Plan> = {
  monthly: { id: "monthly", label: "Aylık", price: 79.99, period: "ay" },
  yearly: { id: "yearly", label: "Yıllık", price: 599.99, period: "yıl" },
};

/** Free reads still left (never negative). */
export function freeScansLeft(used: number): number {
  return Math.max(0, FREE_SCANS - used);
}

/** A barcode read is allowed while free reads remain, or with an active plan. */
export function canScan(used: number, premium: PlanId | null): boolean {
  return premium !== null || used < FREE_SCANS;
}

/** How much cheaper the yearly plan is than twelve monthly ones, in whole percent. */
export function yearlySavingsPercent(): number {
  const twelveMonths = PLANS.monthly.price * 12;
  return Math.round((1 - PLANS.yearly.price / twelveMonths) * 100);
}

/** "79,99 ₺" */
export function formatPrice(price: number): string {
  return `${price.toFixed(2).replace(".", ",")} ₺`;
}

/** The yearly plan's price per month, e.g. for "ayda yalnızca 50,00 ₺". */
export function yearlyPerMonth(): number {
  return PLANS.yearly.price / 12;
}

/**
 * Reconciles the phone's used-read count with the signed-in account's. The higher one wins, so reinstalling
 * the app can't give reads back and a fresh account can't either. `local` is what the phone should now
 * hold, `upload` whether the account is behind and needs the new count.
 */
export function reconcileScans(local: number, remote: number | undefined): { local: number; upload: boolean } {
  const account = remote ?? 0;
  const used = Math.max(local, account);
  return { local: used, upload: used > account };
}
