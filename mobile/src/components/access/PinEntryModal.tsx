import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../constants/colors';
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
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (visible) {
      setPin('');
    }
  }, [visible]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 6 && !loading) {
      setPin((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    if (pin.length > 0 && !loading) {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (!loading) {
      setPin('');
    }
  };

  const canSubmit = (pin.length === 4 || pin.length === 6) && !loading;

  const handleSubmit = () => {
    if (canSubmit) {
      onConfirm(pin);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onCancel}
            disabled={loading}
          >
            <X color={Colors.textMuted} size={22} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <KeyRound color="#FFFFFF" size={28} />
            </View>
            <Text style={styles.title}>Введите PIN-код</Text>
            <Text style={styles.subtitle}>
              2FA подтверждение открытия{'\n'}
              <Text style={styles.pointHighlight}>«{accessPointName}»</Text>
            </Text>
          </View>

          {/* Dots Indicator */}
          <View style={styles.dotsContainer}>
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
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
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
                        disabled={loading || pin.length === 0}
                      >
                        <Text style={styles.keypadSpecialText}>Сброс</Text>
                      </TouchableOpacity>
                    );
                  }
                  if (btn === 'DEL') {
                    return (
                      <TouchableOpacity
                        key={btn}
                        style={styles.keypadButtonSpecial}
                        onPress={handleDelete}
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
                      disabled={loading || pin.length >= 6}
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
            disabled={!canSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Открыть шлагбаум</Text>
            )}
          </TouchableOpacity>

          {/* Forgot PIN */}
          {onForgotPin ? (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={onForgotPin}
              disabled={loading}
            >
              <Text style={styles.forgotButtonText}>Забыли PIN-код доступа?</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
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
    width: 36,
    height: 36,
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
    paddingVertical: 4,
  },
  forgotButtonText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
});
