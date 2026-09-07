import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { AnnouncementsApi, AnnouncementItem } from '../../api/announcements';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { Bell, AlertTriangle, ArrowLeft } from 'lucide-react-native';

export const AnnouncementsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      const data = await AnnouncementsApi.getAnnouncements(tenantId);
      setAnnouncements(data);
    } catch (e) {
      console.warn('Failed to load announcements:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [tenantId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNews();
  };

  if (loading) {
    return <LoadingState message="Загрузка новостей ЖК..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Новости и оповещения</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Bell color={Colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>Новостей пока нет</Text>
            <Text style={styles.emptySubtitle}>
              Здесь будут публиковаться объявления управляющей компании, отчеты и информация об отключениях
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={[styles.card, item.isUrgent && styles.urgentCard]}>
            <View style={styles.cardHeader}>
              {item.isUrgent ? (
                <View style={styles.urgentBadge}>
                  <AlertTriangle color="#DC2626" size={14} />
                  <Text style={styles.urgentBadgeText}>ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ</Text>
                </View>
              ) : (
                <Badge label="Объявление" variant="info" />
              )}
              <Text style={styles.dateText}>
                {new Date(item.createdAt).toLocaleDateString('ru-RU')}
              </Text>
            </View>

            <Text style={[styles.newsTitle, item.isUrgent && styles.urgentTitle]}>
              {item.title}
            </Text>
            <Text style={styles.newsContent}>{item.content}</Text>

            <View style={styles.cardFooter}>
              <Text style={styles.authorText}>
                {item.author.firstName} {item.author.lastName} ({item.author.role})
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
    padding: 4,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 12,
  },
  urgentCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
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
    fontSize: 17,
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
    lineHeight: 20,
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
