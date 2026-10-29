import React from 'react';
import { StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';
import { fontFamilies } from '../../theme/tokens';

const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': fontFamilies.regular,
  '200': fontFamilies.regular,
  '300': fontFamilies.regular,
  '400': fontFamilies.regular,
  normal: fontFamilies.regular,
  '500': fontFamilies.medium,
  '600': fontFamilies.semiBold,
  '700': fontFamilies.bold,
  bold: fontFamilies.bold,
  '800': fontFamilies.bold,
  '900': fontFamilies.bold,
};

const DISPLAY_MIN_SIZE = 20;

/**
 * Brand-aware replacement for react-native's Text.
 * Picks the Onest face that matches fontWeight, and Geologica for large bold
 * headings. Custom faces ship one weight each, so fontWeight is dropped to
 * avoid synthetic bolding on Android. An explicit fontFamily always wins.
 */
export function resolveTextStyle(style: TextStyle): TextStyle {
  if (style.fontFamily) return style;
  const { fontWeight, ...rest } = style;
  const weight = String(fontWeight ?? '400');
  const size = typeof style.fontSize === 'number' ? style.fontSize : 15;
  const isHeavy = weight === '700' || weight === 'bold' || weight === '800' || weight === '900';
  let fontFamily = WEIGHT_TO_FAMILY[weight] ?? fontFamilies.regular;
  if (isHeavy && size >= DISPLAY_MIN_SIZE) {
    fontFamily = weight === '700' || weight === 'bold' ? fontFamilies.display : fontFamilies.displayHeavy;
  }
  return { ...rest, fontFamily };
}

export function Text({ style, ...props }: TextProps) {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  return <RNText {...props} style={resolveTextStyle(flat)} />;
}
