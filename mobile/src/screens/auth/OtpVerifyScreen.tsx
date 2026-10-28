import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../navigation/types';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { safeHaptic } from '../../lib/haptics';
import { Button } from '../../components/ui/Button';
import { OtpInput } from '../../components/ui/OtpInput';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { KeyRound, ArrowLeft, RotateCcw } from 'lucide-react-native';

type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>;

export const OtpVerifyScreen: React.FC<Props> = ({ route, navigation }) => {
  const { phone } = route.params;
  const { login } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showToast, hideDevCodeToast, hideToast } = useToast();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [shakeTrigger, setShakeTrigger] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    return () => {
      hideDevCodeToast();
    };
  }, [hideDevCodeToast]);

  const handleVerify = useCallback(
    async (codeToVerify?: string) => {
      const targetCode = codeToVerify || code;
      if (targetCode.length !== 6) {
        setError(t('auth.otpValidation'));
        setShakeTrigger((prev) => prev + 1);
        safeHaptic.notification();
        return;
      }

      setLoading(true);
      setError('');

      try {
        const authData = await AuthApi.verifyOtp(phone, targetCode);
        safeHaptic.notification();
        hideDevCodeToast();
        hideToast();
        await login(authData);
        // RootNavigator handles redirection automatically
      } catch (err: any) {
        const msg = getApiErrorMessage(err);
        setError(msg);
        setShakeTrigger((prev) => prev + 1);
        safeHaptic.notification();
      } finally {
        setLoading(false);
      }
    },
    [code, phone, login, t],
  );

  const handleResend = async () => {
    if (countdown > 0 || resending) return;

    setResending(true);
    setError('');

    try {
      const res = await AuthApi.requestOtp(phone);
      setCountdown(60);
      safeHaptic.selection();

      if (res.devCode) {
        showToast({
          type: 'info',
          title: t('auth.testSmsTitle'),
          message: t('auth.testSmsBody', { code: res.devCode }),
          code: res.devCode,
          duration: 12000,
        });
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  const ringProgress = countdown / 60;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Top Back Navigation Bar */}
        <View
          style={[
            styles.navBar,
            {
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('auth.changeNumber')}
          >
            <ArrowLeft color={theme.colors.text} size={22} />
            <Text style={[styles.backText, { color: theme.colors.text }]}>
              {t('auth.changeNumber')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 24) + 20,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Icon & Title */}
          <AnimatedEntrance index={0} style={styles.header}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: theme.colors.primary,
                  ...theme.shadows.lg,
                },
              ]}
            >
              <KeyRound color={theme.colors.onPrimary} size={34} strokeWidth={2.2} />
            </View>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {t('auth.otpTitle')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {t('auth.otpSubtitle')}{'\n'}
              <Text style={[styles.phoneHighlight, { color: theme.colors.primary }]}>
                {phone}
              </Text>
            </Text>
          </AnimatedEntrance>

          {/* Form Card */}
          <AnimatedEntrance index={1} style={styles.formContainer}>
            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  ...theme.shadows.md,
                },
              ]}
            >
              <Text style={[styles.otpInputLabel, { color: theme.colors.textMuted }]}>
                {t('auth.otpLabel')}
              </Text>

              <OtpInput
                value={code}
                onChange={(val) => {
                  setError('');
                  setCode(val);
                }}
                onComplete={(completedCode) => {
                  handleVerify(completedCode);
                }}
                error={error}
                shakeTrigger={shakeTrigger}
                length={6}
                autoFocus={true}
              />

              {Boolean(error) && (
                <Text style={[styles.errorText, { color: theme.colors.danger }]}>
                  {error}
                </Text>
              )}

              <Button
                title={t('auth.loginButton')}
                onPress={() => handleVerify()}
                loading={loading}
                disabled={code.length !== 6 || loading}
                size="lg"
                style={styles.verifyButton}
              />

              {/* Resend Section with Progress Ring */}
              <View style={styles.resendSection}>
                {countdown > 0 ? (
                  <View style={styles.countdownRow}>
                    <ProgressRing
                      progress={ringProgress}
                      size={44}
                      strokeWidth={3.5}
                      label={countdown}
                    />
                    <Text style={[styles.timerText, { color: theme.colors.textMuted }]}>
                      {t('auth.resendTimer', { count: countdown })}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resending}
                    style={styles.resendButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.resendButton')}
                  >
                    <RotateCcw size={16} color={theme.colors.primary} />
                    <Text style={[styles.resendText, { color: theme.colors.primary }]}>
                      {resending ? t('auth.resending') : t('auth.resendButton')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </AnimatedEntrance>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  navBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    minWidth: 44,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  phoneHighlight: {
    fontWeight: '700',
  },
  formContainer: {
    width: '100%',
  },
  formCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  otpInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'center',
  },
  verifyButton: {
    width: '100%',
    marginTop: 12,
  },
  resendSection: {
    alignItems: 'center',
    marginTop: 22,
    width: '100%',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  resendText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
