import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  LayoutChangeEvent,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  style?: ViewStyle;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = React.useState(0);

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const pillTranslateX = useSharedValue(0);

  const itemWidth = containerWidth > 0 ? (containerWidth - 6) / options.length : 0;

  React.useEffect(() => {
    if (itemWidth > 0 && selectedIndex >= 0) {
      pillTranslateX.value = accessibleSpring(
        3 + selectedIndex * itemWidth,
        Boolean(reducedMotion),
        theme.spring.touch,
      );
    }
  }, [selectedIndex, itemWidth, reducedMotion, pillTranslateX, theme.spring.touch]);

  const animatedPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillTranslateX.value }],
    width: itemWidth,
  }), [pillTranslateX, itemWidth]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const handleSelect = (val: T) => {
    safeHaptic.selection();
    onChange(val);
  };

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        {
          backgroundColor: theme.isDark ? '#1F2937' : '#F1F5F9',
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {itemWidth > 0 && (
        <Animated.View
          style={[
            styles.activePill,
            {
              backgroundColor: theme.colors.surface,
              ...theme.shadows.sm,
            },
            animatedPillStyle,
          ]}
        />
      )}

      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => handleSelect(opt.value)}
            style={styles.segmentBtn}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={opt.label}
          >
            {opt.icon && <View style={styles.iconWrap}>{opt.icon}</View>}
            <Text
              style={[
                styles.label,
                {
                  color: isSelected ? theme.colors.text : theme.colors.textMuted,
                  fontWeight: isSelected ? '700' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 46,
    borderRadius: 14,
    padding: 3,
    position: 'relative',
    alignItems: 'center',
    borderWidth: 1,
  },
  activePill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 11,
  },
  segmentBtn: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  iconWrap: {
    marginRight: 6,
  },
  label: {
    fontSize: 13,
  },
});
