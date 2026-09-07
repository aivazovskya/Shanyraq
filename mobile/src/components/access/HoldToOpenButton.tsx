import React, { useState, useRef } from 'react';
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
  const [isHolding, setIsHolding] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
              <ShieldCheck color="#FFFFFF" size={20} />
              <Text style={styles.text}>
                {isHolding ? 'Удерживайте для открытия...' : title}
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
    height: 56,
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.5,
  },
});
