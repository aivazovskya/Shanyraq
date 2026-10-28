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
import { useAuth, canAccessLogs } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { AccessApi, AccessLogItem } from '../../api/access';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Input,
  EmptyState,
  SkeletonList,
  AnimatedEntrance,
  IconButton,
} from '../../components/ui';
import {
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  Car,
  DoorClosed,
  Video,
  KeyRound,
  User,
  Building,
  ArrowLeft,
  Clock,
} from 'lucide-react-native';

type StatusFilter = 'ALL' | 'SUCCESS' | 'DENIED';

interface DayGroupedLogs {
  dateHeader: string;
  items: AccessLogItem[];
}

export const StaffAccessLogScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [logs, setLogs] = useState<AccessLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const tenantId = user?.tenantId || user?.tenant?.id || '';
  const hasAccess = canAccessLogs(user?.role);

  const fetchLogs = useCallback(
    async (isSilent = false) => {
      if (!tenantId || !hasAccess) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!isSilent) setLoading(true);

      try {
        const data = await AccessApi.getAccessLogs(tenantId);
        setLogs(data || []);
      } catch (e: any) {
        console.warn('Failed to load access logs:', e);
      } finally {
        if (!isSilent) setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, hasAccess]
  );

  useFocusEffect(
    useCallback(() => {
      fetchLogs(true);
    }, [fetchLogs])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    fetchLogs(true);
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'OPEN_BARRIER':
        return t('staff.accessLog.actionOpenBarrier');
      case 'GUEST_CODE_ENTRY':
        return t('staff.accessLog.actionGuestCodeEntry');
      case 'VIEW_CAMERA':
        return t('staff.accessLog.actionViewCamera');
      case 'OPEN_INTERCOM':
        return t('staff.accessLog.actionOpenIntercom');
      default:
        return action;
    }
  };

  const getPointIcon = (pointType?: string, action?: string) => {
    if (action === 'GUEST_CODE_ENTRY') {
      return <KeyRound size={16} color={theme.colors.info} />;
    }
    switch (pointType) {
      case 'BARRIER':
        return <Car size={16} color={theme.colors.primary} />;
      case 'GATE':
      case 'DOOR_INTERCOM':
        return <DoorClosed size={16} color={theme.colors.warning} />;
      case 'CAMERA':
        return <Video size={16} color={theme.colors.info} />;
      default:
        return <Shield size={16} color={theme.colors.textMuted} />;
    }
  };

  const getDateHeaderLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (d.toDateString() === today.toDateString()) {
        return t('staff.accessLog.today');
      }
      if (d.toDateString() === yesterday.toDateString()) {
        return t('staff.accessLog.yesterday');
      }
      return d.toLocaleDateString([], {
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return dateStr;
    }
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (statusFilter === 'SUCCESS' && log.status !== 'SUCCESS') return false;
      if (statusFilter === 'DENIED' && log.status !== 'DENIED') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pointName = log.accessPoint?.name?.toLowerCase() || '';
        const userFirst = log.user?.firstName?.toLowerCase() || '';
        const userLast = log.user?.lastName?.toLowerCase() || '';
        const unitNum = log.unit?.unitNumber?.toLowerCase() || '';
        const note = log.note?.toLowerCase() || '';
        const action = log.action?.toLowerCase() || '';
        return (
          pointName.includes(q) ||
          userFirst.includes(q) ||
          userLast.includes(q) ||
          unitNum.includes(q) ||
          note.includes(q) ||
          action.includes(q)
        );
      }
      return true;
    });
  }, [logs, statusFilter, searchQuery]);

  // Group by day for timeline
  const groupedDays = useMemo(() => {
    const groups: DayGroupedLogs[] = [];
    const dateMap = new Map<string, AccessLogItem[]>();

    for (const item of filteredLogs) {
      const dateKey = new Date(item.createdAt).toDateString();
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(item);
    }

    for (const [dateKey, items] of dateMap.entries()) {
      groups.push({
        dateHeader: getDateHeaderLabel(items[0].createdAt),
        items,
      });
    }

    return groups;
  }, [filteredLogs]);

  const successCount = useMemo(
    () => logs.filter((l) => l.status === 'SUCCESS').length,
    [logs]
  );
  const deniedCount = useMemo(
    () => logs.filter((l) => l.status === 'DENIED').length,
    [logs]
  );

  const canGoBack = navigation.canGoBack();

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
          {canGoBack && (
            <IconButton
              icon={<ArrowLeft size={22} color={theme.colors.text} />}
              accessibilityLabel={t('common.back')}
              onPress={() => {
                safeHaptic.selection();
                navigation.goBack();
              }}
              variant="ghost"
              size={40}
              style={{ marginRight: 8 }}
            />
          )}

          <View style={styles.headerTextWrap}>
            <Text
              style={[
                styles.title,
                { color: theme.colors.text },
                theme.typography.title,
              ]}
            >
              {t('staff.accessLog.title')}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
            >
              {t('staff.accessLog.cardSubtitle')}
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Input
            label={t('common.search')}
            placeholder={t('staff.accessLog.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={<Search size={18} color={theme.colors.textMuted} />}
          />
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  statusFilter === 'ALL'
                    ? theme.colors.primary
                    : theme.colors.surface,
                borderColor:
                  statusFilter === 'ALL'
                    ? theme.colors.primary
                    : theme.colors.border,
              },
            ]}
            onPress={() => {
              safeHaptic.selection();
              setStatusFilter('ALL');
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                {
                  color:
                    statusFilter === 'ALL'
                      ? theme.colors.onPrimary
                      : theme.colors.text,
                },
                theme.typography.caption,
              ]}
            >
              {t('staff.accessLog.filterAll')}
            </Text>
            <View
              style={[
                styles.chipCountBadge,
                {
                  backgroundColor:
                    statusFilter === 'ALL'
                      ? 'rgba(255, 255, 255, 0.25)'
                      : theme.colors.surfaceSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipCountText,
                  {
                    color:
                      statusFilter === 'ALL'
                        ? theme.colors.onPrimary
                        : theme.colors.textMuted,
                  },
                ]}
              >
                {logs.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  statusFilter === 'SUCCESS'
                    ? theme.colors.success
                    : theme.colors.surface,
                borderColor:
                  statusFilter === 'SUCCESS'
                    ? theme.colors.success
                    : theme.colors.border,
              },
            ]}
            onPress={() => {
              safeHaptic.selection();
              setStatusFilter('SUCCESS');
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                {
                  color:
                    statusFilter === 'SUCCESS'
                      ? '#FFFFFF'
                      : theme.colors.text,
                },
                theme.typography.caption,
              ]}
            >
              {t('staff.accessLog.filterAllowed')}
            </Text>
            <View
              style={[
                styles.chipCountBadge,
                {
                  backgroundColor:
                    statusFilter === 'SUCCESS'
                      ? 'rgba(255, 255, 255, 0.25)'
                      : theme.colors.surfaceSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipCountText,
                  {
                    color:
                      statusFilter === 'SUCCESS'
                        ? '#FFFFFF'
                        : theme.colors.textMuted,
                  },
                ]}
              >
                {successCount}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  statusFilter === 'DENIED'
                    ? theme.colors.danger
                    : theme.colors.surface,
                borderColor:
                  statusFilter === 'DENIED'
                    ? theme.colors.danger
                    : theme.colors.border,
              },
            ]}
            onPress={() => {
              safeHaptic.selection();
              setStatusFilter('DENIED');
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                {
                  color:
                    statusFilter === 'DENIED'
                      ? '#FFFFFF'
                      : theme.colors.text,
                },
                theme.typography.caption,
              ]}
            >
              {t('staff.accessLog.filterDenied')}
            </Text>
            <View
              style={[
                styles.chipCountBadge,
                {
                  backgroundColor:
                    statusFilter === 'DENIED'
                      ? 'rgba(255, 255, 255, 0.25)'
                      : theme.colors.surfaceSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipCountText,
                  {
                    color:
                      statusFilter === 'DENIED'
                        ? '#FFFFFF'
                        : theme.colors.textMuted,
                  },
                ]}
              >
                {deniedCount}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Timeline Content */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
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
        >
          {groupedDays.length > 0 ? (
            groupedDays.map((group, groupIdx) => (
              <AnimatedEntrance key={group.dateHeader} index={groupIdx}>
                <View style={styles.dayGroup}>
                  {/* Day Date Header Pill */}
                  <View style={styles.dayHeaderRow}>
                    <View
                      style={[
                        styles.dayHeaderPill,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayHeaderText,
                          { color: theme.colors.textMuted },
                          theme.typography.caption,
                        ]}
                      >
                        {group.dateHeader}
                      </Text>
                    </View>
                  </View>

                  {/* Day items with vertical timeline line */}
                  <View style={styles.timelineList}>
                    {group.items.map((item, itemIdx) => {
                      const isSuccess = item.status === 'SUCCESS';
                      const userName = item.user
                        ? `${item.user.firstName} ${item.user.lastName}`.trim()
                        : null;
                      const unitStr = item.unit
                        ? `${item.unit.building?.blockName ? `${item.unit.building.blockName}, ` : ''}${t('staff.sos.unit')} ${item.unit.unitNumber}`
                        : null;

                      return (
                        <View key={item.id} style={styles.timelineItemWrap}>
                          {/* Left timeline connector line and dot */}
                          <View style={styles.timelineTrack}>
                            <View
                              style={[
                                styles.timelineDot,
                                {
                                  backgroundColor: isSuccess
                                    ? theme.colors.success
                                    : theme.colors.danger,
                                },
                              ]}
                            >
                              {isSuccess ? (
                                <CheckCircle2 size={12} color="#FFFFFF" />
                              ) : (
                                <XCircle size={12} color="#FFFFFF" />
                              )}
                            </View>
                            {itemIdx < group.items.length - 1 && (
                              <View
                                style={[
                                  styles.timelineLine,
                                  { backgroundColor: theme.colors.border },
                                ]}
                              />
                            )}
                          </View>

                          {/* Right event card */}
                          <Card
                            style={[
                              styles.eventCard,
                              {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                              },
                            ]}
                          >
                            <View style={styles.eventTopLine}>
                              <View style={styles.pointInfoRow}>
                                <View
                                  style={[
                                    styles.pointIconCircle,
                                    { backgroundColor: theme.colors.surfaceSubtle },
                                  ]}
                                >
                                  {getPointIcon(item.accessPoint?.type, item.action)}
                                </View>
                                <Text
                                  style={[
                                    styles.pointName,
                                    { color: theme.colors.text },
                                    theme.typography.headline,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {item.accessPoint?.name || t('staff.accessLog.unknownPoint')}
                                </Text>
                              </View>

                              <Badge
                                label={
                                  isSuccess
                                    ? t('staff.accessLog.statusSuccess')
                                    : t('staff.accessLog.statusDenied')
                                }
                                variant={isSuccess ? 'success' : 'danger'}
                                size="sm"
                              />
                            </View>

                            <Text
                              style={[
                                styles.actionName,
                                { color: theme.colors.primary },
                                theme.typography.callout,
                              ]}
                            >
                              {getActionLabel(item.action)}
                            </Text>

                            {/* Details row: User, Unit, Time */}
                            <View style={styles.eventMetaRow}>
                              {Boolean(userName) && (
                                <View style={styles.metaItem}>
                                  <User size={13} color={theme.colors.textMuted} />
                                  <Text
                                    style={[
                                      styles.metaText,
                                      { color: theme.colors.textMuted },
                                      theme.typography.caption,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {userName}
                                  </Text>
                                </View>
                              )}

                              {Boolean(unitStr) && (
                                <View style={styles.metaItem}>
                                  <Building size={13} color={theme.colors.textMuted} />
                                  <Text
                                    style={[
                                      styles.metaText,
                                      { color: theme.colors.textMuted },
                                      theme.typography.caption,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {unitStr}
                                  </Text>
                                </View>
                              )}

                              <View style={styles.metaItem}>
                                <Clock size={13} color={theme.colors.textMuted} />
                                <Text
                                  style={[
                                    styles.metaText,
                                    { color: theme.colors.textMuted },
                                    theme.typography.caption,
                                  ]}
                                >
                                  {new Date(item.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </Text>
                              </View>
                            </View>

                            {Boolean(item.note) && (
                              <Text
                                style={[
                                  styles.eventNote,
                                  { color: theme.colors.textMuted },
                                  theme.typography.caption,
                                ]}
                              >
                                {item.note}
                              </Text>
                            )}
                          </Card>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </AnimatedEntrance>
            ))
          ) : (
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
                title={t('staff.accessLog.emptyTitle')}
                description={t('staff.accessLog.emptySubtitle')}
              />
            </Card>
          )}
        </ScrollView>
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
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  dayGroup: {
    marginBottom: 16,
  },
  dayHeaderRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  dayHeaderPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayHeaderText: {
    fontWeight: '600',
  },
  timelineList: {
    paddingLeft: 4,
  },
  timelineItemWrap: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timelineTrack: {
    width: 28,
    alignItems: 'center',
    marginRight: 8,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -2,
    marginBottom: -16,
  },
  eventCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
  },
  eventTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pointInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  pointIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  pointName: {
    fontWeight: '700',
    flex: 1,
  },
  actionName: {
    fontWeight: '600',
    marginBottom: 8,
  },
  eventMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontWeight: '500',
  },
  eventNote: {
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyCard: {
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
});
