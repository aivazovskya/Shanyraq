import { ScreenHero } from '../../components/common/ScreenHero';
import { FilterChips } from '../../components/common/FilterChips';
import { Button } from '../../components/common/Button';
import { LoadError } from '../../components/common/LoadError';
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, AlertTriangle, CheckCircle2, XCircle, Clock, Shield } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { sosApi, SosAlert } from '../../api/sos';

export const SosHistoryScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [filter, setFilter] = useState<'ALL' | SosAlert['status']>('ALL');
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestVersion = useRef(0);
  const fetching = useRef(false);
  const loaded = useRef(false);

  const loadAlerts = useCallback(async (isSilent = false) => {
    if (fetching.current) return;
    fetching.current = true;
    const version = ++requestVersion.current;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await sosApi.getMySosAlerts();
      if (version !== requestVersion.current) return;
      setAlerts(data || []);
      loaded.current = true;
      setLoadFailed(false);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setLoadFailed(true);
      console.error('Failed to load my SOS alerts:', err);
    } finally {
      if (version === requestVersion.current) {
        fetching.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadAlerts(loaded.current);
    return () => { ++requestVersion.current; fetching.current = false; };
  }, [loadAlerts]));

  const renderStatusBadge = (status: SosAlert['status']) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <View style={[styles.statusBadge, styles.statusActive]}>
            <AlertTriangle size={12} color="#DC2626" style={{ marginRight: 4 }} />
            <Text style={styles.statusActiveText}>{t('sos.status.ACTIVE')}</Text>
          </View>
        );
      case 'RESOLVED':
        return (
          <View style={[styles.statusBadge, styles.statusResolved]}>
            <CheckCircle2 size={12} color={Colors.success} style={{ marginRight: 4 }} />
            <Text style={styles.statusResolvedText}>{t('sos.status.RESOLVED')}</Text>
          </View>
        );
      case 'FALSE_ALARM':
        return (
          <View style={[styles.statusBadge, styles.statusFalseAlarm]}>
            <XCircle size={12} color="#6B7280" style={{ marginRight: 4 }} />
            <Text style={styles.statusFalseAlarmText}>{t('sos.status.FALSE_ALARM')}</Text>
          </View>
        );
    }
  };

  const renderItem = ({ item }: { item: SosAlert }) => {
    const formattedDate = new Date(item.createdAt).toLocaleString(i18n.language);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.dateRow}>
            <Clock size={14} color={Colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
          {renderStatusBadge(item.status)}
        </View>

        {item.unit && (
          <Text style={styles.unitText}>
            {item.unit.building?.blockName ? `${item.unit.building.blockName}, ` : ''}
            {t('common.unitShort')} {item.unit.unitNumber}
          </Text>
        )}

        {item.resolutionNote ? (
          <View style={[styles.noteBox, item.status !== 'RESOLVED' && { borderLeftColor: Colors.textMuted }]}>
            <Text style={styles.noteLabel}>{t('sos.resolutionNoteLabel')}:</Text>
            <Text selectable style={styles.noteContent}>{item.resolutionNote}</Text>
            {item.resolvedBy && (
              <Text style={styles.resolverText}>
                {t('sos.resolvedBy')}: {item.resolvedBy.firstName} {item.resolvedBy.lastName}
              </Text>
            )}
          </View>
        ) : item.status === 'ACTIVE' ? (
          <View style={styles.activeAlertNotice}>
            <Text style={styles.activeNoticeText}>{t('sos.activeNotice')}</Text>
          </View>
        ) : null}
      </View>
    );
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
        <Text style={styles.headerTitle}>{t('sos.historyTitle')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
          data={filter === 'ALL' ? alerts : alerts.filter(item => item.status === filter)}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<>
            <ScreenHero title={t('residentUi.sosHistoryTitle')} subtitle={t('residentUi.sosHistoryHint')} />
            <FilterChips value={filter} onChange={setFilter} options={(['ALL', 'ACTIVE', 'RESOLVED', 'FALSE_ALARM'] as const).map(value => ({ value, label: t(value === 'ALL' ? 'common.all' : 'sos.status.' + value) }))} />
            {loadFailed && <LoadError onRetry={() => void loadAlerts(true)} retrying={refreshing} />}
          </>}
          ListEmptyComponent={loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#DC2626" />
        </View>
      ) : loadFailed ? undefined : (
        <View style={styles.centerContainer}>
          <Shield size={48} color={Colors.border} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>{t(filter === 'ALL' ? 'sos.noHistoryAlerts' : 'common.noMatches')}</Text>
          <Text style={styles.emptySubtitle}>{t(filter === 'ALL' ? 'sos.emptyHistorySubtitle' : 'common.changeFilters')}</Text>
          {filter !== 'ALL' && <Button title={t('common.resetFilters')} onPress={() => setFilter('ALL')} variant="outline" style={{ marginTop: 16 }} />}
        </View>
      )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadAlerts(true)}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
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
    paddingTop: 12,
    paddingBottom: 16,
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
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
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#FEE2E2',
  },
  statusActiveText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  statusResolved: {
    backgroundColor: '#DCFCE7',
  },
  statusResolvedText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  statusFalseAlarm: {
    backgroundColor: '#F3F4F6',
  },
  statusFalseAlarmText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '600',
  },
  unitText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 6,
  },
  noteBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
  },
  noteLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  noteContent: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text,
  },
  resolverText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  activeAlertNotice: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  activeNoticeText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '500',
  },
});
