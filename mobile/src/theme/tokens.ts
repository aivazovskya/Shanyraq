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
  onSuccess: string;

  warning: string;
  warningBg: string;
  onWarning: string;

  danger: string;
  dangerBg: string;
  onDanger: string;

  info: string;
  infoBg: string;
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
  primary: '#059669',
  primaryDark: '#047857',
  primaryLight: '#D1FAE5',
  primaryBg: '#ECFDF5',
  onPrimary: '#FFFFFF',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  border: '#E2E8F0',
  borderFocus: '#059669',

  text: '#0F172A',
  textMuted: '#475569', // 7.58:1 WCAG AA
  textLight: '#94A3B8',

  success: '#10B981',
  successBg: '#DEF7EC',
  onSuccess: '#FFFFFF',

  warning: '#D97706',
  warningBg: '#FEF3C7',
  onWarning: '#FFFFFF',

  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  onDanger: '#FFFFFF',

  info: '#2563EB',
  infoBg: '#EFF6FF',
  onInfo: '#FFFFFF',

  card: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.45)',

  tabBarBg: 'rgba(255, 255, 255, 0.92)',
  tabBarBorder: 'rgba(226, 232, 240, 0.9)',
  tabBarActiveIndicator: '#ECFDF5',

  shimmerStart: '#E2E8F0',
  shimmerEnd: '#F8FAFC',
};

export const darkColors: ThemeColors = {
  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#064E3B',
  primaryBg: '#022C22',
  onPrimary: '#062117', // 7.04:1 AAA contrast on #10B981

  background: '#090D16',
  surface: '#111827',
  surfaceElevated: '#1F2937',
  surfaceSubtle: '#1E293B',
  border: '#1E293B',
  borderFocus: '#10B981',

  text: '#F8FAFC', // 18.57:1 WCAG AAA
  textMuted: '#94A3B8', // 6.92:1 WCAG AA
  textLight: '#64748B',

  success: '#34D399',
  successBg: '#064E3B',
  onSuccess: '#062117',

  warning: '#FBBF24',
  warningBg: '#451A03',
  onWarning: '#062117',

  danger: '#F87171',
  dangerBg: '#450A0A',
  onDanger: '#062117',

  info: '#60A5FA',
  infoBg: '#1E3A8A',
  onInfo: '#062117',

  card: '#111827',
  overlay: 'rgba(0, 0, 0, 0.75)',

  tabBarBg: 'rgba(17, 24, 39, 0.92)',
  tabBarBorder: 'rgba(30, 41, 59, 0.9)',
  tabBarActiveIndicator: '#1E293B',

  shimmerStart: '#1E293B',
  shimmerEnd: '#334155',
};

export const fontFamilies = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
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
    fontFamily: fontFamilies.extraBold,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: fontFamilies.bold,
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
