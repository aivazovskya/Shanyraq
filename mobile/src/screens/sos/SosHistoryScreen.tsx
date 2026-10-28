import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
} from 'lucide-react-native';
import { sosApi, SosAlert } from '../../api/sos';
import { useTheme } from '../../theme/ThemeContext';
import { IconButton } from '../../components/ui/IconButton';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';

export const SosHistoryScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await sosApi.getMySosAlerts();
      setAlerts(data || []);
    } catch (err) {
      console.error('Failed to load my SOS alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const renderStatusBadge = (status: SosAlert['status']) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: theme.colors.dangerBg,
                borderColor: theme.colors.dangerBorder,
                borderWidth: 1,
              },
            ]}
          >
            <AlertTriangle size={12} color={theme.colors.danger} style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: theme.colors.danger, fontWeight: '700' }]}>
              {t('sos.status.ACTIVE')}
            </Text>
          </View>
        );
      case 'RESOLVED':
        return (
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: theme.colors.successBg,
                borderColor: theme.colors.successBorder,
                borderWidth: 1,
              },
            ]}
          >
            <CheckCircle2 size={12} color={theme.colors.success} style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: theme.colors.success, fontWeight: '600' }]}>
              {t('sos.status.RESOLVED')}
            </Text>
          </View>
        );
      case 'FALSE_ALARM':
        return (
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
                borderWidth: 1,
              },
            ]}
          >
            <XCircle size={12} color={theme.colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: theme.colors.textMuted, fontWeight: '600' }]}>
              {t('sos.status.FALSE_ALARM')}
            </Text>
          </View>
        );
    }
  };

  const renderItem = ({ item }: { item: SosAlert }) => {
    let formattedDate = item.createdAt;
    try {
      formattedDate = new Date(item.createdAt).toLocaleString([], {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      // fallback
    }

    return (
      <Card
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.dateRow}>
            <Clock size={14} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.dateText, { color: theme.colors.textMuted }]}>{formattedDate}</Text>
          </View>
          {renderStatusBadge(item.status)}
        </View>

        {item.unit && (
          <Text style={[styles.unitText, { color: theme.colors.text }]}>
            {item.unit.building?.blockName ? `${item.unit.building.blockName}, ` : ''}
            {t('common.unitShort')} {item.unit.unitNumber}
          </Text>
        )}

        {item.resolutionNote ? (
          <View
            style={[
              styles.noteBox,
              {
                backgroundColor: theme.colors.surfaceSubtle,
                borderLeftColor: theme.colors.success,
              },
            ]}
          >
            <Text style={[styles.noteLabel, { color: theme.colors.textMuted }]}>
              {t('sos.resolutionNoteLabel')}:
            </Text>
            <Text style={[styles.noteContent, { color: theme.colors.text }]}>
              {item.resolutionNote}
            </Text>
            {item.resolvedBy && (
              <Text style={[styles.resolverText, { color: theme.colors.textMuted }]}>
                {t('sos.resolvedBy')}: {item.resolvedBy.firstName} {item.resolvedBy.lastName}
              </Text>
            )}
          </View>
        ) : item.status === 'ACTIVE' ? (
          <View
            style={[
              styles.activeAlertNotice,
              {
                backgroundColor: theme.colors.dangerBg,
                borderColor: theme.colors.dangerBorder,
              },
            ]}
          >
            <Text style={[styles.activeNoticeText, { color: theme.colors.danger }]}>
              {t('sos.activeNotice')}
            </Text>
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: 1,
          },
        ]}
      >
        <IconButton
          icon={<ArrowLeft size={22} color={theme.colors.text} />}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
          variant="ghost"
          size={44}
        />
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('sos.historyTitle')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonList count={4} />
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <EmptyState
            title={t('sos.noHistoryAlerts')}
            description={t('sos.emptyHistorySubtitle')}
          />
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadAlerts(true)}
              tintColor={theme.colors.danger}
              colors={[theme.colors.danger]}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  skeletonContainer: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
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
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  noteBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  noteLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  noteContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  resolverText: {
    fontSize: 11,
    marginTop: 4,
  },
  activeAlertNotice: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  activeNoticeText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
