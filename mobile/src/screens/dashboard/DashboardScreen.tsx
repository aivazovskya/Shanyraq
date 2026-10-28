import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { VotingsApi, MeetingItem } from '../../api/votings';
import { ServiceRequestsApi, ServiceRequestItem } from '../../api/service-requests';
import { AnnouncementsApi, AnnouncementItem } from '../../api/announcements';
import { NotificationsApi } from '../../api/notifications';
import { sosApi } from '../../api/sos';
import { SosHoldButton } from '../../components/sos/SosHoldButton';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CountUp } from '../../components/ui/CountUp';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { Skeleton, SkeletonCard } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import {
  Bell,
  ShieldCheck,
  UserPlus,
  Wrench,
  ChevronRight,
  AlertTriangle,
  CreditCard,
  Gauge,
  Calendar,
  ShoppingBag,
  ArrowUpRight,
  FileText,
  Clock,
} from 'lucide-react-native';

export const DashboardScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const primaryOwnership = user?.ownerships?.[0];
  const tenantId = user?.tenantId || (primaryOwnership as any)?.unit?.building?.tenantId;

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [votings, setVotings] = useState<MeetingItem[]>([]);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const fetchUnreadNotifs = useCallback(async () => {
    try {
      const res = await NotificationsApi.getUnreadCount();
      setUnreadNotifsCount(res.unreadCount ?? res.count ?? 0);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUnreadNotifs();
    }, [fetchUnreadNotifs])
  );

  const getRequestStatusProps = (status: string): { label: string; variant: import('../../components/ui/Badge').BadgeVariant } => {
    switch (status) {
      case 'PENDING':
        return { label: t('requests.statusPending'), variant: 'warning' };
      case 'ASSIGNED':
        return { label: t('requests.statusAssigned'), variant: 'info' };
      case 'IN_PROGRESS':
        return { label: t('requests.statusInProgress'), variant: 'primary' };
      case 'RESOLVED':
        return { label: t('requests.statusResolved'), variant: 'success' };
      case 'REJECTED':
        return { label: t('requests.statusRejected'), variant: 'danger' };
      case 'CLOSED':
        return { label: t('requests.statusClosed'), variant: 'neutral' };
      default:
        return { label: status, variant: 'neutral' };
    }
  };

  const fetchDashboardData = useCallback(async () => {
    if (!tenantId) {
      setInitialLoading(false);
      return;
    }

    try {
      setFetchError(false);
      const [votingsRes, requestsRes, announcementsRes] = await Promise.allSettled([
        VotingsApi.getMeetings(tenantId),
        ServiceRequestsApi.getRequests(),
        AnnouncementsApi.getAnnouncements(tenantId),
      ]);

      if (votingsRes.status === 'fulfilled') setVotings(votingsRes.value);
      if (requestsRes.status === 'fulfilled') setRequests(requestsRes.value);
      if (announcementsRes.status === 'fulfilled') setAnnouncements(announcementsRes.value);
    } catch (e) {
      console.warn('Dashboard fetch error:', e);
      setFetchError(true);
    } finally {
      setInitialLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboardData(), fetchUnreadNotifs()]);
    setRefreshing(false);
  };

  const activeVotings = votings.filter((m) => m.status === 'ACTIVE');
  const openRequests = requests.filter((r) => r.status !== 'CLOSED' && r.status !== 'REJECTED');
  const urgentAnnouncement = announcements.find((a) => a.isUrgent);

  const [sosTriggering, setSosTriggering] = useState(false);

  const handleTriggerSos = async () => {
    setSosTriggering(true);
    let coords: { latitude?: number; longitude?: number } = {};

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const locPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 3000),
        );
        const locResult = await Promise.race([locPromise, timeoutPromise]);
        if (locResult && 'coords' in locResult) {
          coords = {
            latitude: locResult.coords.latitude,
            longitude: locResult.coords.longitude,
          };
        }
      }
    } catch (e) {
      console.warn('GPS capture skipped:', e);
    }

    try {
      await sosApi.triggerSos(coords);
      Alert.alert(
        t('sos.alertSuccessTitle'),
        t('sos.alertSuccessMessage'),
        [
          { text: t('common.ok'), style: 'default' },
          {
            text: t('sos.viewHistoryButton'),
            onPress: () => navigation.navigate('SosHistory'),
          },
        ],
      );
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        err?.response?.data?.message || err?.message || t('sos.triggerError'),
      );
    } finally {
      setSosTriggering(false);
    }
  };

  // Localized date string
  const todayFormatted = (() => {
    try {
      const d = new Date();
      const str = d.toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return '';
    }
  })();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: Math.max(insets.bottom, 24) + 90, // safe clearance over floating tab bar
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Top Header Profile Summary */}
        <AnimatedEntrance index={0} style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.dateText, { color: theme.colors.textMuted }]}>
              {todayFormatted}
            </Text>
            <Text style={[styles.greeting, { color: theme.colors.text }]}>
              {t('dashboard.welcome', { name: user?.firstName || t('dashboard.defaultResident') })}
            </Text>
            <Text style={[styles.apartmentInfo, { color: theme.colors.textMuted }]}>
              {user?.tenant?.name || t('dashboard.defaultComplex')} • {t('dashboard.unitFormat', { unit: primaryOwnership?.unit?.unitNumber || '—' })}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              style={[
                styles.notifBtn,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.title')}
            >
              <Bell size={22} color={theme.colors.text} />
              {unreadNotifsCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <Badge
              label={primaryOwnership?.isVerified ? t('dashboard.verified') : t('dashboard.onVerification')}
              variant={primaryOwnership?.isVerified ? 'success' : 'warning'}
              size="sm"
            />
          </View>
        </AnimatedEntrance>

        {/* Hero Card: Personal Account Balance with LinearGradient & CountUp */}
        <AnimatedEntrance index={1}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => navigation.navigate('FinanceAccount')}
            accessibilityRole="button"
            accessibilityLabel={`${t('dashboard.balanceCardTitle')}: 12 450 ₸`}
          >
            <LinearGradient
              colors={
                theme.isDark
                  ? ['#047857', '#065F46', '#022C22']
                  : ['#059669', '#047857', '#065F46']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, theme.shadows.lg]}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroBadgeRow}>
                  <CreditCard size={18} color="#D1FAE5" />
                  <Text style={styles.heroCardSubtitle}>{t('dashboard.balanceCardTitle')}</Text>
                </View>
                <View style={styles.heroActionArrow}>
                  <ArrowUpRight size={18} color="#FFFFFF" />
                </View>
              </View>

              <View style={styles.heroBalanceWrap}>
                <CountUp
                  value={12450}
                  currency="₸"
                  style={styles.heroBalanceText}
                />
              </View>

              <View style={styles.heroFooter}>
                <TouchableOpacity
                  style={styles.heroChip}
                  onPress={() => navigation.navigate('FinanceAccount')}
                >
                  <Text style={styles.heroChipText}>{t('dashboard.payAction')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroChipSecondary}
                  onPress={() => navigation.navigate('TransparencyReport')}
                >
                  <FileText size={14} color="#D1FAE5" />
                  <Text style={styles.heroChipSecondaryText}>{t('dashboard.billsAction')}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* Urgent Announcement Alert if any */}
        {urgentAnnouncement && (
          <AnimatedEntrance index={2}>
            <Card
              style={styles.urgentCard}
              onPress={() => navigation.navigate('Announcements')}
            >
              <View style={styles.urgentRow}>
                <View style={styles.urgentIconCircle}>
                  <AlertTriangle color="#DC2626" size={22} />
                </View>
                <View style={styles.urgentTextContainer}>
                  <Text style={styles.urgentTitle}>{urgentAnnouncement.title}</Text>
                  <Text style={styles.urgentContent} numberOfLines={2}>
                    {urgentAnnouncement.content}
                  </Text>
                </View>
                <ChevronRight size={18} color="#DC2626" />
              </View>
            </Card>
          </AnimatedEntrance>
        )}

        {/* Emergency SOS Button */}
        <AnimatedEntrance index={3} style={styles.sosSection}>
          <SosHoldButton loading={sosTriggering} onConfirmed={handleTriggerSos} />
          <TouchableOpacity
            style={styles.sosHistoryRow}
            onPress={() => navigation.navigate('SosHistory')}
            accessibilityRole="button"
            accessibilityLabel={t('sos.viewHistoryLink')}
          >
            <Text style={[styles.sosHistoryText, { color: theme.colors.textMuted }]}>
              {t('sos.viewHistoryLink')}
            </Text>
            <ChevronRight size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* Quick Actions Bento Grid */}
        <AnimatedEntrance index={4}>
          <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
            {t('dashboard.quickActions')}
          </Text>

          <View style={styles.bentoGrid}>
            {/* 1. Barrier */}
            <Card
              style={styles.bentoCard}
              onPress={() => navigation.navigate('Main', { screen: 'AccessTab' })}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryBg }]}>
                <ShieldCheck color={theme.colors.primary} size={24} />
              </View>
              <Text style={[styles.bentoTitle, { color: theme.colors.text }]}>
                {t('dashboard.barrier')}
              </Text>
              <Text style={[styles.bentoSub, { color: theme.colors.textMuted }]}>
                {t('dashboard.openEntry')}
              </Text>
            </Card>

            {/* 2. Guest QR */}
            <Card
              style={styles.bentoCard}
              onPress={() => navigation.navigate('Main', { screen: 'AccessTab' })}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.infoBg }]}>
                <UserPlus color={theme.colors.info} size={24} />
              </View>
              <Text style={[styles.bentoTitle, { color: theme.colors.text }]}>
                {t('dashboard.guestQr')}
              </Text>
              <Text style={[styles.bentoSub, { color: theme.colors.textMuted }]}>
                {t('dashboard.passCourier')}
              </Text>
            </Card>

            {/* 3. Call Master */}
            <Card
              style={styles.bentoCard}
              onPress={() => navigation.navigate('CreateRequest')}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.warningBg }]}>
                <Wrench color={theme.colors.warning} size={24} />
              </View>
              <Text style={[styles.bentoTitle, { color: theme.colors.text }]}>
                {t('dashboard.master')}
              </Text>
              <Text style={[styles.bentoSub, { color: theme.colors.textMuted }]}>
                {t('dashboard.callService')}
              </Text>
            </Card>

            {/* 4. Meters */}
            <Card
              style={styles.bentoCard}
              onPress={() => navigation.navigate('Meters')}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                <Gauge color="#2563EB" size={24} />
              </View>
              <Text style={[styles.bentoTitle, { color: theme.colors.text }]}>
                {t('dashboard.metersAction')}
              </Text>
              <Text style={[styles.bentoSub, { color: theme.colors.textMuted }]}>
                {t('dashboard.metersCardSub')}
              </Text>
            </Card>

            {/* 5. Bookings */}
            <Card
              style={styles.bentoCard}
              onPress={() => navigation.navigate('Bookings')}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.isDark ? '#4C1D95' : '#F5F3FF' }]}>
                <Calendar color="#8B5CF6" size={24} />
              </View>
              <Text style={[styles.bentoTitle, { color: theme.colors.text }]}>
                {t('dashboard.bookingsAction')}
              </Text>
              <Text style={[styles.bentoSub, { color: theme.colors.textMuted }]}>
                {t('dashboard.bookingsCardSub')}
              </Text>
            </Card>

            {/* 6. Community Board */}
            <Card
              style={styles.bentoCard}
              onPress={() => navigation.navigate('CommunityBoard')}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.isDark ? '#78350F' : '#FFFBEB' }]}>
                <ShoppingBag color="#D97706" size={24} />
              </View>
              <Text style={[styles.bentoTitle, { color: theme.colors.text }]}>
                {t('dashboard.boardAction')}
              </Text>
              <Text style={[styles.bentoSub, { color: theme.colors.textMuted }]}>
                {t('dashboard.communityBoardCardSub')}
              </Text>
            </Card>
          </View>
        </AnimatedEntrance>

        {/* Section: Active Votings */}
        <AnimatedEntrance index={5}>
          <SectionHeader
            title={t('dashboard.activeVotings', { count: activeVotings.length })}
            actionText={t('common.all')}
            onActionPress={() => navigation.navigate('Main', { screen: 'VotingsTab' })}
          />

          {initialLoading ? (
            <SkeletonCard />
          ) : activeVotings.length === 0 ? (
            <Card style={styles.emptyCardWrap}>
              <Text style={[styles.emptyCardText, { color: theme.colors.textMuted }]}>
                {t('dashboard.noActiveVotings')}
              </Text>
            </Card>
          ) : (
            activeVotings.slice(0, 2).map((v) => (
              <Card
                key={v.id}
                style={styles.votingCard}
                onPress={() => navigation.navigate('VotingDetails', { meetingId: v.id })}
              >
                <View style={styles.cardHeaderRow}>
                  <Badge label={t('dashboard.votingInProgress')} variant="success" size="sm" showDot />
                  <View style={styles.dateRow}>
                    <Clock size={12} color={theme.colors.textMuted} />
                    <Text style={[styles.votingDateText, { color: theme.colors.textMuted }]}>
                      {t('dashboard.untilDate', {
                        date: new Date(v.endDate).toLocaleDateString(i18n.language),
                      })}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.votingTitle, { color: theme.colors.text }]}>
                  {v.title}
                </Text>

                {/* Quorum Progress Bar */}
                <View
                  style={[
                    styles.quorumTrack,
                    { backgroundColor: theme.isDark ? '#1E293B' : '#E2E8F0' },
                  ]}
                >
                  <View
                    style={[
                      styles.quorumFill,
                      {
                        width: `${Math.min(v.quorumPercent || 0, 100)}%`,
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  />
                </View>

                <View style={styles.votingFooter}>
                  <Text style={[styles.quorumLabel, { color: theme.colors.textMuted }]}>
                    {t('dashboard.quorum', {
                      percent: v.quorumPercent?.toFixed(1) || 0,
                    })}
                  </Text>
                  <View style={styles.actionArrowRow}>
                    <Text style={[styles.actionArrowLabel, { color: theme.colors.primary }]}>
                      {t('dashboard.voteAction')}
                    </Text>
                    <ChevronRight size={15} color={theme.colors.primary} />
                  </View>
                </View>
              </Card>
            ))
          )}
        </AnimatedEntrance>

        {/* Section: Open Service Requests */}
        <AnimatedEntrance index={6}>
          <SectionHeader
            title={t('dashboard.openRequests', { count: openRequests.length })}
            actionText={t('common.all')}
            onActionPress={() => navigation.navigate('Main', { screen: 'RequestsTab' })}
          />

          {initialLoading ? (
            <SkeletonCard />
          ) : openRequests.length === 0 ? (
            <Card style={styles.emptyCardWrap}>
              <Text style={[styles.emptyCardText, { color: theme.colors.textMuted }]}>
                {t('dashboard.noOpenRequests')}
              </Text>
            </Card>
          ) : (
            openRequests.slice(0, 2).map((r) => {
              const statusProps = getRequestStatusProps(r.status);
              return (
                <Card
                  key={r.id}
                  style={styles.requestCard}
                  onPress={() => navigation.navigate('RequestDetail', { requestId: r.id })}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text
                      style={[styles.requestTitle, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {r.title}
                    </Text>
                    <Badge label={statusProps.label} variant={statusProps.variant} size="sm" />
                  </View>

                  <Text
                    style={[styles.requestDesc, { color: theme.colors.textMuted }]}
                    numberOfLines={2}
                  >
                    {r.description}
                  </Text>

                  <Text style={[styles.requestDate, { color: theme.colors.textLight }]}>
                    {new Date(r.createdAt).toLocaleDateString(i18n.language)}
                  </Text>
                </Card>
              );
            })
          )}
        </AnimatedEntrance>

        {/* Section: Announcements */}
        <AnimatedEntrance index={7}>
          <SectionHeader
            title={t('dashboard.newsAndAnnouncements')}
            actionText={t('dashboard.newsFeed')}
            onActionPress={() => navigation.navigate('Announcements')}
          />

          {initialLoading ? (
            <SkeletonCard />
          ) : (
            announcements.slice(0, 2).map((a) => (
              <Card
                key={a.id}
                style={styles.newsCard}
                onPress={() => navigation.navigate('Announcements')}
              >
                <Text style={[styles.newsTitle, { color: theme.colors.text }]}>{a.title}</Text>
                <Text
                  style={[styles.newsSnippet, { color: theme.colors.textMuted }]}
                  numberOfLines={2}
                >
                  {a.content}
                </Text>
                <Text style={[styles.newsDate, { color: theme.colors.textLight }]}>
                  {new Date(a.createdAt).toLocaleDateString(i18n.language)}
                </Text>
              </Card>
            ))
          )}
        </AnimatedEntrance>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  apartmentInfo: {
    fontSize: 13,
    marginTop: 3,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  notifBtn: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroCardSubtitle: {
    color: '#D1FAE5',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroActionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBalanceWrap: {
    marginVertical: 14,
  },
  heroBalanceText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  heroChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  heroChipText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 13,
  },
  heroChipSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  heroChipSecondaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  urgentCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1.5,
    marginBottom: 16,
    padding: 14,
  },
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  urgentIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTextContainer: {
    flex: 1,
  },
  urgentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  urgentContent: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  sosSection: {
    marginBottom: 18,
  },
  sosHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 2,
  },
  sosHistoryText: {
    fontSize: 13,
    fontWeight: '500',
    marginRight: 4,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 4,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  bentoCard: {
    width: '48.5%',
    padding: 14,
    borderRadius: 18,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bentoTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bentoSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  emptyCardWrap: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyCardText: {
    fontSize: 13,
    textAlign: 'center',
  },
  votingCard: {
    marginBottom: 12,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  votingDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  votingTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 20,
  },
  quorumTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  quorumFill: {
    height: '100%',
    borderRadius: 3,
  },
  votingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quorumLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionArrowLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  requestCard: {
    marginBottom: 10,
    padding: 16,
  },
  requestTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  requestDesc: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  requestDate: {
    fontSize: 11,
    marginTop: 8,
  },
  newsCard: {
    marginBottom: 10,
    padding: 16,
  },
  newsTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  newsSnippet: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  newsDate: {
    fontSize: 11,
    marginTop: 8,
  },
});
