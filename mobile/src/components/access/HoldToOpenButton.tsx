import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { ShieldCheck, LockOpen } from 'lucide-react-native';

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
  const { theme } = useTheme();

  const [isHolding, setIsHolding] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);

  useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      setCurrentProgress(value);
    });
    return () => {
      progressAnim.removeListener(listenerId);
    };
  }, [progressAnim]);

  const startHold = () => {
    if (disabled || loading) return;

    safeHaptic.selection();
    setIsHolding(true);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: holdDurationMs,
      useNativeDriver: false,
    }).start();

    timeoutRef.current = setTimeout(async () => {
      safeHaptic.notification();
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
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  const widthInterpolation = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const ringSize = 40;
  const strokeWidth = 3.5;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - currentProgress);

  return (
    <TouchableWithoutFeedback
      onPressIn={startHold}
      onPressOut={cancelHold}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t('access.holdToOpen')}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: disabled
              ? theme.colors.surfaceSubtle
              : theme.colors.primary,
            borderColor: theme.colors.primaryDark,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        {/* Animated fill progress bar */}
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: widthInterpolation,
              backgroundColor: theme.colors.primaryDark,
            },
          ]}
        />

        <View style={styles.contentRow}>
          {loading ? (
            <ActivityIndicator color={theme.colors.onPrimary} size="small" />
          ) : (
            <>
              {/* Circular Ring Progress with Icon in center */}
              <View style={[styles.ringWrapper, { width: ringSize, height: ringSize }]}>
                <Svg width={ringSize} height={ringSize} style={styles.svgRing}>
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    stroke="#FFFFFF"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                  />
                </Svg>
                <View style={styles.iconInsideRing}>
                  {isHolding ? (
                    <LockOpen color="#FFFFFF" size={18} />
                  ) : (
                    <ShieldCheck color="#FFFFFF" size={18} />
                  )}
                </View>
              </View>

              <Text
                style={[
                  styles.text,
                  { color: theme.colors.onPrimary },
                ]}
              >
                {isHolding ? t('access.holdingToOpen') : title}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    marginVertical: 6,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 2,
    paddingHorizontal: 16,
  },
  ringWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svgRing: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  iconInsideRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
