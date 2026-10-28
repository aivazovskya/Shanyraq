import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';

export interface AnimatedEntranceProps {
  children: React.ReactNode;
  index?: number;
  delay?: number;
  style?: ViewStyle;
}

export const AnimatedEntrance: React.FC<AnimatedEntranceProps> = ({
  children,
  index = 0,
  delay,
  style,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();

  const totalDelay = delay !== undefined ? delay : index * 60;
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const translateY = useSharedValue(reducedMotion ? 0 : 16);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
    } else {
      opacity.value = withDelay(totalDelay, withTiming(1, { duration: 250 }));
      translateY.value = withDelay(totalDelay, withSpring(0, theme.spring.entrance));
    }
  }, [reducedMotion, totalDelay, opacity, translateY, theme.spring.entrance]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }), [opacity, translateY]);

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
};
