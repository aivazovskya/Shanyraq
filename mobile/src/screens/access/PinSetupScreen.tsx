import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Button,
  IconButton,
  Card,
  Badge,
  Input,
  SkeletonCard,
  AnimatedEntrance,
} from '../../components/ui';
import {
  KeyRound,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Delete,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react-native';

export const PinSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isPinSet, setIsPinSet] = useState(false);
  const [mode, setMode] = useState<'SETUP' | 'CHANGE' | 'FORGOT_OTP'>('SETUP');

  // Multi-step pin entry: 0: currentPin (if CHANGE), 1: newPin, 2: confirmPin
  const [pinStep, setPinStep] = useState<number>(0);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const shakeOffset = useSharedValue(0);

  const fetchStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const res = await AuthApi.getPinStatus();
      setIsPinSet(res.isPinSet);
      setMode(res.isPinSet ? 'CHANGE' : 'SETUP');
      setPinStep(res.isPinSet ? 0 : 1);
    } catch (e) {
      console.warn('Failed to load PIN status:', e);
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const triggerShake = (errMsg: string) => {
    setError(errMsg);
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
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }), [shakeOffset]);

  const validateLocalPin = (pinStr: string): string | null => {
    if (!/^\d{4}$|^\d{6}$/.test(pinStr)) {
      return t('access.pinValidationLength');
    }
    const allSame = pinStr.split('').every((d) => d === pinStr[0]);
    if (allSame) {
      return t('access.pinValidationSame');
    }
    const weakList = [
      '1234',
      '4321',
      '0123',
      '3210',
      '9876',
      '6789',
      '2580',
      '123456',
      '654321',
    ];
    if (weakList.includes(pinStr)) {
      return t('access.pinValidationWeak');
    }
    return null;
  };

  const handleKeyPress = (num: string) => {
    safeHaptic.selection();
    setError('');

    if (pinStep === 0) {
      if (currentPin.length < 6) setCurrentPin((prev) => prev + num);
    } else if (pinStep === 1) {
      if (newPin.length < 6) setNewPin((prev) => prev + num);
    } else if (pinStep === 2) {
      if (confirmPin.length < 6) setConfirmPin((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    safeHaptic.selection();
    setError('');

    if (pinStep === 0) {
      setCurrentPin((prev) => prev.slice(0, -1));
    } else if (pinStep === 1) {
      setNewPin((prev) => prev.slice(0, -1));
    } else if (pinStep === 2) {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    safeHaptic.selection();
    setError('');

    if (pinStep === 0) setCurrentPin('');
    else if (pinStep === 1) setNewPin('');
    else if (pinStep === 2) setConfirmPin('');
  };

  const handleNextStep = async () => {
    if (pinStep === 0) {
      if (currentPin.length < 4) {
        triggerShake(t('access.enterCurrentPinError'));
        return;
      }
      setPinStep(1);
    } else if (pinStep === 1) {
      const err = validateLocalPin(newPin);
      if (err) {
        triggerShake(err);
        return;
      }
      setPinStep(2);
    } else if (pinStep === 2) {
      if (newPin !== confirmPin) {
        triggerShake(t('access.pinsDoNotMatchError'));
        return;
      }
      await handleSavePin();
    }
  };

  const handleSavePin = async () => {
    setLoading(true);
    setError('');

    try {
      await AuthApi.setPin({
        newPin,
        currentPin: mode === 'CHANGE' ? currentPin : undefined,
      });
      safeHaptic.notification();
      showToast({
        type: 'success',
        title: t('common.success'),
        message: t('access.pinSavedSuccess'),
      });
      setTimeout(() => navigation.goBack(), 1200);
    } catch (e: any) {
      const msg = getApiErrorMessage(e);
      triggerShake(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setError('');
    setLoading(true);

    try {
      const res = await AuthApi.requestPinReset();
      setCountdown(60);
      safeHaptic.selection();

      if (res.devCode) {
        showToast({
          type: 'info',
          title: t('access.devSmsTitle'),
          message: t('access.devSmsBody', { code: res.devCode }),
          code: res.devCode,
        });
      }
    } catch (e: any) {
      triggerShake(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithOtp = async () => {
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      triggerShake(t('auth.otpValidation'));
      return;
    }

    const pinErr = validateLocalPin(newPin);
    if (pinErr) {
      triggerShake(pinErr);
      return;
    }

    if (newPin !== confirmPin) {
      triggerShake(t('access.pinsDoNotMatchError'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await AuthApi.confirmPinReset({
        otpCode: otpCode.trim(),
        newPin,
      });
      safeHaptic.notification();
      showToast({
        type: 'success',
        title: t('common.success'),
        message: t('access.pinResetSuccess'),
      });
      setTimeout(() => navigation.goBack(), 1200);
    } catch (e: any) {
      triggerShake(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const currentDisplayPin =
    pinStep === 0 ? currentPin : pinStep === 1 ? newPin : confirmPin;

  const currentPromptText =
    pinStep === 0
      ? t('access.currentPinLabel')
      : pinStep === 1
      ? t('access.newPinLabel')
      : t('access.confirmPinLabel');

  const keypadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', 'DEL'],
  ];

  if (checkingStatus) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            paddingTop: Math.max(insets.top, 16) + 12,
            paddingHorizontal: 16,
          },
        ]}
      >
        <SkeletonCard style={{ height: 260 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <IconButton
          icon={<ArrowLeft color={theme.colors.text} size={22} />}
          onPress={() => navigation.goBack()}
          variant="ghost"
          accessibilityLabel={t('common.back')}
        />
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {mode === 'CHANGE'
              ? t('access.pinChangeTitle')
              : mode === 'FORGOT_OTP'
              ? t('access.pinForgotTitle')
              : t('access.pinSetupTitle')}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'FORGOT_OTP' ? (
            /* Forgot PIN via SMS OTP Form */
            <AnimatedEntrance index={0}>
              <Card style={styles.card}>
                <View style={styles.promoHeader}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: theme.colors.primaryBg },
                    ]}
                  >
                    <KeyRound size={26} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                    {t('access.pinForgotTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {t('access.smsOtpHelper')}
                  </Text>
                </View>

                <View style={styles.otpRow}>
                  <Input
                    label={t('access.smsOtpLabel')}
                    placeholder={t('access.pinPlaceholderDigits')}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    containerStyle={{ flex: 1 }}
                  />
                  <Button
                    title={
                      countdown > 0
                        ? `${countdown}s`
                        : t('access.confirmResetBtn')
                    }
                    onPress={handleRequestOtp}
                    disabled={countdown > 0 || loading}
                    variant="secondary"
                    size="md"
                    style={{ marginTop: 6 }}
                  />
                </View>

                <Input
                  label={t('access.newPinLabel')}
                  placeholder={t('access.pinPlaceholderDigits')}
                  value={newPin}
                  onChangeText={setNewPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  containerStyle={{ marginBottom: 14 }}
                />

                <Input
                  label={t('access.confirmPinLabel')}
                  placeholder={t('access.confirmPinPlaceholder')}
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  containerStyle={{ marginBottom: 20 }}
                />

                {error ? (
                  <Text
                    style={[styles.errorText, { color: theme.colors.danger }]}
                  >
                    {error}
                  </Text>
                ) : null}

                <Button
                  title={t('access.confirmResetBtn')}
                  onPress={handleResetWithOtp}
                  loading={loading}
                  variant="primary"
                  size="lg"
                  style={{ width: '100%' }}
                />

                <TouchableOpacity
                  onPress={() => {
                    setMode(isPinSet ? 'CHANGE' : 'SETUP');
                    setPinStep(isPinSet ? 0 : 1);
                  }}
                  style={styles.switchModeBtn}
                >
                  <Text
                    style={[
                      styles.switchModeText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {t('access.returnToRegularInput')}
                  </Text>
                </TouchableOpacity>
              </Card>
            </AnimatedEntrance>
          ) : (
            /* PIN Setup / Change with Custom Keypad */
            <AnimatedEntrance index={0}>
              <Card style={styles.card}>
                <View style={styles.promoHeader}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: theme.colors.primaryBg },
                    ]}
                  >
                    <KeyRound size={26} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                    {currentPromptText}
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {t('access.pinSetupSubtitle')}
                  </Text>
                </View>

                {/* Dots Indicator */}
                <Animated.View style={[styles.dotsContainer, shakeStyle]}>
                  {Array.from({ length: 6 }).map((_, i) => {
                    const isFilled = i < currentDisplayPin.length;
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

                {error ? (
                  <Text
                    style={[styles.errorText, { color: theme.colors.danger }]}
                  >
                    {error}
                  </Text>
                ) : null}

                {/* Keypad Grid */}
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
                                {
                                  backgroundColor: theme.colors.surfaceSubtle,
                                  borderColor: theme.colors.border,
                                },
                              ]}
                              onPress={handleClear}
                              disabled={loading || currentDisplayPin.length === 0}
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
                                {
                                  backgroundColor: theme.colors.surfaceSubtle,
                                  borderColor: theme.colors.border,
                                },
                              ]}
                              onPress={handleDelete}
                              disabled={loading || currentDisplayPin.length === 0}
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
                            disabled={loading || currentDisplayPin.length >= 6}
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

                {/* Next / Submit Button */}
                <Button
                  title={
                    pinStep === 2
                      ? t('access.savePinBtn')
                      : t('requests.nextStep')
                  }
                  onPress={handleNextStep}
                  loading={loading}
                  disabled={
                    currentDisplayPin.length < 4 || currentDisplayPin.length > 6
                  }
                  variant="primary"
                  size="lg"
                  style={{ width: '100%', marginTop: 8 }}
                />

                {/* Forgot PIN Link if in CHANGE mode */}
                {mode === 'CHANGE' && (
                  <TouchableOpacity
                    onPress={() => {
                      setMode('FORGOT_OTP');
                      handleRequestOtp();
                    }}
                    style={styles.switchModeBtn}
                  >
                    <Text
                      style={[
                        styles.switchModeText,
                        { color: theme.colors.primary },
                      ]}
                    >
                      {t('access.forgotCurrentPinBtn')}
                    </Text>
                  </TouchableOpacity>
                )}
              </Card>
            </AnimatedEntrance>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  scrollContent: {
    padding: 16,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    alignItems: 'center',
  },
  promoHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 16,
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
    marginBottom: 10,
  },
  keypadGrid: {
    width: '100%',
    maxWidth: 320,
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
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberKeyText: {
    fontSize: 22,
    fontWeight: '700',
  },
  actionKeyText: {
    fontSize: 16,
    fontWeight: '700',
  },
  otpRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  switchModeBtn: {
    paddingVertical: 12,
    marginTop: 8,
  },
  switchModeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
