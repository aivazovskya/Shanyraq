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
import { Colors } from '../../constants/colors';
import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface HoldToOpenButtonProps {
  title: string;
  onConfirmed: () => Promise<void> | void;
  loading?: boolean;
  disabled?: boolean;
  holdDurationMs?: number;
}

export const HoldToOpenButton: React.FC<HoldToOpenButtonProps> = ({
  title,
  onConfirmed,
  loading = false,
  disabled = false,
  holdDurationMs = 1200,
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
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t('access.holdHint')}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
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
              <ShieldCheck color="#FFFFFF" size={20} />
              <Text style={styles.text}>
                {isHolding ? t('access.holdingToOpen') : title}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>{failed && <Text accessibilityLiveRegion="polite" style={{ color: Colors.danger, marginTop: 8 }}>{t('common.error')}</Text>}</View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: Colors.barrierProgress,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  text: {
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 21,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.5,
  },
});
