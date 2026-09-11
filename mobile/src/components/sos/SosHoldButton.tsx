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
  const [isHolding, setIsHolding] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    if (disabled || loading) return;

    setIsHolding(true);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: holdDurationMs,
      useNativeDriver: false,
    }).start();

    timeoutRef.current = setTimeout(async () => {
      setIsHolding(false);
      progressAnim.setValue(0);
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
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const widthInterpolation = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <TouchableWithoutFeedback
      onPressIn={startHold}
      onPressOut={cancelHold}
      disabled={disabled || loading}
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
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 76,
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
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
