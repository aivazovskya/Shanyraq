import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Colors } from '../../constants/colors';
import { KeyRound, ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react-native';

export const PinSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isPinSet, setIsPinSet] = useState(false);
  const [mode, setMode] = useState<'SETUP' | 'CHANGE' | 'FORGOT_OTP'>('SETUP');

  // Form fields
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const fetchStatus = async () => {
    setCheckingStatus(true);
    try {
      const res = await AuthApi.getPinStatus();
      setIsPinSet(res.isPinSet);
      setMode(res.isPinSet ? 'CHANGE' : 'SETUP');
    } catch (e) {
      console.warn('Failed to load PIN status:', e);
    } finally {
      setCheckingStatus(false);
    }
  };

  const validateLocalPin = (pin: string): string | null => {
    if (!/^\d{4}$|^\d{6}$/.test(pin)) {
      return t('access.pinValidationLength');
    }
    const allSame = pin.split('').every((d) => d === pin[0]);
    if (allSame) {
      return t('access.pinValidationSame');
    }
    const weakList = ['1234', '4321', '0123', '3210', '9876', '6789', '2580', '123456', '654321'];
    if (weakList.includes(pin)) {
      return t('access.pinValidationWeak');
    }
    return null;
  };

  const handleSavePin = async () => {
    setError('');

    if (mode === 'CHANGE' && !currentPin) {
      setError(t('access.enterCurrentPinError'));
      return;
    }

    const pinErr = validateLocalPin(newPin);
    if (pinErr) {
      setError(pinErr);
      return;
    }

    if (newPin !== confirmPin) {
      setError(t('access.pinsDoNotMatchError'));
      return;
    }

    setLoading(true);
    try {
      await AuthApi.setPin({
        newPin,
        currentPin: mode === 'CHANGE' ? currentPin : undefined,
      });

      Alert.alert(t('common.success'), t('access.pinSavedSuccess'), [
        {
          text: t('access.ok'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStartForgotPin = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await AuthApi.requestPinReset();
      setMode('FORGOT_OTP');
      setCountdown(60);
      if (res.devCode) {
        Alert.alert(
          t('access.devSmsTitle'),
          t('access.devSmsBody', { code: res.devCode })
        );
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    setError('');

    if (!otpCode || otpCode.length !== 6) {
      setError(t('access.smsOtpLabel'));
      return;
    }

    const pinErr = validateLocalPin(newPin);
    if (pinErr) {
      setError(pinErr);
      return;
    }

    if (newPin !== confirmPin) {
      setError(t('access.pinsDoNotMatchError'));
      return;
    }

    setLoading(true);
    try {
      await AuthApi.confirmPinReset({
        otpCode,
        newPin,
      });

      Alert.alert(t('common.success'), t('access.pinResetSuccess'), [
        {
          text: t('access.ok'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t('access.checkingSecurityStatus')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft color={Colors.text} size={24} />
            <Text style={styles.backText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <KeyRound color="#FFFFFF" size={32} />
            </View>
            <Text style={styles.title}>
              {mode === 'SETUP'
                ? t('access.pinSetupTitle')
                : mode === 'CHANGE'
                ? t('access.pinChangeTitle')
                : t('access.pinForgotTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {t('access.pinSetupSubtitle')}
            </Text>
          </View>

          {/* Status info card */}
          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              {isPinSet ? (
                <CheckCircle2 color={Colors.success || '#10B981'} size={20} />
              ) : (
                <ShieldAlert color={Colors.warning || '#F59E0B'} size={20} />
              )}
              <Text style={styles.infoText}>
                {isPinSet
                  ? t('access.pinStatusActive')
                  : t('access.pinStatusInactive')}
              </Text>
            </View>
          </Card>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'CHANGE' && (
              <Input
                label={t('access.currentPinLabel')}
                value={currentPin}
                onChangeText={(val) => {
                  setError('');
                  setCurrentPin(val.replace(/\D/g, '').slice(0, 6));
                }}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                placeholder="••••"
              />
            )}

            {mode === 'FORGOT_OTP' && (
              <Input
                label={t('access.smsOtpLabel')}
                value={otpCode}
                onChangeText={(val) => {
                  setError('');
                  setOtpCode(val.replace(/\D/g, '').slice(0, 6));
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                helper={t('access.smsOtpHelper')}
              />
            )}

            <Input
              label={t('access.newPinLabel')}
              value={newPin}
              onChangeText={(val) => {
                setError('');
                setNewPin(val.replace(/\D/g, '').slice(0, 6));
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder={t('access.pinPlaceholderDigits')}
            />

            <Input
              label={t('access.confirmPinLabel')}
              value={confirmPin}
              onChangeText={(val) => {
                setError('');
                setConfirmPin(val.replace(/\D/g, '').slice(0, 6));
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder={t('access.confirmPinPlaceholder')}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>{error}</Text>
              </View>
            ) : null}

            <Button
              title={
                mode === 'FORGOT_OTP'
                  ? t('access.confirmResetBtn')
                  : mode === 'CHANGE'
                  ? t('access.updatePinBtn')
                  : t('access.savePinBtn')
              }
              onPress={mode === 'FORGOT_OTP' ? handleConfirmReset : handleSavePin}
              loading={loading}
              size="lg"
              style={styles.submitBtn}
            />

            {/* Sub-actions */}
            {mode === 'CHANGE' && (
              <TouchableOpacity
                style={styles.switchModeBtn}
                onPress={handleStartForgotPin}
                disabled={loading}
              >
                <Text style={styles.switchModeText}>{t('access.forgotCurrentPinBtn')}</Text>
              </TouchableOpacity>
            )}

            {mode === 'FORGOT_OTP' && (
              <TouchableOpacity
                style={styles.switchModeBtn}
                onPress={() => {
                  setError('');
                  setMode('CHANGE');
                }}
                disabled={loading}
              >
                <Text style={styles.switchModeText}>{t('access.returnToRegularInput')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  backText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  infoCard: {
    marginBottom: 24,
    padding: 14,
    backgroundColor: Colors.card,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  form: {
    gap: 12,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    marginTop: 4,
  },
  errorBoxText: {
    color: Colors.danger || '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 12,
  },
  switchModeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  switchModeText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
});
