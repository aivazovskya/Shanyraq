import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../navigation/types';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Building2, Phone, ShieldCheck } from 'lucide-react-native';

type Props = NativeStackScreenProps<AuthStackParamList, 'PhoneInput'>;

export function formatKazakhPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let norm = digits;
  if (norm.startsWith('8')) {
    norm = '7' + norm.slice(1);
  } else if (!norm.startsWith('7')) {
    norm = '7' + norm;
  }
  norm = norm.slice(0, 11);

  let formatted = '+7';
  if (norm.length > 1) {
    formatted += ' (' + norm.slice(1, Math.min(4, norm.length));
  }
  if (norm.length >= 4) {
    formatted += ') ' + norm.slice(4, Math.min(7, norm.length));
  }
  if (norm.length >= 7) {
    formatted += '-' + norm.slice(7, Math.min(9, norm.length));
  }
  if (norm.length >= 9) {
    formatted += '-' + norm.slice(9, 11);
  }
  return formatted;
}

export function cleanKazakhPhone(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');
  if (digits.startsWith('8')) return '+7' + digits.slice(1);
  if (digits.startsWith('7')) return '+' + digits;
  return '+7' + digits;
}

export const PhoneInputScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [phoneDisplay, setPhoneDisplay] = useState('+7 (7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rateLimitTimer, setRateLimitTimer] = useState<number>(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (rateLimitTimer > 0) {
      interval = setInterval(() => {
        setRateLimitTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [rateLimitTimer]);

  const handlePhoneChange = (val: string) => {
    setError('');
    // keep +7 (7 prefix minimum
    if (!val || val.length < 3) {
      setPhoneDisplay('+7 (7');
      return;
    }
    setPhoneDisplay(formatKazakhPhone(val));
  };

  const handleSendOtp = async () => {
    const rawDigits = phoneDisplay.replace(/\D/g, '');
    if (rawDigits.length < 11) {
      setError(t('auth.phoneValidation'));
      return;
    }

    if (rateLimitTimer > 0) {
      return;
    }

    const cleanedPhone = cleanKazakhPhone(phoneDisplay);

    setLoading(true);
    setError('');

    try {
      const res = await AuthApi.requestOtp(cleanedPhone);

      if (res.devCode) {
        showToast({
          type: 'info',
          title: t('auth.testSmsTitle'),
          message: t('auth.testSmsBody', { code: res.devCode }),
          code: res.devCode,
          duration: 12000,
        });
      }

      navigation.navigate('OtpVerify', { phone: cleanedPhone });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfter = err?.response?.data?.retryAfter || 60;
        setRateLimitTimer(retryAfter);
        setError(t('auth.tooManyRequests', { seconds: retryAfter }));
      } else {
        const msg = getApiErrorMessage(err);
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const isComplete = phoneDisplay.replace(/\D/g, '').length === 11;
  const isButtonDisabled = loading || !isComplete || rateLimitTimer > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 24) + 20,
              paddingBottom: Math.max(insets.bottom, 24) + 20,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo & Branding */}
          <AnimatedEntrance index={0} style={styles.header}>
            <View
              style={[
                styles.logoWrap,
                {
                  backgroundColor: theme.colors.primary,
                  ...theme.shadows.lg,
                },
              ]}
            >
              <Building2 color={theme.colors.onPrimary} size={38} strokeWidth={2.2} />
            </View>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {t('auth.title')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {t('auth.subtitle')}
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
              <Input
                label={t('auth.phoneLabel')}
                value={phoneDisplay}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                placeholder="+7 (7XX) XXX-XX-XX"
                error={error}
                helper={
                  rateLimitTimer > 0
                    ? t('auth.tooManyRequests', { seconds: rateLimitTimer })
                    : t('auth.phoneHelper')
                }
                leftIcon={<Phone color={theme.colors.textMuted} size={20} />}
                autoFocus={true}
              />

              <Button
                title={
                  rateLimitTimer > 0
                    ? `${t('auth.getCodeButton')} (${rateLimitTimer})`
                    : t('auth.getCodeButton')
                }
                onPress={handleSendOtp}
                loading={loading}
                disabled={isButtonDisabled}
                size="lg"
                style={styles.submitButton}
              />
            </View>

            {/* Security reassurance footer */}
            <View style={styles.footerNote}>
              <ShieldCheck size={16} color={theme.colors.primary} />
              <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
                {t('profile.signatureTitle')}
              </Text>
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
    marginBottom: 32,
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 300,
  },
  formContainer: {
    width: '100%',
  },
  formCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
  },
  submitButton: {
    marginTop: 8,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
