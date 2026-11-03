import { ScreenHero } from '../../components/common/ScreenHero';
import { LoadError } from '../../components/common/LoadError';
import { Button } from '../../components/common/Button';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ServiceRequestsApi,
  ServiceRequestItem,
  RequestStatus,
} from '../../api/service-requests';
import {
  getCategoryLabel,
  getPriorityLabel,
  getStatusInfo,
} from '../../utils/requestLabels';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import {
  Wrench,
  ChevronRight,
  Search,
  Building,
  Calendar,
  AlertCircle,
} from 'lucide-react-native';

type FilterStatus = 'ALL' | RequestStatus;

export const StaffRequestsListScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();

  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadRequests = useCallback(async () => {
    try {
      const data = await ServiceRequestsApi.getRequests();
      setRequests(data);
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      console.warn('Failed to load staff requests:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    loadRequests();
  };

  const filterOptions: { key: FilterStatus; label: string }[] = [
    { key: 'ALL', label: t('staff.requests.filterAll') },
    { key: 'PENDING', label: t('requests.statusPending') },
    { key: 'ASSIGNED', label: t('requests.statusAssigned') },
    { key: 'IN_PROGRESS', label: t('requests.statusInProgress') },
    { key: 'RESOLVED', label: t('requests.statusResolved') },
    { key: 'CLOSED', label: t('requests.statusClosed') },
    { key: 'REJECTED', label: t('requests.statusRejected') },
  ];

  const filteredRequests = requests.filter((r) => {
    if (selectedStatus !== 'ALL' && r.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = r.title.toLowerCase().includes(q);
      const descMatch = r.description.toLowerCase().includes(q);
      const unitMatch = r.unit?.unitNumber?.toLowerCase().includes(q) || false;
      const blockMatch = r.unit?.building?.blockName?.toLowerCase().includes(q) || false;
      return titleMatch || descMatch || unitMatch || blockMatch;
    }
    return true;
  });

  const renderRequestItem = ({ item }: { item: ServiceRequestItem }) => {
    const statusInfo = getStatusInfo(item.status, t);
    const unitText = item.unit?.unitNumber
      ? `${t('staff.requests.unitPrefix', { unit: item.unit.unitNumber })}${item.unit.building?.blockName ? ` (${item.unit.building.blockName})` : ''}`
      : null;

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('RequestDetail', { requestId: item.id })}
        accessibilityRole="button" accessibilityLabel={item.title}
        activeOpacity={0.7}
      >
        <Card style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemMetaLeft}>
              <Badge label={statusInfo.label} variant={statusInfo.variant} />
              {item.priority === 'EMERGENCY' && (
                <Badge label={getPriorityLabel(item.priority, t)} variant="danger" />
              )}
            </View>
            <Text style={styles.itemDate}>
              {new Date(item.createdAt).toLocaleDateString(i18n.language, {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          <Text style={styles.itemTitle}>
            {item.title}
          </Text>

          <View style={styles.itemFooter}>
            <View style={styles.detailsRow}>
              {unitText && (
                <View style={styles.tag}>
                  <Building size={13} color={Colors.textMuted} />
                  <Text style={styles.tagText}>{unitText}</Text>
                </View>
              )}
              <View style={styles.tag}>
                <Wrench size={13} color={Colors.textMuted} />
                <Text style={styles.tagText}>{getCategoryLabel(item.category, t)}</Text>
              </View>
              {item.priority !== 'EMERGENCY' && (
                <View style={styles.tag}>
                  <AlertCircle size={13} color={Colors.textMuted} />
                  <Text style={styles.tagText}>{getPriorityLabel(item.priority, t)}</Text>
                </View>
              )}
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ScreenHero title={t('staff.requests.title')} subtitle={t('staff.requests.subtitle')} style={{ marginBottom: 0 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Input
          placeholder={t('staff.requests.searchPlaceholder')}
          accessibilityLabel={t('staff.requests.searchPlaceholder')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {filterOptions.map((opt) => {
            const count = opt.key === 'ALL'
              ? requests.length
              : requests.filter((r) => r.status === opt.key).length;
            const isActive = selectedStatus === opt.key;

            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedStatus(opt.key)}
                accessibilityRole="tab" accessibilityState={{ selected: isActive }}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {opt.label}{loading ? '' : ` (${count})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Requests List */}
      <FlatList
        ListHeaderComponent={loadFailed ? <LoadError onRetry={onRefresh} retrying={refreshing} /> : undefined}
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequestItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={loading ? <LoadingState message={t('requests.loadingRequests')} /> : loadFailed ? undefined :
          <View style={styles.emptyContainer}>
            <Wrench size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>{t(requests.length ? 'common.noMatches' : 'staff.requests.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t(requests.length ? 'common.changeFilters' : 'staff.requests.emptySubtitle')}</Text>
            {requests.length > 0 && <Button title={t('common.resetFilters')} variant="outline" onPress={() => { setSelectedStatus('ALL'); setSearchQuery(''); }} style={{ marginTop: 16 }} />}
          </View>
        }
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  filterSection: {
    marginVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  itemCard: {
    marginBottom: 12,
    padding: 18,
    borderRadius: 24,
  },
  itemHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemMetaLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  itemDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 25,
    marginBottom: 10,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  tag: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagText: {
    flexShrink: 1,
    fontSize: 12,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
