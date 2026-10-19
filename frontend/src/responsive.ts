import { useWindowDimensions } from "react-native";

/** On tablets and landscape the app stays a centered column this wide (see App.tsx). */
export const MAX_CONTENT_WIDTH = 560;

/** The phone width the screens were designed on. */
const DESIGN_WIDTH = 375;

/** Below this the screen counts as small (e.g. 320-359 dp phones). */
const SMALL_WIDTH = 360;

/** A design size grown or shrunk with the screen width, but only within ±15 % so nothing gets absurd. */
export function scaleSize(size: number, contentWidth: number): number {
  const factor = Math.min(1.15, Math.max(0.85, contentWidth / DESIGN_WIDTH));
  return Math.round(size * factor);
}

/** Width the app's content actually gets: the window, capped at MAX_CONTENT_WIDTH. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
  return {
    /** Content column width in dp. */
    width: contentWidth,
    height,
    isSmall: contentWidth < SMALL_WIDTH,
    isShort: height < 640,
    isWide: width > MAX_CONTENT_WIDTH,
    /** Scales a design size to this screen (hero images, cards with a fixed width). */
    scale: (size: number) => scaleSize(size, contentWidth),
  };
}
