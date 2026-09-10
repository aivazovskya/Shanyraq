import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth, canAccessLogs } from '../../context/AuthContext';
import { AccessApi, AccessLogItem } from '../../api/access';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import {
  ArrowLeft,
  Search,
  Shield,
  ShieldAlert,
  KeyRound,
  Video,
  DoorOpen,
  Car,
  Clock,
  User,
  Building,
  AlertCircle,
  FileText,
} from 'lucide-react-native';

type StatusFilter = 'ALL' | 'SUCCESS' | 'DENIED';

export const StaffAccessLogScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [logs, setLogs] = useState<AccessLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasAccess = canAccessLogs(user?.role);

  const fetchLogs = useCallback(async () => {
    if (!user?.tenantId || !hasAccess) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const data = await AccessApi.getAccessLogs(user.tenantId);
      setLogs(data);
    } catch (e: any) {
      console.warn('Failed to load access logs:', e);
      setError(t('staff.accessLog.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantId, hasAccess, t]);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
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

  const getActionIcon = (action: string, pointType?: string) => {
    if (action === 'VIEW_CAMERA' || pointType === 'CAMERA') {
      return <Video size={18} color="#0284C7" />;
    }
    if (action === 'GUEST_CODE_ENTRY') {
      return <KeyRound size={18} color="#D97706" />;
    }
    if (action === 'OPEN_INTERCOM' || pointType === 'DOOR_INTERCOM') {
      return <DoorOpen size={18} color="#7C3AED" />;
    }
    return <Car size={18} color={Colors.primary} />;
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (statusFilter !== 'ALL' && log.status !== statusFilter) {
        return false;
      }

      if (!searchQuery.trim()) {
        return true;
      }

      const q = searchQuery.toLowerCase();
      const pointName = (log.accessPoint?.name || '').toLowerCase();
      const actionName = (log.action || '').toLowerCase();
      const userName = [log.user?.firstName, log.user?.lastName, log.user?.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const unitNumber = (log.unit?.unitNumber || '').toLowerCase();
      const blockName = (log.unit?.building?.blockName || '').toLowerCase();
      const note = (log.note || '').toLowerCase();

      return (
        pointName.includes(q) ||
        actionName.includes(q) ||
        userName.includes(q) ||
        unitNumber.includes(q) ||
        blockName.includes(q) ||
        note.includes(q)
      );
    });
  }, [logs, statusFilter, searchQuery]);

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('staff.accessLog.title')}</Text>
        </View>
        <View style={styles.unauthorizedContainer}>
          <Card style={styles.unauthorizedCard}>
            <ShieldAlert size={48} color={Colors.danger} style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.unauthorizedTitle}>{t('staff.accessLog.unauthorizedTitle')}</Text>
            <Text style={styles.unauthorizedMsg}>{t('staff.accessLog.unauthorizedMsg')}</Text>
            <Button
              title={t('common.back')}
              onPress={() => navigation.goBack()}
              variant="outline"
              style={{ marginTop: 16 }}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !refreshing) {
    return <LoadingState message={t('common.loading')} />;
  }

  const renderLogItem = ({ item }: { item: AccessLogItem }) => {
    const isSuccess = item.status === 'SUCCESS';
    const isDenied = item.status === 'DENIED';

    const formattedTime = new Date(item.createdAt).toLocaleString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const userFullName = [item.user?.firstName, item.user?.lastName].filter(Boolean).join(' ');
    const unitLabel = item.unit
      ? `${item.unit.building?.blockName ? `${item.unit.building.blockName}, ` : ''}${t('common.unitShort')} ${item.unit.unitNumber}`
      : null;

    return (
      <Card style={styles.logCard}>
        {/* Header row: Action + Status Badge */}
        <View style={styles.logHeader}>
          <View style={styles.actionGroup}>
            <View style={styles.actionIconContainer}>
              {getActionIcon(item.action, item.accessPoint?.type)}
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>{getActionLabel(item.action)}</Text>
              <Text style={styles.accessPointName}>
                {item.accessPoint?.name || t('staff.accessLog.unknownPoint')}
              </Text>
            </View>
          </View>
          <Badge
            label={isSuccess ? t('staff.accessLog.statusSuccess') : isDenied ? t('staff.accessLog.statusDenied') : item.status}
            variant={isSuccess ? 'success' : isDenied ? 'danger' : 'default'}
          />
        </View>

        {/* Details section */}
        <View style={styles.logDetails}>
          {userFullName ? (
            <View style={styles.metaRow}>
              <User size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{userFullName}</Text>
              {item.user?.phone && (
                <Text style={styles.metaSubText}>({item.user.phone})</Text>
              )}
            </View>
          ) : null}

          {unitLabel ? (
            <View style={styles.metaRow}>
              <Building size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{unitLabel}</Text>
            </View>
          ) : null}

          {item.note ? (
            <View style={styles.metaRow}>
              <FileText size={14} color={Colors.textMuted} />
              <Text style={styles.noteText}>{item.note}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer: Timestamp */}
        <View style={styles.logFooter}>
          <Clock size={12} color={Colors.textMuted} />
          <Text style={styles.timeText}>{formattedTime}</Text>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('staff.accessLog.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {user?.tenant?.name || t('staff.complexInfo')}
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Input
          placeholder={t('staff.accessLog.searchPlaceholder')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Search size={18} color={Colors.textMuted} />}
          style={styles.searchInput}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            onPress={() => setStatusFilter('ALL')}
            style={[styles.filterChip, statusFilter === 'ALL' && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === 'ALL' && styles.filterChipTextActive,
              ]}
            >
              {t('staff.accessLog.filterAll')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStatusFilter('SUCCESS')}
            style={[styles.filterChip, statusFilter === 'SUCCESS' && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === 'SUCCESS' && styles.filterChipTextActive,
              ]}
            >
              {t('staff.accessLog.statusSuccess')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStatusFilter('DENIED')}
            style={[styles.filterChip, statusFilter === 'DENIED' && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === 'DENIED' && styles.filterChipTextActive,
              ]}
            >
              {t('staff.accessLog.statusDenied')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Error Banner */}
      {error && (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <AlertCircle size={18} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <Button
            title={t('common.retry')}
            onPress={fetchLogs}
            variant="outline"
            size="sm"
            style={{ marginTop: 8 }}
          />
        </Card>
      )}

      {/* Access Logs List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.emptyCard}>
              <Shield size={40} color={Colors.textMuted} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>{t('staff.accessLog.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('staff.accessLog.emptySubtitle')}</Text>
            </Card>
          ) : null
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: Colors.surface,
  },
  searchInput: {
    marginBottom: 0,
  },
  filterWrapper: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  logCard: {
    padding: 14,
    marginBottom: 10,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  accessPointName: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  logDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 8,
    gap: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: Colors.text,
  },
  metaSubText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  noteText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  logFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    marginTop: 24,
  },
  emptyIcon: {
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  errorCard: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    flex: 1,
  },
  unauthorizedContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  unauthorizedCard: {
    padding: 24,
    alignItems: 'center',
  },
  unauthorizedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  unauthorizedMsg: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
