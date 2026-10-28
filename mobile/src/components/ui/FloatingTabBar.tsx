import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { accessibleSpring } from '../../lib/motion';

export const FloatingTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);

  const activeIndex = state.index;
  const numTabs = state.routes.length;
  const tabWidth = barWidth > 0 ? (barWidth - 12) / numTabs : 0;

  const indicatorTranslateX = useSharedValue(0);

  useEffect(() => {
    if (tabWidth > 0) {
      indicatorTranslateX.value = accessibleSpring(
        6 + activeIndex * tabWidth,
        Boolean(reducedMotion),
        theme.spring.tabIndicator,
      );
    }
  }, [activeIndex, tabWidth, reducedMotion, indicatorTranslateX, theme.spring.tabIndicator]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorTranslateX.value }],
    width: tabWidth,
  }), [indicatorTranslateX, tabWidth]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  };

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 14 : 10);

  const renderBackground = () => {
    if (Platform.OS === 'ios') {
      return (
        <BlurView
          intensity={80}
          tint={theme.isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      );
    }
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.tabBarBg,
          },
        ]}
      />
    );
  };

  return (
    <View
      style={[
        styles.outerWrapper,
        {
          paddingBottom: bottomInset,
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        onLayout={handleLayout}
        style={[
          styles.container,
          {
            borderColor: theme.colors.tabBarBorder,
            ...theme.shadows.floating,
          },
        ]}
      >
        {renderBackground()}

        {/* Sliding Active Pill */}
        {tabWidth > 0 && (
          <Animated.View
            style={[
              styles.activeIndicator,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(16, 185, 129, 0.16)'
                  : 'rgba(5, 150, 105, 0.12)',
              },
              animatedIndicatorStyle,
            ]}
          />
        )}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const onPress = () => {
            safeHaptic.selection();

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const activeColor = options.tabBarActiveTintColor || theme.colors.primary;
          const inactiveColor = theme.colors.textMuted;
          const iconColor = isFocused ? activeColor : inactiveColor;

          const badgeCount = options.tabBarBadge;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={typeof label === 'string' ? label : route.name}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                {options.tabBarIcon &&
                  options.tabBarIcon({
                    focused: isFocused,
                    color: iconColor,
                    size: 22,
                  })}
                {badgeCount !== undefined && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {typeof badgeCount === 'number' && badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.label,
                  {
                    color: isFocused ? activeColor : inactiveColor,
                    fontWeight: isFocused ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {typeof label === 'string' ? label : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    marginHorizontal: 16,
    width: '92%',
    maxWidth: 500,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  activeIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 26,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    zIndex: 1,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
  },
  label: {
    fontSize: 10,
    marginTop: 3,
    letterSpacing: -0.2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
