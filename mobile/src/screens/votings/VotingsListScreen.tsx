import { ScreenHero } from '../../components/common/ScreenHero';
import { LoadError } from '../../components/common/LoadError';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { VotingsApi, MeetingItem } from '../../api/votings';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { Vote, ChevronRight, CheckCircle2 } from 'lucide-react-native';

export const VotingsListScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  const fetchMeetings = async () => {
    if (!tenantId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await VotingsApi.getMeetings(tenantId);
      setMeetings(data);
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      console.warn('Failed to load meetings:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [tenantId]);

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    fetchMeetings();
  };

  const filteredMeetings = meetings.filter((m) => {
    if (filter === 'ACTIVE') return m.status === 'ACTIVE';
    if (filter === 'COMPLETED') return m.status === 'COMPLETED';
    return true;
  });


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScreenHero title={t('votings.title')} subtitle={t('votings.subtitle')} style={{ marginHorizontal: 16, marginTop: 16 }} />

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, filter === 'ALL' && styles.tabActive]}
          onPress={() => setFilter('ALL')}
          accessibilityRole="tab" aria-selected={filter === 'ALL'} accessibilityState={{ selected: filter === 'ALL' }}
        >
          <Text style={[styles.tabText, filter === 'ALL' && styles.tabTextActive]}>
            {loading || (loadFailed && !meetings.length) ? '—' : t('votings.tabAll', { count: meetings.length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'ACTIVE' && styles.tabActive]}
          onPress={() => setFilter('ACTIVE')}
          accessibilityRole="tab" aria-selected={filter === 'ACTIVE'} accessibilityState={{ selected: filter === 'ACTIVE' }}
        >
          <Text style={[styles.tabText, filter === 'ACTIVE' && styles.tabTextActive]}>
            {loading || (loadFailed && !meetings.length) ? '—' : t('votings.tabActive', { count: meetings.filter((m) => m.status === 'ACTIVE').length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'COMPLETED' && styles.tabActive]}
          onPress={() => setFilter('COMPLETED')}
          accessibilityRole="tab" aria-selected={filter === 'COMPLETED'} accessibilityState={{ selected: filter === 'COMPLETED' }}
        >
          <Text style={[styles.tabText, filter === 'COMPLETED' && styles.tabTextActive]}>
            {t('votings.tabCompleted')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ListHeaderComponent={loadFailed ? <LoadError onRetry={onRefresh} retrying={refreshing} /> : undefined}
        data={filteredMeetings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={loading ? <LoadingState message={t('votings.loadingMeetings')} /> : loadFailed ? undefined :
          <View style={styles.emptyContainer}>
            <Vote color={Colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>{t(meetings.length ? 'common.noMatches' : 'votings.emptyMeetingsTitle')}</Text>
            <Text style={styles.emptySubtitle}>
              {t(meetings.length ? 'common.changeFilters' : 'votings.emptyMeetingsSubtitle')}
            </Text>
            {meetings.length > 0 && <Button title={t('common.resetFilters')} onPress={() => setFilter('ALL')} variant="outline" style={{ marginTop: 16 }} />}
          </View>
        }
        renderItem={({ item }) => {
          const isActive = item.status === 'ACTIVE';
          return (
            <Card
              style={styles.meetingCard}
              onPress={() => navigation.navigate('VotingDetails', { meetingId: item.id })}
            >
              <View style={styles.cardHeader}>
                <Badge
                  label={t(`votings.votingStatus${{ ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DRAFT: 'Draft' }[item.status]}`)}
                  variant={isActive ? 'success' : 'default'}
                />
                <Text style={styles.dateText}>
                  {t('votings.untilDate', { date: new Date(item.endDate).toLocaleDateString(i18n.language) })}
                </Text>
              </View>

              <Text style={styles.meetingTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.meetingDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              {/* Quorum indicator */}
              <View style={styles.quorumSection}>
                <View style={styles.quorumBar}>
                  <View
                    style={[
                      styles.quorumFill,
                      { width: `${Math.max(0, Math.min(Number.isFinite(item.quorumPercent) ? item.quorumPercent : 0, 100))}%` },
                      item.isQuorumReached && styles.quorumReached,
                    ]}
                  />
                </View>
                <View style={styles.quorumMeta}>
                  <Text style={styles.quorumText}>
                    {t('votings.quorumMeta', { current: item.quorumPercent?.toFixed(1) || 0, required: '50.0' })}
                  </Text>
                  {item.isQuorumReached ? (
                    <View style={styles.quorumBadge}>
                      <CheckCircle2 color="#059669" size={14} />
                      <Text style={styles.quorumBadgeText}>{t('votings.quorumReached')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.itemsCount}>
                  {t('votings.agendaCount', { count: item.agendaItems?.length || 0 })}
                </Text>
                <ChevronRight color={Colors.primary} size={20} />
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabsRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 0,
    marginBottom: 10,
    gap: 8,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  meetingCard: {
    borderRadius: 22,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  meetingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  meetingDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  quorumSection: {
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  quorumBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  quorumFill: {
    height: '100%',
    backgroundColor: Colors.warning,
  },
  quorumReached: {
    backgroundColor: Colors.primary,
  },
  quorumMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quorumText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  quorumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quorumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  itemsCount: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
