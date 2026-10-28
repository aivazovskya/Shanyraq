import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { KeyRound, Delete, X } from 'lucide-react-native';

interface PinEntryModalProps {
  visible: boolean;
  accessPointName: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: (pin: string) => Promise<void> | void;
  onCancel: () => void;
  onForgotPin?: () => void;
}

export const PinEntryModal: React.FC<PinEntryModalProps> = ({
  visible,
  accessPointName,
  loading = false,
  error = null,
  onConfirm,
  onCancel,
  onForgotPin,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();

  const [pin, setPin] = useState('');
  const shakeOffset = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setPin('');
    }
  }, [visible]);

  useEffect(() => {
    if (error) {
      safeHaptic.notification();
      if (!reducedMotion) {
        shakeOffset.value = withSequence(
          withTiming(-12, { duration: 50 }),
          withTiming(12, { duration: 50 }),
          withTiming(-10, { duration: 50 }),
          withTiming(10, { duration: 50 }),
          withTiming(-5, { duration: 50 }),
          withTiming(0, { duration: 50 })
        );
      }
    }
  }, [error, reducedMotion, shakeOffset]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 6 && !loading) {
      safeHaptic.selection();
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4 || nextPin.length === 6) {
        // Can submit or auto-submit on 6
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0 && !loading) {
      safeHaptic.selection();
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (!loading) {
      safeHaptic.selection();
      setPin('');
    }
  };

  const canSubmit = (pin.length === 4 || pin.length === 6) && !loading;

  const handleSubmit = () => {
    if (canSubmit) {
      safeHaptic.selection();
      onConfirm(pin);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }), [shakeOffset]);

  const keypadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', 'DEL'],
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.overlay },
        ]}
      >
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              ...theme.shadows.floating,
            },
          ]}
        >
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onCancel}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X color={theme.colors.textMuted} size={22} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <KeyRound color={theme.colors.onPrimary} size={26} />
            </View>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {t('access.enterPinTitle')}
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.textMuted }]}
            >
              {t('access.pin2faSubtitle')}{'\n'}
              <Text
                style={[
                  styles.pointHighlight,
                  { color: theme.colors.primary },
                ]}
              >
                «{accessPointName}»
              </Text>
            </Text>
          </View>

          {/* Dots Indicator with Shake */}
          <Animated.View style={[styles.dotsContainer, shakeStyle]}>
            {Array.from({ length: 6 }).map((_, i) => {
              const isFilled = i < pin.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      borderColor: isFilled
                        ? theme.colors.primary
                        : theme.colors.border,
                      backgroundColor: isFilled
                        ? theme.colors.primary
                        : theme.colors.surfaceSubtle,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

          {/* Error Message if any */}
          {error && (
            <Text
              style={[styles.errorText, { color: theme.colors.danger }]}
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          )}

          {/* Numeric Keypad Grid */}
          <View style={styles.keypadGrid}>
            {keypadButtons.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.keypadRow}>
                {row.map((item) => {
                  if (item === 'C') {
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.keypadKey,
                          styles.actionKey,
                          {
                            backgroundColor: theme.colors.surfaceSubtle,
                            borderColor: theme.colors.border,
                          },
                        ]}
                        onPress={handleClear}
                        disabled={loading || pin.length === 0}
                        accessibilityRole="button"
                        accessibilityLabel={t('access.keypadClear')}
                      >
                        <Text
                          style={[
                            styles.actionKeyText,
                            { color: theme.colors.textMuted },
                          ]}
                        >
                          C
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  if (item === 'DEL') {
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.keypadKey,
                          styles.actionKey,
                          {
                            backgroundColor: theme.colors.surfaceSubtle,
                            borderColor: theme.colors.border,
                          },
                        ]}
                        onPress={handleDelete}
                        disabled={loading || pin.length === 0}
                        accessibilityRole="button"
                        accessibilityLabel={t('access.keypadBackspace')}
                      >
                        <Delete color={theme.colors.textMuted} size={22} />
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.keypadKey,
                        {
                          backgroundColor: theme.colors.surfaceSubtle,
                          borderColor: theme.colors.border,
                        },
                      ]}
                      onPress={() => handleKeyPress(item)}
                      disabled={loading || pin.length >= 6}
                      accessibilityRole="button"
                      accessibilityLabel={item}
                    >
                      <Text
                        style={[
                          styles.numberKeyText,
                          { color: theme.colors.text },
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Confirm Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: canSubmit
                  ? theme.colors.primary
                  : theme.colors.surfaceSubtle,
                borderColor: canSubmit
                  ? theme.colors.primaryDark
                  : theme.colors.border,
                opacity: canSubmit ? 1 : 0.6,
              },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel={t('access.openBarrierAction')}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.onPrimary} size="small" />
            ) : (
              <Text
                style={[
                  styles.submitButtonText,
                  {
                    color: canSubmit
                      ? theme.colors.onPrimary
                      : theme.colors.textLight,
                  },
                ]}
              >
                {t('access.openBarrierAction')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Forgot PIN Link */}
          {onForgotPin && (
            <TouchableOpacity
              onPress={onForgotPin}
              disabled={loading}
              style={styles.forgotButton}
              accessibilityRole="link"
            >
              <Text
                style={[
                  styles.forgotText,
                  { color: theme.colors.primary },
                ]}
              >
                {t('access.forgotPinPrompt')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
    zIndex: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  pointHighlight: {
    fontWeight: '700',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 14,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  keypadGrid: {
    width: '100%',
    maxWidth: 300,
    gap: 10,
    marginVertical: 12,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  keypadKey: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionKey: {
    paddingHorizontal: 4,
  },
  numberKeyText: {
    fontSize: 22,
    fontWeight: '700',
  },
  actionKeyText: {
    fontSize: 16,
    fontWeight: '700',
  },
  submitButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  forgotButton: {
    paddingVertical: 12,
    marginTop: 4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
