import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Returns total height consumed by FloatingTabBar at the bottom of the screen
 * including container height (64pt), bottom safe area / web padding, and extra buffer.
 */
export function useTabBarInset(extraPadding: number = 24): number {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 14 : 10);
  const barHeight = 64;
  return barHeight + bottomInset + extraPadding;
}
