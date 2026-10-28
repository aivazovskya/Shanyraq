import React from 'react';
import { StyleSheet, Pressable, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'surface' | 'ghost' | 'primary';
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  size = 44,
  disabled = false,
  style,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = accessibleSpring(0.92, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = accessibleSpring(1, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePress = () => {
    if (disabled) return;
    safeHaptic.selection();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  const getBackgroundColor = () => {
    if (variant === 'ghost') return 'transparent';
    if (variant === 'primary') return theme.colors.primary;
    return theme.colors.surface;
  };

  const getBorderColor = () => {
    if (variant === 'ghost' || variant === 'primary') return 'transparent';
    return theme.colors.border;
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          minWidth: 44,
          minHeight: 44,
          borderRadius: size / 2,
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'surface' ? 1 : 0,
        },
        animatedStyle,
        style,
      ]}
    >
      {icon}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
