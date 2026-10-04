import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * A circular progress ring without an SVG library: two clipped half-rings rotated around the
 * center (the right half fills 0-180°, the left half 180-360°), clockwise from the top.
 */
export function ProgressRing({
  size,
  stroke,
  progress,
  color,
  track,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const half = size / 2;
  const degrees = Math.max(0, Math.min(1, progress)) * 360;
  const ring = { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: color };
  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: half, borderWidth: stroke, borderColor: track }]} />
      {/* right half: 0-180° */}
      <View style={[styles.clip, { left: half, width: half, height: size }]}>
        <View style={[styles.abs, { left: -half, width: size, height: size, transform: [{ rotate: `${Math.min(degrees, 180)}deg` }] }]}>
          <View style={[styles.clip, { left: 0, width: half, height: size }]}>
            <View style={ring} />
          </View>
        </View>
      </View>
      {/* left half: 180-360° */}
      <View style={[styles.clip, { left: 0, width: half, height: size }]}>
        <View style={[styles.abs, { left: 0, width: size, height: size, transform: [{ rotate: `${Math.max(degrees - 180, 0)}deg` }] }]}>
          <View style={[styles.clip, { left: half, width: half, height: size }]}>
            <View style={[ring, { marginLeft: -half }]} />
          </View>
        </View>
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: "absolute", top: 0, overflow: "hidden" },
  abs: { position: "absolute", top: 0 },
  center: { alignItems: "center", justifyContent: "center" },
});
