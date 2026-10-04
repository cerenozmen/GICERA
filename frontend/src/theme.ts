import { Platform } from "react-native";
import { CleanRating } from "./types";

export const colors = {
  bg: "#F8F4EE",
  card: "#FFFFFF",
  primary: "#1F4D3A",
  primaryDark: "#173A2C",
  primaryLight: "#E6EEE7",
  accent: "#F26B2A",
  accentLight: "#FDEBE1",
  peach: "#FCE9DF",
  blush: "#F6DCD8",
  blushLight: "#FBEAE7",
  text: "#1F2A24",
  muted: "#7A7F7B",
  border: "#ECE6DE",
  danger: "#C0503F",
  dangerLight: "#FBE3DF",
  warning: "#E07B39",
  warningLight: "#FCEFE4",
  scanBg: "#1E2A24",
};

export const serif = Platform.select({ ios: "Georgia", default: "serif" });

export const ratingStyle: Record<CleanRating, { label: string; color: string; bg: string }> = {
  clean: { label: "Temiz Ürün", color: colors.primary, bg: colors.primaryLight },
  moderate: { label: "Orta", color: colors.warning, bg: colors.warningLight },
  riskli: { label: "Riskli", color: colors.danger, bg: colors.dangerLight },
};

export const shadow = {
  shadowColor: "#5A4A3A",
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
};
