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
import { ServiceRequestsApi, ServiceRequestItem, RequestStatus } from '../../api/service-requests';
import { getCategoryLabel, getStatusInfo } from '../../utils/requestLabels';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { Wrench, Plus, ChevronRight, MessageSquare } from 'lucide-react-native';

export const RequestsListScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');

  const fetchRequests = async () => {
    try {
      const data = await ServiceRequestsApi.getRequests();
      setRequests(data);
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
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
    if (refreshing) return;
    setRefreshing(true);
    fetchRequests();
  };

  const filteredRequests = requests.filter((r) => {
    if (filter === 'ACTIVE') return r.status !== 'RESOLVED' && r.status !== 'CLOSED' && r.status !== 'REJECTED';
    if (filter === 'DONE') return r.status === 'RESOLVED' || r.status === 'CLOSED';
    return true;
  });


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('requests.serviceDesk')}</Text>
          <Text style={styles.subtitle}>{t('requests.subtitle')}</Text>
        </View>
        <Button
          title={t('requests.createBtn')}
          onPress={() => navigation.navigate('CreateRequest')}
          variant="primary"
          size="md"
          icon={<Plus color="#FFFFFF" size={16} />}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, filter === 'ALL' && styles.tabActive]}
          onPress={() => setFilter('ALL')}
          accessibilityRole="tab" aria-selected={filter === 'ALL'} accessibilityState={{ selected: filter === 'ALL' }}
        >
          <Text style={[styles.tabText, filter === 'ALL' && styles.tabTextActive]}>
            {loading || (loadFailed && !requests.length) ? '—' : t('requests.tabAll', { count: requests.length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'ACTIVE' && styles.tabActive]}
          onPress={() => setFilter('ACTIVE')}
          accessibilityRole="tab" aria-selected={filter === 'ACTIVE'} accessibilityState={{ selected: filter === 'ACTIVE' }}
        >
          <Text style={[styles.tabText, filter === 'ACTIVE' && styles.tabTextActive]}>
            {loading || (loadFailed && !requests.length) ? '—' : t('requests.tabActive', { count: requests.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CLOSED' && r.status !== 'REJECTED').length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'DONE' && styles.tabActive]}
          onPress={() => setFilter('DONE')}
          accessibilityRole="tab" aria-selected={filter === 'DONE'} accessibilityState={{ selected: filter === 'DONE' }}
        >
          <Text style={[styles.tabText, filter === 'DONE' && styles.tabTextActive]}>
            {t('requests.tabDone')} {!loading && !(loadFailed && !requests.length) ? requests.filter(r => r.status === 'RESOLVED' || r.status === 'CLOSED').length : '—'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ListHeaderComponent={loadFailed ? <LoadError onRetry={onRefresh} retrying={refreshing} /> : undefined}
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={loading ? <LoadingState message={t('requests.loadingRequests')} /> : loadFailed ? undefined :
          <View style={styles.emptyContainer}>
            <Wrench color={Colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>{t(requests.length ? 'common.noMatches' : 'requests.emptyRequestsTitle')}</Text>
            <Text style={styles.emptySubtitle}>
              {t(requests.length ? 'common.changeFilters' : 'requests.emptyRequestsSubtitle')}
            </Text>
            <Button
              title={t(requests.length ? 'common.resetFilters' : 'requests.createFirstRequest')}
              onPress={() => requests.length ? setFilter('ALL') : navigation.navigate('CreateRequest')}
              size="md"
              style={{ marginTop: 16 }}
            />
          </View>
        }
        renderItem={({ item }) => {
          const statusInfo = getStatusInfo(item.status, t);
          return (
            <Card
              style={styles.card}
              onPress={() => navigation.navigate('RequestDetail', { requestId: item.id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.categoryBadge}>{getCategoryLabel(item.category, t)}</Text>
                <Badge label={statusInfo.label} variant={statusInfo.variant} />
              </View>

              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {item.description}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  {new Date(item.createdAt).toLocaleDateString(i18n.language)}
                </Text>
                <View style={styles.footerRight}>
                  {item.comments && item.comments.length > 0 ? (
                    <View style={styles.commentCount}>
                      <MessageSquare color={Colors.textMuted} size={14} />
                      <Text style={styles.commentText}>{item.comments.length}</Text>
                    </View>
                  ) : null}
                  <ChevronRight color={Colors.textMuted} size={18} />
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
    gap: 16,
    padding: 20,
    margin: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.primaryBg,
  },
  title: {
    fontSize: 26,
    letterSpacing: -0.6,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tabsRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    paddingHorizontal: 16,
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
    paddingBottom: 40,
  },
  card: {
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
