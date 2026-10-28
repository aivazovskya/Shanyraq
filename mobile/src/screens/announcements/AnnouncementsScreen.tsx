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
import { useAuth } from '../../context/AuthContext';
import { AnnouncementsApi, AnnouncementItem } from '../../api/announcements';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import { roleLabel } from '../../lib/role-label';
import {
  Card,
  Badge,
  IconButton,
  EmptyState,
  SkeletonList,
  AnimatedEntrance,
} from '../../components/ui';
import {
  ArrowLeft,
  Bell,
  AlertTriangle,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

export const AnnouncementsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tenantId =
    user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const fetchNews = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      const data = await AnnouncementsApi.getAnnouncements(tenantId);
      setAnnouncements(data || []);
    } catch (e) {
      console.warn('Failed to load announcements:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const onRefresh = () => {
    setRefreshing(true);
    safeHaptic.selection();
    fetchNews();
  };

  const toggleExpand = (id: string) => {
    safeHaptic.selection();
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('announcements.title')}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 32 },
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
              title={t('announcements.emptyNewsTitle')}
              description={t('announcements.emptyNewsSubtitle')}
            />
          }
          renderItem={({ item, index }) => {
            const isExpanded = Boolean(expandedIds[item.id]);
            const formattedDate = new Date(item.createdAt).toLocaleDateString(
              i18n.language,
              { day: 'numeric', month: 'long', year: 'numeric' }
            );

            const isLong = item.content.length > 120;
            const authorRole = roleLabel(item.author?.role, t);

            return (
              <AnimatedEntrance index={Math.min(index, 6)}>
                <Card
                  style={[
                    styles.card,
                    item.isUrgent
                      ? {
                          backgroundColor: theme.colors.dangerBg,
                          borderColor: theme.colors.dangerBorder,
                        }
                      : {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                  ]}
                >
                  {/* Card Header: Importance Badge + Date */}
                  <View style={styles.cardHeader}>
                    {item.isUrgent ? (
                      <Badge
                        label={t('announcements.urgentBadgeText')}
                        variant="danger"
                        size="sm"
                        showDot
                      />
                    ) : (
                      <Badge
                        label={t('announcements.regularBadgeText')}
                        variant="info"
                        size="sm"
                      />
                    )}

                    <View style={styles.dateRow}>
                      <Clock size={12} color={theme.colors.textLight} />
                      <Text
                        style={[
                          styles.dateText,
                          { color: theme.colors.textLight },
                        ]}
                      >
                        {formattedDate}
                      </Text>
                    </View>
                  </View>

                  {/* Title */}
                  <Text
                    style={[
                      styles.annTitle,
                      {
                        color: item.isUrgent
                          ? theme.colors.danger
                          : theme.colors.text,
                      },
                    ]}
                  >
                    {item.title}
                  </Text>

                  {/* Content (collapsible) */}
                  <Text
                    style={[
                      styles.annContent,
                      { color: theme.colors.text },
                    ]}
                    numberOfLines={isExpanded ? undefined : 3}
                  >
                    {item.content}
                  </Text>

                  {/* Expand / Collapse Action */}
                  {isLong && (
                    <TouchableOpacity
                      onPress={() => toggleExpand(item.id)}
                      style={styles.expandBtn}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isExpanded
                          ? t('announcements.showLess')
                          : t('announcements.readMore')
                      }
                    >
                      <Text
                        style={[
                          styles.expandText,
                          {
                            color: item.isUrgent
                              ? theme.colors.danger
                              : theme.colors.primary,
                          },
                        ]}
                      >
                        {isExpanded
                          ? t('announcements.showLess')
                          : t('announcements.readMore')}
                      </Text>
                      {isExpanded ? (
                        <ChevronUp
                          size={16}
                          color={
                            item.isUrgent
                              ? theme.colors.danger
                              : theme.colors.primary
                          }
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                          color={
                            item.isUrgent
                              ? theme.colors.danger
                              : theme.colors.primary
                          }
                        />
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Footer: Author Info */}
                  <View
                    style={[
                      styles.cardFooter,
                      { borderTopColor: theme.colors.border },
                    ]}
                  >
                    <View style={styles.authorRow}>
                      <User size={14} color={theme.colors.textLight} />
                      <Text
                        style={[
                          styles.authorText,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        {item.author.firstName} {item.author.lastName}
                        {authorRole ? ` (${authorRole})` : ''}
                      </Text>
                    </View>
                  </View>
                </Card>
              </AnimatedEntrance>
            );
          }}
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
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  loadingContainer: {
    padding: 16,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  annTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  annContent: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    marginBottom: 6,
  },
  expandText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 4,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
