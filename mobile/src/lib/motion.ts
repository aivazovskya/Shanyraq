import { WithSpringConfig, withSpring, withTiming } from 'react-native-reanimated';

export const SpringPresets: Record<string, WithSpringConfig> = {
  // Snappy feedback for button presses, cards
  touch: {
    damping: 18,
    stiffness: 300,
    mass: 0.6,
  },
  // Smooth feedback for bottom sheets, modals
  sheet: {
    damping: 24,
    stiffness: 220,
    mass: 0.8,
  },
  // Bouncy indicator for tab bar selection
  tabIndicator: {
    damping: 20,
    stiffness: 250,
    mass: 0.7,
  },
  // Gentle entrance
  entrance: {
    damping: 22,
    stiffness: 180,
    mass: 0.9,
  },
};

export const MotionDurations = {
  instant: 0,
  fast: 150,
  normal: 250,
  slow: 400,
  shimmer: 1200,
};

/**
 * Helper to wrap animation respecting reduce motion.
 */
export function accessibleSpring(toValue: number, reducedMotion: boolean, config = SpringPresets.touch) {
  'worklet';
  if (reducedMotion) {
    return withTiming(toValue, { duration: 0 });
  }
  return withSpring(toValue, config);
}

export function accessibleTiming(toValue: number, reducedMotion: boolean, duration = MotionDurations.normal) {
  'worklet';
  if (reducedMotion) {
    return withTiming(toValue, { duration: 0 });
  }
  return withTiming(toValue, { duration });
}
