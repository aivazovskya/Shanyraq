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
import { ServiceRequestsApi, ServiceRequestItem } from '../../api/service-requests';
import { getCategoryLabel, getPriorityLabel, getStatusInfo } from '../../utils/requestLabels';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  BadgeVariant,
  Button,
  SegmentedControl,
  SkeletonList,
  EmptyState,
  AnimatedEntrance,
} from '../../components/ui';
import {
  Plus,
  ChevronRight,
  MessageSquare,
  Wrench,
  Clock,
  Flame,
  AlertTriangle,
} from 'lucide-react-native';

export const RequestsListScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);

  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');

  const fetchRequests = useCallback(async () => {
    try {
      const data = await ServiceRequestsApi.getRequests();
      setRequests(data || []);
    } catch (e) {
      console.warn('Failed to load requests:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    safeHaptic.selection();
    fetchRequests();
  };

  const activeCount = requests.filter(
    (r) => r.status !== 'RESOLVED' && r.status !== 'CLOSED' && r.status !== 'REJECTED'
  ).length;

  const filteredRequests = requests.filter((r) => {
    if (filter === 'ACTIVE') {
      return r.status !== 'RESOLVED' && r.status !== 'CLOSED' && r.status !== 'REJECTED';
    }
    if (filter === 'DONE') {
      return r.status === 'RESOLVED' || r.status === 'CLOSED';
    }
    return true;
  });

  const getPriorityBadgeVariant = (priority: string): BadgeVariant => {
    switch (priority) {
      case 'EMERGENCY':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const filterSegments: Array<{ value: 'ALL' | 'ACTIVE' | 'DONE'; label: string }> = [
    { value: 'ALL', label: t('requests.tabAll', { count: requests.length }) },
    { value: 'ACTIVE', label: t('requests.tabActive', { count: activeCount }) },
    { value: 'DONE', label: t('requests.tabDone') },
  ];

  const keyExtractor = useCallback((item: ServiceRequestItem) => item.id, []);

  const renderRequestItem = useCallback(
    ({ item, index }: { item: ServiceRequestItem; index: number }) => {
      const statusInfo = getStatusInfo(item.status, t);
      const statusVariant: BadgeVariant =
        statusInfo.variant === 'default' ? 'neutral' : statusInfo.variant;
      const prioVariant = getPriorityBadgeVariant(item.priority);
      const formattedDate = new Date(item.createdAt).toLocaleDateString(
        i18n.language,
        { day: 'numeric', month: 'short' }
      );

      return (
        <AnimatedEntrance index={Math.min(index, 6)}>
          <Card
            onPress={() => {
              safeHaptic.selection();
              navigation.navigate('RequestDetail', { requestId: item.id });
            }}
            style={styles.card}
            accessibilityLabel={`${item.title}. ${statusInfo.label}`}
          >
            <View style={styles.cardHeader}>
              <View style={styles.badgesRow}>
                <Badge
                  label={getCategoryLabel(item.category, t)}
                  variant="neutral"
                  size="sm"
                />
                {item.priority === 'EMERGENCY' || item.priority === 'HIGH' ? (
                  <Badge
                    label={getPriorityLabel(item.priority, t)}
                    variant={prioVariant}
                    size="sm"
                    showDot
                  />
                ) : null}
              </View>
              <Badge
                label={statusInfo.label}
                variant={statusVariant}
                size="sm"
                mode="subtle"
              />
            </View>

            <Text
              style={[styles.itemTitle, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>

            <Text
              style={[styles.itemDesc, { color: theme.colors.textMuted }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>

            <View
              style={[
                styles.cardFooter,
                { borderTopColor: theme.colors.border },
              ]}
            >
              <View style={styles.dateWrap}>
                <Clock size={13} color={theme.colors.textLight} />
                <Text
                  style={[styles.dateText, { color: theme.colors.textLight }]}
                >
                  {formattedDate}
                </Text>
              </View>

              <View style={styles.footerRight}>
                {item.comments && item.comments.length > 0 && (
                  <View style={styles.commentCount}>
                    <MessageSquare
                      color={theme.colors.textMuted}
                      size={14}
                    />
                    <Text
                      style={[
                        styles.commentText,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      {item.comments.length}
                    </Text>
                  </View>
                )}
                <ChevronRight
                  color={theme.colors.textLight}
                  size={18}
                />
              </View>
            </View>
          </Card>
        </AnimatedEntrance>
      );
    },
    [t, i18n.language, theme, navigation]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {t('requests.serviceDesk')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {t('requests.subtitle')}
          </Text>
        </View>

        <Button
          title={t('requests.createBtn')}
          onPress={() => {
            safeHaptic.selection();
            navigation.navigate('CreateRequest');
          }}
          variant="primary"
          size="sm"
          leftIcon={<Plus color={theme.colors.onPrimary} size={16} />}
          accessibilityLabel={t('requests.createBtn')}
        />
      </View>

      {/* Segmented Filter */}
      <View style={styles.filterWrap}>
        <SegmentedControl
          options={filterSegments}
          value={filter}
          onChange={(key) => {
            safeHaptic.selection();
            setFilter(key as 'ALL' | 'ACTIVE' | 'DONE');
          }}
        />
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarInset },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t('requests.emptyRequestsTitle')}
              description={t('requests.emptyRequestsSubtitle')}
              actionTitle={t('requests.createFirstRequest')}
              onActionPress={() => {
                safeHaptic.selection();
                navigation.navigate('CreateRequest');
              }}
            />
          }
          renderItem={renderRequestItem}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  filterWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  card: {
    padding: 16,
    marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  itemDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
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
    marginRight: 4,
  },
  commentText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
