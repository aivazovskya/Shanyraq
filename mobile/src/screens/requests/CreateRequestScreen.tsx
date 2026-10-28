import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import {
  ServiceRequestsApi,
  RequestCategory,
  RequestPriority,
} from '../../api/service-requests';
import { getApiErrorMessage } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Button,
  IconButton,
  Input,
  Card,
  Badge,
  BadgeVariant,
  AnimatedEntrance,
} from '../../components/ui';
import { PhotoAttachments } from '../../components/common/PhotoAttachments';
import {
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Zap,
  Building,
  Flame,
  Trees,
  KeyRound,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  Clock,
  Shield,
  Check,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRequest'>;

export const CreateRequestScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const primaryUnitId = user?.ownerships?.[0]?.unitId;

  const [step, setStep] = useState<number>(1);
  const [category, setCategory] = useState<RequestCategory>('PLUMBING');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [priority, setPriority] = useState<RequestPriority>('MEDIUM');

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Inline errors
  const [titleError, setTitleError] = useState('');
  const [descError, setDescError] = useState('');

  const categories: Array<{
    key: RequestCategory;
    label: string;
    icon: (color: string) => React.ReactNode;
  }> = [
    {
      key: 'PLUMBING',
      label: t('requests.catPlumbing'),
      icon: (color) => <Droplets size={24} color={color} />,
    },
    {
      key: 'ELECTRICAL',
      label: t('requests.catElectrical'),
      icon: (color) => <Zap size={24} color={color} />,
    },
    {
      key: 'ELEVATOR',
      label: t('requests.catElevator'),
      icon: (color) => <Building size={24} color={color} />,
    },
    {
      key: 'HEATING',
      label: t('requests.catHeating'),
      icon: (color) => <Flame size={24} color={color} />,
    },
    {
      key: 'YARD_TERRITORY',
      label: t('requests.catYard'),
      icon: (color) => <Trees size={24} color={color} />,
    },
    {
      key: 'INTERCOM_ACCESS',
      label: t('requests.catIntercom'),
      icon: (color) => <KeyRound size={24} color={color} />,
    },
    {
      key: 'CLEANING',
      label: t('requests.catCleaning'),
      icon: (color) => <Sparkles size={24} color={color} />,
    },
    {
      key: 'OTHER',
      label: t('requests.catOther'),
      icon: (color) => <HelpCircle size={24} color={color} />,
    },
  ];

  const priorities: Array<{
    key: RequestPriority;
    label: string;
    desc: string;
    variant: BadgeVariant;
  }> = [
    {
      key: 'LOW',
      label: t('requests.prioLow'),
      desc: t('requests.priorityLowDesc'),
      variant: 'neutral',
    },
    {
      key: 'MEDIUM',
      label: t('requests.prioMedium'),
      desc: t('requests.priorityMediumDesc'),
      variant: 'info',
    },
    {
      key: 'HIGH',
      label: t('requests.prioHigh'),
      desc: t('requests.priorityHighDesc'),
      variant: 'warning',
    },
    {
      key: 'EMERGENCY',
      label: t('requests.prioEmergency'),
      desc: t('requests.priorityEmergencyDesc'),
      variant: 'danger',
    },
  ];

  const handleNext = () => {
    safeHaptic.selection();

    if (step === 2) {
      let hasError = false;
      if (!title.trim()) {
        setTitleError(t('requests.titleRequiredError'));
        hasError = true;
      } else {
        setTitleError('');
      }

      if (!description.trim()) {
        setDescError(t('requests.descriptionRequiredError'));
        hasError = true;
      } else {
        setDescError('');
      }

      if (hasError) {
        safeHaptic.notification();
        return;
      }
    }

    if (step < 4) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    safeHaptic.selection();
    if (step > 1) {
      setStep((prev) => prev - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    if (uploadingPhoto || submitting) return;

    if (!primaryUnitId) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: t('requests.noUnitAttachedError'),
      });
      return;
    }

    setSubmitting(true);

    try {
      await ServiceRequestsApi.createRequest({
        unitId: primaryUnitId,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        attachmentUrls: attachments.length > 0 ? attachments : undefined,
      });

      safeHaptic.notification();
      setIsSuccess(true);

      showToast({
        type: 'success',
        title: t('requests.requestCreatedTitle'),
        message: t('requests.requestCreatedMsg'),
      });

      setTimeout(() => {
        navigation.goBack();
      }, 1400);
    } catch (e: any) {
      safeHaptic.notification();
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <View
        style={[
          styles.successContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <AnimatedEntrance index={0}>
          <View style={styles.successCard}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: theme.colors.successBg },
              ]}
            >
              <CheckCircle2 color={theme.colors.success} size={54} />
            </View>
            <Text style={[styles.successTitle, { color: theme.colors.text }]}>
              {t('requests.requestCreatedTitle')}
            </Text>
            <Text
              style={[styles.successSubtitle, { color: theme.colors.textMuted }]}
            >
              {t('requests.requestCreatedMsg')}
            </Text>
          </View>
        </AnimatedEntrance>
      </View>
    );
  }

  const stepTitles = [
    t('requests.stepCategory'),
    t('requests.stepDescription'),
    t('requests.stepPhotos'),
    t('requests.stepPriority'),
  ];

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
          onPress={handleBack}
          variant="ghost"
          accessibilityLabel={t('common.back')}
        />
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('requests.newRequestTitle')}
          </Text>
          <Text style={[styles.stepIndicatorText, { color: theme.colors.textMuted }]}>
            {step} / 4 • {stepTitles[step - 1]}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Progress Bar */}
      <View
        style={[
          styles.progressTrack,
          { backgroundColor: theme.colors.surfaceSubtle },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.colors.primary,
              width: `${(step / 4) * 100}%`,
            },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 90 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: Categories Tiles */}
          {step === 1 && (
            <AnimatedEntrance index={0}>
              <View style={styles.stepSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {t('requests.selectCategory')}
                </Text>
                <View style={styles.categoriesGrid}>
                  {categories.map((c) => {
                    const isSelected = category === c.key;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        activeOpacity={0.85}
                        onPress={() => {
                          safeHaptic.selection();
                          setCategory(c.key);
                        }}
                        style={[
                          styles.categoryTile,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primaryBg
                              : theme.colors.surface,
                            borderColor: isSelected
                              ? theme.colors.primary
                              : theme.colors.border,
                          },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={c.label}
                      >
                        <View
                          style={[
                            styles.tileIconCircle,
                            {
                              backgroundColor: isSelected
                                ? theme.isDark
                                  ? theme.colors.primaryDark
                                  : theme.colors.primaryLight
                                : theme.colors.surfaceSubtle,
                            },
                          ]}
                        >
                          {c.icon(
                            isSelected
                              ? theme.isDark
                                ? '#FFFFFF'
                                : theme.colors.primary
                              : theme.colors.textMuted
                          )}
                        </View>
                        <Text
                          style={[
                            styles.categoryLabel,
                            {
                              color: isSelected
                                ? theme.colors.primary
                                : theme.colors.text,
                              fontWeight: isSelected ? '700' : '600',
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </AnimatedEntrance>
          )}

          {/* STEP 2: Description & Title */}
          {step === 2 && (
            <AnimatedEntrance index={0}>
              <View style={styles.stepSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {t('requests.whatHappenedLabel')}
                </Text>
                <Input
                  label={t('requests.whatHappenedLabel')}
                  placeholder={t('requests.whatHappenedPlaceholder')}
                  value={title}
                  onChangeText={(val) => {
                    setTitle(val);
                    if (val.trim()) setTitleError('');
                  }}
                  error={titleError}
                  containerStyle={{ marginBottom: 16 }}
                />

                <Input
                  label={t('requests.descriptionLabel')}
                  placeholder={t('requests.descriptionPlaceholder')}
                  value={description}
                  onChangeText={(val) => {
                    setDescription(val);
                    if (val.trim()) setDescError('');
                  }}
                  error={descError}
                  multiline
                  numberOfLines={4}
                  inputStyle={styles.multilineInput}
                />
              </View>
            </AnimatedEntrance>
          )}

          {/* STEP 3: Photos */}
          {step === 3 && (
            <AnimatedEntrance index={0}>
              <View style={styles.stepSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {t('requests.photosLabel')}
                </Text>
                <Text
                  style={[
                    styles.sectionSubtitle,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {t('requests.photosOptional')}
                </Text>

                <Card style={styles.photosCard}>
                  <PhotoAttachments
                    value={attachments}
                    onChange={setAttachments}
                    onBusyChange={setUploadingPhoto}
                  />
                </Card>
              </View>
            </AnimatedEntrance>
          )}

          {/* STEP 4: Priority & Confirmation */}
          {step === 4 && (
            <AnimatedEntrance index={0}>
              <View style={styles.stepSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {t('requests.priorityLabel')}
                </Text>

                <View style={styles.prioritiesList}>
                  {priorities.map((p) => {
                    const isSelected = priority === p.key;
                    return (
                      <TouchableOpacity
                        key={p.key}
                        activeOpacity={0.88}
                        onPress={() => {
                          safeHaptic.selection();
                          setPriority(p.key);
                        }}
                        style={[
                          styles.priorityCard,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primaryBg
                              : theme.colors.surface,
                            borderColor: isSelected
                              ? theme.colors.primary
                              : theme.colors.border,
                          },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <View style={styles.priorityHeader}>
                          <Badge
                            label={p.label}
                            variant={p.variant}
                            size="md"
                            showDot
                          />
                          {isSelected && (
                            <View
                              style={[
                                styles.checkDot,
                                { backgroundColor: theme.colors.primary },
                              ]}
                            >
                              <Check color="#FFFFFF" size={14} />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.priorityDesc,
                            { color: theme.colors.textMuted },
                          ]}
                        >
                          {p.desc}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </AnimatedEntrance>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Bottom Action Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        {step > 1 ? (
          <Button
            title={t('requests.prevStep')}
            variant="secondary"
            onPress={handleBack}
            style={styles.navButton}
            accessibilityLabel={t('requests.prevStep')}
          />
        ) : null}

        {step < 4 ? (
          <Button
            title={t('requests.nextStep')}
            variant="primary"
            onPress={handleNext}
            style={styles.navButton}
            accessibilityLabel={t('requests.nextStep')}
          />
        ) : (
          <Button
            title={t('requests.submitToDispatcher')}
            variant="primary"
            onPress={handleSubmit}
            loading={submitting || uploadingPhoto}
            disabled={submitting || uploadingPhoto}
            style={styles.navButton}
            accessibilityLabel={t('requests.submitToDispatcher')}
          />
        )}
      </View>
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
  stepIndicatorText: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  scrollContent: {
    padding: 20,
  },
  stepSection: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  categoryTile: {
    width: '47.5%',
    minHeight: 104,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 13,
    textAlign: 'center',
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  photosCard: {
    padding: 16,
  },
  prioritiesList: {
    gap: 12,
    marginTop: 8,
  },
  priorityCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
  },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  navButton: {
    flex: 1,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successCard: {
    alignItems: 'center',
    maxWidth: 380,
  },
  successIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  successSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
