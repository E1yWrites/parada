import { type ReactNode, useMemo } from "react";
import {
  Text as RNText,
  type AccessibilityRole,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { fonts, fontSizes, letterSpacing, lineHeights } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

export type TextVariant =
  | "display"
  | "hero"
  | "title"
  | "section"
  | "body"
  | "bodySemi"
  | "caption"
  | "micro"
  | "mono"
  | "monoBold"
  | "plate";

type TextProps = {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  align?: "auto" | "left" | "right" | "center";
  numberOfLines?: number;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  /** Cap font scaling so fixed layouts (plates, badges, heros) never blow out.
   *  Defaults to 1.8. Pass a larger value (e.g. 2) on screens that must scale
   *  further for accessibility. */
  maxFontSizeMultiplier?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

function buildVariantStyles(colors: ColorTokens): Record<TextVariant, TextStyle> {
  return {
    display: {
      fontFamily: fonts.heading,
      fontSize: fontSizes.display,
      lineHeight: lineHeights.display,
      letterSpacing: letterSpacing.display,
      color: colors.foreground,
      fontVariant: ["tabular-nums"],
    },
    hero: {
      fontFamily: fonts.heading,
      fontSize: fontSizes.hero,
      lineHeight: lineHeights.hero,
      letterSpacing: letterSpacing.hero,
      color: colors.foreground,
    },
    title: {
      fontFamily: fonts.headingMedium,
      fontSize: fontSizes.title,
      lineHeight: lineHeights.title,
      letterSpacing: letterSpacing.title,
      color: colors.foreground,
    },
    section: {
      fontFamily: fonts.headingMedium,
      fontSize: fontSizes.section,
      lineHeight: lineHeights.section,
      color: colors.foreground,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: fontSizes.body,
      lineHeight: lineHeights.body,
      color: colors.foreground,
    },
    bodySemi: {
      fontFamily: fonts.bodySemi,
      fontSize: fontSizes.body,
      lineHeight: lineHeights.body,
      color: colors.foreground,
    },
    caption: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.caption,
      lineHeight: lineHeights.caption,
      color: colors.muted,
    },
    micro: {
      fontFamily: fonts.bodyBold,
      fontSize: fontSizes.micro,
      lineHeight: lineHeights.micro,
      color: colors.muted,
      letterSpacing: letterSpacing.micro,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: fontSizes.caption,
      lineHeight: lineHeights.caption,
      color: colors.foreground,
      fontVariant: ["tabular-nums"],
    },
    monoBold: {
      fontFamily: fonts.monoBold,
      fontSize: fontSizes.monoValue,
      lineHeight: lineHeights.monoValue,
      color: colors.foreground,
      fontVariant: ["tabular-nums"],
    },
    plate: {
      fontFamily: fonts.monoBold,
      fontSize: fontSizes.monoValue,
      lineHeight: lineHeights.monoValue,
      letterSpacing: 1.5,
      color: colors.foreground,
      fontVariant: ["tabular-nums"],
    },
  };
}

const baseStyle: TextStyle = { includeFontPadding: false };

export function Text({
  children,
  variant = "body",
  color,
  align,
  numberOfLines,
  accessibilityLabel,
  accessibilityRole,
  maxFontSizeMultiplier = 1.8,
  style,
  testID,
}: TextProps) {
  const colors = useColors();
  const variantStyles = useMemo(() => buildVariantStyles(colors), [colors]);
  return (
    <RNText
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        baseStyle,
        variantStyles[variant],
        align ? { textAlign: align } : undefined,
        color ? { color } : undefined,
        style,
      ]}>
      {children}
    </RNText>
  );
}
