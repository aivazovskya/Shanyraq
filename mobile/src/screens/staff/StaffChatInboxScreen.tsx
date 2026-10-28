import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { ChatApi, Conversation } from '../../api/chat';
import { createRealtimeSocket } from '../../lib/socket';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Input,
  Avatar,
  EmptyState,
  SkeletonList,
  AnimatedEntrance,
} from '../../components/ui';
import {
  MessageSquare,
  Search,
  ChevronRight,
  CheckCircle2,
  Image as ImageIcon,
} from 'lucide-react-native';

type FilterStatus = 'ALL' | 'UNRESOLVED' | 'RESOLVED';

export const StaffChatInboxScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const tenantId = user?.tenantId || user?.tenant?.id || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterStatus>('ALL');

  const loadConversations = useCallback(
    async (isSilent = false) => {
      if (!tenantId) return;
      if (!isSilent) setLoading(true);

      try {
        const data = await ChatApi.getTenantConversations(tenantId);
        setConversations(data || []);
      } catch (err: any) {
        console.warn('Failed to load tenant conversations:', err);
      } finally {
        if (!isSilent) setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  // Real-time WebSocket connection to tenant inbox room
  useFocusEffect(
    useCallback(() => {
      let socket: Socket | null = null;
      let active = true;

      const initSocket = async () => {
        if (!tenantId) return;
        await loadConversations();
        if (!active) return;

        socket = await createRealtimeSocket();
        if (!socket || !active) return;

        socket.on('connect', () => {
          socket?.emit('chat:join', { tenantId });
          loadConversations(true);
        });

        socket.on('reconnect', () => {
          socket?.emit('chat:join', { tenantId });
          loadConversations(true);
        });

        socket.on('chat:message', () => {
          safeHaptic.selection();
          loadConversations(true);
        });
      };

      initSocket();

      return () => {
        active = false;
        if (socket) {
          socket.emit('chat:leave', { tenantId });
          socket.disconnect();
        }
      };
    }, [tenantId, loadConversations])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    loadConversations(true);
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Filter status
      if (selectedFilter === 'UNRESOLVED' && c.isResolved) return false;
      if (selectedFilter === 'RESOLVED' && !c.isResolved) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const residentName = c.resident
          ? `${c.resident.firstName} ${c.resident.lastName}`.toLowerCase()
          : '';
        const unitNumber = c.resident?.ownerships?.[0]?.unit?.unitNumber?.toLowerCase() || '';
        const blockName = c.resident?.ownerships?.[0]?.unit?.building?.blockName?.toLowerCase() || '';
        const lastMsg = c.lastMessage?.text?.toLowerCase() || '';
        return (
          residentName.includes(q) ||
          unitNumber.includes(q) ||
          blockName.includes(q) ||
          lastMsg.includes(q)
        );
      }
      return true;
    });
  }, [conversations, selectedFilter, searchQuery]);

  const unresolvedCount = useMemo(
    () => conversations.filter((c) => !c.isResolved).length,
    [conversations]
  );
  const resolvedCount = useMemo(
    () => conversations.filter((c) => c.isResolved).length,
    [conversations]
  );

  const renderItem = ({ item, index }: { item: Conversation; index: number }) => {
    const resident = item.resident;
    const residentName = resident
      ? `${resident.firstName} ${resident.lastName}`.trim()
      : t('staff.chat.resident');
    const residentUnit = resident?.ownerships?.[0]?.unit;
    const unitStr = residentUnit
      ? `${residentUnit.building?.blockName ? `${residentUnit.building.blockName}, ` : ''}${t('staff.sos.unit')} ${residentUnit.unitNumber}`
      : undefined;

    const unreadCount = item.unreadCount ?? 0;
    const hasPhoto = Boolean(item.lastMessage?.photoUrl);
    const lastMsgText = item.lastMessage?.text || (hasPhoto ? t('staff.chat.photoAttachment') : '—');

    return (
      <AnimatedEntrance index={index}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            safeHaptic.selection();
            navigation.navigate('StaffChatThread', {
              conversationId: item.id,
              residentName,
              unitInfo: unitStr,
              isResolved: item.isResolved,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={`${residentName}, ${unreadCount > 0 ? `${unreadCount} unread` : ''}`}
        >
          <Card
            style={[
              styles.convCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: unreadCount > 0 ? theme.colors.primary : theme.colors.border,
                borderWidth: unreadCount > 0 ? 1.5 : 1,
              },
            ]}
          >
            <View style={styles.cardContentRow}>
              {/* Resident Avatar */}
              <Avatar
                name={residentName}
                size="md"
                style={styles.avatar}
              />

              {/* Middle text */}
              <View style={styles.cardTextWrap}>
                <View style={styles.cardTopLine}>
                  <Text
                    style={[
                      styles.residentName,
                      { color: theme.colors.text },
                      theme.typography.headline,
                    ]}
                    numberOfLines={1}
                  >
                    {residentName}
                  </Text>
                  {item.lastMessage?.createdAt && (
                    <Text
                      style={[
                        styles.timeText,
                        { color: theme.colors.textMuted },
                        theme.typography.caption,
                      ]}
                    >
                      {new Date(item.lastMessage.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  )}
                </View>

                {Boolean(unitStr) && (
                  <Text
                    style={[
                      styles.unitText,
                      { color: theme.colors.textMuted },
                      theme.typography.caption,
                    ]}
                    numberOfLines={1}
                  >
                    {unitStr}
                  </Text>
                )}

                <View style={styles.lastMsgRow}>
                  {hasPhoto && (
                    <ImageIcon
                      size={14}
                      color={theme.colors.primary}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.lastMsgText,
                      {
                        color: unreadCount > 0 ? theme.colors.text : theme.colors.textMuted,
                        fontWeight: unreadCount > 0 ? '600' : '400',
                      },
                      theme.typography.callout,
                    ]}
                    numberOfLines={1}
                  >
                    {lastMsgText}
                  </Text>
                </View>
              </View>

              {/* Right status badge / chevron */}
              <View style={styles.cardRightWrap}>
                {unreadCount > 0 ? (
                  <Badge
                    label={`${unreadCount}`}
                    variant="primary"
                    size="sm"
                  />
                ) : item.isResolved ? (
                  <Badge
                    label={t('staff.chat.resolvedBadge')}
                    variant="success"
                    size="sm"
                  />
                ) : (
                  <ChevronRight size={18} color={theme.colors.textMuted} />
                )}
              </View>
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
        <View style={styles.headerTitleRow}>
          <View
            style={[
              styles.headerIconCircle,
              { backgroundColor: theme.colors.primaryBg },
            ]}
          >
            <MessageSquare size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text
              style={[
                styles.title,
                { color: theme.colors.text },
                theme.typography.title,
              ]}
            >
              {t('staff.chat.inboxTitle')}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
            >
              {t('staff.chat.inboxSubtitle')}
            </Text>
          </View>
        </View>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Input
            label={t('common.search')}
            placeholder={t('staff.chat.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={<Search size={18} color={theme.colors.textMuted} />}
          />
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <FilterChip
            label={t('staff.chat.filterAll')}
            count={conversations.length}
            isSelected={selectedFilter === 'ALL'}
            onPress={() => {
              safeHaptic.selection();
              setSelectedFilter('ALL');
            }}
          />
          <FilterChip
            label={t('staff.chat.filterUnresolved')}
            count={unresolvedCount}
            isSelected={selectedFilter === 'UNRESOLVED'}
            onPress={() => {
              safeHaptic.selection();
              setSelectedFilter('UNRESOLVED');
            }}
          />
          <FilterChip
            label={t('staff.chat.filterResolved')}
            count={resolvedCount}
            isSelected={selectedFilter === 'RESOLVED'}
            onPress={() => {
              safeHaptic.selection();
              setSelectedFilter('RESOLVED');
            }}
          />
        </ScrollView>
      </View>

      {/* Conversations List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
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
                title={t('staff.chat.noConversations')}
                description={t('staff.chat.noConversationsSub')}
              />
            </Card>
          }
        />
      )}
    </View>
  );
};

interface FilterChipProps {
  label: string;
  count: number;
  isSelected: boolean;
  onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({
  label,
  count,
  isSelected,
  onPress,
}) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} (${count})`}
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
        {label}
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
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    gap: 10,
  },
  convCard: {
    padding: 14,
    borderRadius: 16,
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 12,
  },
  cardTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  cardTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  residentName: {
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontWeight: '400',
  },
  unitText: {
    fontWeight: '500',
    marginBottom: 4,
  },
  lastMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMsgText: {
    flex: 1,
  },
  cardRightWrap: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 28,
  },
  emptyCard: {
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
});
