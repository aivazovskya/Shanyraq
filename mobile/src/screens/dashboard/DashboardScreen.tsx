import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { VotingsApi, MeetingItem } from '../../api/votings';
import { ServiceRequestsApi, ServiceRequestItem } from '../../api/service-requests';
import { AnnouncementsApi, AnnouncementItem } from '../../api/announcements';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Colors } from '../../constants/colors';
import {
  Building2,
  Vote,
  Wrench,
  Bell,
  ShieldCheck,
  UserPlus,
  ChevronRight,
  AlertTriangle,
  CreditCard,
  Gauge,
  Calendar,
} from 'lucide-react-native';

export const DashboardScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const primaryOwnership = user?.ownerships?.[0];
  const tenantId = user?.tenantId || (primaryOwnership as any)?.unit?.building?.tenantId;

  const [refreshing, setRefreshing] = useState(false);
  const [votings, setVotings] = useState<MeetingItem[]>([]);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);

  const getRequestStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return t('requests.statusPending');
      case 'ASSIGNED': return t('requests.statusAssigned');
      case 'IN_PROGRESS': return t('requests.statusInProgress');
      case 'RESOLVED': return t('requests.statusResolved');
      case 'REJECTED': return t('requests.statusRejected');
      case 'CLOSED': return t('requests.statusClosed');
      default: return status;
    }
  };

  const fetchDashboardData = useCallback(async () => {
    if (!tenantId) return;

    try {
      // Execute 3 parallel requests according to technical specification
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
    }
  }, [tenantId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const activeVotings = votings.filter((m) => m.status === 'ACTIVE');
  const openRequests = requests.filter((r) => r.status !== 'CLOSED' && r.status !== 'REJECTED');
  const urgentAnnouncement = announcements.find((a) => a.isUrgent);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header Profile Summary */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {t('dashboard.welcome', { name: user?.firstName || t('dashboard.defaultResident') })}
            </Text>
            <Text style={styles.apartmentInfo}>
              {user?.tenant?.name || t('dashboard.defaultComplex')} • {t('dashboard.unitFormat', { unit: primaryOwnership?.unit?.unitNumber || '—' })}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <Badge
              label={primaryOwnership?.isVerified ? t('dashboard.verified') : t('dashboard.onVerification')}
              variant={primaryOwnership?.isVerified ? 'success' : 'warning'}
            />
          </View>
        </View>

        {/* Urgent Announcement Alert */}
        {urgentAnnouncement && (
          <Card style={styles.urgentCard} onPress={() => navigation.navigate('Announcements')}>
            <View style={styles.urgentRow}>
              <AlertTriangle color="#DC2626" size={24} />
              <View style={styles.urgentTextContainer}>
                <Text style={styles.urgentTitle}>{urgentAnnouncement.title}</Text>
                <Text style={styles.urgentContent} numberOfLines={2}>
                  {urgentAnnouncement.content}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Quick Access Actions */}
        <Text style={styles.sectionTitle}>{t('dashboard.quickActions')}</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('Main', { screen: 'AccessTab' })}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#ECFDF5' }]}>
              <ShieldCheck color={Colors.primary} size={24} />
            </View>
            <Text style={styles.quickActionTitle}>{t('dashboard.barrier')}</Text>
            <Text style={styles.quickActionSub}>{t('dashboard.openEntry')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('Main', { screen: 'AccessTab' })}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#EFF6FF' }]}>
              <UserPlus color={Colors.info} size={24} />
            </View>
            <Text style={styles.quickActionTitle}>{t('dashboard.guestQr')}</Text>
            <Text style={styles.quickActionSub}>{t('dashboard.passCourier')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => navigation.navigate('CreateRequest')}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Wrench color={Colors.warning} size={24} />
            </View>
            <Text style={styles.quickActionTitle}>{t('dashboard.master')}</Text>
            <Text style={styles.quickActionSub}>{t('dashboard.callService')}</Text>
          </TouchableOpacity>
        </View>

        {/* Personal Account / Finance Card */}
        <Card
          style={styles.financeCard}
          onPress={() => (navigation as any).navigate('FinanceAccount')}
        >
          <View style={styles.financeRow}>
            <View style={[styles.quickIconCircle, { backgroundColor: '#ECFDF5' }]}>
              <CreditCard color={Colors.primary} size={22} />
            </View>
            <View style={styles.financeTextContainer}>
              <Text style={styles.financeTitle}>{t('dashboard.financeCardTitle')}</Text>
              <Text style={styles.financeSub}>{t('dashboard.financeCardSub')}</Text>
            </View>
            <ChevronRight color={Colors.textMuted} size={20} />
          </View>
        </Card>

        {/* Meter Readings Card */}
        <Card
          style={[styles.financeCard, { marginTop: 8 }]}
          onPress={() => (navigation as any).navigate('Meters')}
        >
          <View style={styles.financeRow}>
            <View style={[styles.quickIconCircle, { backgroundColor: '#EFF6FF' }]}>
              <Gauge color={Colors.info} size={22} />
            </View>
            <View style={styles.financeTextContainer}>
              <Text style={styles.financeTitle}>{t('dashboard.metersCardTitle')}</Text>
              <Text style={styles.financeSub}>{t('dashboard.metersCardSub')}</Text>
            </View>
            <ChevronRight color={Colors.textMuted} size={20} />
          </View>
        </Card>

        {/* Amenity Booking Card */}
        <Card
          style={[styles.financeCard, { marginTop: 8 }]}
          onPress={() => (navigation as any).navigate('Bookings')}
        >
          <View style={styles.financeRow}>
            <View style={[styles.quickIconCircle, { backgroundColor: '#FDF4FF' }]}>
              <Calendar color="#A855F7" size={22} />
            </View>
            <View style={styles.financeTextContainer}>
              <Text style={styles.financeTitle}>{t('dashboard.bookingsCardTitle')}</Text>
              <Text style={styles.financeSub}>{t('dashboard.bookingsCardSub')}</Text>
            </View>
            <ChevronRight color={Colors.textMuted} size={20} />
          </View>
        </Card>

        {/* Section: Active Votings */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('dashboard.activeVotings', { count: activeVotings.length })}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'VotingsTab' })}>
            <Text style={styles.seeAllText}>{t('common.all')}</Text>
          </TouchableOpacity>
        </View>

        {activeVotings.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('dashboard.noActiveVotings')}</Text>
          </Card>
        ) : (
          activeVotings.slice(0, 2).map((v) => (
            <Card
              key={v.id}
              style={styles.votingCard}
              onPress={() => navigation.navigate('VotingDetails', { meetingId: v.id })}
            >
              <View style={styles.votingCardHeader}>
                <Badge label={t('dashboard.votingInProgress')} variant="success" />
                <Text style={styles.votingDate}>{t('dashboard.untilDate', { date: new Date(v.endDate).toLocaleDateString(i18n.language) })}</Text>
              </View>
              <Text style={styles.votingTitle}>{v.title}</Text>
              <View style={styles.quorumBar}>
                <View
                  style={[
                    styles.quorumProgress,
                    { width: `${Math.min(v.quorumPercent || 0, 100)}%` },
                  ]}
                />
              </View>
              <View style={styles.quorumRow}>
                <Text style={styles.quorumLabel}>{t('dashboard.quorum', { percent: v.quorumPercent?.toFixed(1) || 0 })}</Text>
                <View style={styles.actionArrow}>
                  <Text style={styles.actionArrowText}>{t('dashboard.voteAction')}</Text>
                  <ChevronRight color={Colors.primary} size={16} />
                </View>
              </View>
            </Card>
          ))
        )}

        {/* Section: Open Service Requests */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('dashboard.openRequests', { count: openRequests.length })}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'RequestsTab' })}>
            <Text style={styles.seeAllText}>{t('common.all')}</Text>
          </TouchableOpacity>
        </View>

        {openRequests.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('dashboard.noOpenRequests')}</Text>
          </Card>
        ) : (
          openRequests.slice(0, 2).map((r) => (
            <Card
              key={r.id}
              style={styles.requestCard}
              onPress={() => navigation.navigate('RequestDetail', { requestId: r.id })}
            >
              <View style={styles.requestHeader}>
                <Text style={styles.requestTitle}>{r.title}</Text>
                <Badge label={getRequestStatusLabel(r.status)} variant="info" />
              </View>
              <Text style={styles.requestDesc} numberOfLines={2}>
                {r.description}
              </Text>
              <Text style={styles.requestDate}>
                {new Date(r.createdAt).toLocaleDateString(i18n.language)}
              </Text>
            </Card>
          ))
        )}

        {/* Section: Announcements preview */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('dashboard.newsAndAnnouncements')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Announcements')}>
            <Text style={styles.seeAllText}>{t('dashboard.newsFeed')}</Text>
          </TouchableOpacity>
        </View>

        {announcements.slice(0, 2).map((a) => (
          <Card key={a.id} style={styles.newsCard} onPress={() => navigation.navigate('Announcements')}>
            <Text style={styles.newsTitle}>{a.title}</Text>
            <Text style={styles.newsSnippet} numberOfLines={2}>
              {a.content}
            </Text>
            <Text style={styles.newsDate}>{new Date(a.createdAt).toLocaleDateString(i18n.language)}</Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    marginTop: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  apartmentInfo: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    marginTop: 4,
  },
  urgentCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    marginBottom: 16,
  },
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  urgentTextContainer: {
    flex: 1,
  },
  urgentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#991B1B',
  },
  urgentContent: {
    fontSize: 13,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  quickIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  quickActionSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  votingCard: {
    marginBottom: 10,
  },
  votingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  votingDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  votingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  quorumBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  quorumProgress: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  quorumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quorumLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  actionArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionArrowText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  requestCard: {
    marginBottom: 10,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  requestDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 6,
    lineHeight: 18,
  },
  requestDate: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 8,
  },
  emptyCard: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  newsCard: {
    marginBottom: 8,
  },
  newsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  newsSnippet: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  newsDate: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 8,
  },
  financeCard: {
    marginBottom: 20,
    padding: 14,
  },
  financeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  financeTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  financeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  financeSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
