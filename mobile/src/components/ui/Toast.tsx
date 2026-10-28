import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  PanResponder,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast, ToastItem } from '../../context/ToastContext';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react-native';

interface ToastCardProps {
  item: ToastItem;
  onDismiss: () => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, onDismiss }) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();

  const translateY = useSharedValue(-60);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    safeHaptic.selection();
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
    } else {
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 180 });
    }
  }, [reducedMotion, translateY, opacity]);

  const triggerDismiss = () => {
    if (reducedMotion) {
      onDismiss();
    } else {
      translateY.value = withTiming(-60, { duration: 160 });
      opacity.value = withTiming(0, { duration: 150 }, () => {
        runOnJS(onDismiss)();
      });
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dy < -6 || Math.abs(gesture.dx) > 12;
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy < 0) {
          translateY.value = gesture.dy;
        }
        translateX.value = gesture.dx;
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -24 || Math.abs(gesture.dx) > 75) {
          triggerDismiss();
        } else {
          translateY.value = withSpring(0, { damping: 16, stiffness: 200 });
          translateX.value = withSpring(0, { damping: 16, stiffness: 200 });
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: opacity.value,
  }), [translateY, translateX, opacity]);

  const getThemeProps = () => {
    switch (item.type) {
      case 'success':
        return {
          bg: theme.colors.successBg,
          border: theme.colors.successBorder,
          text: theme.isDark ? theme.colors.success : '#065F46',
          icon: <CheckCircle2 size={20} color={theme.colors.success} />,
        };
      case 'warning':
        return {
          bg: theme.colors.warningBg,
          border: theme.colors.warningBorder,
          text: theme.isDark ? theme.colors.warning : '#92400E',
          icon: <AlertTriangle size={20} color={theme.colors.warning} />,
        };
      case 'error':
        return {
          bg: theme.colors.dangerBg,
          border: theme.colors.dangerBorder,
          text: theme.isDark ? theme.colors.danger : '#991B1B',
          icon: <AlertCircle size={20} color={theme.colors.danger} />,
        };
      default:
        return {
          bg: theme.colors.infoBg,
          border: theme.colors.infoBorder,
          text: theme.isDark ? theme.colors.info : '#1E40AF',
          icon: <Info size={20} color={theme.colors.info} />,
        };
    }
  };

  const styleProps = getThemeProps();

  return (
    <Animated.View
      style={[styles.cardWrapper, animatedStyle]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => {
          if (item.onPress) item.onPress();
          triggerDismiss();
        }}
        style={[
          styles.card,
          {
            backgroundColor: styleProps.bg,
            borderColor: styleProps.border,
            ...theme.shadows.md,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`${item.title}. ${item.message || ''}`}
      >
        <View style={styles.iconWrap}>{styleProps.icon}</View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: styleProps.text }]}>{item.title}</Text>
          {Boolean(item.message) && (
            <Text style={[styles.message, { color: styleProps.text }]}>{item.message}</Text>
          )}
          {Boolean(item.code) && (
            <View
              style={[
                styles.codeBadge,
                { backgroundColor: theme.colors.primaryDark },
              ]}
            >
              <Text style={styles.codeText}>{item.code}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={triggerDismiss}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={18} color={styleProps.text} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, hideToast } = useToast();
  const insets = useSafeAreaInsets();

  if (!toasts || toasts.length === 0) return null;

  const topOffset = Math.max(insets.top, Platform.OS === 'web' ? 16 : 8) + 8;

  return (
    <View
      style={[
        styles.container,
        { top: topOffset },
      ]}
      pointerEvents="box-none"
    >
      {toasts.map((item) => (
        <ToastCard
          key={item.id}
          item={item}
          onDismiss={() => hideToast(item.id)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 99,
    alignItems: 'center',
    gap: 8,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  iconWrap: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
    opacity: 0.9,
  },
  codeBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  codeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 4,
  },
});
