import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Text } from '../../components/ui/AppText';
import { ChargesRing, buildRingSegments, segmentColor } from '../../components/ui/ChargesRing';
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
import { financeApi, PersonalAccountData } from '../../api/finance';
import { sosApi } from '../../api/sos';
import { SosHoldButton } from '../../components/sos/SosHoldButton';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CountUp } from '../../components/ui/CountUp';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { QuickAction, QuickActionGrid, QuickActionItem, SectionTitle, PromoStories, PromoStoryItem } from '../../components/ui';
import { useTabBarInset } from '../../hooks/useTabBarInset';
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
  PieChart,
  MessageSquare,
} from 'lucide-react-native';

export const DashboardScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(36);
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
  const [accounts, setAccounts] = useState<PersonalAccountData[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState(false);

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
      setAccountsLoading(true);
      const [votingsRes, requestsRes, announcementsRes, accountsRes] = await Promise.allSettled([
        VotingsApi.getMeetings(tenantId),
        ServiceRequestsApi.getRequests(),
        AnnouncementsApi.getAnnouncements(tenantId),
        financeApi.getMyAccounts(),
      ]);

      if (votingsRes.status === 'fulfilled') setVotings(votingsRes.value);
      if (requestsRes.status === 'fulfilled') setRequests(requestsRes.value);
      if (announcementsRes.status === 'fulfilled') setAnnouncements(announcementsRes.value);
      if (accountsRes.status === 'fulfilled') {
        setAccounts(accountsRes.value || []);
        setAccountsError(false);
      } else {
        setAccountsError(true);
      }
      setAccountsLoading(false);
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

  const promoItems: PromoStoryItem[] = useMemo(() => {
    if (announcements.length > 0) {
      return announcements.slice(0, 5).map((a) => ({
        id: a.id,
        tag: a.isUrgent ? t('announcements.urgentBadgeText') : t('announcements.regularBadgeText'),
        title: a.title,
        onPress: () => navigation.navigate('Announcements'),
      }));
    }
    return [
      {
        id: 'promo-bills',
        tag: t('dashboard.balanceCardTitle'),
        title: t('dashboard.payAction'),
        onPress: () => navigation.navigate('FinanceAccount'),
      },
      {
        id: 'promo-votings',
        tag: t('navigation.votings'),
        title: t('dashboard.votingInProgress'),
        onPress: () => navigation.navigate('Main', { screen: 'VotingsTab' }),
      },
      {
        id: 'promo-board',
        tag: t('dashboard.boardAction'),
        title: t('dashboard.communityBoardCardSub'),
        onPress: () => navigation.navigate('CommunityBoard'),
      },
    ];
  }, [announcements, t, navigation]);

  const quickActionsList: QuickActionItem[] = [
    {
      id: 'pay',
      icon: <CreditCard size={24} color={theme.colors.primary} />,
      label: t('dashboard.payAction'),
      onPress: () => navigation.navigate('FinanceAccount'),
      iconBgColor: theme.colors.primaryBg,
    },
    {
      id: 'barrier',
      icon: <ShieldCheck size={24} color={theme.colors.primary} />,
      label: t('dashboard.barrier'),
      onPress: () => navigation.navigate('Main', { screen: 'AccessTab' }),
      iconBgColor: theme.colors.primaryBg,
    },
    {
      id: 'guestQr',
      icon: <UserPlus size={24} color={theme.colors.info} />,
      label: t('dashboard.guestQr'),
      onPress: () => navigation.navigate('Main', { screen: 'AccessTab' }),
      iconBgColor: theme.colors.infoBg,
    },
    {
      id: 'master',
      icon: <Wrench size={24} color={theme.colors.warning} />,
      label: t('dashboard.master'),
      onPress: () => navigation.navigate('CreateRequest'),
      iconBgColor: theme.colors.warningBg,
    },
    {
      id: 'meters',
      icon: <Gauge size={24} color={theme.colors.info} />,
      label: t('dashboard.metersAction'),
      onPress: () => navigation.navigate('Meters'),
      iconBgColor: theme.colors.infoBg,
    },
    {
      id: 'bookings',
      icon: <Calendar size={24} color={theme.colors.primary} />,
      label: t('dashboard.bookingsAction'),
      onPress: () => navigation.navigate('Bookings'),
      iconBgColor: theme.colors.primaryBg,
    },
    {
      id: 'board',
      icon: <ShoppingBag size={24} color={theme.colors.warning} />,
      label: t('dashboard.boardAction'),
      onPress: () => navigation.navigate('CommunityBoard'),
      iconBgColor: theme.colors.warningBg,
    },
    {
      id: 'chat',
      icon: <MessageSquare size={24} color={theme.colors.success} />,
      label: t('dashboard.chatCardTitle'),
      onPress: () => navigation.navigate('Chat'),
      iconBgColor: theme.colors.successBg,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: tabBarInset + 20, // safe clearance over floating tab bar
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
          {(() => {
            const selectedAccount = accounts.find((a) => a.unit?.id === primaryOwnership?.unitId) || accounts[0];
            const totalBalance = selectedAccount ? selectedAccount.balance : accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
            const hasAccounts = accounts.length > 0;
            const ringSegments = buildRingSegments(selectedAccount?.charges);
            return (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => navigation.navigate('FinanceAccount')}
            accessibilityLabel={
              accountsLoading
                ? `${t('dashboard.balanceCardTitle')}: ${t('common.loading')}`
                : accountsError || !hasAccounts
                ? `${t('dashboard.balanceCardTitle')}: —`
                : `${t('dashboard.balanceCardTitle')}: ${totalBalance.toLocaleString()} ₸`
            }
          >
            <LinearGradient
              colors={
                theme.isDark
                  ? ['#16405F', '#0F2D45', '#0A1F30']
                  : ['#0C2233', '#12395A', '#1A6BAA']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, theme.shadows.lg]}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroBadgeRow}>
                  <CreditCard size={18} color="#BFE0F4" />
                  <Text style={styles.heroCardSubtitle}>{t('dashboard.balanceCardTitle')}</Text>
                </View>
                <View style={styles.heroActionArrow}>
                  <ArrowUpRight size={18} color="#FFFFFF" />
                </View>
              </View>

              <View style={[styles.heroBalanceWrap, styles.heroBalanceRow]}>
                <View style={{ flex: 1 }}>
                {accountsLoading ? (
                  <Skeleton width={140} height={36} borderRadius={8} />
                ) : accountsError || !hasAccounts ? (
                  <Text style={styles.heroBalanceText}>—</Text>
                ) : (
                  <CountUp
                    value={totalBalance}
                    currency="₸"
                    style={styles.heroBalanceText}
                  />
                )}
                </View>
                {!accountsLoading && !accountsError && ringSegments.length > 0 && (
                  <View style={styles.heroRing}>
                    <ChargesRing segments={ringSegments} />
                  </View>
                )}
              </View>
              {!accountsLoading && !accountsError && ringSegments.length > 0 && (
                <View style={styles.heroLegend}>
                  {ringSegments.map((seg, i) => (
                    <View key={seg.label + i} style={styles.heroLegendItem}>
                      <View style={[styles.heroLegendDot, { backgroundColor: segmentColor(i) }]} />
                      <Text style={styles.heroLegendText} numberOfLines={1}>
                        {seg.label} · {Math.round(seg.amount).toLocaleString()} ₸
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.heroFooter}>
                <TouchableOpacity
                  style={styles.heroChip}
                  onPress={() => navigation.navigate('FinanceAccount')}
                >
                  <Text style={styles.heroChipText}>{t('dashboard.payAction')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroChipSecondary}
                  onPress={() => navigation.navigate('FinanceAccount')}
                >
                  <FileText size={14} color="#BFE0F4" />
                  <Text style={styles.heroChipSecondaryText}>{t('dashboard.billsAction')}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </TouchableOpacity>
            );
          })()}
        </AnimatedEntrance>

        {/* Transparency Report Card ("Куда уходят деньги") */}
        <AnimatedEntrance index={1}>
          <Card
            style={[
              styles.transparencyCard,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => navigation.navigate('TransparencyReport')}
            accessibilityLabel={t('dashboard.transparencyCardTitle')}
          >
            <View style={styles.transparencyCardContent}>
              <View
                style={[
                  styles.transparencyIconWrap,
                  { backgroundColor: theme.colors.primaryBg },
                ]}
              >
                <PieChart size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.transparencyTextWrap}>
                <Text
                  style={[styles.transparencyTitle, { color: theme.colors.text }]}
                >
                  {t('dashboard.transparencyCardTitle')}
                </Text>
                <View style={styles.transparencyBadgeRow}>
                  <Badge
                    label={t('dashboard.transparencyCardBadge')}
                    variant="info"
                    size="sm"
                  />
                </View>
                <Text
                  style={[styles.transparencySubtitle, { color: theme.colors.textMuted }]}
                  numberOfLines={2}
                >
                  {t('dashboard.transparencyCardSubtitle')}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.colors.textMuted} />
            </View>
          </Card>
        </AnimatedEntrance>

        {/* Urgent Announcement Alert if any */}
        {urgentAnnouncement && (
          <AnimatedEntrance index={2}>
            <Card
              style={[styles.urgentCard, { backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.dangerBorder }]}
              onPress={() => navigation.navigate('Announcements')}
            >
              <View style={styles.urgentRow}>
                <View style={[styles.urgentIconCircle, { backgroundColor: theme.colors.surface }]}>
                  <AlertTriangle color={theme.colors.danger} size={22} />
                </View>
                <View style={styles.urgentTextContainer}>
                  <Text style={[styles.urgentTitle, { color: theme.colors.danger }]}>{urgentAnnouncement.title}</Text>
                  <Text style={[styles.urgentContent, { color: theme.colors.text }]} numberOfLines={2}>
                    {urgentAnnouncement.content}
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.colors.danger} />
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
            accessibilityLabel={t('sos.viewHistoryLink')}
          >
            <Text style={[styles.sosHistoryText, { color: theme.colors.textMuted }]}>
              {t('sos.viewHistoryLink')}
            </Text>
            <ChevronRight size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* Promo / Announcements Stories (Kaspi/Freedom style) */}
        {promoItems.length > 0 && (
          <AnimatedEntrance index={3} style={{ marginHorizontal: -16, marginBottom: 12 }}>
            <PromoStories items={promoItems} />
          </AnimatedEntrance>
        )}

        {/* Quick Actions Grid (Kaspi/Freedom style 4-column tiles) */}
        <AnimatedEntrance index={4} style={{ marginBottom: 12 }}>
          <SectionTitle title={t('dashboard.quickActions')} />
          <QuickActionGrid items={quickActionsList} columns={4} />
        </AnimatedEntrance>

        {/* Section: Active Votings */}
        <AnimatedEntrance index={5}>
          <SectionTitle
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
          <SectionTitle
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
          <SectionTitle
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
    color: '#BFE0F4',
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
  heroBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroRing: {
    marginLeft: 12,
  },
  heroLegend: {
    gap: 4,
    marginBottom: 12,
  },
  heroLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroLegendText: {
    color: '#D9ECF7',
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
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
    color: '#0C2233',
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
  transparencyCard: {
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  transparencyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transparencyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transparencyTextWrap: {
    flex: 1,
  },
  transparencyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  transparencyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  transparencySubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
