import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Gauge,
  Droplets,
  Flame,
  Zap,
  HelpCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Home,
  AlertCircle,
  TrendingUp,
  History,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import * as Haptics from 'expo-haptics';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  BottomSheet,
  SkeletonList,
  EmptyState,
  ErrorState,
  AnimatedEntrance,
} from '../../components/ui';
import { PhotoAttachments } from '../../components/common/PhotoAttachments';
import { metersApi, MeterData, MeterReading, MeterType } from '../../api/meters';
import { useAuth } from '../../context/AuthContext';

export const MetersScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const verifiedOwnerships = (user?.ownerships || []).filter((o) => o.isVerified);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(0);

  const activeUnit = verifiedOwnerships[selectedUnitIndex]?.unit;
  const activeUnitId = activeUnit?.id;

  const [meters, setMeters] = useState<MeterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded history for each meter
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Submit BottomSheet State
  const [selectedMeter, setSelectedMeter] = useState<MeterData | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputMonth, setInputMonth] = useState(new Date().getMonth() + 1);
  const [inputYear, setInputYear] = useState(new Date().getFullYear());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
      setMeters(data || []);
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
    safeHaptic.selection();
    loadMeters();
  };

  const getSortedReadings = (meter: MeterData): MeterReading[] => {
    if (!meter.readings || meter.readings.length === 0) return [];
    return [...meter.readings].sort((a, b) => {
      if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
      return b.periodMonth - a.periodMonth;
    });
  };

  const getLatestReading = (meter: MeterData): MeterReading | null => {
    const sorted = getSortedReadings(meter);
    return sorted.length > 0 ? sorted[0] : null;
  };

  const getLastVerifiedReading = (meter: MeterData): MeterReading | null => {
    const verified = (meter.readings || []).filter((r) => r.status === 'VERIFIED');
    if (verified.length === 0) return null;
    return verified.sort((a, b) => {
      if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
      return b.periodMonth - a.periodMonth;
    })[0];
  };

  const toggleHistory = (meterId: string) => {
    safeHaptic.selection();
    setExpandedHistory((prev) => ({
      ...prev,
      [meterId]: !prev[meterId],
    }));
  };

  const openSubmitModal = (meter: MeterData) => {
    safeHaptic.selection();
    setUploadingPhoto(false);
    setSelectedMeter(meter);
    const now = new Date();
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    const latest = meter.readings && meter.readings[0];
    if (latest && latest.periodMonth === m && latest.periodYear === y && latest.status !== 'REJECTED') {
      m = m + 1;
      if (m > 12) {
        m = 1;
        y = y + 1;
      }
    }
    setInputMonth(m);
    setInputYear(y);
    setInputValue('');
    setPhotoUrl(null);
    setSubmitError(null);
    setIsSubmitModalOpen(true);
  };

  const closeSubmitModal = () => {
    safeHaptic.selection();
    setIsSubmitModalOpen(false);
    setSelectedMeter(null);
  };

  const handleSubmitReading = async () => {
    if (uploadingPhoto || submitting) return;
    if (!selectedMeter) return;

    if (!inputValue.trim()) {
      setSubmitError(t('meters.validationEmptyError'));
      return;
    }

    const numVal = parseFloat(inputValue.replace(',', '.'));
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

      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      setIsSubmitModalOpen(false);
      setSelectedMeter(null);
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
        return <Droplets color={theme.colors.primary} size={22} />;
      case 'HOT_WATER':
        return <Flame color={theme.colors.danger} size={22} />;
      case 'ELECTRICITY':
        return <Zap color={theme.colors.warning} size={22} />;
      default:
        return <HelpCircle color={theme.colors.info} size={22} />;
    }
  };

  const getMeterTypeBg = (type: MeterType) => {
    switch (type) {
      case 'COLD_WATER':
        return theme.colors.primaryBg;
      case 'HOT_WATER':
        return theme.colors.dangerBg;
      case 'ELECTRICITY':
        return theme.colors.warningBg;
      default:
        return theme.colors.infoBg;
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

  const getMeterUnit = (type: MeterType) => {
    return type === 'ELECTRICITY' ? t('meters.unitElectricity') : t('meters.unitWater');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 4,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic.selection();
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Назад')}
        >
          <ChevronLeft color={theme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('meters.title')}
        </Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Unit Selector if multiple apartments */}
      {verifiedOwnerships.length > 1 && (
        <View
          style={[
            styles.unitSelectorContainer,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.unitPillsRow}
          >
            {verifiedOwnerships.map((o, idx) => {
              const isSelected = selectedUnitIndex === idx;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[
                    styles.unitPill,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceSubtle,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => {
                    safeHaptic.selection();
                    setSelectedUnitIndex(idx);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${t('common.unitShort')} ${o.unit.unitNumber}`}
                >
                  <Home
                    color={isSelected ? theme.colors.onPrimary : theme.colors.textMuted}
                    size={14}
                  />
                  <Text
                    style={[
                      styles.unitPillText,
                      {
                        color: isSelected ? theme.colors.onPrimary : theme.colors.text,
                        fontWeight: isSelected ? '700' : '600',
                      },
                    ]}
                  >
                    {t('common.unitShort')} {o.unit.unitNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={3} />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={loadMeters} />
        ) : meters.length === 0 ? (
          <EmptyState
            title={t('meters.emptyTitle')}
            description={t('meters.emptyDesc')}
            actionTitle={t('common.refresh')}
            onActionPress={loadMeters}
          />
        ) : (
          <AnimatedEntrance>
            {meters.map((meter) => {
              const latest = getLatestReading(meter);
              const sorted = getSortedReadings(meter);
              const isRejected = latest?.status === 'REJECTED';
              const isPending = latest?.status === 'PENDING';
              const isVerified = latest?.status === 'VERIFIED';
              const isHistoryOpen = Boolean(expandedHistory[meter.id]);

              // Calculate consumption delta against previous verified or initial reading
              let consumptionDelta: number | null = null;
              if (latest) {
                const prevReading = sorted.find(
                  (r) => r.id !== latest.id && (r.status === 'VERIFIED' || r.status === 'PENDING'),
                );
                const prevVal = prevReading ? prevReading.value : meter.initialValue;
                if (latest.value >= prevVal) {
                  consumptionDelta = latest.value - prevVal;
                }
              }

              return (
                <Card
                  key={meter.id}
                  style={[
                    styles.meterCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  {/* Meter Card Header */}
                  <View style={styles.meterHeader}>
                    <View
                      style={[
                        styles.meterIconWrap,
                        {
                          backgroundColor: getMeterTypeBg(meter.type),
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      {getMeterTypeIcon(meter.type)}
                    </View>
                    <View style={styles.meterInfo}>
                      <Text style={[styles.meterName, { color: theme.colors.text }]}>
                        {getMeterTypeName(meter.type)}
                      </Text>
                      <Text style={[styles.meterSerial, { color: theme.colors.textMuted }]}>
                        {meter.serialNumber
                          ? t('meters.serialNumber', { number: meter.serialNumber })
                          : t('meters.initialReading', { value: meter.initialValue })}
                      </Text>
                    </View>
                    <Badge
                      label={
                        isVerified
                          ? t('meters.statusVerified')
                          : isPending
                          ? t('meters.statusPending')
                          : isRejected
                          ? t('meters.statusRejected')
                          : t('meters.noReadingsYet')
                      }
                      variant={
                        isVerified
                          ? 'success'
                          : isPending
                          ? 'warning'
                          : isRejected
                          ? 'danger'
                          : 'neutral'
                      }
                      size="sm"
                    />
                  </View>

                  {/* Reading Display Box */}
                  <View
                    style={[
                      styles.readingBox,
                      {
                        backgroundColor: theme.colors.surfaceSubtle,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    {latest ? (
                      <>
                        <View style={styles.readingTopRow}>
                          <Text style={[styles.readingPeriodText, { color: theme.colors.textMuted }]}>
                            {t('meters.periodFormat', {
                              month: String(latest.periodMonth).padStart(2, '0'),
                              year: latest.periodYear,
                            })}
                          </Text>
                          {consumptionDelta !== null && (
                            <View style={styles.consumptionBadge}>
                              <TrendingUp color={theme.colors.primary} size={13} />
                              <Text
                                style={[styles.consumptionText, { color: theme.colors.primary }]}
                              >
                                +{consumptionDelta.toLocaleString()} {getMeterUnit(meter.type)}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.readingValueRow}>
                          <Text style={[styles.readingValueNum, { color: theme.colors.text }]}>
                            {latest.value.toLocaleString()}
                          </Text>
                          <Text style={[styles.readingUnitText, { color: theme.colors.textMuted }]}>
                            {getMeterUnit(meter.type)}
                          </Text>
                        </View>

                        {isRejected && latest.reviewNote && (
                          <View
                            style={[
                              styles.rejectionBox,
                              {
                                backgroundColor: theme.colors.dangerBg,
                                borderColor: theme.colors.dangerBorder,
                              },
                            ]}
                          >
                            <AlertCircle color={theme.colors.danger} size={15} />
                            <Text style={[styles.rejectionText, { color: theme.colors.danger }]}>
                              {t('meters.rejectionReason', { note: latest.reviewNote })}
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.noReadingsWrap}>
                        <Text style={[styles.noReadingsTitle, { color: theme.colors.text }]}>
                          {t('meters.noReadingsYet')}
                        </Text>
                        <Text style={[styles.noReadingsSub, { color: theme.colors.textMuted }]}>
                          {t('meters.initialReading', { value: meter.initialValue })}{' '}
                          {getMeterUnit(meter.type)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Past readings history toggle */}
                  {sorted.length > 1 && (
                    <View style={styles.historySection}>
                      <TouchableOpacity
                        style={styles.historyToggleBtn}
                        onPress={() => toggleHistory(meter.id)}
                        accessibilityRole="button"
                        accessibilityLabel={isHistoryOpen ? t('meters.historyHide') : t('meters.historyShow')}
                      >
                        <View style={styles.historyToggleLeft}>
                          <History color={theme.colors.textMuted} size={14} />
                          <Text style={[styles.historyToggleText, { color: theme.colors.textMuted }]}>
                            {isHistoryOpen ? t('meters.historyHide') : t('meters.historyShow')} ({sorted.length})
                          </Text>
                        </View>
                        {isHistoryOpen ? (
                          <ChevronUp color={theme.colors.textMuted} size={16} />
                        ) : (
                          <ChevronDown color={theme.colors.textMuted} size={16} />
                        )}
                      </TouchableOpacity>

                      {isHistoryOpen && (
                        <View
                          style={[
                            styles.historyList,
                            {
                              borderTopColor: theme.colors.border,
                            },
                          ]}
                        >
                          {sorted.map((r, rIdx) => (
                            <View
                              key={r.id || `r-${rIdx}`}
                              style={[
                                styles.historyRow,
                                rIdx < sorted.length - 1 && {
                                  borderBottomWidth: 1,
                                  borderBottomColor: theme.colors.border,
                                },
                              ]}
                            >
                              <Text style={[styles.historyPeriod, { color: theme.colors.textMuted }]}>
                                {String(r.periodMonth).padStart(2, '0')}.{r.periodYear}
                              </Text>
                              <Text style={[styles.historyVal, { color: theme.colors.text }]}>
                                {r.value.toLocaleString()} {getMeterUnit(meter.type)}
                              </Text>
                              <Badge
                                label={
                                  r.status === 'VERIFIED'
                                    ? t('meters.statusVerified')
                                    : r.status === 'PENDING'
                                    ? t('meters.statusPending')
                                    : t('meters.statusRejected')
                                }
                                variant={
                                  r.status === 'VERIFIED'
                                    ? 'success'
                                    : r.status === 'PENDING'
                                    ? 'warning'
                                    : 'danger'
                                }
                                size="sm"
                              />
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Submit Button */}
                  <Button
                    title={isRejected ? t('meters.resubmitBtn') : t('meters.submitBtn')}
                    variant={isRejected ? 'destructive' : 'primary'}
                    onPress={() => openSubmitModal(meter)}
                    size="md"
                    style={styles.cardSubmitBtn}
                  />
                </Card>
              );
            })}
          </AnimatedEntrance>
        )}
      </ScrollView>

      {/* SUBMISSION BOTTOMSHEET */}
      {selectedMeter && (
        <BottomSheet
          visible={isSubmitModalOpen}
          onClose={closeSubmitModal}
          title={t('meters.modalTitle')}
        >
          <ScrollView
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Meter and Period Badge */}
            <View style={styles.sheetHeaderInfo}>
              <View
                style={[
                  styles.sheetIconWrap,
                  { backgroundColor: getMeterTypeBg(selectedMeter.type) },
                ]}
              >
                {getMeterTypeIcon(selectedMeter.type)}
              </View>
              <View style={styles.sheetHeaderText}>
                <Text style={[styles.sheetMeterName, { color: theme.colors.text }]}>
                  {getMeterTypeName(selectedMeter.type)}
                </Text>
                <Text style={[styles.sheetPeriodText, { color: theme.colors.textMuted }]}>
                  {t('meters.periodLabel')}:{' '}
                  {t('meters.periodFormat', {
                    month: String(inputMonth).padStart(2, '0'),
                    year: inputYear,
                  })}
                </Text>
              </View>
            </View>

            {/* Previous verified reference */}
            {(() => {
              const lastVerified = getLastVerifiedReading(selectedMeter);
              const minVal = lastVerified ? lastVerified.value : selectedMeter.initialValue;
              return (
                <View
                  style={[
                    styles.referenceBox,
                    {
                      backgroundColor: theme.colors.surfaceSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.referenceLabel, { color: theme.colors.textMuted }]}>
                    {t('meters.previousVerified', { value: minVal })} {getMeterUnit(selectedMeter.type)}
                  </Text>
                </View>
              );
            })()}

            {/* Large Digital Input */}
            <Text style={[styles.inputLabel, { color: theme.colors.text }]}>
              {t('meters.inputLabel')}
            </Text>
            <View
              style={[
                styles.digitalInputWrap,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: submitError ? theme.colors.danger : theme.colors.border,
                },
              ]}
            >
              <TextInput
                style={[
                  styles.digitalInput,
                  {
                    color: theme.colors.text,
                  },
                  Platform.OS === 'web'
                    ? ({ outlineStyle: 'none', outlineWidth: 0 } as any)
                    : null,
                ]}
                keyboardType="decimal-pad"
                placeholder={t('meters.inputPlaceholder')}
                placeholderTextColor={theme.colors.textLight}
                value={inputValue}
                onChangeText={(val) => {
                  setInputValue(val);
                  setSubmitError(null);
                }}
                accessibilityLabel={t('meters.inputLabel')}
              />
              <Text style={[styles.digitalUnit, { color: theme.colors.textMuted }]}>
                {getMeterUnit(selectedMeter.type)}
              </Text>
            </View>

            {/* Photo Attachment Section */}
            <Text style={[styles.inputLabel, { color: theme.colors.text, marginTop: 14 }]}>
              {t('meters.photoLabel')}
            </Text>
            <PhotoAttachments
              key={selectedMeter.id}
              value={photoUrl ? [photoUrl] : []}
              onChange={(urls) => {
                setPhotoUrl(urls[0] || null);
                setSubmitError(null);
              }}
              onBusyChange={setUploadingPhoto}
              disabled={submitting}
              maxPhotos={1}
            />

            {/* Error Message */}
            {submitError && (
              <View
                style={[
                  styles.submitErrorBox,
                  {
                    backgroundColor: theme.colors.dangerBg,
                    borderColor: theme.colors.dangerBorder,
                  },
                ]}
              >
                <AlertCircle color={theme.colors.danger} size={16} />
                <Text style={[styles.submitErrorText, { color: theme.colors.danger }]}>
                  {submitError}
                </Text>
              </View>
            )}

            {/* Confirm Submit Button */}
            <Button
              title={t('meters.confirmSubmit')}
              onPress={handleSubmitReading}
              loading={submitting}
              disabled={uploadingPhoto}
              size="lg"
              style={styles.modalSubmitBtn}
            />
          </ScrollView>
        </BottomSheet>
      )}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
    marginLeft: -4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerRightPlaceholder: {
    width: 44,
  },
  unitSelectorContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  unitPillsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
  },
  unitPillText: {
    fontSize: 13,
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  skeletonWrap: {
    paddingTop: 12,
  },
  meterCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  meterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  meterIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  meterInfo: {
    flex: 1,
    marginRight: 8,
  },
  meterName: {
    fontSize: 16,
    fontWeight: '700',
  },
  meterSerial: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  readingBox: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  readingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  readingPeriodText: {
    fontSize: 12,
    fontWeight: '600',
  },
  consumptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  consumptionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  readingValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  readingValueNum: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
  readingUnitText: {
    fontSize: 14,
    fontWeight: '600',
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  rejectionText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  noReadingsWrap: {
    paddingVertical: 8,
  },
  noReadingsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  noReadingsSub: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  historySection: {
    marginBottom: 12,
  },
  historyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    minHeight: 44,
  },
  historyToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyList: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  historyPeriod: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  historyVal: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  cardSubmitBtn: {
    marginTop: 4,
  },
  sheetScrollContent: {
    paddingBottom: 20,
  },
  sheetHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetMeterName: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetPeriodText: {
    fontSize: 12,
    marginTop: 2,
  },
  referenceBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  referenceLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  digitalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  digitalInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'monospace',
    paddingVertical: 10,
  },
  digitalUnit: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  submitErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  submitErrorText: {
    flex: 1,
    fontSize: 13,
  },
  modalSubmitBtn: {
    marginTop: 20,
  },
});
