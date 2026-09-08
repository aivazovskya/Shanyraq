import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
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
import { Input } from '../../components/common/Input';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Camera, Check } from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRequest'>;

export const CreateRequestScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const primaryUnitId = user?.ownerships?.[0]?.unitId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RequestCategory>('PLUMBING');
  const [priority, setPriority] = useState<RequestPriority>('MEDIUM');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  const handleAddSamplePhoto = () => {
    // Demonstration attachment photo URL simulating MinIO upload
    const mockUrl = `http://localhost:9000/shanyraq-media/sample_repair_${Date.now()}.jpg`;
    setAttachments((prev) => [...prev, mockUrl]);
    Alert.alert(t('requests.photoAttachedTitle'), t('requests.photoAttachedMsg'));
  };

  const handleSubmit = async () => {
    if (!primaryUnitId) {
      Alert.alert(t('common.error'), t('requests.noUnitAttachedError'));
      return;
    }
    if (!title.trim()) {
      setError(t('requests.titleRequiredError'));
      return;
    }
    if (!description.trim()) {
      setError(t('requests.descriptionRequiredError'));
      return;
    }

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

      Alert.alert(t('requests.requestCreatedTitle'), t('requests.requestCreatedMsg'), [
        { text: t('access.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('requests.newRequestTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Input
          label={t('requests.whatHappenedLabel')}
          placeholder={t('requests.whatHappenedPlaceholder')}
          value={title}
          onChangeText={(v) => {
            setError('');
            setTitle(v);
          }}
        />

        {/* Category Picker */}
        <Text style={styles.fieldLabel}>{t('requests.categoryLabel')}</Text>
        <View style={styles.chipGrid}>
          {categories.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
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

        {/* Description */}
        <Input
          label={t('requests.descriptionLabel')}
          placeholder={t('requests.descriptionPlaceholder')}
          value={description}
          onChangeText={(v) => {
            setError('');
            setDescription(v);
          }}
          multiline
          numberOfLines={4}
          style={styles.textArea}
        />

        {/* Attach Photo */}
        <Text style={styles.fieldLabel}>{t('requests.photosLabel')}</Text>
        <TouchableOpacity style={styles.photoUploadBox} onPress={handleAddSamplePhoto}>
          <Camera color={Colors.primary} size={28} />
          <Text style={styles.photoUploadText}>
            {attachments.length > 0
              ? t('requests.photosCount', { count: attachments.length })
              : t('requests.takeOrChoosePhoto')}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          title={t('requests.submitToDispatcher')}
          onPress={handleSubmit}
          loading={submitting}
          size="lg"
          style={styles.submitBtn}
        />
      </ScrollView>
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
    padding: 4,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
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
    gap: 8,
    marginBottom: 16,
  },
  priorityItem: {
    flex: 1,
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
    fontSize: 12,
    fontWeight: '700',
  },
  textArea: {
    height: 100,
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
    marginTop: 8,
  },
});
