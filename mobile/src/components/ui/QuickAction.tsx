import React from 'react';
import { StyleSheet, View, Pressable, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { Text } from './AppText';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';

export interface QuickActionItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  badge?: number | string;
  badgeColor?: string;
  iconBgColor?: string;
  iconColor?: string;
  testID?: string;
}

export interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  badge?: number | string;
  badgeColor?: string;
  iconBgColor?: string;
  style?: ViewStyle;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const QuickAction: React.FC<QuickActionProps> = ({
  icon,
  label,
  onPress,
  badge,
  badgeColor,
  iconBgColor,
  style,
  testID,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = accessibleSpring(0.92, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePressOut = () => {
    scale.value = accessibleSpring(1, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePress = () => {
    safeHaptic.selection();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  return (
    <AnimatedPressable
      testID={testID}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.container, animatedStyle, style]}
    >
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: iconBgColor || theme.colors.primaryBg,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {icon}
        {badge !== undefined && (
          <View
            style={[
              styles.badge,
              { backgroundColor: badgeColor || theme.colors.danger },
            ]}
          >
            {typeof badge === 'number' || typeof badge === 'string' ? (
              <Text style={styles.badgeText}>{badge}</Text>
            ) : null}
          </View>
        )}
      </View>

      <Text
        style={[
          styles.label,
          { color: theme.colors.text },
        ]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
};

export interface QuickActionGridProps {
  items?: QuickActionItem[];
  children?: React.ReactNode;
  columns?: 3 | 4;
  style?: ViewStyle;
}

export const QuickActionGrid: React.FC<QuickActionGridProps> = ({
  items,
  children,
  columns = 4,
  style,
}) => {
  return (
    <View style={[styles.grid, style]}>
      {items
        ? items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.gridItem,
                { width: columns === 4 ? '25%' : '33.33%' },
              ]}
            >
              <QuickAction
                icon={item.icon}
                label={item.label}
                onPress={item.onPress}
                badge={item.badge}
                badgeColor={item.badgeColor}
                iconBgColor={item.iconBgColor}
                testID={item.testID}
              />
            </View>
          ))
        : children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    minHeight: 94,
    justifyContent: 'flex-start',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  label: {
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 11,
    lineHeight: 14,
    height: 28,
    width: '100%',
    paddingHorizontal: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -2,
  },
  gridItem: {
    paddingHorizontal: 2,
    marginBottom: 8,
  },
});
