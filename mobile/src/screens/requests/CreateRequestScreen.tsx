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

const CATEGORIES: Array<{ key: RequestCategory; label: string }> = [
  { key: 'PLUMBING', label: 'Сантехника' },
  { key: 'ELECTRICAL', label: 'Электрика' },
  { key: 'ELEVATOR', label: 'Лифты' },
  { key: 'HEATING', label: 'Отопление' },
  { key: 'YARD_TERRITORY', label: 'Двор / Территория' },
  { key: 'INTERCOM_ACCESS', label: 'Домофон / Двери' },
  { key: 'CLEANING', label: 'Уборка' },
  { key: 'OTHER', label: 'Другое' },
];

const PRIORITIES: Array<{ key: RequestPriority; label: string; color: string }> = [
  { key: 'LOW', label: 'Низкий', color: Colors.textMuted },
  { key: 'MEDIUM', label: 'Обычный', color: Colors.info },
  { key: 'HIGH', label: 'Высокий', color: Colors.warning },
  { key: 'EMERGENCY', label: 'Аварийный', color: Colors.danger },
];

export const CreateRequestScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const primaryUnitId = user?.ownerships?.[0]?.unitId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RequestCategory>('PLUMBING');
  const [priority, setPriority] = useState<RequestPriority>('MEDIUM');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddSamplePhoto = () => {
    // Demonstration attachment photo URL simulating MinIO upload
    const mockUrl = `http://localhost:9000/shanyraq-media/sample_repair_${Date.now()}.jpg`;
    setAttachments((prev) => [...prev, mockUrl]);
    Alert.alert('Фото прикреплено', 'Изображение успешно добавлено к заявке');
  };

  const handleSubmit = async () => {
    if (!primaryUnitId) {
      Alert.alert('Ошибка', 'К вашему аккаунту не привязана квартира');
      return;
    }
    if (!title.trim()) {
      setError('Укажите краткую тему заявки');
      return;
    }
    if (!description.trim()) {
      setError('Подробно опишите суть неисправности');
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

      Alert.alert('Заявка создана', 'Диспетчер получил обращение и назначит мастера в ближайшее время.', [
        { text: 'OK', onPress: () => navigation.goBack() },
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
        <Text style={styles.navTitle}>Новая заявка</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Input
          label="Что произошло?"
          placeholder="Например: Протекает труба под раковиной"
          value={title}
          onChangeText={(v) => {
            setError('');
            setTitle(v);
          }}
        />

        {/* Category Picker */}
        <Text style={styles.fieldLabel}>Категория вопроса</Text>
        <View style={styles.chipGrid}>
          {CATEGORIES.map((c) => {
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
        <Text style={styles.fieldLabel}>Срочность</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => {
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
          label="Подробное описание"
          placeholder="Укажите удобное время визита мастера, детали поломки..."
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
        <Text style={styles.fieldLabel}>Фотографии (необязательно)</Text>
        <TouchableOpacity style={styles.photoUploadBox} onPress={handleAddSamplePhoto}>
          <Camera color={Colors.primary} size={28} />
          <Text style={styles.photoUploadText}>
            {attachments.length > 0
              ? `Прикреплено фото: ${attachments.length} шт.`
              : 'Сфотографировать или выбрать из галереи'}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          title="Отправить заявку в диспетчерскую"
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
