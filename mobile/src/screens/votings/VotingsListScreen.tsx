import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Vote, ChevronRight, CheckCircle2, Clock } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  SegmentedControl,
  SkeletonList,
  EmptyState,
  ErrorState,
  AnimatedEntrance,
} from '../../components/ui';
import { VotingsApi, MeetingItem } from '../../api/votings';
import { useAuth } from '../../context/AuthContext';

export const VotingsListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { user } = useAuth();
  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [error, setError] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await VotingsApi.getMeetings(tenantId);
      setMeetings(data || []);
    } catch (e: any) {
      console.warn('Failed to load meetings:', e);
      setError(e?.response?.data?.message || e.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const onRefresh = () => {
    setRefreshing(true);
    safeHaptic.selection();
    fetchMeetings();
  };

  const activeCount = meetings.filter((m) => m.status === 'ACTIVE').length;

  const filteredMeetings = meetings.filter((m) => {
    if (filter === 'ACTIVE') return m.status === 'ACTIVE';
    if (filter === 'COMPLETED') return m.status === 'COMPLETED';
    return true;
  });

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
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('votings.title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {t('votings.subtitle')}
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrap}>
        <SegmentedControl
          options={[
            { value: 'ALL', label: t('votings.tabAll', { count: meetings.length }) },
            { value: 'ACTIVE', label: t('votings.tabActive', { count: activeCount }) },
            { value: 'COMPLETED', label: t('votings.tabCompleted') },
          ]}
          value={filter}
          onChange={(val) => {
            safeHaptic.selection();
            setFilter(val as 'ALL' | 'ACTIVE' | 'COMPLETED');
          }}
        />
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMeetings} />
      ) : (
        <FlatList
          data={filteredMeetings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t('votings.emptyMeetingsTitle')}
              description={t('votings.emptyMeetingsSubtitle')}
              actionTitle={t('common.refresh')}
              onActionPress={fetchMeetings}
            />
          }
          renderItem={({ item }) => {
            const isActive = item.status === 'ACTIVE';
            return (
              <Card
                style={[
                  styles.meetingCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('VotingDetails', { meetingId: item.id });
                }}
                accessibilityLabel={item.title}
              >
                <View style={styles.cardHeader}>
                  <Badge
                    label={
                      isActive
                        ? t('votings.votingStatusActive')
                        : t('votings.votingStatusCompleted')
                    }
                    variant={isActive ? 'success' : 'neutral'}
                    size="sm"
                  />
                  <View style={styles.dateRow}>
                    <Clock size={12} color={theme.colors.textMuted} />
                    <Text style={[styles.dateText, { color: theme.colors.textMuted }]}>
                      {t('votings.untilDate', {
                        date: new Date(item.endDate).toLocaleDateString(i18n.language),
                      })}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.meetingTitle, { color: theme.colors.text }]}>
                  {item.title}
                </Text>
                {Boolean(item.description) && (
                  <Text
                    style={[styles.meetingDesc, { color: theme.colors.textMuted }]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                )}

                {/* Quorum indicator box */}
                <View
                  style={[
                    styles.quorumSection,
                    {
                      backgroundColor: theme.colors.surfaceSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.quorumBar,
                      { backgroundColor: theme.colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.quorumFill,
                        {
                          width: `${Math.min(item.quorumPercent || 0, 100)}%`,
                          backgroundColor: item.isQuorumReached
                            ? theme.colors.primary
                            : theme.colors.warning,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.quorumMeta}>
                    <Text style={[styles.quorumText, { color: theme.colors.text }]}>
                      {t('votings.quorumMeta', {
                        current: item.quorumPercent?.toFixed(1) || 0,
                        required: '50.0',
                      })}
                    </Text>
                    {item.isQuorumReached ? (
                      <View style={styles.quorumBadge}>
                        <CheckCircle2 color={theme.colors.primary} size={14} />
                        <Text
                          style={[
                            styles.quorumBadgeText,
                            { color: theme.colors.primary },
                          ]}
                        >
                          {t('votings.quorumReached')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Footer with chevron */}
                <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
                  <Text style={[styles.itemsCount, { color: theme.colors.textMuted }]}>
                    {t('votings.agendaCount', { count: item.agendaItems?.length || 0 })}
                  </Text>
                  <ChevronRight color={theme.colors.primary} size={18} />
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  filterWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skeletonWrap: {
    padding: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  meetingCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  cardHeader: {
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
  dateText: {
    fontSize: 12,
  },
  meetingTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 22,
  },
  meetingDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  quorumSection: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  quorumBar: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  quorumFill: {
    height: '100%',
    borderRadius: 4,
  },
  quorumMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quorumText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quorumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quorumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  itemsCount: {
    fontSize: 13,
    fontWeight: '500',
  },
});
