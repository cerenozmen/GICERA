import { Platform } from "react-native";
import { CleanRating } from "./types";

export const colors = {
  bg: "#F8F4EE",
  card: "#FFFFFF",
  primary: "#4A7A62",
  primaryDark: "#3B6350",
  primaryLight: "#E8F0EA",
  primaryMid: "#7FAE93",
  primaryMint: "#B4D8C2",
  primaryTint: "#D5E5DA",
  accent: "#F4A06B",
  accentLight: "#FDEEE3",
  accentDark: "#E08A52",
  accentTint: "#FAD9C3",
  peach: "#FDEEE3",
  blush: "#FDEEE3",
  blushLight: "#FDEEE3",
  text: "#1F2A24",
  muted: "#7A7F7B",
  border: "#ECE6DE",
  surface: "#F1ECE5",
  line: "#D8D2C8",
  danger: "#E08A52",
  dangerLight: "#FDEEE3",
  warning: "#F4A06B",
  warningLight: "#FDEEE3",
  scanBg: "#1E2A24",
};

/** Product risk colors (Temiz / Orta / Riskli, score card, ingredient flags). Fixed on purpose: not part of the pastel app palette. */
export const risk = {
  ok: "#3E8E5E",
  okText: "#1F4D3A",
  okBg: "#E6EEE7",
  okRing: "#8CC79A",
  caution: "#F26B2A",
  cautionBg: "#FDEBE1",
  warn: "#E07B39",
  warnBg: "#FCEFE4",
  warnRing: "#F5A26B",
  bad: "#C0503F",
  badBg: "#FBE3DF",
  badRing: "#E8806F",
  card: "#1F4D3A",
};

/** The logo artwork's own cream, so its faded edges disappear into the page. */
export const LOGO_BG = "#FBF4ED";

export const serif =Platform.select({ ios: "Georgia", default: "serif" });

/** The intro's display serif (DM Serif Display, SIL OFL; android/app/src/main/assets/fonts). */
export const display = Platform.select({ android: "DMSerifDisplay-Regular", default: serif });

export const ratingStyle: Record<CleanRating, { label: string; color: string; bg: string }> = {
  clean: { label: "Temiz Ürün", color: risk.okText, bg: risk.okBg },
  moderate: { label: "Orta", color: risk.warn, bg: risk.warnBg },
  riskli: { label: "Riskli", color: risk.bad, bg: risk.badBg },
};

export const shadow = {
  shadowColor: "#5A4A3A",
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
};
