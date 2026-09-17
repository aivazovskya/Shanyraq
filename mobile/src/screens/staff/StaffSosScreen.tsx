import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { sosApi, SosAlert, SosStatistics } from '../../api/sos';
import { createRealtimeSocket } from '../../lib/socket';
import { Socket } from 'socket.io-client';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  MapPin,
  ExternalLink,
  Shield,
  RefreshCw,
  Home,
  X,
  Send,
} from 'lucide-react-native';

export const StaffSosScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation();

  const tenantId = user?.tenantId || user?.tenant?.id || '';
  const isChairman = user?.role === 'HOA_CHAIRMAN';

  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [stats, setStats] = useState<SosStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal resolution state
  const [selectedAlert, setSelectedAlert] = useState<SosAlert | null>(null);
  const [targetStatus, setTargetStatus] = useState<'RESOLVED' | 'FALSE_ALARM'>('RESOLVED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);

  // Update local elapsed time every 10 seconds (no server polling)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadAlerts = useCallback(
    async (isSilent = false) => {
      if (!tenantId) return;
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setErrorMsg(null);

      try {
        const data = await sosApi.getTenantSosAlerts(tenantId);
        setAlerts(data || []);
      } catch (err: any) {
        console.error('Failed to load tenant SOS alerts:', err);
        if (!isSilent) {
          setErrorMsg(err?.response?.data?.message || t('staff.sos.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, t],
  );

  const loadStats = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await sosApi.getStatistics(tenantId);
      setStats(data);
    } catch (err) {
      console.warn('Failed to load SOS statistics:', err);
      // Fails silently per decision #5
    }
  }, [tenantId]);

  // Real-time WebSocket connection while screen is focused
  useFocusEffect(
    useCallback(() => {
      let socket: Socket | null = null;
      let active = true;

      const initSocket = async () => {
        if (!tenantId) return;
        await loadAlerts();
        if (!active) return;

        socket = await createRealtimeSocket();
        if (!socket || !active) return;

        socket.on('connect', () => {
          socket?.emit('sos:join', { tenantId });
          // Reconciliation fetch on initial connect
          loadAlerts(true);
        });

        socket.on('reconnect', () => {
          socket?.emit('sos:join', { tenantId });
          // Reconciliation fetch on reconnect
          loadAlerts(true);
        });

        socket.on('sos:alert:triggered', (newAlert: SosAlert) => {
          setAlerts((prev) => {
            const index = prev.findIndex((a) => a.id === newAlert.id);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = newAlert;
              return updated;
            }
            return [newAlert, ...prev];
          });
        });

        socket.on('sos:alert:updated', (updatedAlert: SosAlert) => {
          setAlerts((prev) =>
            prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)),
          );
        });
      };

      initSocket();
      loadStats();

      return () => {
        active = false;
        if (socket) {
          socket.emit('sos:leave', { tenantId });
          socket.disconnect();
        }
      };
    }, [tenantId, loadAlerts, loadStats]),
  );

  const formatElapsed = (createdAtStr: string) => {
    const diffSec = Math.max(0, Math.floor((now - new Date(createdAtStr).getTime()) / 1000));
    if (diffSec < 60) return `${diffSec} ${t('staff.sos.timeSec')}`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} ${t('staff.sos.timeMin')}`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours} ${t('staff.sos.timeHour')} ${diffMin % 60} ${t('staff.sos.timeMin')}`;
  };

  const handleOpenResolveModal = (alert: SosAlert, status: 'RESOLVED' | 'FALSE_ALARM') => {
    if (isChairman) return;
    setSelectedAlert(alert);
    setTargetStatus(status);
    setResolutionNote('');
  };

  const handleConfirmResolve = async () => {
    if (!selectedAlert) return;
    setResolving(true);
    try {
      const updated = await sosApi.resolveSosAlert(selectedAlert.id, {
        status: targetStatus,
        note: resolutionNote.trim() || undefined,
      });

      // Update state in place
      setAlerts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a)),
      );

      setSelectedAlert(null);
      await loadAlerts(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || t('staff.sos.resolveError');
      Alert.alert(t('common.error'), msg);
    } finally {
      setResolving(false);
    }
  };

  const handleCall = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn('Failed to open dialer:', err),
    );
  };

  const handleOpenMap = (lat?: number | null, lng?: number | null) => {
    if (lat == null || lng == null) return;
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch((err) =>
      console.warn('Failed to open maps:', err),
    );
  };

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const historyAlerts = alerts.filter((a) => a.status !== 'ACTIVE');

  const renderActiveCard = (alert: SosAlert) => {
    const residentName = alert.triggeredBy
      ? `${alert.triggeredBy.firstName} ${alert.triggeredBy.lastName}`.trim()
      : t('staff.sos.residentFallback');
    const phone = alert.triggeredBy?.phone;
    const unitStr = alert.unit
      ? `${alert.unit.building?.blockName ? alert.unit.building.blockName + ', ' : ''}${t('common.unitShort')} ${alert.unit.unitNumber}`
      : null;
    const hasCoords = alert.latitude != null && alert.longitude != null;

    return (
      <View key={alert.id} style={styles.activeCard}>
        {/* Elapsed Time Badge */}
        <View style={styles.elapsedBadge}>
          <Clock size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.elapsedText}>{formatElapsed(alert.createdAt)}</Text>
        </View>

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.alertIconCircle}>
            <AlertTriangle size={22} color="#DC2626" />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.residentName}>{residentName}</Text>
            <Text style={styles.activeStatusLabel}>{t('staff.sos.status.ACTIVE')}</Text>
          </View>
        </View>

        {/* Details Box */}
        <View style={styles.detailsBox}>
          {unitStr && (
            <View style={styles.detailRow}>
              <Home size={15} color={Colors.textMuted} style={styles.detailIcon} />
              <Text style={styles.detailTextBold}>{unitStr}</Text>
            </View>
          )}

          {phone && (
            <TouchableOpacity
              style={styles.detailRow}
              onPress={() => handleCall(phone)}
              activeOpacity={0.7}
            >
              <Phone size={15} color={Colors.primary} style={styles.detailIcon} />
              <Text style={styles.phoneText}>{phone}</Text>
              <Text style={styles.callHint}>({t('staff.sos.callResident')})</Text>
            </TouchableOpacity>
          )}

          <View style={styles.detailRow}>
            <Clock size={15} color={Colors.textMuted} style={styles.detailIcon} />
            <Text style={styles.detailText}>
              {new Date(alert.createdAt).toLocaleTimeString()} ({new Date(alert.createdAt).toLocaleDateString()})
            </Text>
          </View>

          <View style={styles.detailRow}>
            <MapPin size={15} color={hasCoords ? Colors.danger : Colors.textMuted} style={styles.detailIcon} />
            {hasCoords ? (
              <TouchableOpacity
                onPress={() => handleOpenMap(alert.latitude, alert.longitude)}
                style={styles.mapLink}
                activeOpacity={0.7}
              >
                <Text style={styles.mapText}>
                  {t('staff.sos.viewOnMap')} ({alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)})
                </Text>
                <ExternalLink size={12} color={Colors.danger} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.noLocationText}>{t('staff.sos.noLocation')}</Text>
            )}
          </View>
        </View>

        {/* Action Buttons for non-chairman staff */}
        {!isChairman && (
          <View style={styles.activeActionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.resolveBtn]}
              onPress={() => handleOpenResolveModal(alert, 'RESOLVED')}
              activeOpacity={0.8}
            >
              <CheckCircle2 size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.resolveBtnText}>{t('staff.sos.resolveAction')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.falseAlarmBtn]}
              onPress={() => handleOpenResolveModal(alert, 'FALSE_ALARM')}
              activeOpacity={0.8}
            >
              <XCircle size={16} color={Colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.falseAlarmBtnText}>{t('staff.sos.falseAlarmAction')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderHistoryItem = ({ item }: { item: SosAlert }) => {
    const residentName = item.triggeredBy
      ? `${item.triggeredBy.firstName} ${item.triggeredBy.lastName}`.trim()
      : '—';
    const resolverName = item.resolvedBy
      ? `${item.resolvedBy.firstName} ${item.resolvedBy.lastName}`.trim()
      : '—';
    const unitStr = item.unit
      ? `${item.unit.building?.blockName ? item.unit.building.blockName + ', ' : ''}${t('common.unitShort')} ${item.unit.unitNumber}`
      : null;

    const isResolved = item.status === 'RESOLVED';

    return (
      <View style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <View style={styles.historyTimeRow}>
            <Clock size={13} color={Colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={styles.historyTimeText}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </View>
          <Badge
            label={isResolved ? t('staff.sos.status.RESOLVED') : t('staff.sos.status.FALSE_ALARM')}
            variant={isResolved ? 'success' : 'default'}
          />
        </View>

        <Text style={styles.historyResident}>{residentName}</Text>
        {unitStr && <Text style={styles.historyUnit}>{unitStr}</Text>}

        {item.resolutionNote && (
          <View style={styles.historyNoteBox}>
            <Text style={styles.historyNoteLabel}>{t('staff.sos.resolutionNoteLabel')}:</Text>
            <Text style={styles.historyNoteText}>{item.resolutionNote}</Text>
            <Text style={styles.historyResolverText}>
              {t('staff.sos.resolvedBy')}: {resolverName}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.headerIconCircle}>
            <AlertTriangle size={20} color="#DC2626" />
          </View>
          <View>
            <Text style={styles.headerTitle}>{t('staff.sos.title')}</Text>
            <Text style={styles.headerSubtitle}>
              {user?.tenant?.name || t('staff.sos.subtitle')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => {
            loadAlerts(false);
            loadStats();
          }}
          disabled={refreshing}
          style={styles.refreshBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <RefreshCw
            size={18}
            color={refreshing ? Colors.danger : Colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Chairman Notice */}
      {isChairman && (
        <View style={styles.chairmanNoticeBanner}>
          <Shield size={16} color="#B45309" style={{ marginRight: 6 }} />
          <Text style={styles.chairmanNoticeText}>{t('staff.sos.readOnlyNotice')}</Text>
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#DC2626" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                loadAlerts(true);
                loadStats();
              }}
              colors={['#DC2626']}
            />
          }
        >
          {/* Mini Stats Summary (Task 0080) */}
          {stats && (
            <View style={styles.statsContainer}>
              {/* Card 1: 30-day Total Alerts */}
              <View style={styles.statCard}>
                <Text style={styles.statCardValue}>{stats.totalAlerts}</Text>
                <Text style={styles.statCardLabel}>{t('staff.sos.stats.total30d')}</Text>
                <Text style={styles.statCardSub} numberOfLines={1}>
                  {stats.byStatus.RESOLVED} {t('staff.sos.status.RESOLVED').toLowerCase()} · {stats.byStatus.FALSE_ALARM} {t('staff.sos.status.FALSE_ALARM').toLowerCase()}
                </Text>
              </View>

              {/* Card 2: Active Alerts Now (from live alerts list) */}
              <View style={[styles.statCard, activeAlerts.length > 0 && styles.statCardActiveAlert]}>
                <Text style={[styles.statCardValue, activeAlerts.length > 0 && styles.statCardValueAlert]}>
                  {activeAlerts.length}
                </Text>
                <Text style={styles.statCardLabel}>{t('staff.sos.stats.activeNow')}</Text>
                <Text style={styles.statCardSub} numberOfLines={1}>
                  {activeAlerts.length > 0 ? t('staff.sos.stats.requiresAttention') : t('staff.sos.stats.allClear')}
                </Text>
              </View>

              {/* Card 3: Avg Response Time */}
              <View style={styles.statCard}>
                <Text style={styles.statCardValue}>
                  {stats.averageResponseTimeMinutes > 0 ? stats.averageResponseTimeMinutes : '0'}
                  <Text style={styles.statCardUnit}> {t('staff.sos.timeMin')}</Text>
                </Text>
                <Text style={styles.statCardLabel}>{t('staff.sos.stats.avgResponseTime')}</Text>
                <Text style={styles.statCardSub} numberOfLines={1}>
                  {t('staff.sos.stats.resolvedOnly')}
                </Text>
              </View>
            </View>
          )}

          {/* Active Alerts Section */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>{t('staff.sos.activeAlerts')}</Text>
              <View
                style={[
                  styles.activeCountBadge,
                  activeAlerts.length > 0 ? styles.activeCountPulse : styles.activeCountEmpty,
                ]}
              >
                <Text style={styles.activeCountText}>{activeAlerts.length}</Text>
              </View>
            </View>
          </View>

          {activeAlerts.length === 0 ? (
            <View style={styles.emptyActiveBox}>
              <CheckCircle2 size={36} color={Colors.success} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyActiveTitle}>{t('staff.sos.noActiveAlerts')}</Text>
              <Text style={styles.emptyActiveSubtitle}>{t('staff.sos.allAlertsHandled')}</Text>
            </View>
          ) : (
            activeAlerts.map(renderActiveCard)
          )}

          {/* History Section */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>{t('staff.sos.history')}</Text>
          </View>

          {historyAlerts.length === 0 ? (
            <View style={styles.emptyHistoryBox}>
              <Text style={styles.emptyHistoryText}>{t('staff.sos.noHistoryAlerts')}</Text>
            </View>
          ) : (
            historyAlerts.map((item) => (
              <React.Fragment key={item.id}>
                {renderHistoryItem({ item })}
              </React.Fragment>
            ))
          )}
        </ScrollView>
      )}

      {/* Resolution Modal */}
      <Modal visible={Boolean(selectedAlert)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('staff.sos.resolveModalTitle')}</Text>
              <TouchableOpacity
                onPress={() => setSelectedAlert(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedAlert && (
              <View style={styles.modalBody}>
                {/* Caller summary */}
                <View style={styles.modalSummaryBox}>
                  <Text style={styles.modalSummaryText}>
                    <Text style={styles.boldText}>{t('staff.sos.residentFallback')}: </Text>
                    {selectedAlert.triggeredBy
                      ? `${selectedAlert.triggeredBy.firstName} ${selectedAlert.triggeredBy.lastName}`
                      : '—'}
                  </Text>
                  {selectedAlert.unit && (
                    <Text style={styles.modalSummaryText}>
                      <Text style={styles.boldText}>{t('staff.sos.unit')}: </Text>
                      {t('common.unitShort')} {selectedAlert.unit.unitNumber}
                    </Text>
                  )}
                </View>

                {/* Status Toggle */}
                <View style={styles.statusToggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      targetStatus === 'RESOLVED' && styles.statusToggleActiveResolved,
                    ]}
                    onPress={() => setTargetStatus('RESOLVED')}
                  >
                    <CheckCircle2
                      size={16}
                      color={targetStatus === 'RESOLVED' ? '#FFFFFF' : Colors.textMuted}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.statusToggleText,
                        targetStatus === 'RESOLVED' && styles.statusToggleTextActive,
                      ]}
                    >
                      {t('staff.sos.status.RESOLVED')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      targetStatus === 'FALSE_ALARM' && styles.statusToggleActiveFalse,
                    ]}
                    onPress={() => setTargetStatus('FALSE_ALARM')}
                  >
                    <XCircle
                      size={16}
                      color={targetStatus === 'FALSE_ALARM' ? '#FFFFFF' : Colors.textMuted}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.statusToggleText,
                        targetStatus === 'FALSE_ALARM' && styles.statusToggleTextActive,
                      ]}
                    >
                      {t('staff.sos.status.FALSE_ALARM')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Resolution note */}
                <Text style={styles.inputLabel}>{t('staff.sos.resolutionNoteLabel')}</Text>
                <TextInput
                  value={resolutionNote}
                  onChangeText={setResolutionNote}
                  placeholder={t('staff.sos.resolutionNotePlaceholder')}
                  placeholderTextColor={Colors.textLight}
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                />

                {/* Actions */}
                <View style={styles.modalActions}>
                  <Button
                    title={t('common.cancel')}
                    variant="outline"
                    onPress={() => setSelectedAlert(null)}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                  <Button
                    title={resolving ? t('staff.sos.resolving') : t('staff.sos.confirmResolve')}
                    onPress={handleConfirmResolve}
                    disabled={resolving}
                    style={{
                      flex: 1.5,
                      backgroundColor: targetStatus === 'RESOLVED' ? '#16A34A' : Colors.warning,
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#FEE2E2',
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
  chairmanNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  chairmanNoticeText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  errorBox: {
    backgroundColor: Colors.dangerBg,
    padding: 12,
    margin: 16,
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
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCardActiveAlert: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  statCardValue: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  statCardValueAlert: {
    color: Colors.danger,
  },
  statCardUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  statCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  statCardSub: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  activeCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCountPulse: {
    backgroundColor: '#DC2626',
  },
  activeCountEmpty: {
    backgroundColor: Colors.border,
  },
  activeCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyActiveBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyActiveTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyActiveSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  activeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#EF4444',
    padding: 16,
    marginBottom: 14,
    position: 'relative',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  elapsedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#DC2626',
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  elapsedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingRight: 80,
  },
  alertIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  residentName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  activeStatusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  detailsBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: 8,
  },
  detailText: {
    fontSize: 13,
    color: Colors.text,
  },
  detailTextBold: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  phoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  callHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 6,
  },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.danger,
  },
  noLocationText: {
    fontSize: 13,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  activeActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  resolveBtn: {
    backgroundColor: '#16A34A',
  },
  resolveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  falseAlarmBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  falseAlarmBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyTimeText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  historyResident: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  historyUnit: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  historyNoteBox: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  historyNoteLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  historyNoteText: {
    fontSize: 13,
    color: Colors.text,
    marginTop: 2,
  },
  historyResolverText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyHistoryBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  modalBody: {
    gap: 12,
  },
  modalSummaryBox: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  modalSummaryText: {
    fontSize: 13,
    color: Colors.text,
  },
  boldText: {
    fontWeight: '600',
  },
  statusToggleContainer: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 4,
  },
  statusToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  statusToggleActiveResolved: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  statusToggleActiveFalse: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  statusToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  statusToggleTextActive: {
    color: '#FFFFFF',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.text,
    textAlignVertical: 'top',
    height: 72,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
});
