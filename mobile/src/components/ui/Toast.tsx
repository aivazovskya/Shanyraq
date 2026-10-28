import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react-native';

export const ToastContainer: React.FC = () => {
  const { toast, hideToast } = useToast();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (toast) {
      safeHaptic.selection();
      if (reducedMotion) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = withSpring(0, { damping: 16, stiffness: 200 });
        opacity.value = withTiming(1, { duration: 180 });
      }
    } else {
      if (reducedMotion) {
        translateY.value = -120;
        opacity.value = 0;
      } else {
        translateY.value = withTiming(-120, { duration: 200 });
        opacity.value = withTiming(0, { duration: 180 });
      }
    }
  }, [toast, reducedMotion, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }), [translateY, opacity]);

  if (!toast) return null;

  const getThemeProps = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: theme.isDark ? '#064E3B' : '#ECFDF5',
          border: theme.isDark ? '#059669' : '#A7F3D0',
          text: theme.isDark ? '#34D399' : '#065F46',
          icon: <CheckCircle2 size={20} color={theme.isDark ? '#34D399' : '#059669'} />,
        };
      case 'warning':
        return {
          bg: theme.isDark ? '#451A03' : '#FFFBEB',
          border: theme.isDark ? '#B45309' : '#FDE68A',
          text: theme.isDark ? '#FBBF24' : '#92400E',
          icon: <AlertTriangle size={20} color={theme.isDark ? '#FBBF24' : '#D97706'} />,
        };
      case 'error':
        return {
          bg: theme.isDark ? '#450A0A' : '#FEF2F2',
          border: theme.isDark ? '#DC2626' : '#FECACA',
          text: theme.isDark ? '#F87171' : '#991B1B',
          icon: <AlertCircle size={20} color={theme.isDark ? '#F87171' : '#DC2626'} />,
        };
      default:
        return {
          bg: theme.isDark ? '#1E293B' : '#EFF6FF',
          border: theme.isDark ? '#3B82F6' : '#BFDBFE',
          text: theme.isDark ? '#93C5FD' : '#1E40AF',
          icon: <Info size={20} color={theme.isDark ? '#60A5FA' : '#2563EB'} />,
        };
    }
  };

  const styleProps = getThemeProps();
  const topOffset = Math.max(insets.top, Platform.OS === 'web' ? 16 : 8) + 8;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { top: topOffset },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (toast.onPress) toast.onPress();
          hideToast();
        }}
        style={[
          styles.card,
          {
            backgroundColor: styleProps.bg,
            borderColor: styleProps.border,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`${toast.title}. ${toast.message || ''}`}
      >
        <View style={styles.iconWrap}>{styleProps.icon}</View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: styleProps.text }]}>{toast.title}</Text>
          {Boolean(toast.message) && (
            <Text style={[styles.message, { color: styleProps.text }]}>{toast.message}</Text>
          )}
          {Boolean(toast.code) && (
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{toast.code}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={hideToast}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
        >
          <X size={18} color={styleProps.text} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 99,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
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
    backgroundColor: '#059669',
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
