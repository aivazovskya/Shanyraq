import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';

export interface OtpInputProps {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (code: string) => void;
  error?: string;
  shakeTrigger?: number;
  length?: number;
  autoFocus?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  onComplete,
  error,
  shakeTrigger = 0,
  length = 6,
  autoFocus = true,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<any>(null);

  const shakeTranslateX = useSharedValue(0);

  // Trigger shake animation on error
  useEffect(() => {
    if (shakeTrigger > 0 || (error && error.length > 0)) {
      safeHaptic.notification();
      if (!reducedMotion) {
        shakeTranslateX.value = withSequence(
          withTiming(-10, { duration: 50 }),
          withTiming(10, { duration: 50 }),
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 50 }),
          withTiming(-4, { duration: 50 }),
          withTiming(4, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        );
      }
    }
  }, [shakeTrigger, error, reducedMotion, shakeTranslateX]);

  const animatedShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeTranslateX.value }],
  }), [shakeTranslateX]);

  const handleChangeText = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, length);
    safeHaptic.selection();
    onChange(cleaned);
    if (cleaned.length === length && onComplete) {
      onComplete(cleaned);
    }
  };

  const handleCellPress = () => {
    inputRef.current?.focus();
  };

  const digits = value.split('');

  return (
    <Animated.View style={[styles.container, animatedShakeStyle]}>
      <Pressable
        onPress={handleCellPress}
        style={styles.cellsRow}
        accessible={true}
        accessibilityRole="none"
        accessibilityLabel="Поле ввода одноразового кода"
      >
        {Array.from({ length }).map((_, index) => {
          const digit = digits[index] || '';
          const isFocused = value.length === index;
          const isFilled = Boolean(digit);

          let borderColor = theme.colors.border;
          if (error) {
            borderColor = theme.colors.danger;
          } else if (isFocused) {
            borderColor = theme.colors.borderFocus;
          } else if (isFilled) {
            borderColor = theme.isDark ? '#334155' : '#94A3B8';
          }

          return (
            <View
              key={index}
              style={[
                styles.cell,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor,
                  borderWidth: isFocused ? 2 : 1.5,
                  borderRadius: theme.radii.md,
                },
                isFocused && !error && {
                  shadowColor: theme.colors.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                  elevation: 3,
                },
              ]}
            >
              {digit ? (
                <Text
                  style={[
                    styles.cellText,
                    {
                      color: theme.colors.text,
                      ...theme.typography.tabularNums,
                    },
                  ]}
                >
                  {digit}
                </Text>
              ) : isFocused ? (
                <View
                  style={[
                    styles.cursorDot,
                    { backgroundColor: theme.colors.primary },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={length}
        autoFocus={autoFocus}
        style={styles.hiddenInput}
        caretHidden={true}
        accessibilityLabel="Введите 6 цифр кода из SMS"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 12,
  },
  cellsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 340,
    gap: 8,
  },
  cell: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  cursorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
