import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Modal,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Gauge,
  Droplets,
  Flame,
  Zap,
  HelpCircle,
  Camera,
  CheckCircle2,
  Clock,
  XCircle,
  Home,
  X,
  AlertCircle,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../../components/common/LoadingState';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { metersApi, MeterData, MeterReading, MeterType } from '../../api/meters';

export const MetersScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const verifiedOwnerships = (user?.ownerships || []).filter((o) => o.isVerified);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(0);

  const activeUnit = verifiedOwnerships[selectedUnitIndex]?.unit;
  const activeUnitId = activeUnit?.id;

  const [meters, setMeters] = useState<MeterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submit Modal State
  const [selectedMeter, setSelectedMeter] = useState<MeterData | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputMonth, setInputMonth] = useState(new Date().getMonth() + 1);
  const [inputYear, setInputYear] = useState(new Date().getFullYear());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadMeters = useCallback(async () => {
    if (!activeUnitId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const data = await metersApi.getUnitMeters(activeUnitId);
      setMeters(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || t('meters.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeUnitId, t]);

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  const onRefresh = () => {
    setRefreshing(true);
    loadMeters();
  };

  const getLatestReading = (meter: MeterData): MeterReading | null => {
    if (!meter.readings || meter.readings.length === 0) return null;
    return [...meter.readings].sort((a, b) => {
      if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
      return b.periodMonth - a.periodMonth;
    })[0];
  };

  const getLastVerifiedReading = (meter: MeterData): MeterReading | null => {
    const verified = (meter.readings || []).filter((r) => r.status === 'VERIFIED');
    if (verified.length === 0) return null;
    return verified.sort((a, b) => {
      if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
      return b.periodMonth - a.periodMonth;
    })[0];
  };

  const openSubmitModal = (meter: MeterData) => {
    setSelectedMeter(meter);
    const now = new Date();
    setInputMonth(now.getMonth() + 1);
    setInputYear(now.getFullYear());
    setInputValue('');
    setPhotoUrl(null);
    setSubmitError(null);
    setIsSubmitModalOpen(true);
  };

  const handleAttachPhoto = () => {
    // Demonstration attachment photo simulating MinIO upload, matching CreateRequestScreen
    const mockUrl = `http://localhost:9000/shanyraq-media/meter_${Date.now()}.jpg`;
    setPhotoUrl(mockUrl);
    setSubmitError(null);
  };

  const handleSubmitReading = async () => {
    if (!selectedMeter) return;

    if (!inputValue.trim()) {
      setSubmitError(t('meters.validationEmptyError'));
      return;
    }

    const numVal = parseFloat(inputValue);
    if (isNaN(numVal) || numVal < 0) {
      setSubmitError(t('meters.validationEmptyError'));
      return;
    }

    const lastVerified = getLastVerifiedReading(selectedMeter);
    const minVal = lastVerified ? lastVerified.value : selectedMeter.initialValue;

    if (numVal < minVal) {
      setSubmitError(t('meters.validationLessError', { value: numVal, min: minVal }));
      return;
    }

    if (!photoUrl) {
      setSubmitError(t('meters.photoRequired'));
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      await metersApi.submitReading(selectedMeter.id, {
        value: numVal,
        photoUrl,
        month: inputMonth,
        year: inputYear,
      });

      setIsSubmitModalOpen(false);
      Alert.alert(t('meters.submitSuccessTitle'), t('meters.submitSuccessMsg'));
      await loadMeters();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const getMeterTypeIcon = (type: MeterType) => {
    switch (type) {
      case 'COLD_WATER':
        return <Droplets color={Colors.primary} size={22} />;
      case 'HOT_WATER':
        return <Flame color={Colors.danger} size={22} />;
      case 'ELECTRICITY':
        return <Zap color={Colors.warning} size={22} />;
      default:
        return <HelpCircle color={Colors.textMuted} size={22} />;
    }
  };

  const getMeterTypeName = (type: MeterType) => {
    switch (type) {
      case 'COLD_WATER':
        return t('meters.typeColdWater');
      case 'HOT_WATER':
        return t('meters.typeHotWater');
      case 'ELECTRICITY':
        return t('meters.typeElectricity');
      default:
        return t('meters.typeOther');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('meters.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Unit Selector (if multiple apartments) */}
      {verifiedOwnerships.length > 1 && (
        <View style={styles.unitSelectorContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitPillsRow}>
            {verifiedOwnerships.map((o, idx) => {
              const isSelected = selectedUnitIndex === idx;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.unitPill, isSelected && styles.unitPillSelected]}
                  onPress={() => setSelectedUnitIndex(idx)}
                >
                  <Home color={isSelected ? '#FFFFFF' : Colors.textMuted} size={14} />
                  <Text style={[styles.unitPillText, isSelected && styles.unitPillTextSelected]}>
                    {t('common.unitShort')} {o.unit.unitNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <LoadingState message={t('common.loading')} />
      ) : error ? (
        <View style={styles.centered}>
          <AlertCircle color={Colors.danger} size={48} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title={t('common.retry')} onPress={loadMeters} style={{ marginTop: 16 }} />
        </View>
      ) : meters.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        >
          <View style={styles.emptyIconCircle}>
            <Gauge color={Colors.textMuted} size={40} />
          </View>
          <Text style={styles.emptyTitle}>{t('meters.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('meters.emptyDesc')}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        >
          {meters.map((meter) => {
            const latest = getLatestReading(meter);
            const isRejected = latest?.status === 'REJECTED';
            const isPending = latest?.status === 'PENDING';
            const isVerified = latest?.status === 'VERIFIED';

            return (
              <Card key={meter.id} style={styles.meterCard}>
                {/* Card Header */}
                <View style={styles.meterHeader}>
                  <View style={styles.meterIconContainer}>{getMeterTypeIcon(meter.type)}</View>
                  <View style={styles.meterInfo}>
                    <Text style={styles.meterName}>{getMeterTypeName(meter.type)}</Text>
                    <Text style={styles.meterSerial}>
                      {meter.serialNumber
                        ? t('meters.serialNumber', { number: meter.serialNumber })
                        : t('meters.initialReading', { value: meter.initialValue })}
                    </Text>
                  </View>
                </View>

                {/* Latest Reading Info */}
                <View style={styles.readingSection}>
                  {latest ? (
                    <View style={styles.readingBox}>
                      <View style={styles.readingHeader}>
                        <Text style={styles.readingPeriod}>
                          {t('meters.periodFormat', {
                            month: String(latest.periodMonth).padStart(2, '0'),
                            year: latest.periodYear,
                          })}
                        </Text>
                        <View style={styles.statusBadge}>
                          {isPending ? (
                            <View style={[styles.badge, styles.badgePending]}>
                              <Clock color="#D97706" size={12} />
                              <Text style={styles.badgeTextPending}>{t('meters.statusPending')}</Text>
                            </View>
                          ) : isVerified ? (
                            <View style={[styles.badge, styles.badgeVerified]}>
                              <CheckCircle2 color="#059669" size={12} />
                              <Text style={styles.badgeTextVerified}>{t('meters.statusVerified')}</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.badgeRejected]}>
                              <XCircle color="#DC2626" size={12} />
                              <Text style={styles.badgeTextRejected}>{t('meters.statusRejected')}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <Text style={styles.readingValueText}>
                        {latest.value.toLocaleString()}{' '}
                        <Text style={styles.readingUnit}>
                          {meter.type === 'ELECTRICITY'
                            ? t('meters.unitElectricity')
                            : t('meters.unitWater')}
                        </Text>
                      </Text>

                      {isRejected && latest.reviewNote && (
                        <View style={styles.rejectionBox}>
                          <Text style={styles.rejectionNote}>
                            {t('meters.rejectionReason', { note: latest.reviewNote })}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.noReadingsBox}>
                      <Text style={styles.noReadingsText}>{t('meters.noReadingsYet')}</Text>
                      <Text style={styles.initialValueText}>
                        {t('meters.initialReading', { value: meter.initialValue })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  style={[styles.submitButton, isRejected && styles.resubmitButton]}
                  onPress={() => openSubmitModal(meter)}
                >
                  <Text style={styles.submitButtonText}>
                    {isRejected ? t('meters.resubmitBtn') : t('meters.submitBtn')}
                  </Text>
                </TouchableOpacity>
              </Card>
            );
          })}
        </ScrollView>
      )}

      {/* SUBMISSION MODAL */}
      {selectedMeter && (
        <Modal
          visible={isSubmitModalOpen}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsSubmitModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{t('meters.modalTitle')}</Text>
                  <Text style={styles.modalSub}>{getMeterTypeName(selectedMeter.type)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setIsSubmitModalOpen(false)}
                >
                  <X color={Colors.textMuted} size={20} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScrollContent}>
                {/* Period Display */}
                <Text style={styles.fieldLabel}>{t('meters.periodLabel')}</Text>
                <View style={styles.periodRow}>
                  <Text style={styles.periodText}>
                    {t('meters.periodFormat', {
                      month: String(inputMonth).padStart(2, '0'),
                      year: inputYear,
                    })}
                  </Text>
                </View>

                {/* Numeric Value Input */}
                <Text style={styles.fieldLabel}>{t('meters.inputLabel')}</Text>
                <TextInput
                  style={styles.numericInput}
                  keyboardType="decimal-pad"
                  placeholder={t('meters.inputPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={inputValue}
                  onChangeText={(val) => {
                    setInputValue(val);
                    setSubmitError(null);
                  }}
                />

                {/* Photo Attachment */}
                <Text style={styles.fieldLabel}>{t('meters.photoLabel')}</Text>
                <TouchableOpacity style={styles.photoUploadBox} onPress={handleAttachPhoto}>
                  <Camera color={photoUrl ? Colors.primary : Colors.textMuted} size={28} />
                  <Text style={[styles.photoUploadText, Boolean(photoUrl) && styles.photoUploadTextActive]}>
                    {photoUrl ? t('meters.photoAttached') : t('meters.takeOrChoosePhoto')}
                  </Text>
                </TouchableOpacity>

                {/* Error Banner */}
                {submitError && (
                  <View style={styles.submitErrorBox}>
                    <AlertCircle color="#DC2626" size={16} />
                    <Text style={styles.submitErrorText}>{submitError}</Text>
                  </View>
                )}

                {/* Submit Button */}
                <Button
                  title={t('meters.confirmSubmit')}
                  onPress={handleSubmitReading}
                  loading={submitting}
                  size="lg"
                  style={styles.modalSubmitBtn}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 4,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  unitSelectorContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unitPillsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitPillSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  unitPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  unitPillTextSelected: {
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: Colors.danger,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  meterCard: {
    padding: 16,
    borderRadius: 16,
  },
  meterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  meterIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meterInfo: {
    flex: 1,
  },
  meterName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  meterSerial: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  readingSection: {
    marginBottom: 14,
  },
  readingBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  readingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  readingPeriod: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  statusBadge: {},
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeTextPending: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  badgeVerified: {
    backgroundColor: '#ECFDF5',
  },
  badgeTextVerified: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  badgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  badgeTextRejected: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  readingValueText: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: Colors.text,
  },
  readingUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  rejectionBox: {
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectionNote: {
    fontSize: 12,
    color: '#DC2626',
  },
  noReadingsBox: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noReadingsText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  initialValueText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resubmitButton: {
    backgroundColor: '#DC2626',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  periodRow: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  numericInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: Colors.text,
    backgroundColor: '#FFFFFF',
  },
  photoUploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
  },
  photoUploadText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  photoUploadTextActive: {
    color: Colors.primary,
  },
  submitErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  submitErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  modalSubmitBtn: {
    marginTop: 20,
  },
});
