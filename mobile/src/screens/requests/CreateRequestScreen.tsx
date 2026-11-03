import { FormExitDialog } from '../../components/common/FormExitDialog';
import { ScreenHero } from '../../components/common/ScreenHero';
import { PhotoAttachments } from '../../components/common/PhotoAttachments';
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import {
  ServiceRequestsApi,
  RequestCategory,
  RequestPriority,
} from '../../api/service-requests';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/common/Button';
import { useFormExitGuard } from '../../components/common/useFormExitGuard';
import { Input } from '../../components/common/Input';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Check } from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRequest'>;

export const CreateRequestScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { user } = useAuth();
  const primaryUnitId = user?.ownerships?.[0]?.unitId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RequestCategory>('PLUMBING');
  const [priority, setPriority] = useState<RequestPriority>('MEDIUM');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const formScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});
  const [error, setError] = useState('');
  const posting = useRef(false);
  const [saved, setSaved] = useState(false);
  const locked = submitting || saved;
  const exitGuard = useFormExitGuard(Boolean(title || description || attachments.length || category !== 'PLUMBING' || priority !== 'MEDIUM'), submitting || uploadingPhoto, saved);

  const categories: Array<{ key: RequestCategory; label: string }> = [
    { key: 'PLUMBING', label: t('requests.catPlumbing') },
    { key: 'ELECTRICAL', label: t('requests.catElectrical') },
    { key: 'ELEVATOR', label: t('requests.catElevator') },
    { key: 'HEATING', label: t('requests.catHeating') },
    { key: 'YARD_TERRITORY', label: t('requests.catYard') },
    { key: 'INTERCOM_ACCESS', label: t('requests.catIntercom') },
    { key: 'CLEANING', label: t('requests.catCleaning') },
    { key: 'OTHER', label: t('requests.catOther') },
  ];

  const priorities: Array<{ key: RequestPriority; label: string; color: string }> = [
    { key: 'LOW', label: t('requests.prioLow'), color: Colors.textMuted },
    { key: 'MEDIUM', label: t('requests.prioMedium'), color: Colors.info },
    { key: 'HIGH', label: t('requests.prioHigh'), color: Colors.warning },
    { key: 'EMERGENCY', label: t('requests.prioEmergency'), color: Colors.danger },
  ];


  const handleSubmit = async () => {
    if (uploadingPhoto || posting.current || saved) return;
    if (!primaryUnitId) {
      Alert.alert(t('common.error'), t('requests.noUnitAttachedError'));
      return;
    }
    const errors = { title: !title.trim() ? t('requests.titleRequiredError') : undefined, description: !description.trim() ? t('requests.descriptionRequiredError') : undefined };
    setFieldErrors(errors);
    if (errors.title || errors.description) {
      setError('');
      formScroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    posting.current = true;
    setSubmitting(true);
    setError('');

    try {
      await ServiceRequestsApi.createRequest({
        unitId: primaryUnitId,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        attachmentUrls: attachments.length > 0 ? attachments : undefined,
      });

      setSaved(true);
      Alert.alert(t('requests.requestCreatedTitle'), t('requests.requestCreatedMsg'), [
        { text: t('access.ok'), onPress: () => navigation.goBack() },
      ], { cancelable: false });
    } catch (e: any) {
      posting.current = false;
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('requests.newRequestTitle')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView ref={formScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scrollContent}>
        <ScreenHero title={t('residentUi.requestTitle')} subtitle={t('residentUi.requestHint')} />
        {/* Title */}
        <Input
          label={t('requests.whatHappenedLabel')}
          placeholder={t('requests.whatHappenedPlaceholder')}
          value={title}
          error={fieldErrors.title}
          editable={!locked}
          onChangeText={(v) => {
            setError('');
            setTitle(v);
            setFieldErrors(previous => ({ ...previous, title: undefined }));
          }}
        />

        {/* Description */}
        <Input
          label={t('requests.descriptionLabel')}
          placeholder={t('requests.descriptionPlaceholder')}
          value={description}
          error={fieldErrors.description}
          editable={!locked}
          onChangeText={(v) => {
            setError('');
            setDescription(v);
            setFieldErrors(previous => ({ ...previous, description: undefined }));
          }}
          multiline
          numberOfLines={4}
          style={styles.textArea}
        />

        {/* Category Picker */}
        <Text style={styles.fieldLabel}>{t('requests.categoryLabel')}</Text>
        <View style={styles.chipGrid}>
          {categories.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                accessibilityRole="radio"
                aria-checked={active} accessibilityState={{ checked: active, disabled: locked }}
                disabled={locked}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategory(c.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Priority Picker */}
        <Text style={styles.fieldLabel}>{t('requests.priorityLabel')}</Text>
        <View style={styles.priorityRow}>
          {priorities.map((p) => {
            const active = priority === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                accessibilityRole="radio"
                aria-checked={active}
                accessibilityState={{ checked: active, disabled: locked }}
                disabled={locked}
                style={[styles.priorityItem, active && styles.priorityItemActive]}
                onPress={() => setPriority(p.key)}
              >
                <Text style={[styles.priorityText, { color: active ? '#FFFFFF' : p.color }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Attach Photo */}
        <Text style={styles.fieldLabel}>{t('requests.photosLabel')}</Text>
        <PhotoAttachments value={attachments} onChange={setAttachments} onBusyChange={setUploadingPhoto} disabled={locked} />

      </ScrollView>
      <View style={styles.footer}>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}

        <Button
          title={t('requests.submitToDispatcher')}
          onPress={handleSubmit}
          loading={submitting}
          disabled={uploadingPhoto || saved}
          size="lg"
          style={styles.submitBtn}
        />
      </View>
      </KeyboardAvoidingView>
      <FormExitDialog {...exitGuard} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    marginTop: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  priorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  priorityItem: {
    minHeight: 44,
    justifyContent: 'center',
    flexGrow: 1,
    flexBasis: '45%',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  priorityItemActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priorityText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  photoUploadBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryBg,
    marginBottom: 20,
    gap: 8,
  },
  photoUploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  submitBtn: {
    marginTop: 0,
  },
});
