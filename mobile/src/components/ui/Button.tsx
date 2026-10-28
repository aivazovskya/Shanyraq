import React from 'react';
import {
  StyleSheet,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Pressable,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  accessibilityLabel,
  testID,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled || loading) return;
    scale.value = accessibleSpring(0.97, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePressOut = () => {
    if (disabled || loading) return;
    scale.value = accessibleSpring(1, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePress = () => {
    if (disabled || loading) return;
    safeHaptic.selection();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle; indicatorColor: string } => {
    const isDark = theme.isDark;

    if (disabled) {
      return {
        container: {
          backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
          borderColor: isDark ? '#334155' : '#CBD5E1',
          borderWidth: 1,
        },
        text: {
          color: isDark ? '#64748B' : '#94A3B8',
        },
        indicatorColor: isDark ? '#64748B' : '#94A3B8',
      };
    }

    switch (variant) {
      case 'secondary':
        return {
          container: {
            backgroundColor: isDark ? '#1F2937' : '#F1F5F9',
            borderColor: theme.colors.border,
            borderWidth: 1,
          },
          text: {
            color: theme.colors.text,
          },
          indicatorColor: theme.colors.text,
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: theme.colors.primary,
          },
          indicatorColor: theme.colors.primary,
        };
      case 'destructive':
        return {
          container: {
            backgroundColor: theme.colors.danger,
            borderWidth: 0,
          },
          text: {
            color: '#FFFFFF',
          },
          indicatorColor: '#FFFFFF',
        };
      case 'primary':
      default:
        return {
          container: {
            backgroundColor: theme.colors.primary,
            borderWidth: 0,
          },
          text: {
            color: theme.colors.onPrimary,
          },
          indicatorColor: theme.colors.onPrimary,
        };
    }
  };

  const getSizeStyles = (): { height: number; paddingHorizontal: number; fontSize: number; gap: number } => {
    switch (size) {
      case 'sm':
        return { height: 38, paddingHorizontal: 14, fontSize: 13, gap: 6 };
      case 'lg':
        return { height: 52, paddingHorizontal: 22, fontSize: 16, gap: 10 };
      case 'md':
      default:
        return { height: 46, paddingHorizontal: 18, fontSize: 15, gap: 8 };
    }
  };

  const vStyles = getVariantStyles();
  const sStyles = getSizeStyles();

  return (
    <AnimatedPressable
      testID={testID}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: disabled || loading }}
      style={[
        styles.base,
        {
          height: sStyles.height,
          paddingHorizontal: sStyles.paddingHorizontal,
          borderRadius: size === 'sm' ? theme.radii.md : theme.radii.lg,
          minWidth: 44,
          minHeight: 44,
        },
        vStyles.container,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={vStyles.indicatorColor} size="small" />
      ) : (
        <View style={[styles.contentRow, { gap: sStyles.gap }]}>
          {leftIcon}
          <Text
            style={[
              styles.text,
              {
                fontSize: sStyles.fontSize,
                fontWeight: '700',
              },
              vStyles.text,
              textStyle,
            ]}
          >
            {title}
          </Text>
          {rightIcon}
        </View>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
