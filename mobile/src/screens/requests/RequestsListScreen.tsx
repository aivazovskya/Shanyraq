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
import { ServiceRequestsApi, ServiceRequestItem, RequestStatus } from '../../api/service-requests';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { Wrench, Plus, ChevronRight, MessageSquare } from 'lucide-react-native';

const STATUS_MAP: Record<RequestStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'default' }> = {
  PENDING: { label: 'В очереди', variant: 'warning' },
  ASSIGNED: { label: 'Назначен мастер', variant: 'info' },
  IN_PROGRESS: { label: 'В работе', variant: 'info' },
  RESOLVED: { label: 'Выполнена', variant: 'success' },
  REJECTED: { label: 'Отклонена', variant: 'danger' },
  CLOSED: { label: 'Закрыта', variant: 'default' },
};

export const RequestsListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');

  const fetchRequests = async () => {
    try {
      const data = await ServiceRequestsApi.getRequests();
      setRequests(data);
    } catch (e) {
      console.warn('Failed to load requests:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const filteredRequests = requests.filter((r) => {
    if (filter === 'ACTIVE') return r.status !== 'RESOLVED' && r.status !== 'CLOSED' && r.status !== 'REJECTED';
    if (filter === 'DONE') return r.status === 'RESOLVED' || r.status === 'CLOSED';
    return true;
  });

  if (loading) {
    return <LoadingState message="Загрузка ваших заявок..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Service Desk</Text>
          <Text style={styles.subtitle}>Заявки на ремонт, сантехнику и обслуживание дома</Text>
        </View>
        <Button
          title="Создать"
          onPress={() => navigation.navigate('CreateRequest')}
          variant="primary"
          size="sm"
          icon={<Plus color="#FFFFFF" size={16} />}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, filter === 'ALL' && styles.tabActive]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={[styles.tabText, filter === 'ALL' && styles.tabTextActive]}>
            Все ({requests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'ACTIVE' && styles.tabActive]}
          onPress={() => setFilter('ACTIVE')}
        >
          <Text style={[styles.tabText, filter === 'ACTIVE' && styles.tabTextActive]}>
            В работе ({requests.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CLOSED').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'DONE' && styles.tabActive]}
          onPress={() => setFilter('DONE')}
        >
          <Text style={[styles.tabText, filter === 'DONE' && styles.tabTextActive]}>
            Завершенные
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Wrench color={Colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>Заявок нет</Text>
            <Text style={styles.emptySubtitle}>
              Если у вас возникла неисправность или вопрос по дому, создайте заявку для диспетчерской
            </Text>
            <Button
              title="Создать первую заявку"
              onPress={() => navigation.navigate('CreateRequest')}
              size="md"
              style={{ marginTop: 16 }}
            />
          </View>
        }
        renderItem={({ item }) => {
          const statusInfo = STATUS_MAP[item.status] || { label: item.status, variant: 'default' };
          return (
            <Card
              style={styles.card}
              onPress={() => navigation.navigate('RequestDetail', { requestId: item.id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.categoryBadge}>{item.category}</Text>
                <Badge label={statusInfo.label} variant={statusInfo.variant} />
              </View>

              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {item.description}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                </Text>
                <View style={styles.footerRight}>
                  {item.comments && item.comments.length > 0 ? (
                    <View style={styles.commentCount}>
                      <MessageSquare color={Colors.textMuted} size={14} />
                      <Text style={styles.commentText}>{item.comments.length}</Text>
                    </View>
                  ) : null}
                  <ChevronRight color={Colors.primary} size={18} />
                </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginTop: 2,
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
    paddingBottom: 40,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textLight,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
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
