import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { NotificationsApi, NotificationItem } from '../../api/notifications';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  IconButton,
  EmptyState,
  SkeletonList,
  AnimatedEntrance,
} from '../../components/ui';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  ChevronRight,
  AlertTriangle,
  MessageSquare,
  Wrench,
  Vote,
  CreditCard,
  Calendar,
  Check,
} from 'lucide-react-native';

interface NotificationCardProps {
  item: NotificationItem;
  onPress: () => void;
  onMarkRead: () => void;
}

const NotificationCardItem: React.FC<NotificationCardProps> = ({
  item,
  onPress,
  onMarkRead,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  const translateX = useSharedValue(0);

  const triggerMarkRead = () => {
    safeHaptic.selection();
    onMarkRead();
    translateX.value = withSpring(0);
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return !item.isRead && Math.abs(gesture.dx) > 15 && Math.abs(gesture.dy) < 15;
      },
      onPanResponderMove: (_, gesture) => {
        if (!item.isRead && gesture.dx < 0) {
          translateX.value = Math.max(gesture.dx, -80);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (!item.isRead && gesture.dx < -50) {
          runOnJS(triggerMarkRead)();
        } else {
          translateX.value = withSpring(0);
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }), [translateX]);

  const getNotificationIcon = () => {
    const type = item.data?.type || '';
    if (type.includes('SOS')) {
      return <AlertTriangle size={20} color={theme.colors.danger} />;
    }
    if (type.includes('CHAT')) {
      return <MessageSquare size={20} color={theme.colors.primary} />;
    }
    if (type.includes('REQUEST')) {
      return <Wrench size={20} color={theme.colors.info} />;
    }
    if (type.includes('VOTING')) {
      return <Vote size={20} color={theme.colors.warning} />;
    }
    if (type.includes('BILL') || type.includes('FINANCE')) {
      return <CreditCard size={20} color={theme.colors.success} />;
    }
    return <Bell size={20} color={theme.colors.primary} />;
  };

  const timeFormatted = new Date(item.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.cardContainer} {...panResponder.panHandlers}>
      {/* Background action button revealed on swipe */}
      {!item.isRead && (
        <View
          style={[
            styles.swipeActionBg,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <Check size={20} color={theme.colors.onPrimary} />
          <Text
            style={[
              styles.swipeActionText,
              { color: theme.colors.onPrimary },
            ]}
          >
            {t('notifications.markAsRead')}
          </Text>
        </View>
      )}

      <Animated.View style={animatedStyle}>
        <Card
          onPress={onPress}
          style={[
            styles.itemCard,
            {
              backgroundColor: item.isRead
                ? theme.colors.surface
                : theme.colors.primaryBg,
              borderColor: item.isRead
                ? theme.colors.border
                : theme.colors.primary,
            },
          ]}
          accessibilityLabel={`${item.title}. ${item.body}`}
        >
          <View style={styles.cardRow}>
            {/* Icon */}
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: item.isRead
                    ? theme.colors.surfaceSubtle
                    : theme.colors.primaryBg,
                },
              ]}
            >
              {getNotificationIcon()}
            </View>

            {/* Texts */}
            <View style={styles.textWrap}>
              <View style={styles.titleRow}>
                <Text
                  style={[
                    styles.itemTitle,
                    {
                      color: theme.colors.text,
                      fontWeight: item.isRead ? '600' : '800',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>

                {!item.isRead && (
                  <View
                    style={[
                      styles.unreadDot,
                      { backgroundColor: theme.colors.primary },
                    ]}
                  />
                )}
              </View>

              <Text
                style={[styles.itemBody, { color: theme.colors.textMuted }]}
                numberOfLines={2}
              >
                {item.body}
              </Text>

              <Text
                style={[styles.itemTime, { color: theme.colors.textLight }]}
              >
                {timeFormatted}
              </Text>
            </View>

            <ChevronRight size={18} color={theme.colors.textLight} />
          </View>
        </Card>
      </Animated.View>
    </View>
  );
};

export const NotificationsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
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
    safeHaptic.selection();
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    safeHaptic.selection();
    try {
      await NotificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      safeHaptic.notification();
    } catch (e) {
      console.warn('Failed to mark all as read:', e);
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await NotificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.warn('Failed to mark as read:', e);
    }
  };

  const handleItemPress = async (item: NotificationItem) => {
    if (!item.isRead) {
      handleMarkSingleRead(item.id);
    }

    safeHaptic.selection();

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

  // Group notifications into Today, Yesterday, Earlier
  const sections = useMemo(() => {
    const today: NotificationItem[] = [];
    const yesterday: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    notifications.forEach((item) => {
      const itemTime = new Date(item.createdAt).getTime();
      if (itemTime >= todayStart) {
        today.push(item);
      } else if (itemTime >= yesterdayStart) {
        yesterday.push(item);
      } else {
        earlier.push(item);
      }
    });

    const result = [];
    if (today.length > 0) {
      result.push({ title: t('notifications.sectionToday'), data: today });
    }
    if (yesterday.length > 0) {
      result.push({ title: t('notifications.sectionYesterday'), data: yesterday });
    }
    if (earlier.length > 0) {
      result.push({ title: t('notifications.sectionEarlier'), data: earlier });
    }
    return result;
  }, [notifications, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <IconButton
          icon={<ArrowLeft color={theme.colors.text} size={22} />}
          onPress={() => navigation.goBack()}
          variant="ghost"
          accessibilityLabel={t('common.back')}
        />
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {t('notifications.title')}
          </Text>
          {unreadCount > 0 && (
            <Badge
              label={t('notifications.unreadBadge', { count: unreadCount })}
              variant="primary"
              size="sm"
            />
          )}
        </View>

        {unreadCount > 0 ? (
          <IconButton
            icon={<CheckCheck size={20} color={theme.colors.primary} />}
            onPress={handleMarkAllRead}
            variant="surface"
            accessibilityLabel={t('notifications.markAllAsRead')}
          />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonList count={5} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title={t('notifications.empty')}
            description={t('notifications.emptySubtitle')}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <View
              style={[
                styles.sectionHeader,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <Text
                style={[
                  styles.sectionHeaderText,
                  { color: theme.colors.textMuted },
                ]}
              >
                {title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <NotificationCardItem
              item={item}
              onPress={() => handleItemPress(item)}
              onMarkRead={() => handleMarkSingleRead(item.id)}
            />
          )}
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
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  loadingContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionHeader: {
    paddingVertical: 10,
    marginTop: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  swipeActionBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 20,
    gap: 6,
  },
  swipeActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  itemTitle: {
    fontSize: 15,
    letterSpacing: -0.2,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  itemBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  itemTime: {
    fontSize: 11,
    fontWeight: '500',
  },
});
