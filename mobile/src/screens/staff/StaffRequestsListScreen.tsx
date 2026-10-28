import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
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
import { isRequestOverdue } from '../../utils/sla';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Input,
  Button,
  EmptyState,
  SkeletonList,
  AnimatedEntrance,
} from '../../components/ui';
import {
  ClipboardList,
  Search,
  Building,
  User,
  Clock,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react-native';

type FilterStatus = 'ALL' | RequestStatus;

export const StaffRequestsListScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();

  const isChairman = user?.role === 'HOA_CHAIRMAN';

  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadRequests = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const data = await ServiceRequestsApi.getRequests();
      setRequests(data || []);
    } catch (e) {
      console.warn('Failed to load staff requests:', e);
    } finally {
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests(true);
    }, [loadRequests])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    loadRequests(true);
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: requests.length,
      PENDING: 0,
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      CLOSED: 0,
      REJECTED: 0,
    };
    for (const r of requests) {
      if (counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    }
    return counts;
  }, [requests]);

  const filterOptions: { key: FilterStatus; label: string }[] = [
    { key: 'ALL', label: t('staff.requests.filterAll') },
    { key: 'PENDING', label: t('requests.statusPending') },
    { key: 'ASSIGNED', label: t('requests.statusAssigned') },
    { key: 'IN_PROGRESS', label: t('requests.statusInProgress') },
    { key: 'RESOLVED', label: t('requests.statusResolved') },
    { key: 'CLOSED', label: t('requests.statusClosed') },
  ];

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
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
  }, [requests, selectedStatus, searchQuery]);

  const renderItem = ({ item, index }: { item: ServiceRequestItem; index: number }) => {
    const stInfo = getStatusInfo(item.status, t);
    const badgeVariant = stInfo.variant === 'default' ? 'neutral' : stInfo.variant;
    const overdue = isRequestOverdue(item);
    const isUrgent = item.priority === 'EMERGENCY';
    const unitStr = item.unit
      ? `${item.unit.building?.blockName ? `${item.unit.building.blockName}, ` : ''}${t('staff.requests.unitPrefix', { unit: item.unit.unitNumber })}`
      : null;

    return (
      <AnimatedEntrance index={index}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            safeHaptic.selection();
            navigation.navigate('RequestDetail', { requestId: item.id });
          }}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${stInfo.label}`}
        >
          <Card
            style={[
              styles.requestCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: overdue
                  ? theme.colors.danger
                  : isUrgent
                  ? theme.colors.warning
                  : theme.colors.border,
                borderWidth: overdue || isUrgent ? 1.5 : 1,
              },
            ]}
          >
            {/* Top row: Status, Overdue SLA & Created Date */}
            <View style={styles.cardTopRow}>
              <View style={styles.badgesWrap}>
                <Badge label={stInfo.label} variant={badgeVariant} size="sm" />
                {overdue && (
                  <Badge
                    label={t('staff.requests.overdueBadge')}
                    variant="danger"
                    size="sm"
                  />
                )}
                {!overdue && isUrgent && (
                  <Badge
                    label={t('staff.requests.urgentBadge')}
                    variant="warning"
                    size="sm"
                  />
                )}
              </View>

              <Text
                style={[
                  styles.createdDate,
                  { color: theme.colors.textMuted },
                  theme.typography.caption,
                ]}
              >
                {new Date(item.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>

            {/* Category & Priority Pill */}
            <View style={styles.categoryRow}>
              <Text
                style={[
                  styles.categoryText,
                  { color: theme.colors.primary },
                  theme.typography.caption,
                ]}
              >
                {getCategoryLabel(item.category, t)}
              </Text>
              <Text style={[styles.dotSep, { color: theme.colors.textMuted }]}>•</Text>
              <Text
                style={[
                  styles.priorityText,
                  { color: theme.colors.textMuted },
                  theme.typography.caption,
                ]}
              >
                {getPriorityLabel(item.priority, t)}
              </Text>
            </View>

            {/* Title & Description */}
            <Text
              style={[
                styles.requestTitle,
                { color: theme.colors.text },
                theme.typography.headline,
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {Boolean(item.description) && (
              <Text
                style={[
                  styles.requestDesc,
                  { color: theme.colors.textMuted },
                  theme.typography.caption,
                ]}
                numberOfLines={2}
              >
                {item.description}
              </Text>
            )}

            {/* Unit & Assignee Footer */}
            <View
              style={[
                styles.cardFooter,
                {
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.footerInfo}>
                {Boolean(unitStr) && (
                  <View style={styles.footerItem}>
                    <Building size={14} color={theme.colors.textMuted} />
                    <Text
                      style={[
                        styles.footerItemText,
                        { color: theme.colors.text },
                        theme.typography.caption,
                      ]}
                      numberOfLines={1}
                    >
                      {unitStr}
                    </Text>
                  </View>
                )}

                <View style={styles.footerItem}>
                  <User size={14} color={theme.colors.textMuted} />
                  <Text
                    style={[
                      styles.footerItemText,
                      {
                        color: item.assignee
                          ? theme.colors.text
                          : theme.colors.textMuted,
                      },
                      theme.typography.caption,
                    ]}
                    numberOfLines={1}
                  >
                    {item.assignee
                      ? `${item.assignee.firstName} ${item.assignee.lastName}`
                      : t('staff.requests.notAssigned')}
                  </Text>
                </View>
              </View>

              <ChevronRight size={18} color={theme.colors.textMuted} />
            </View>
          </Card>
        </TouchableOpacity>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.headerWrap,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text
              style={[
                styles.title,
                { color: theme.colors.text },
                theme.typography.title,
              ]}
            >
              {t('staff.requests.title')}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
            >
              {t('staff.requests.subtitle')}
            </Text>
          </View>

          {isChairman && (
            <Badge
              label={t('staff.requests.readOnlyBadge')}
              variant="warning"
              size="sm"
            />
          )}
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Input
            label={t('common.search')}
            placeholder={t('staff.requests.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={<Search size={18} color={theme.colors.textMuted} />}
          />
        </View>

        {/* Status Filters Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {filterOptions.map((opt) => {
            const isSelected = selectedStatus === opt.key;
            const count = statusCounts[opt.key] ?? 0;

            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.surface,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
                onPress={() => {
                  safeHaptic.selection();
                  setSelectedStatus(opt.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${opt.label} (${count})`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected
                        ? theme.colors.onPrimary
                        : theme.colors.text,
                    },
                    theme.typography.caption,
                  ]}
                >
                  {opt.label}
                </Text>
                <View
                  style={[
                    styles.chipCountBadge,
                    {
                      backgroundColor: isSelected
                        ? 'rgba(255, 255, 255, 0.25)'
                        : theme.colors.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipCountText,
                      {
                        color: isSelected
                          ? theme.colors.onPrimary
                          : theme.colors.textMuted,
                      },
                      theme.typography.caption,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Requests List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarInset + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <Card
              style={[
                styles.emptyCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <EmptyState
                title={t('staff.requests.emptyTitle')}
                description={t('staff.requests.emptySubtitle')}
              />
            </Card>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontWeight: '400',
  },
  searchBar: {
    marginBottom: 10,
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    minHeight: 36,
  },
  filterChipText: {
    fontWeight: '600',
  },
  chipCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  chipCountText: {
    fontWeight: '700',
    fontSize: 11,
  },
  loadingWrap: {
    padding: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  requestCard: {
    padding: 16,
    borderRadius: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  createdDate: {
    fontWeight: '400',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  categoryText: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dotSep: {
    fontWeight: '700',
  },
  priorityText: {
    fontWeight: '500',
  },
  requestTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  requestDesc: {
    fontWeight: '400',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  footerInfo: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerItemText: {
    fontWeight: '500',
  },
  emptyCard: {
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
});
