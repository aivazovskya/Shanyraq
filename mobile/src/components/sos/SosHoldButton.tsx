import { useHoldConfirmation } from '../common/useHoldConfirmation';
import React, { useRef, useEffect } from 'react';
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

interface SosHoldButtonProps {
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
  const { isHolding, failed, startHold, cancelHold } = useHoldConfirmation({ disabled, loading, duration: holdDurationMs, onConfirmed });
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(progressAnim, { toValue: isHolding ? 1 : 0, duration: isHolding ? holdDurationMs : 200, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [isHolding, holdDurationMs, progressAnim]);

  const widthInterpolation = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View><TouchableWithoutFeedback
      onPressIn={startHold}
      onPressOut={cancelHold}
      disabled={disabled || loading}
      accessibilityRole="button" accessibilityLabel={t('sos.buttonTitle')} accessibilityHint={t('sos.buttonSubtitle')} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      <View style={[styles.container, disabled && styles.disabled]}>
        {/* Animated filling background */}
        <Animated.View
          style={[
            styles.progressBar,
            { width: widthInterpolation },
          ]}
        />

        <View style={styles.contentRow}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <View style={styles.iconCircle}>
                <AlertTriangle color="#DC2626" size={24} />
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
    </TouchableWithoutFeedback>{failed && <Text accessibilityLiveRegion="polite" style={{ color: '#DC2626', marginTop: 8 }}>{t('common.error')}</Text>}</View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 88,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#DC2626',
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
    backgroundColor: '#991B1B', // Darker red on hold fill
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
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#FEE2E2',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 2,
  },
});
