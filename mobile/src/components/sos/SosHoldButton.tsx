import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';

export interface SosHoldButtonProps {
  onConfirmed: () => Promise<void> | void;
  loading?: boolean;
  disabled?: boolean;
  holdDurationMs?: number;
}

export const SosHoldButton: React.FC<SosHoldButtonProps> = ({
  onConfirmed,
  loading = false,
  disabled = false,
  holdDurationMs = 1500,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();

  const [isHolding, setIsHolding] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    if (disabled || loading) return;

    setIsHolding(true);
    safeHaptic.selection();

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: reducedMotion ? 100 : holdDurationMs,
      useNativeDriver: false,
    }).start();

    timeoutRef.current = setTimeout(async () => {
      setIsHolding(false);
      progressAnim.setValue(0);
      safeHaptic.notification();
      await onConfirmed();
    }, holdDurationMs);
  };

  const cancelHold = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHolding(false);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const widthInterpolation = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const progressBg = theme.colors.dangerDark;

  return (
    <TouchableWithoutFeedback
      onPressIn={startHold}
      onPressOut={cancelHold}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={isHolding ? t('sos.holding') : t('sos.buttonTitle')}
      accessibilityHint={isHolding ? t('sos.releaseToCancel') : t('sos.buttonSubtitle')}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.danger,
            shadowColor: theme.colors.danger,
          },
          disabled && styles.disabled,
        ]}
      >
        {/* Animated filling background */}
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: widthInterpolation,
              backgroundColor: progressBg,
            },
          ]}
        />

        <View style={styles.contentRow}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.surface }]}>
                <AlertTriangle color={theme.colors.danger} size={24} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.title}>
                  {isHolding ? t('sos.holding') : t('sos.buttonTitle')}
                </Text>
                <Text style={styles.subtitle}>
                  {isHolding ? t('sos.releaseToCancel') : t('sos.buttonSubtitle')}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 76,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    position: 'relative',
  },
  disabled: {
    opacity: 0.6,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
