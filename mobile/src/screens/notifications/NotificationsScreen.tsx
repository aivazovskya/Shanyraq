import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth, canAccessChat, canAccessRequests } from '../../context/AuthContext';
import { getNotificationTarget } from '../../navigation/notification-target';
import { getApiErrorMessage } from '../../api/client';
import { LoadError } from '../../components/common/LoadError';
import { NotificationsApi, NotificationItem } from '../../api/notifications';
import { LoadingState } from '../../components/common/LoadingState';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Bell, CheckCheck, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';

export const NotificationsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isStaffRole, user } = useAuth();
  const capabilities = { staff: isStaffRole, chat: canAccessChat(user?.role), requests: canAccessRequests(user?.role) };

  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingReads, setPendingReads] = useState(0);
  const reading = useRef(new Set<string>());
  const confirmedReads = useRef(new Set<string>());
  const marking = useRef(false);
  const active = useRef(true);
  const opening = useRef(false);
  const fetching = useRef(false);
  const requestVersion = useRef(0);
  const readVersion = useRef(0);
  const visibleNotifications = filter === 'UNREAD' ? notifications.filter(item => !item.isRead) : notifications;
  const hasUnread = (unreadCount ?? 0) > 0 || notifications.some((item) => !item.isRead);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; ++requestVersion.current; };
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (fetching.current || marking.current || reading.current.size > 0) return;
    fetching.current = true;
    const version = ++requestVersion.current;
    const reads = readVersion.current;
    try {
      const [items, countRes] = await Promise.allSettled([
        NotificationsApi.getNotifications({ take: 50 }),
        NotificationsApi.getUnreadCount(),
      ]);
      if (!active.current || version !== requestVersion.current || reads !== readVersion.current) return;
      if (items.status === 'fulfilled') {
        for (const item of items.value || []) if (item.isRead) confirmedReads.current.add(item.id);
        setNotifications(items.value || []);
        setLoadFailed(false);
      } else setLoadFailed(true);
      if (countRes.status === 'fulfilled') setUnreadCount(countRes.value.unreadCount ?? countRes.value.count ?? null);
      else setUnreadCount(null);
    } catch (e) {
      if (!active.current || version !== requestVersion.current) return;
      setLoadFailed(true);
      console.warn('Failed to load notifications:', e);
    } finally {
      if (version === requestVersion.current) {
        fetching.current = false;
        if (active.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      opening.current = false;
      void fetchNotifications();
      return () => {
        ++requestVersion.current;
        fetching.current = false;
        setRefreshing(false);
      };
    }, [fetchNotifications])
  );

  const onRefresh = () => {
    if (fetching.current || marking.current || reading.current.size > 0) return;
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    if (marking.current || reading.current.size > 0) return;
    marking.current = true;
    ++readVersion.current;
    setMarkingAll(true);
    setActionError(null);
    try {
      await NotificationsApi.markAllAsRead();
      ++readVersion.current;
      if (!active.current) return;
      for (const item of notifications) confirmedReads.current.add(item.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.warn('Failed to mark all as read:', e);
      if (active.current) setActionError(getApiErrorMessage(e));
    } finally {
      marking.current = false;
      if (active.current) setMarkingAll(false);
    }
  };

  const handleItemPress = async (item: NotificationItem) => {
    const target = getNotificationTarget(item.data, capabilities);
    if (target) {
      if (opening.current) return;
      opening.current = true;
      navigation.navigate(target.name, target.params);
    } else {
      setExpandedId((previous) => previous === item.id ? null : item.id);
    }

    if (!item.isRead && !confirmedReads.current.has(item.id) && !marking.current && !reading.current.has(item.id)) {
      reading.current.add(item.id);
      ++readVersion.current;
      setPendingReads(reading.current.size);
      setActionError(null);
      try {
        await NotificationsApi.markAsRead(item.id);
        confirmedReads.current.add(item.id);
        ++readVersion.current;
        if (!active.current) return;
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => prev === null ? null : Math.max(0, prev - 1));
      } catch (e) {
        console.warn('Failed to mark notification as read:', e);
        if (active.current) setActionError(getApiErrorMessage(e));
      } finally {
        reading.current.delete(item.id);
        if (active.current) setPendingReads(reading.current.size);
      }
    }
  };

  const formatRelativeTime = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      if (!Number.isFinite(date.getTime())) return '';
      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - date.getTime());
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 1) return t('notifications.justNow');
      if (diffMinutes < 60) return t('notifications.minutesAgo', { count: diffMinutes });
      if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
      return t('notifications.daysAgo', { count: diffDays });
    } catch {
      return '';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
          {unreadCount !== null && unreadCount > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.filters}>
        {(['ALL', 'UNREAD'] as const).map(value => <TouchableOpacity key={value} onPress={() => setFilter(value)} accessibilityRole="tab" aria-selected={filter === value} accessibilityState={{ selected: filter === value }} style={[styles.filter, filter === value && styles.filterActive]}>
          <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{t(value === 'ALL' ? 'common.all' : 'notifications.filterUnread')}</Text>
        </TouchableOpacity>)}
      </View>
      {notifications.length === 50 && <Text style={styles.limitHint}>{t('notifications.latestItems')}</Text>}
      {hasUnread && !loading && <View style={styles.toolbar}>
          <TouchableOpacity
            onPress={handleMarkAllRead}
            disabled={markingAll || pendingReads > 0 || refreshing}
            accessibilityRole="button"
            accessibilityState={{ busy: markingAll, disabled: markingAll || pendingReads > 0 || refreshing }}
            style={styles.markAllButton}
          >
            {markingAll ? <ActivityIndicator size="small" color={Colors.primary} /> : <CheckCheck size={18} color={Colors.primary} />}
            <Text style={styles.markAllText}>{t(markingAll ? 'common.loading' : 'notifications.markAllAsRead')}</Text>
          </TouchableOpacity>
      </View>}

      {/* Notifications List */}
      {actionError && <Text accessibilityLiveRegion="polite" style={{ color: Colors.danger, paddingHorizontal: 20, paddingVertical: 12 }}>{actionError}</Text>}
      <FlatList
        ListHeaderComponent={loadFailed ? <LoadError onRetry={onRefresh} retrying={refreshing} /> : undefined}
        data={visibleNotifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={loading ? <LoadingState /> : loadFailed ? undefined :
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Bell size={36} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t(filter === 'UNREAD' ? 'notifications.emptyUnread' : 'notifications.empty')}</Text>
            <Text style={styles.emptySubtitle}>{t(filter === 'UNREAD' ? 'notifications.emptyUnreadSubtitle' : 'notifications.emptySubtitle')}
            </Text>
            {filter === 'UNREAD' && <Button title={t('common.all')} variant="outline" onPress={() => setFilter('ALL')} style={{ marginTop: 16 }} />}

          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.body}`}
            accessibilityHint={getNotificationTarget(item.data, capabilities) ? undefined : t('notifications.expandHint')}
            accessibilityState={{ busy: reading.current.has(item.id), expanded: getNotificationTarget(item.data, capabilities) ? undefined : expandedId === item.id }}
            style={[
              styles.notificationItem,
              !item.isRead && styles.unreadItem,
            ]}
            onPress={() => handleItemPress(item)}
            activeOpacity={0.7}
          >
            {/* Status dot */}
            <View style={styles.indicatorContainer}>
              {reading.current.has(item.id) ? <ActivityIndicator size="small" color={Colors.primary} /> : <View
                style={[
                  styles.unreadDot,
                  { backgroundColor: !item.isRead ? Colors.primary : 'transparent' },
                ]}
              />}
            </View>

            {/* Content */}
            <View style={styles.itemContent}>
              <View style={styles.itemHeader}>
                <Text
                  style={[
                    styles.itemTitle,
                    !item.isRead && styles.itemTitleUnread,
                  ]}
                  numberOfLines={expandedId === item.id ? undefined : 2}
                >
                  {item.title}
                </Text>
                <Text style={styles.itemTime}>
                  {formatRelativeTime(item.createdAt)}
                </Text>
              </View>
              <Text style={styles.itemBody} numberOfLines={expandedId === item.id ? undefined : 3}>
                {item.body}
              </Text>
            </View>

            {/* Chevron */}
            <View style={styles.chevronContainer}>
              {getNotificationTarget(item.data, capabilities)
                ? <ChevronRight size={16} color={Colors.textMuted} />
                : expandedId === item.id
                  ? <ChevronUp size={16} color={Colors.textMuted} />
                  : <ChevronDown size={16} color={Colors.textMuted} />}
            </View>
          </TouchableOpacity>
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  badgeContainer: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  markAllButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 44,
  },
  toolbar: { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  filter: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  limitHint: { fontSize: 12, color: Colors.textMuted, paddingHorizontal: 20, paddingBottom: 8 },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 22,
    marginBottom: 12,
  },
  unreadItem: {
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.primaryBg,
  },
  indicatorContainer: {
    width: 10,
    alignItems: 'center',
    paddingTop: 5,
    marginRight: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  itemTitleUnread: {
    fontWeight: '700',
    color: Colors.text,
  },
  itemTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  itemBody: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  chevronContainer: {
    paddingTop: 12,
    paddingLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
