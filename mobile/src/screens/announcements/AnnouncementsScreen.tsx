import { ScreenHero } from '../../components/common/ScreenHero';
import { FilterChips } from '../../components/common/FilterChips';
import { Button } from '../../components/common/Button';
import { LoadError } from '../../components/common/LoadError';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { AnnouncementsApi, AnnouncementItem } from '../../api/announcements';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { Bell, AlertTriangle, ArrowLeft } from 'lucide-react-native';

export const AnnouncementsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [filter, setFilter] = useState<'ALL' | 'URGENT'>('ALL');
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestVersion = useRef(0);
  const fetching = useRef(false);

  const fetchNews = useCallback(async () => {
    if (fetching.current) return;
    const version = ++requestVersion.current;
    if (!tenantId) {
      setLoadFailed(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    fetching.current = true;
    try {
      const data = await AnnouncementsApi.getAnnouncements(tenantId);
      if (version !== requestVersion.current) return;
      setAnnouncements(data);
      setLoadFailed(false);
    } catch (e) {
      if (version !== requestVersion.current) return;
      setLoadFailed(true);
      console.warn('Failed to load announcements:', e);
    } finally {
      if (version === requestVersion.current) {
        fetching.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    setAnnouncements([]);
    setLoadFailed(false);
    setLoading(true);
    void fetchNews();
    return () => { ++requestVersion.current; fetching.current = false; };
  }, [fetchNews]);

  const onRefresh = () => {
    if (fetching.current) return;
    setRefreshing(true);
    fetchNews();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('announcements.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        ListHeaderComponent={<>
          <ScreenHero title={t('residentUi.newsTitle')} subtitle={t('residentUi.newsHint')} />
          <FilterChips value={filter} onChange={setFilter} options={[{ value: 'ALL', label: t('common.all') }, { value: 'URGENT', label: t('residentUi.importantNews') }]} />
          {loadFailed && <LoadError message={!tenantId ? t('common.noComplex') : undefined} onRetry={onRefresh} retrying={refreshing} />}
        </>}
        data={filter === 'URGENT' ? announcements.filter(item => item.isUrgent) : announcements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={loading ? <LoadingState message={t('announcements.loadingNews')} /> : loadFailed ? undefined :
          <View style={styles.emptyContainer}>
            <Bell color={Colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>{t(filter === 'URGENT' ? 'common.noMatches' : 'announcements.emptyNewsTitle')}</Text>
            <Text style={styles.emptySubtitle}>
              {t(filter === 'URGENT' ? 'common.changeFilters' : 'announcements.emptyNewsSubtitle')}
            </Text>
            {filter === 'URGENT' && <Button title={t('common.resetFilters')} onPress={() => setFilter('ALL')} variant="outline" style={{ marginTop: 16 }} />}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={[styles.card, item.isUrgent && styles.urgentCard]}>
            <View style={styles.cardHeader}>
              {item.isUrgent ? (
                <View style={styles.urgentBadge}>
                  <AlertTriangle color="#DC2626" size={14} />
                  <Text style={styles.urgentBadgeText}>{t('announcements.urgentBadgeText')}</Text>
                </View>
              ) : (
                <Badge label={t('announcements.regularBadgeText')} variant="info" />
              )}
              <Text style={styles.dateText}>
                {new Date(item.createdAt).toLocaleDateString(i18n.language)}
              </Text>
            </View>

            <Text style={[styles.newsTitle, item.isUrgent && styles.urgentTitle]}>
              {item.title}
            </Text>
            <Text style={styles.newsContent}>{item.content}</Text>

            <View style={styles.cardFooter}>
              <Text style={styles.authorText}>
                {item.author?.firstName} {item.author?.lastName}
              </Text>
            </View>
          </Card>
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
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  urgentCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  urgentBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textLight,
  },
  newsTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  urgentTitle: {
    color: '#991B1B',
  },
  newsContent: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 23,
    marginBottom: 12,
  },
  cardFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  authorText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
