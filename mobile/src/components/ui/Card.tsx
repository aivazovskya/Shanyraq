import React from 'react';
import { StyleSheet, ViewStyle, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';

export type CardVariant = 'elevated' | 'outlined' | 'tinted';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: CardVariant;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  variant = 'outlined',
  style,
  accessibilityLabel,
  testID,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const isPressable = Boolean(onPress);

  const handlePressIn = () => {
    if (!isPressable) return;
    scale.value = accessibleSpring(0.98, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePressOut = () => {
    if (!isPressable) return;
    scale.value = accessibleSpring(1, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePress = () => {
    if (!onPress) return;
    safeHaptic.selection();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.border,
          borderWidth: 1,
          ...theme.shadows.md,
        };
      case 'tinted':
        return {
          backgroundColor: theme.colors.surfaceSubtle,
          borderColor: theme.colors.border,
          borderWidth: 1,
        };
      case 'outlined':
      default:
        return {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          ...theme.shadows.sm,
        };
    }
  };

  const baseStyle: ViewStyle = {
    borderRadius: theme.radii.lg,
    padding: theme.spacing.base,
    ...getVariantStyles(),
  };

  if (!isPressable) {
    return (
      <View
        testID={testID}
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
        style={[baseStyle, style]}
      >
        {children}
      </View>
    );
  }

  return (
    <AnimatedPressable
      testID={testID}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[baseStyle, animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
};
