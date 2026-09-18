import { Platform } from "react-native";
import { CleanRating } from "./types";

export const colors = {
  bg: "#FBF3F0",
  card: "#FFFFFF",
  primary: "#3F6B4F",
  primaryLight: "#E3F1E4",
  blush: "#F6DCD8",
  blushLight: "#FBEAE7",
  text: "#2B2B2B",
  muted: "#7D7D7D",
  border: "#EFE3DF",
  danger: "#C0503F",
  dangerLight: "#FBE3DF",
  warning: "#D9932B",
  warningLight: "#FCEFD6",
};

export const serif = Platform.select({ ios: "Georgia", default: "serif" });

export const ratingStyle: Record<CleanRating, { label: string; color: string; bg: string }> = {
  clean: { label: "Temiz Ürün", color: colors.primary, bg: colors.primaryLight },
  moderate: { label: "Orta", color: colors.warning, bg: colors.warningLight },
  riskli: { label: "Riskli", color: colors.danger, bg: colors.dangerLight },
};

export const shadow = {
  shadowColor: "#8A5A50",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
