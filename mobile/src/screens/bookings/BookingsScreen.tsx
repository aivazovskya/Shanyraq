import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Calendar,
  Clock,
  Layers,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import * as Haptics from 'expo-haptics';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  SegmentedControl,
  BottomSheet,
  Input,
  SkeletonList,
  EmptyState,
  ErrorState,
  AnimatedEntrance,
} from '../../components/ui';
import {
  BookingsApi,
  BookableResource,
  Booking,
  AvailabilitySlot,
  WaitlistEntry,
} from '../../api/bookings';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export const BookingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;
  const verifiedOwnerships = (user?.ownerships || []).filter((o) => o.isVerified);
  const isVerified = verifiedOwnerships.length > 0;

  const [activeTab, setActiveTab] = useState<'SPACES' | 'MY' | 'WAITLIST'>('SPACES');
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myWaitlist, setMyWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Booking modal state
  const [selectedResource, setSelectedResource] = useState<BookableResource | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [busySlots, setBusySlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [timeStart, setTimeStart] = useState('10:00');
  const [timeEnd, setTimeEnd] = useState('12:00');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [resData, myData, waitlistData] = await Promise.all([
        BookingsApi.getResources(tenantId),
        BookingsApi.getMyBookings(),
        BookingsApi.getMyWaitlist(),
      ]);
      setResources(resData || []);
      setMyBookings(myData || []);
      setMyWaitlist(waitlistData || []);
    } catch (err: any) {
      console.warn('Failed to load bookings data:', err);
      setError(err?.response?.data?.message || err.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    safeHaptic.selection();
    fetchData();
  };

  const fetchAvailability = async (resourceId: string, date: Date) => {
    setLoadingSlots(true);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const slots = await BookingsApi.getAvailability(
        resourceId,
        startOfDay.toISOString(),
        endOfDay.toISOString(),
      );
      setBusySlots(slots || []);
    } catch (err) {
      console.warn('Failed to load availability:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleOpenBookingModal = (resource: BookableResource) => {
    if (!isVerified) {
      Alert.alert(t('common.error'), t('bookings.unverifiedNotice'));
      return;
    }
    safeHaptic.selection();
    const today = new Date();
    setSelectedResource(resource);
    setSelectedDate(today);

    const startStr = resource.operatingHoursStart || '10:00';
    setTimeStart(startStr);
    const startHour = parseInt(startStr.split(':')[0], 10) || 10;
    const endHour = Math.min(startHour + 2, 22);
    setTimeEnd(`${String(endHour).padStart(2, '0')}:00`);
    setNote('');
    fetchAvailability(resource.id, today);
  };

  const handleDateSelect = (date: Date) => {
    safeHaptic.selection();
    setSelectedDate(date);
    if (selectedResource) {
      fetchAvailability(selectedResource.id, date);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedResource) return;

    const [startH, startM] = timeStart.split(':').map(Number);
    const [endH, endM] = timeEnd.split(':').map(Number);

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
      Alert.alert(t('common.error'), t('bookings.timeStart'));
      return;
    }

    const startDate = new Date(selectedDate);
    startDate.setHours(startH, startM, 0, 0);

    const endDate = new Date(selectedDate);
    endDate.setHours(endH, endM, 0, 0);

    if (startDate.getTime() <= Date.now()) {
      Alert.alert(t('common.error'), t('bookings.timeMustBeFuture'));
      return;
    }

    if (startDate.getTime() >= endDate.getTime()) {
      Alert.alert(t('common.error'), t('bookings.timeEnd'));
      return;
    }

    setSubmitting(true);
    try {
      await BookingsApi.createBooking(selectedResource.id, {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        note: note.trim() || undefined,
      });

      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      setSelectedResource(null);
      Alert.alert(t('common.success'), t('bookings.bookingSuccess'));
      setActiveTab('MY');
      fetchData();
    } catch (err: any) {
      if (err?.response?.data?.code === 'BOOKINGS.SLOT_CONFLICT') {
        safeHaptic.notification(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          t('bookings.slotFullTitle'),
          t('bookings.waitlistJoinPrompt'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('bookings.waitlistJoinBtn'),
              onPress: async () => {
                try {
                  setSubmitting(true);
                  await BookingsApi.joinWaitlist(selectedResource.id, {
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                  });
                  safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
                  setSelectedResource(null);
                  Alert.alert(t('common.success'), t('bookings.waitlistJoinSuccess'));
                  setActiveTab('WAITLIST');
                  fetchData();
                } catch (joinErr: any) {
                  Alert.alert(t('common.error'), getApiErrorMessage(joinErr));
                } finally {
                  setSubmitting(false);
                }
              },
            },
          ],
        );
      } else {
        safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t('common.error'), getApiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWaitlist = (id: string) => {
    safeHaptic.selection();
    const doLeave = async () => {
      try {
        await BookingsApi.leaveWaitlist(id);
        safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('common.success'), t('bookings.waitlistLeaveSuccess'));
        fetchData();
      } catch (err: any) {
        Alert.alert(t('common.error'), getApiErrorMessage(err));
      }
    };

    if (Platform.OS === 'web') {
      doLeave();
      return;
    }

    Alert.alert(
      t('bookings.waitlistLeaveBtn'),
      t('bookings.waitlistLeaveConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm', 'Подтвердить'),
          style: 'destructive',
          onPress: doLeave,
        },
      ],
    );
  };

  const handleCancelBooking = (bookingId: string) => {
    safeHaptic.selection();
    const doCancel = async () => {
      try {
        await BookingsApi.cancelBooking(bookingId);
        safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('common.success'), t('bookings.cancelSuccess'));
        fetchData();
      } catch (err: any) {
        Alert.alert(t('common.error'), getApiErrorMessage(err));
      }
    };

    if (Platform.OS === 'web') {
      doCancel();
      return;
    }

    Alert.alert(
      t('bookings.cancelBookingBtn'),
      `${t('bookings.cancelSuccess')}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm', 'Подтвердить'),
          style: 'destructive',
          onPress: doCancel,
        },
      ],
    );
  };

  const getTypeLabel = (typeStr: string) => {
    switch (typeStr) {
      case 'BBQ_AREA':
        return t('bookings.typeBbQ');
      case 'COWORKING':
        return t('bookings.typeCoworking');
      case 'GUEST_PARKING':
        return t('bookings.typeParking');
      case 'KIDS_ROOM':
        return t('bookings.typeKids');
      default:
        return t('bookings.typeOther');
    }
  };

  const formatSlotTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
    });
  };

  // Next 7 days generator
  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

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
          {t('bookings.title')}
        </Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrapper}>
        <SegmentedControl
          options={[
            { value: 'SPACES', label: t('bookings.tabSpaces') },
            { value: 'MY', label: `${t('bookings.tabMy')} (${myBookings.length})` },
            {
              value: 'WAITLIST',
              label: `${t('bookings.tabWaitlist')} (${myWaitlist.length})`,
              icon: <Layers size={14} color={theme.colors.textMuted} />,
            },
          ]}
          value={activeTab}
          onChange={(v) => {
            safeHaptic.selection();
            setActiveTab(v as 'SPACES' | 'MY' | 'WAITLIST');
          }}
        />
      </View>

      {/* Unverified resident warning banner */}
      {!isVerified && (
        <View
          style={[
            styles.unverifiedBanner,
            {
              backgroundColor: theme.colors.warningBg,
              borderColor: theme.colors.warningBorder,
            },
          ]}
        >
          <AlertCircle color={theme.colors.warning} size={18} />
          <Text style={[styles.unverifiedText, { color: theme.colors.text }]}>
            {t('bookings.unverifiedNotice')}
          </Text>
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
          <ErrorState message={error} onRetry={fetchData} />
        ) : (
          <AnimatedEntrance>
            {activeTab === 'SPACES' ? (
              resources.length === 0 ? (
                <EmptyState
                  title={t('bookings.emptySpaces')}
                  description={t('bookings.unverifiedNotice')}
                />
              ) : (
                resources.map((res) => (
                  <Card
                    key={res.id}
                    style={[
                      styles.resourceCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={[styles.resourceName, { color: theme.colors.text }]}>
                          {res.name}
                        </Text>
                        <Badge label={getTypeLabel(res.type)} variant="info" size="sm" />
                      </View>
                    </View>

                    {Boolean(res.description) && (
                      <Text style={[styles.resourceDescription, { color: theme.colors.textMuted }]}>
                        {res.description}
                      </Text>
                    )}

                    <View style={styles.metaRow}>
                      {res.operatingHoursStart && res.operatingHoursEnd && (
                        <View style={styles.metaItem}>
                          <Clock size={14} color={theme.colors.textMuted} />
                          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
                            {t('bookings.operatingHours', {
                              start: res.operatingHoursStart,
                              end: res.operatingHoursEnd,
                            })}
                          </Text>
                        </View>
                      )}
                      {res.maxDurationMinutes && (
                        <View style={styles.metaItem}>
                          <Calendar size={14} color={theme.colors.textMuted} />
                          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
                            {t('bookings.maxDuration', { minutes: res.maxDurationMinutes })}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
                      <Button
                        title={t('bookings.bookBtn')}
                        onPress={() => handleOpenBookingModal(res)}
                        variant="primary"
                        size="sm"
                      />
                    </View>
                  </Card>
                ))
              )
            ) : activeTab === 'MY' ? (
              myBookings.length === 0 ? (
                <EmptyState
                  title={t('bookings.emptyMy')}
                  description={t('bookings.tabSpaces')}
                  actionTitle={t('bookings.tabSpaces')}
                  onActionPress={() => setActiveTab('SPACES')}
                />
              ) : (
                myBookings.map((b) => {
                  const isFuture = new Date(b.startTime).getTime() > Date.now();
                  const isConfirmed = b.status === 'CONFIRMED';

                  return (
                    <Card
                      key={b.id}
                      style={[
                        styles.bookingCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTitleWrap}>
                          <Text style={[styles.resourceName, { color: theme.colors.text }]}>
                            {b.resource?.name || '—'}
                          </Text>
                          <Text style={[styles.bookingDate, { color: theme.colors.textMuted }]}>
                            {formatDateLabel(b.startTime)}
                          </Text>
                        </View>
                        <Badge
                          label={
                            isConfirmed
                              ? t('bookings.statusConfirmed')
                              : t('bookings.statusCancelled')
                          }
                          variant={isConfirmed ? 'success' : 'neutral'}
                          size="sm"
                        />
                      </View>

                      <View style={styles.metaItem}>
                        <Clock size={14} color={theme.colors.textMuted} />
                        <Text style={[styles.metaText, { color: theme.colors.text }]}>
                          {formatSlotTime(b.startTime)} — {formatSlotTime(b.endTime)}
                        </Text>
                      </View>

                      {Boolean(b.note) && (
                        <Text style={[styles.bookingNote, { color: theme.colors.textMuted }]}>
                          «{b.note}»
                        </Text>
                      )}

                      {isConfirmed && isFuture && (
                        <View style={[styles.cancelBtnWrapper, { borderTopColor: theme.colors.border }]}>
                          <Button
                            title={t('bookings.cancelBookingBtn')}
                            variant="secondary"
                            size="sm"
                            onPress={() => handleCancelBooking(b.id)}
                          />
                        </View>
                      )}
                    </Card>
                  );
                })
              )
            ) : (
              myWaitlist.length === 0 ? (
                <EmptyState
                  title={t('bookings.emptyWaitlist')}
                  description={t('bookings.tabSpaces')}
                />
              ) : (
                myWaitlist.map((entry) => (
                  <Card
                    key={entry.id}
                    style={[
                      styles.bookingCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={[styles.resourceName, { color: theme.colors.text }]}>
                          {entry.resource?.name || '—'}
                        </Text>
                        <Text style={[styles.bookingDate, { color: theme.colors.textMuted }]}>
                          {formatDateLabel(entry.startTime)}
                        </Text>
                      </View>
                      <Badge
                        label={t('bookings.tabWaitlist')}
                        variant="warning"
                        size="sm"
                      />
                    </View>

                    <View style={styles.metaItem}>
                      <Clock size={14} color={theme.colors.textMuted} />
                      <Text style={[styles.metaText, { color: theme.colors.text }]}>
                        {formatSlotTime(entry.startTime)} — {formatSlotTime(entry.endTime)}
                      </Text>
                    </View>

                    <View style={[styles.cancelBtnWrapper, { borderTopColor: theme.colors.border }]}>
                      <Button
                        title={t('bookings.waitlistLeaveBtn')}
                        variant="secondary"
                        size="sm"
                        onPress={() => handleLeaveWaitlist(entry.id)}
                      />
                    </View>
                  </Card>
                ))
              )
            )}
          </AnimatedEntrance>
        )}
      </ScrollView>

      {/* Booking BottomSheet */}
      {selectedResource && (
        <BottomSheet
          visible={Boolean(selectedResource)}
          onClose={() => setSelectedResource(null)}
          title={t('bookings.bookingModalTitle', { name: selectedResource.name })}
        >
          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date Picker (Horizontal 7 Days) */}
            <Text style={[styles.sheetSectionLabel, { color: theme.colors.text }]}>
              {t('bookings.selectDate')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.daysScroll}
            >
              {days.map((d, index) => {
                const isSelected =
                  d.getDate() === selectedDate.getDate() &&
                  d.getMonth() === selectedDate.getMonth();
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dayItem,
                      {
                        backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                    onPress={() => handleDateSelect(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
                  >
                    <Text
                      style={[
                        styles.dayWeekday,
                        { color: isSelected ? theme.colors.onPrimary : theme.colors.textMuted },
                      ]}
                    >
                      {d.toLocaleDateString(i18n.language, { weekday: 'short' })}
                    </Text>
                    <Text
                      style={[
                        styles.dayNumber,
                        { color: isSelected ? theme.colors.onPrimary : theme.colors.text },
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Busy Slots Indicator Box */}
            <View
              style={[
                styles.busySlotsContainer,
                {
                  backgroundColor: theme.colors.surfaceSubtle,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.busySlotsHeading, { color: theme.colors.textMuted }]}>
                {t('bookings.busySlotsTitle')}
              </Text>
              {loadingSlots ? (
                <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
                  {t('common.loading')}
                </Text>
              ) : busySlots.length === 0 ? (
                <View style={styles.availableRow}>
                  <CheckCircle2 color={theme.colors.success} size={15} />
                  <Text style={[styles.noBusyText, { color: theme.colors.success }]}>
                    {t('bookings.availableToday')}
                  </Text>
                </View>
              ) : (
                <View style={styles.slotsRow}>
                  {busySlots.map((s, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.busySlotChip,
                        {
                          backgroundColor: theme.colors.dangerBg,
                          borderColor: theme.colors.dangerBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.busySlotText, { color: theme.colors.danger }]}>
                        {formatSlotTime(s.startTime)} - {formatSlotTime(s.endTime)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Time inputs */}
            <View style={styles.timeInputsRow}>
              <View style={styles.timeInputWrap}>
                <Input
                  label={t('bookings.timeStart')}
                  value={timeStart}
                  onChangeText={setTimeStart}
                  placeholder="10:00"
                />
              </View>
              <View style={styles.timeInputWrap}>
                <Input
                  label={t('bookings.timeEnd')}
                  value={timeEnd}
                  onChangeText={setTimeEnd}
                  placeholder="12:00"
                />
              </View>
            </View>

            {/* Note input */}
            <Input
              label={t('bookings.noteLabel')}
              value={note}
              onChangeText={setNote}
              placeholder={t('bookings.notePlaceholder')}
            />

            {/* Confirm booking button */}
            <Button
              title={t('bookings.confirmBookingBtn')}
              onPress={handleConfirmBooking}
              loading={submitting}
              size="lg"
              style={styles.sheetSubmitBtn}
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
  tabsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  unverifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  unverifiedText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  skeletonWrap: {
    paddingTop: 12,
  },
  resourceCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  resourceName: {
    fontSize: 16,
    fontWeight: '700',
  },
  resourceDescription: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
  },
  cardFooter: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  bookingCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  bookingDate: {
    fontSize: 13,
    marginTop: 2,
  },
  bookingNote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
  },
  cancelBtnWrapper: {
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  sheetScroll: {
    paddingBottom: 24,
  },
  sheetSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  daysScroll: {
    gap: 8,
    paddingBottom: 8,
  },
  dayItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 54,
    minHeight: 56,
  },
  dayWeekday: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  busySlotsContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginVertical: 12,
  },
  busySlotsHeading: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noBusyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  slotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  busySlotChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  busySlotText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  timeInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInputWrap: {
    flex: 1,
  },
  sheetSubmitBtn: {
    marginTop: 8,
  },
});
