import React from 'react';
import { StyleSheet, View, Text, Pressable, ViewStyle, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';
import { ChevronRight } from 'lucide-react-native';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
  destructive?: boolean;
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  leftIcon,
  rightElement,
  onPress,
  showChevron = Boolean(onPress),
  disabled = false,
  style,
  titleStyle,
  subtitleStyle,
  destructive = false,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const isPressable = Boolean(onPress) && !disabled;

  const handlePressIn = () => {
    if (!isPressable) return;
    scale.value = accessibleSpring(0.98, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePressOut = () => {
    if (!isPressable) return;
    scale.value = accessibleSpring(1, Boolean(reducedMotion), theme.spring.touch);
  };

  const handlePress = () => {
    if (!isPressable || !onPress) return;
    safeHaptic.selection();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  const content = (
    <View style={styles.innerRow}>
      {Boolean(leftIcon) && <View style={styles.leftSlot}>{leftIcon}</View>}
      <View style={styles.centerSlot}>
        <Text
          style={[
            styles.title,
            {
              color: destructive ? theme.colors.danger : theme.colors.text,
            },
            titleStyle,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {Boolean(subtitle) && (
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted },
              subtitleStyle,
            ]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.rightSlot}>
        {rightElement}
        {showChevron && (
          <ChevronRight
            size={18}
            color={theme.colors.textLight}
            style={styles.chevron}
          />
        )}
      </View>
    </View>
  );

  if (!isPressable) {
    return (
      <View
        accessible={true}
        accessibilityLabel={accessibilityLabel || title}
        style={[styles.container, style]}
      >
        {content}
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled }}
      style={[styles.container, animatedStyle, style]}
    >
      {content}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftSlot: {
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 6,
  },
  chevron: {
    marginLeft: 2,
  },
});
