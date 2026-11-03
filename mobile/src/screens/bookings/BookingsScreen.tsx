import { ScreenHero } from '../../components/common/ScreenHero';
import { LoadError } from '../../components/common/LoadError';
import { getBookingRange } from '../../utils/booking-time';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Plus,
  Layers,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../../components/common/LoadingState';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import {
  BookingsApi,
  BookableResource,
  Booking,
  AvailabilitySlot,
  WaitlistEntry,
} from '../../api/bookings';
import { getApiErrorMessage } from '../../api/client';

export const BookingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
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
  const [failedTabs, setFailedTabs] = useState({ SPACES: false, MY: false, WAITLIST: false });

  // Booking modal state
  const [selectedResource, setSelectedResource] = useState<BookableResource | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [busySlots, setBusySlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityFailed, setAvailabilityFailed] = useState(false);
  const availabilityVersion = useRef(0);
  const [timeStart, setTimeStart] = useState('10:00');
  const [timeEnd, setTimeEnd] = useState('12:00');
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [resData, myData, waitlistData] = await Promise.allSettled([
        BookingsApi.getResources(tenantId),
        BookingsApi.getMyBookings(),
        BookingsApi.getMyWaitlist(),
      ]);
      if (resData.status === 'fulfilled') setResources(resData.value);
      if (myData.status === 'fulfilled') setMyBookings(myData.value);
      if (waitlistData.status === 'fulfilled') setMyWaitlist(waitlistData.value);
      setFailedTabs({ SPACES: resData.status === 'rejected', MY: myData.status === 'rejected', WAITLIST: waitlistData.status === 'rejected' });
    } catch (err) {
      setFailedTabs({ SPACES: true, MY: true, WAITLIST: true });
      console.warn('Failed to load bookings data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    fetchData();
  };

  const fetchAvailability = async (resourceId: string, date: Date) => {
    const version = ++availabilityVersion.current;
    setLoadingSlots(true);
    setAvailabilityFailed(false);
    setBusySlots([]);
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
      if (version === availabilityVersion.current) setBusySlots(slots);
    } catch (err) {
      if (version === availabilityVersion.current) setAvailabilityFailed(true);
      console.warn('Failed to load availability:', err);
    } finally {
      if (version === availabilityVersion.current) setLoadingSlots(false);
    }
  };

  const handleOpenBookingModal = (resource: BookableResource) => {
    if (!isVerified) {
      Alert.alert(t('common.error'), t('bookings.unverifiedNotice'));
      return;
    }
    const today = new Date();
    setSelectedResource(resource);
    setSelectedDate(today);
    setTimeStart(resource.operatingHoursStart || '10:00');
    // Calculate default end time: start + 2 hours
    const startHour = parseInt((resource.operatingHoursStart || '10:00').split(':')[0], 10);
    const endHour = Math.min(startHour + 2, 22);
    setTimeEnd(`${String(endHour).padStart(2, '0')}:00`);
    setNote('');
    setBookingError(null);
    fetchAvailability(resource.id, today);
  };

  const closeBookingModal = () => {
    if (submitting) return;
    availabilityVersion.current++;
    setSelectedResource(null);
  };

  const handleDateSelect = (date: Date) => {
    if (submitting) return;
    setSelectedDate(date);
    setBookingError(null);
    if (selectedResource) {
      fetchAvailability(selectedResource.id, date);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedResource) return;

    if (submitting || loadingSlots || availabilityFailed) return;
    const range = getBookingRange(selectedDate, timeStart, timeEnd);
    if (range.error) return;
    const { start: startDate, end: endDate } = range;

    setSubmitting(true);
    setBookingError(null);
    try {
      await BookingsApi.createBooking(selectedResource.id, {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        note: note.trim() || undefined,
      });

      setSelectedResource(null);
      Alert.alert(t('common.success'), t('bookings.bookingSuccess'));
      setActiveTab('MY');
      fetchData();
    } catch (err: any) {
      if (err?.response?.data?.code === 'BOOKINGS.SLOT_CONFLICT') {
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
        setBookingError(getApiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWaitlist = (id: string) => {
    Alert.alert(
      t('bookings.waitlistLeaveBtn'),
      t('bookings.waitlistLeaveConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await BookingsApi.leaveWaitlist(id);
              Alert.alert(t('common.success'), t('bookings.waitlistLeaveSuccess'));
              fetchData();
            } catch (err: any) {
              Alert.alert(t('common.error'), getApiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const handleCancelBooking = (bookingId: string) => {
    Alert.alert(
      t('bookings.cancelBookingBtn'),
      t('bookings.cancelConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await BookingsApi.cancelBooking(bookingId);
              Alert.alert(t('common.success'), t('bookings.cancelSuccess'));
              fetchData();
            } catch (err: any) {
              Alert.alert(t('common.error'), getApiErrorMessage(err));
            }
          },
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
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const timeRange = getBookingRange(selectedDate, timeStart, timeEnd);


  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bookings.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'SPACES' && styles.activeTab]}
          accessibilityRole="tab" aria-selected={activeTab === 'SPACES'} accessibilityState={{ selected: activeTab === 'SPACES' }}
          onPress={() => setActiveTab('SPACES')}
        >
          <Text style={[styles.tabText, activeTab === 'SPACES' && styles.activeTabText]}>
            {t('bookings.tabSpaces')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'MY' && styles.activeTab]}
          accessibilityRole="tab" aria-selected={activeTab === 'MY'} accessibilityState={{ selected: activeTab === 'MY' }}
          onPress={() => setActiveTab('MY')}
        >
          <Text style={[styles.tabText, activeTab === 'MY' && styles.activeTabText]}>
            {t('bookings.tabMy')} ({loading || failedTabs.MY ? '—' : myBookings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'WAITLIST' && styles.activeTab]}
          accessibilityRole="tab" aria-selected={activeTab === 'WAITLIST'} accessibilityState={{ selected: activeTab === 'WAITLIST' }}
          onPress={() => setActiveTab('WAITLIST')}
        >
          <View style={styles.tabContentRow}>
            <Layers
              size={15}
              color={activeTab === 'WAITLIST' ? '#FFFFFF' : Colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'WAITLIST' && styles.activeTabText]}>
              {t('bookings.tabWaitlist')} ({loading || failedTabs.WAITLIST ? '—' : myWaitlist.length})
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {activeTab === 'SPACES' && <ScreenHero title={t('residentUi.spacesTitle')} subtitle={t('residentUi.spacesHint')} />}
        {loading && <LoadingState />}
        {failedTabs[activeTab] && <LoadError onRetry={onRefresh} retrying={refreshing} />}
        {loading || failedTabs[activeTab] && (activeTab === 'SPACES' ? resources : activeTab === 'MY' ? myBookings : myWaitlist).length === 0 ? null : activeTab === 'SPACES' ? (
          resources.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('bookings.emptySpaces')}</Text>
            </Card>
          ) : (
            resources.map((res) => (
              <Card key={res.id} style={styles.resourceCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleContainer}>
                    <Text style={styles.resourceName}>{res.name}</Text>
                    <Badge label={getTypeLabel(res.type)} variant="info" />
                  </View>
                </View>

                {res.description && (
                  <Text style={styles.resourceDescription}>{res.description}</Text>
                )}

                <View style={styles.metaRow}>
                  {res.operatingHoursStart && res.operatingHoursEnd && (
                    <View style={styles.metaItem}>
                      <Clock size={14} color={Colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t('bookings.operatingHours', {
                          start: res.operatingHoursStart,
                          end: res.operatingHoursEnd,
                        })}
                      </Text>
                    </View>
                  )}
                  {res.maxDurationMinutes && (
                    <View style={styles.metaItem}>
                      <Calendar size={14} color={Colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t('bookings.maxDuration', { minutes: res.maxDurationMinutes })}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <Button
                    title={t('bookings.bookBtn')}
                    onPress={() => handleOpenBookingModal(res)}
                    size="md" disabled={!res.isActive}
                  />
                </View>
              </Card>
            ))
          )
        ) : activeTab === 'MY' ? (
          myBookings.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('bookings.emptyMy')}</Text>
            </Card>
          ) : (
            myBookings.map((b) => {
              const isFuture = new Date(b.startTime).getTime() > Date.now();
              const isConfirmed = b.status === 'CONFIRMED';

              return (
                <Card key={b.id} style={styles.bookingCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.resourceName}>{b.resource?.name || '—'}</Text>
                      <Text style={styles.bookingDate}>{formatDateLabel(b.startTime)}</Text>
                    </View>
                    <Badge
                      label={isConfirmed ? t('bookings.statusConfirmed') : t('bookings.statusCancelled')}
                      variant={isConfirmed ? 'success' : 'default'}
                    />
                  </View>

                  <View style={styles.metaItem}>
                    <Clock size={14} color={Colors.textMuted} />
                    <Text style={styles.metaText}>
                      {formatSlotTime(b.startTime)} — {formatSlotTime(b.endTime)}
                    </Text>
                  </View>

                  {b.note && <Text style={styles.bookingNote}>«{b.note}»</Text>}

                  {isConfirmed && isFuture && (
                    <View style={styles.cancelBtnWrapper}>
                      <Button
                        title={t('bookings.cancelBookingBtn')}
                        variant="outline"
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
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('bookings.emptyWaitlist')}</Text>
            </Card>
          ) : (
            myWaitlist.map((entry) => (
              <Card key={entry.id} style={styles.bookingCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.resourceName}>{entry.resource?.name || '—'}</Text>
                    <Text style={styles.bookingDate}>{formatDateLabel(entry.startTime)}</Text>
                  </View>
                  <Badge
                    label={t('bookings.tabWaitlist')}
                    variant="warning"
                  />
                </View>

                <View style={styles.metaItem}>
                  <Clock size={14} color={Colors.textMuted} />
                  <Text style={styles.metaText}>
                    {formatSlotTime(entry.startTime)} — {formatSlotTime(entry.endTime)}
                  </Text>
                </View>

                <View style={styles.cancelBtnWrapper}>
                  <Button
                    title={t('bookings.waitlistLeaveBtn')}
                    variant="outline"
                    size="sm"
                    onPress={() => handleLeaveWaitlist(entry.id)}
                  />
                </View>
              </Card>
            ))
          )
        )}
      </ScrollView>

      {/* Booking Modal */}
      {selectedResource && (
        <Modal
          visible={!!selectedResource}
          animationType="slide"
          transparent
          onRequestClose={closeBookingModal}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: 20 + insets.bottom }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t('bookings.bookingModalTitle', { name: selectedResource.name })}
                </Text>
                <TouchableOpacity onPress={closeBookingModal} disabled={submitting} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <X color={Colors.text} size={22} />
                </TouchableOpacity>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={styles.modalScroll}>
                {/* Date Picker (Horizontal Days) */}
                <Text style={styles.inputLabel}>{t('bookings.selectDate')}</Text>
                <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
                  {days.map((d, index) => {
                    const isSelected =
                      d.getDate() === selectedDate.getDate() &&
                      d.getMonth() === selectedDate.getMonth();
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.dayItem, isSelected && styles.dayItemSelected]}
                        onPress={() => handleDateSelect(d)}
                        disabled={submitting}
                        accessibilityRole="tab" aria-selected={isSelected} accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                      >
                        <Text style={[styles.dayWeekday, isSelected && styles.dayTextSelected]}>
                          {d.toLocaleDateString(i18n.language, { weekday: 'short' })}
                        </Text>
                        <Text style={[styles.dayNumber, isSelected && styles.dayTextSelected]}>
                          {d.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Busy Slots Indicator */}
                <View style={styles.busySlotsContainer}>
                  <Text style={styles.busySlotsHeading}>{t('bookings.busySlotsTitle')}</Text>
                  {loadingSlots ? (
                    <Text style={styles.metaText}>{t('common.loading')}</Text>
                  ) : availabilityFailed ? (
                    <LoadError onRetry={() => fetchAvailability(selectedResource.id, selectedDate)} />
                  ) : busySlots.length === 0 ? (
                    <Text style={styles.noBusyText}>{t('bookings.noBusySlots')}</Text>
                  ) : (
                    <View style={styles.slotsRow}>
                      {busySlots.map((s, idx) => (
                        <View key={idx} style={styles.busySlotChip}>
                          <Text style={styles.busySlotText}>
                            {formatSlotTime(s.startTime)} - {formatSlotTime(s.endTime)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Time inputs */}
                <View style={styles.timeInputsRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.inputLabel}>{t('bookings.timeStart')}</Text>
                    <TextInput
                      style={styles.textInput}
                      value={timeStart}
                      editable={!submitting}
                      maxLength={5}
                      autoCorrect={false}
                      accessibilityLabel={t('bookings.timeStart')}
                      onChangeText={value => { setTimeStart(value); setBookingError(null); }}
                      placeholder="10:00"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.inputLabel}>{t('bookings.timeEnd')}</Text>
                    <TextInput
                      style={styles.textInput}
                      value={timeEnd}
                      editable={!submitting}
                      maxLength={5}
                      autoCorrect={false}
                      accessibilityLabel={t('bookings.timeEnd')}
                      onChangeText={value => { setTimeEnd(value); setBookingError(null); }}
                      placeholder="12:00"
                    />
                  </View>
                </View>

                {timeRange.error && <Text accessibilityLiveRegion="polite" style={{ color: Colors.danger, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{t(`bookings.${timeRange.error}`)}</Text>}
                {/* Note */}
                <Text style={styles.inputLabel}>{t('bookings.noteLabel')}</Text>
                <TextInput
                  style={[styles.textInput, { height: 60 }]}
                  value={note}
                  editable={!submitting}
                  accessibilityLabel={t('bookings.noteLabel')}
                  onChangeText={setNote}
                  placeholder={t('bookings.notePlaceholder')}
                  multiline
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                {bookingError && <Text accessibilityLiveRegion="polite" style={styles.bookingError}>{bookingError}</Text>}
                <Button
                  title={t('bookings.confirmBookingBtn')}
                  onPress={handleConfirmBooking}
                  loading={submitting}
                  disabled={loadingSlots || availabilityFailed || !!timeRange.error}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  headerTitle: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  tabsContainer: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    paddingTop: 12,
  },
  tab: {
    minWidth: 90,
    minHeight: 44,
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: Colors.surface,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabText: {
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  resourceCard: {
    borderRadius: 24,
    marginBottom: 12,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  resourceName: {
    flexShrink: 1,
    maxWidth: '100%',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  resourceDescription: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 10,
    lineHeight: 18,
  },
  metaRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  cardFooter: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  bookingCard: {
    borderRadius: 24,
    marginBottom: 12,
    padding: 16,
  },
  bookingDate: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  bookingNote: {
    fontSize: 12,
    color: Colors.text,
    fontStyle: 'italic',
    marginTop: 6,
  },
  cancelBtnWrapper: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 10,
  },
  modalScroll: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  daysScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  dayItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  dayItemSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayWeekday: {
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  dayTextSelected: {
    color: Colors.surface,
  },
  busySlotsContainer: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  busySlotsHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  noBusyText: {
    fontSize: 12,
    color: Colors.success,
  },
  slotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  busySlotChip: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  busySlotText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
  },
  timeInputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bookingError: { fontSize: 13, lineHeight: 19, color: Colors.danger, paddingBottom: 12 },
  textInput: {
    outlineWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
  },
  modalFooter: {
    paddingTop: 8,
  },
});
