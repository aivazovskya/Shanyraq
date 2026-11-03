import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { KeyRound, Delete, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

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
  const [pin, setPin] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const confirmationLock = useRef(false);
  const busy = loading || confirming;

  useEffect(() => {
    setPin('');
    setSubmitFailed(false);
  }, [visible]);

  useEffect(() => { if (error) setPin(''); }, [error]);
  const cancel = () => { if (!busy && !confirmationLock.current) onCancel(); };

  const handleKeyPress = (num: string) => {
    if (pin.length < 6 && !busy && !confirmationLock.current) {
      setSubmitFailed(false);
      setPin((prev) => prev.length < 6 ? prev + num : prev);
    }
  };

  const handleDelete = () => {
    if (pin.length > 0 && !busy && !confirmationLock.current) {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (!busy && !confirmationLock.current) {
      setPin('');
    }
  };

  const canSubmit = (pin.length === 4 || pin.length === 6) && !busy;

  const handleSubmit = async () => {
    if (!canSubmit || confirmationLock.current) return;
    confirmationLock.current = true;
    setConfirming(true); setSubmitFailed(false);
    try { await onConfirm(pin); }
    catch { setSubmitFailed(true); setPin(''); }
    finally { confirmationLock.current = false; setConfirming(false); }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancel}
    >
      <SafeAreaView style={styles.overlay}>
        <ScrollView style={{ width: '100%', maxWidth: 360, maxHeight: '100%' }} contentContainerStyle={styles.modalCard} showsVerticalScrollIndicator={false}>

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={cancel}
            accessibilityRole="button" accessibilityLabel={t('common.close')}
            disabled={busy}
          >
            <X color={Colors.textMuted} size={22} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <KeyRound color="#FFFFFF" size={28} />
            </View>
            <Text style={styles.title}>{t('access.enterPinTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('access.pin2faSubtitle')}{'\n'}
              <Text style={styles.pointHighlight}>«{accessPointName}»</Text>
            </Text>
          </View>

          {/* Dots Indicator */}
          <View style={styles.dotsContainer} accessible accessibilityLabel={t('access.pinLength', { count: pin.length })}>
            {Array.from({ length: 6 }).map((_, i) => {
              const isFilled = i < pin.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    isFilled && styles.dotFilled,
                    i >= 4 && !isFilled && styles.dotOptional,
                  ]}
                />
              );
            })}
          </View>

          {/* Error display */}
          {error || submitFailed ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText} accessibilityLiveRegion="polite">{error || t('common.error')}</Text>
            </View>
          ) : null}

          {/* Keypad */}
          <View style={styles.keypad}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['C', '0', 'DEL'],
            ].map((row, rIdx) => (
              <View key={rIdx} style={styles.keypadRow}>
                {row.map((btn) => {
                  if (btn === 'C') {
                    return (
                      <TouchableOpacity
                        key={btn}
                        style={styles.keypadButtonSpecial}
                        onPress={handleClear}
                        accessibilityRole="button" accessibilityLabel={t('access.resetKeypad')}
                        disabled={busy || pin.length === 0}
                      >
                        <Text style={styles.keypadSpecialText}>{t('access.resetKeypad')}</Text>
                      </TouchableOpacity>
                    );
                  }
                  if (btn === 'DEL') {
                    return (
                      <TouchableOpacity
                        key={btn}
                        style={styles.keypadButtonSpecial}
                        onPress={handleDelete}
                        accessibilityRole="button" accessibilityLabel={t('access.deleteDigit')}
                        disabled={loading || pin.length === 0}
                      >
                        <Delete color={Colors.text} size={22} />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={btn}
                      style={styles.keypadButton}
                      onPress={() => handleKeyPress(btn)}
                      accessibilityRole="button" accessibilityLabel={btn}
                      disabled={busy || pin.length >= 6}
                    >
                      <Text style={styles.keypadNumberText}>{btn}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            accessibilityRole="button" accessibilityLabel={t('access.openBarrierAction')} accessibilityState={{ busy }}
            disabled={!canSubmit}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{t('access.openBarrierAction')}</Text>
            )}
          </TouchableOpacity>

          {/* Forgot PIN */}
          {onForgotPin ? (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={onForgotPin}
              disabled={loading}
            >
              <Text style={styles.forgotButtonText}>{t('access.forgotPinPrompt')}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  pointHighlight: {
    color: Colors.primary,
    fontWeight: '700',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.border || '#CBD5E1',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotOptional: {
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  errorContainer: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger || '#EF4444',
    textAlign: 'center',
    fontWeight: '600',
  },
  keypad: {
    width: '100%',
    marginBottom: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  keypadButton: {
    width: 68,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonSpecial: {
    width: 68,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadNumberText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  keypadSpecialText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  submitButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  forgotButton: {
    marginTop: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  forgotButtonText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
});
