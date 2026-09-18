import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { ChatApi, Conversation } from '../../api/chat';
import { Badge } from '../../components/common/Badge';
import { createRealtimeSocket } from '../../lib/socket';
import { Socket } from 'socket.io-client';
import { Colors } from '../../constants/colors';
import {
  MessageSquare,
  Search,
  User,
  Image as ImageIcon,
  Clock,
  ChevronRight,
  RefreshCw,
} from 'lucide-react-native';

type FilterStatus = 'ALL' | 'UNRESOLVED' | 'RESOLVED';

export const StaffChatInboxScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const tenantId = user?.tenantId || user?.tenant?.id || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterStatus>('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadConversations = useCallback(
    async (isSilent = false, filterOverride?: FilterStatus) => {
      if (!tenantId) return;
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setErrorMsg(null);

      const activeFilter = filterOverride ?? selectedFilter;
      const resolvedParam =
        activeFilter === 'UNRESOLVED' ? false : activeFilter === 'RESOLVED' ? true : undefined;

      try {
        const data = await ChatApi.getTenantConversations(tenantId, resolvedParam);
        setConversations(data || []);
      } catch (err: any) {
        console.error('Failed to load tenant conversations:', err);
        if (!isSilent) {
          setErrorMsg(err?.response?.data?.message || t('staff.chat.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, selectedFilter, t],
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
          // Reconciliation fetch on initial connect
          loadConversations(true);
        });

        socket.on('reconnect', () => {
          socket?.emit('chat:join', { tenantId });
          // Reconciliation fetch on reconnect
          loadConversations(true);
        });

        socket.on('chat:inbox:conversation-status', (payload: {
          conversationId: string;
          isResolved: boolean;
          resolvedAt: string | null;
          resolvedById: string | null;
        }) => {
          if (!payload || !payload.conversationId) return;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === payload.conversationId
                ? {
                    ...c,
                    isResolved: payload.isResolved,
                    resolvedAt: payload.resolvedAt,
                    resolvedById: payload.resolvedById,
                  }
                : c,
            ),
          );
        });

        socket.on('chat:inbox:message', (payload: any) => {
          const role = payload?.message?.sender?.role;
          if (payload?.conversationId && (!role || role === 'RESIDENT' || role === 'RESIDENT_OWNER' || role === 'RESIDENT_TENANT')) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.conversationId
                  ? { ...c, isResolved: false, resolvedAt: null, resolvedById: null }
                  : c,
              ),
            );
          }
          // Re-fetch conversations and unread counts upon new incoming message
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
    }, [tenantId, loadConversations]),
  );

  const formatMessageTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const residentName = `${c.resident?.firstName || ''} ${c.resident?.lastName || ''}`.toLowerCase();
    const phone = (c.resident?.phone || '').toLowerCase();
    const unit = (c.resident?.ownerships?.[0]?.unit?.unitNumber || '').toLowerCase();
    const block = (c.resident?.ownerships?.[0]?.unit?.building?.blockName || '').toLowerCase();

    return (
      residentName.includes(q) ||
      phone.includes(q) ||
      unit.includes(q) ||
      block.includes(q)
    );
  });

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const resident = item.resident;
    const residentName = resident
      ? `${resident.firstName} ${resident.lastName}`.trim() || resident.phone
      : t('staff.chat.resident');

    const primaryUnit = resident?.ownerships?.[0]?.unit;
    const unitInfo = primaryUnit
      ? `${primaryUnit.building?.blockName ? primaryUnit.building.blockName + ', ' : ''}${t('common.unitShort')} ${primaryUnit.unitNumber}`
      : null;

    const unreadCount = item.unreadCount || 0;
    const lastMsg = item.lastMessage;
    const timeStr = lastMsg ? formatMessageTime(lastMsg.createdAt) : formatMessageTime(item.updatedAt);

    const handlePress = () => {
      navigation.navigate('StaffChatThread', {
        conversationId: item.id,
        residentName,
        unitInfo: unitInfo || undefined,
        isResolved: item.isResolved,
      });
    };

    return (
      <TouchableOpacity
        style={[styles.conversationRow, unreadCount > 0 && styles.conversationRowUnread]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={[styles.avatarCircle, unreadCount > 0 && styles.avatarCircleUnread]}>
          <User color={unreadCount > 0 ? Colors.primary : Colors.textMuted} size={22} />
        </View>

        <View style={styles.conversationInfo}>
          <View style={styles.nameTimeRow}>
            <View style={styles.nameWithBadge}>
              <Text style={[styles.residentName, unreadCount > 0 && styles.residentNameBold]}>
                {residentName}
              </Text>
              {item.isResolved && (
                <Badge
                  label={t('staff.chat.resolvedBadge')}
                  variant="success"
                  style={styles.resolvedBadge}
                />
              )}
            </View>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>

          {unitInfo && <Text style={styles.unitText}>{unitInfo}</Text>}

          <View style={styles.previewRow}>
            {lastMsg?.photoUrl && (
              <View style={styles.photoIndicator}>
                <ImageIcon size={13} color={Colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={styles.previewText}>{t('staff.chat.photoAttachment')}</Text>
              </View>
            )}
            {lastMsg?.text && (
              <Text
                style={[styles.previewText, unreadCount > 0 && styles.previewTextUnread]}
                numberOfLines={1}
              >
                {lastMsg.text}
              </Text>
            )}
            {!lastMsg && (
              <Text style={styles.emptyPreviewText}>{t('staff.chat.noConversationsSub')}</Text>
            )}

            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>

        <ChevronRight size={18} color={Colors.textLight} style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.headerIconCircle}>
            <MessageSquare size={20} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{t('staff.chat.inboxTitle')}</Text>
            <Text style={styles.headerSubtitle}>
              {user?.tenant?.name || t('staff.chat.inboxSubtitle')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => loadConversations(false)}
          disabled={refreshing}
          style={styles.refreshBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <RefreshCw
            size={18}
            color={refreshing ? Colors.primary : Colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Search size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('staff.chat.searchPlaceholder')}
          placeholderTextColor={Colors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(
            [
              { key: 'ALL', label: t('staff.chat.filterAll') },
              { key: 'UNRESOLVED', label: t('staff.chat.filterUnresolved') },
              { key: 'RESOLVED', label: t('staff.chat.filterResolved') },
            ] as const
          ).map((opt) => {
            const isActive = selectedFilter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  setSelectedFilter(opt.key);
                  loadConversations(false, opt.key);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.centerContainer}>
          <MessageSquare size={48} color={Colors.border} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>{t('staff.chat.noConversations')}</Text>
          <Text style={styles.emptySubtitle}>{t('staff.chat.noConversationsSub')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadConversations(true)}
              colors={[Colors.primary]}
            />
          }
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  refreshBtn: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 0,
  },
  filterSection: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
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
  errorBox: {
    backgroundColor: Colors.dangerBg,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  conversationRowUnread: {
    borderColor: Colors.primary,
    backgroundColor: '#F0FDF4',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarCircleUnread: {
    backgroundColor: Colors.primaryLight,
  },
  conversationInfo: {
    flex: 1,
  },
  nameTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  nameWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
    marginRight: 8,
  },
  residentName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  resolvedBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  residentNameBold: {
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  unitText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  previewText: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  previewTextUnread: {
    color: Colors.text,
    fontWeight: '600',
  },
  emptyPreviewText: {
    fontSize: 13,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 8,
  },
});
