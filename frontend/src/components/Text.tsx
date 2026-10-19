import { forwardRef } from "react";
import { Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps } from "react-native";

/** System font size can scale text up to this far; beyond it layouts (buttons, tab bar, cards) start to break. */
export const MAX_FONT_SCALE = 1.3;

/** The app's `Text`: React Native's, with font scaling capped (a screen can still pass its own `maxFontSizeMultiplier`). */
export function Text(props: TextProps) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>((props, ref) => (
  <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />
));
TextInput.displayName = "TextInput";
export type TextInput = RNTextInput;
