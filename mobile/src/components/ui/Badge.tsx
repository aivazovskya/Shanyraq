import React from 'react';
import { StyleSheet, View, Text, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral';
export type BadgeMode = 'subtle' | 'solid' | 'outline';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  mode?: BadgeMode;
  showDot?: boolean;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  mode = 'subtle',
  showDot = false,
  size = 'md',
  style,
  textStyle,
}) => {
  const { theme } = useTheme();

  const getColors = () => {
    switch (variant) {
      case 'success':
        return {
          bg: theme.colors.successBg,
          text: theme.colors.success,
          solidBg: theme.colors.success,
          solidText: theme.colors.onSuccess,
        };
      case 'warning':
        return {
          bg: theme.colors.warningBg,
          text: theme.colors.warning,
          solidBg: theme.colors.warning,
          solidText: theme.colors.onWarning,
        };
      case 'danger':
        return {
          bg: theme.colors.dangerBg,
          text: theme.colors.danger,
          solidBg: theme.colors.danger,
          solidText: theme.colors.onDanger,
        };
      case 'info':
        return {
          bg: theme.colors.infoBg,
          text: theme.colors.info,
          solidBg: theme.colors.info,
          solidText: theme.colors.onInfo,
        };
      case 'primary':
        return {
          bg: theme.colors.primaryBg,
          text: theme.colors.primary,
          solidBg: theme.colors.primary,
          solidText: theme.colors.onPrimary,
        };
      case 'neutral':
      default:
        return {
          bg: theme.colors.surfaceSubtle,
          text: theme.colors.textMuted,
          solidBg: theme.colors.textMuted,
          solidText: theme.colors.surface,
        };
    }
  };

  const palette = getColors();

  const getModeStyles = (): { container: ViewStyle; text: TextStyle } => {
    if (mode === 'solid') {
      return {
        container: { backgroundColor: palette.solidBg, borderWidth: 0 },
        text: { color: palette.solidText },
      };
    }
    if (mode === 'outline') {
      return {
        container: { backgroundColor: 'transparent', borderColor: palette.text, borderWidth: 1 },
        text: { color: palette.text },
      };
    }
    // subtle
    return {
      container: { backgroundColor: palette.bg, borderWidth: 0 },
      text: { color: palette.text },
    };
  };

  const mStyles = getModeStyles();
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: isSmall ? 6 : 9,
          paddingVertical: isSmall ? 2 : 4,
          borderRadius: theme.radii.pill,
        },
        mStyles.container,
        style,
      ]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {showDot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: mode === 'solid' ? palette.solidText : palette.text },
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          { fontSize: isSmall ? 10 : 12 },
          mStyles.text,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
