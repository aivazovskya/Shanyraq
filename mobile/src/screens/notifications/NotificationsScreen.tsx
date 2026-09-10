import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { NotificationsApi, NotificationItem } from '../../api/notifications';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Bell, CheckCheck, ChevronRight } from 'lucide-react-native';

export const NotificationsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isStaffRole } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const [items, countRes] = await Promise.all([
        NotificationsApi.getNotifications({ take: 50 }),
        NotificationsApi.getUnreadCount(),
      ]);
      setNotifications(items || []);
      setUnreadCount(countRes.unreadCount ?? countRes.count ?? 0);
    } catch (e) {
      console.warn('Failed to load notifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    try {
      await NotificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.warn('Failed to mark all as read:', e);
    }
  };

  const handleItemPress = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await NotificationsApi.markAsRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.warn('Failed to mark notification as read:', e);
      }
    }

    // Actionable deep linking
    const data = item.data;
    if (!data) return;

    const type = data.type || '';
    if (type.includes('SOS') || data.alertId) {
      navigation.navigate('SosHistory');
    } else if (type.includes('CHAT') || data.conversationId) {
      if (isStaffRole && data.conversationId) {
        navigation.navigate('StaffChatThread', {
          conversationId: data.conversationId,
          residentName: data.senderName,
          unitInfo: data.unitInfo,
        });
      } else {
        navigation.navigate('Chat');
      }
    } else if (type.includes('REQUEST') || data.requestId) {
      navigation.navigate('RequestDetail', {
        requestId: data.requestId,
      });
    } else if (type.includes('VOTING') || type.includes('MEETING') || data.meetingId) {
      navigation.navigate('VotingDetails', {
        meetingId: data.meetingId,
      });
    } else if (type.includes('ANNOUNCEMENT') || data.announcementId) {
      navigation.navigate('Announcements');
    } else if (type.includes('BOOKING') || data.bookingId) {
      navigation.navigate('Bookings');
    } else if (type.includes('BILL') || type.includes('PAYMENT') || data.invoiceId) {
      navigation.navigate('FinanceAccount');
    }
  };

  const formatRelativeTime = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
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

  if (loading) {
    return <LoadingState message={t('common.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
          {unreadCount > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            style={styles.markAllButton}
          >
            <CheckCheck size={18} color={Colors.primary} />
            <Text style={styles.markAllText}>{t('notifications.markAllAsRead')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Bell size={36} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
            <Text style={styles.emptySubtitle}>{t('notifications.emptySubtitle')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.notificationItem,
              !item.isRead && styles.unreadItem,
            ]}
            onPress={() => handleItemPress(item)}
            activeOpacity={0.7}
          >
            {/* Status dot */}
            <View style={styles.indicatorContainer}>
              <View
                style={[
                  styles.unreadDot,
                  { backgroundColor: !item.isRead ? Colors.primary : 'transparent' },
                ]}
              />
            </View>

            {/* Content */}
            <View style={styles.itemContent}>
              <View style={styles.itemHeader}>
                <Text
                  style={[
                    styles.itemTitle,
                    !item.isRead && styles.itemTitleUnread,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text style={styles.itemTime}>
                  {formatRelativeTime(item.createdAt)}
                </Text>
              </View>
              <Text style={styles.itemBody} numberOfLines={3}>
                {item.body}
              </Text>
            </View>

            {/* Chevron */}
            <View style={styles.chevronContainer}>
              <ChevronRight size={16} color={Colors.textMuted} />
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
    padding: 4,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
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
    width: 32,
  },
  listContent: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unreadItem: {
    backgroundColor: '#F0F9FF',
  },
  indicatorContainer: {
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
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
    paddingTop: 100,
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
