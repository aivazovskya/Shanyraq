import { TextStyle } from 'react-native';
import { SpringPresets, MotionDurations } from '../lib/motion';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryBg: string;
  onPrimary: string;

  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  border: string;
  borderFocus: string;

  text: string;
  textMuted: string;
  textLight: string;

  success: string;
  successBg: string;
  successBorder: string;
  onSuccess: string;

  warning: string;
  warningBg: string;
  warningBorder: string;
  onWarning: string;

  danger: string;
  dangerDark: string;
  dangerBg: string;
  dangerBorder: string;
  onDanger: string;

  info: string;
  infoBg: string;
  infoBorder: string;
  onInfo: string;

  card: string;
  overlay: string;

  tabBarBg: string;
  tabBarBorder: string;
  tabBarActiveIndicator: string;

  shimmerStart: string;
  shimmerEnd: string;
}

export const lightColors: ThemeColors = {
  primary: '#1A6BAA', // Tengri sky; WCAG AA with #FFFFFF
  primaryDark: '#14568A',
  primaryLight: '#D9ECF7',
  primaryBg: '#EAF4FB',
  onPrimary: '#FFFFFF',

  background: '#EEF2F4', // felt
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#E4EAEE',
  border: '#DCE4E9',
  borderFocus: '#1A6BAA',

  text: '#0C2233', // night sky
  textMuted: '#4F6372',
  textLight: '#8A9BA8',

  success: '#23765A', // steppe
  successBg: '#DDF0E8',
  successBorder: '#A9D8C5',
  onSuccess: '#FFFFFF',

  warning: '#B45309',
  warningBg: '#FEF3C7',
  warningBorder: '#FDE68A',
  onWarning: '#FFFFFF',

  danger: '#B3342A',
  dangerDark: '#9E2B21',
  dangerBg: '#F8DEDA',
  dangerBorder: '#F0B8B0',
  onDanger: '#FFFFFF',

  info: '#2563EB',
  infoBg: '#EFF6FF',
  infoBorder: '#BFDBFE',
  onInfo: '#FFFFFF',

  card: '#FFFFFF',
  overlay: 'rgba(12, 34, 51, 0.45)',

  tabBarBg: 'rgba(255, 255, 255, 0.94)',
  tabBarBorder: 'rgba(220, 228, 233, 0.9)',
  tabBarActiveIndicator: '#D9ECF7',

  shimmerStart: '#DCE4E9',
  shimmerEnd: '#EEF2F4',
};

export const darkColors: ThemeColors = {
  primary: '#5FB3E8',
  primaryDark: '#3C95CF',
  primaryLight: '#10405F',
  primaryBg: '#0B2A3E',
  onPrimary: '#06202F',

  background: '#08141E',
  surface: '#0F2231',
  surfaceElevated: '#16303F',
  surfaceSubtle: '#133040',
  border: '#1B3B4D',
  borderFocus: '#5FB3E8',

  text: '#F2F7FA',
  textMuted: '#9DB4C3',
  textLight: '#6E8A9C',

  success: '#4CC49A',
  successBg: '#0F3A2D',
  successBorder: '#2E8B6A',
  onSuccess: '#06231A',

  warning: '#FBBF24',
  warningBg: '#451A03',
  warningBorder: '#B45309',
  onWarning: '#062117',

  danger: '#F28B82',
  dangerDark: '#7F1D1D',
  dangerBg: '#3D1512',
  dangerBorder: '#C03A2E',
  onDanger: '#2A0A07',

  info: '#93C5FD',
  infoBg: '#1E3A8A',
  infoBorder: '#1D4ED8',
  onInfo: '#062117',

  card: '#0F2231',
  overlay: 'rgba(0, 0, 0, 0.75)',

  tabBarBg: 'rgba(15, 34, 49, 0.94)',
  tabBarBorder: 'rgba(27, 59, 77, 0.9)',
  tabBarActiveIndicator: '#16303F',

  shimmerStart: '#16303F',
  shimmerEnd: '#1F4155',
};

export const fontFamilies = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semiBold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extraBold: 'Onest_700Bold',
  displayMedium: 'Geologica_500Medium',
  display: 'Geologica_700Bold',
  displayHeavy: 'Geologica_800ExtraBold',
};

export interface TypographyScale {
  display: TextStyle;
  title: TextStyle;
  headline: TextStyle;
  body: TextStyle;
  bodyMedium: TextStyle;
  callout: TextStyle;
  caption: TextStyle;
  tabularNums: TextStyle;
}

export const typography: TypographyScale = {
  display: {
    fontFamily: fontFamilies.displayHeavy,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headline: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodyMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  callout: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  tabularNums: {
    fontVariant: ['tabular-nums'],
  },
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
};

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 9999,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
};

export interface ThemeTokens {
  colors: ThemeColors;
  typography: TypographyScale;
  spacing: typeof spacing;
  radii: typeof radii;
  shadows: typeof shadows;
  spring: typeof SpringPresets;
  durations: typeof MotionDurations;
  isDark: boolean;
}

export function createTheme(colors: ThemeColors, isDark: boolean): ThemeTokens {
  return {
    colors,
    typography,
    spacing,
    radii,
    shadows,
    spring: SpringPresets,
    durations: MotionDurations,
    isDark,
  };
}

export const lightTheme = createTheme(lightColors, false);
export const darkTheme = createTheme(darkColors, true);
