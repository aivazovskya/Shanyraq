import { ScreenHero } from '../../components/common/ScreenHero';
import { LoadError } from '../../components/common/LoadError';
import { LoadingState } from '../../components/common/LoadingState';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Colors } from '../../constants/colors';
import { ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react-native';

export const PinSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [statusFailed, setStatusFailed] = useState(false);
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
    let timer: ReturnType<typeof setInterval>;
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
      setStatusFailed(false);
      setMode(res.isPinSet ? 'CHANGE' : 'SETUP');
    } catch (e) {
      setStatusFailed(true);
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
    if (loading || checkingStatus || statusFailed) return;
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
    if (loading || checkingStatus || statusFailed) return;
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
    if (loading || checkingStatus || statusFailed) return;
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topNav}><TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} disabled={loading} style={styles.navButton} onPress={() => navigation.goBack()}><ArrowLeft color={Colors.text} size={24} /></TouchableOpacity><Text style={styles.navTitle}>{t('profile.pinTitle')}</Text><View style={{ width: 44 }} /></View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scrollContent}>
          {checkingStatus ? <LoadingState message={t('access.checkingSecurityStatus')} /> : statusFailed ? <LoadError message={t('access.pinStatusError')} onRetry={() => void fetchStatus()} /> : <>
          <ScreenHero title={t(mode === 'SETUP' ? 'access.pinSetupTitle' : mode === 'CHANGE' ? 'access.pinChangeTitle' : 'access.pinForgotTitle')} subtitle={t('access.pinSetupSubtitle')} />

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
                editable={!loading}
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
                editable={!loading}
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
              editable={!loading}
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
              editable={!loading}
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
                <Text accessibilityLiveRegion="polite" style={styles.errorBoxText}>{error}</Text>
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
                accessibilityRole="button"
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
          </>}
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
  topNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.text },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    borderRadius: 22,
    marginBottom: 16,
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
    minHeight: 44,
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
