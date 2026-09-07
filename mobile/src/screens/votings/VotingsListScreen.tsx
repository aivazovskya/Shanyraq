import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { VotingsApi, MeetingItem } from '../../api/votings';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { Vote, ChevronRight, CheckCircle2 } from 'lucide-react-native';

export const VotingsListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  const fetchMeetings = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      const data = await VotingsApi.getMeetings(tenantId);
      setMeetings(data);
    } catch (e) {
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
    setRefreshing(true);
    fetchMeetings();
  };

  const filteredMeetings = meetings.filter((m) => {
    if (filter === 'ACTIVE') return m.status === 'ACTIVE';
    if (filter === 'COMPLETED') return m.status === 'COMPLETED';
    return true;
  });

  if (loading) {
    return <LoadingState message="Загрузка собраний ОСС..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Голосования ОСС</Text>
        <Text style={styles.subtitle}>
          Общие собрания собственников с юридическим весом голоса по площади
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, filter === 'ALL' && styles.tabActive]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={[styles.tabText, filter === 'ALL' && styles.tabTextActive]}>
            Все ({meetings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'ACTIVE' && styles.tabActive]}
          onPress={() => setFilter('ACTIVE')}
        >
          <Text style={[styles.tabText, filter === 'ACTIVE' && styles.tabTextActive]}>
            Активные ({meetings.filter((m) => m.status === 'ACTIVE').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'COMPLETED' && styles.tabActive]}
          onPress={() => setFilter('COMPLETED')}
        >
          <Text style={[styles.tabText, filter === 'COMPLETED' && styles.tabTextActive]}>
            Завершенные
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Vote color={Colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>Собраний пока нет</Text>
            <Text style={styles.emptySubtitle}>
              Когда управляющая компания или председатель ОСИ инициируют голосование, оно появится здесь
            </Text>
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
                  label={isActive ? 'Идет голосование' : 'Завершено'}
                  variant={isActive ? 'success' : 'default'}
                />
                <Text style={styles.dateText}>
                  до {new Date(item.endDate).toLocaleDateString('ru-RU')}
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
                      { width: `${Math.min(item.quorumPercent || 0, 100)}%` },
                      item.isQuorumReached && styles.quorumReached,
                    ]}
                  />
                </View>
                <View style={styles.quorumMeta}>
                  <Text style={styles.quorumText}>
                    Кворум: {item.quorumPercent?.toFixed(1) || 0}% из 50.0%
                  </Text>
                  {item.isQuorumReached ? (
                    <View style={styles.quorumBadge}>
                      <CheckCircle2 color="#059669" size={14} />
                      <Text style={styles.quorumBadgeText}>Кворум достигнут</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.itemsCount}>
                  Вопросов на повестке: {item.agendaItems?.length || 0}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    gap: 8,
  },
  tab: {
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
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
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
