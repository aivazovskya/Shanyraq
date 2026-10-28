import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { sosApi, SosAlert, SosStatistics } from '../../api/sos';
import { createRealtimeSocket } from '../../lib/socket';
import { safeHaptic } from '../../lib/haptics';
import { formatTimeWaiting } from '../../utils/sla';
import {
  Card,
  Badge,
  Button,
  Input,
  EmptyState,
  SkeletonList,
  BottomSheet,
  SegmentedControl,
  AnimatedEntrance,
  CountUp,
} from '../../components/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  MapPin,
  ShieldAlert,
  Check,
  User,
} from 'lucide-react-native';

export const StaffSosScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme } = useTheme();

  const tenantId = user?.tenantId || user?.tenant?.id || '';
  const isChairman = user?.role === 'HOA_CHAIRMAN';

  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [stats, setStats] = useState<SosStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selectedTab, setSelectedTab] = useState<'ALERTS' | 'STATS'>('ALERTS');

  // BottomSheet resolution state
  const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<SosAlert | null>(null);
  const [resolveType, setResolveType] = useState<'RESOLVED' | 'FALSE_ALARM'>('RESOLVED');
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Local elapsed time refresh every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const loadAlerts = useCallback(
    async (isSilent = false) => {
      if (!tenantId) return;
      if (!isSilent) setLoading(true);

      try {
        const data = await sosApi.getTenantSosAlerts(tenantId);
        setAlerts(data || []);
      } catch (err: any) {
        console.warn('Failed to load SOS alerts:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  const loadStats = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await sosApi.getStatistics(tenantId);
      setStats(data);
    } catch (err) {
      console.warn('Failed to load SOS statistics:', err);
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
          loadAlerts(true);
        });

        socket.on('reconnect', () => {
          socket?.emit('sos:join', { tenantId });
          loadAlerts(true);
        });

        socket.on('sos:alert:triggered', (newAlert: SosAlert) => {
          safeHaptic.notification(Haptics.NotificationFeedbackType.Warning);
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
            prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a))
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
    }, [tenantId, loadAlerts, loadStats])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    loadAlerts(true);
    loadStats();
  };

  // Accept alert in work
  const handleAcceptAlert = async (alertId: string) => {
    if (isChairman || acceptingId) return;
    safeHaptic.selection();
    setAcceptingId(alertId);

    try {
      const updated = await sosApi.acceptAlert(alertId);
      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      setAlerts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
    } catch (err: any) {
      safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
      const msg = err?.response?.data?.message || t('staff.sos.acceptError');
      Alert.alert(t('common.error'), msg);
    } finally {
      setAcceptingId(null);
    }
  };

  // Open resolve BottomSheet
  const handleOpenResolveSheet = (alert: SosAlert) => {
    if (isChairman) return;
    safeHaptic.selection();
    setSelectedAlertForResolve(alert);
    setResolveType('RESOLVED');
    setResolveNote('');
  };

  // Confirm resolve
  const handleConfirmResolve = async () => {
    if (!selectedAlertForResolve || resolving) return;
    setResolving(true);
    safeHaptic.selection();

    try {
      const updated = await sosApi.resolveSosAlert(selectedAlertForResolve.id, {
        status: resolveType,
        note: resolveNote.trim() || undefined,
      });

      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      setAlerts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
      setSelectedAlertForResolve(null);
      await loadStats();
    } catch (err: any) {
      safeHaptic.notification(Haptics.NotificationFeedbackType.Error);
      const msg = err?.response?.data?.message || t('staff.sos.resolveError');
      Alert.alert(t('common.error'), msg);
    } finally {
      setResolving(false);
    }
  };

  const handleCall = (phone?: string) => {
    if (!phone) return;
    safeHaptic.selection();
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleOpenMap = (lat?: number | null, lng?: number | null) => {
    if (lat == null || lng == null) return;
    safeHaptic.selection();
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {});
  };

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const resolvedAlerts = alerts.filter((a) => a.status !== 'ACTIVE');

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: tabBarInset + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.danger}
            colors={[theme.colors.danger]}
          />
        }
      >
        {/* Header */}
        <AnimatedEntrance index={0}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View
                style={[
                  styles.headerIconBox,
                  { backgroundColor: theme.colors.dangerBg },
                ]}
              >
                <ShieldAlert size={24} color={theme.colors.danger} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text
                  style={[
                    styles.title,
                    { color: theme.colors.text },
                    theme.typography.title,
                  ]}
                >
                  {t('staff.sos.title')}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                >
                  {t('staff.sos.subtitle')}
                </Text>
              </View>
            </View>

            {isChairman && (
              <View
                style={[
                  styles.chairmanNotice,
                  {
                    backgroundColor: theme.colors.warningBg,
                    borderColor: theme.colors.warningBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chairmanNoticeText,
                    { color: theme.colors.warning },
                    theme.typography.caption,
                  ]}
                >
                  {t('staff.sos.readOnlyNotice')}
                </Text>
              </View>
            )}
          </View>
        </AnimatedEntrance>

        {/* Tab Switcher */}
        <AnimatedEntrance index={1}>
          <View style={styles.tabSwitcher}>
            <SegmentedControl<'ALERTS' | 'STATS'>
              options={[
                {
                  value: 'ALERTS',
                  label: `${t('staff.sos.tabAlerts')} (${activeAlerts.length})`,
                },
                {
                  value: 'STATS',
                  label: t('staff.sos.tabStats'),
                },
              ]}
              value={selectedTab}
              onChange={(val) => {
                safeHaptic.selection();
                setSelectedTab(val);
              }}
            />
          </View>
        </AnimatedEntrance>

        {/* Tab 1: Alerts */}
        {selectedTab === 'ALERTS' && (
          <View style={styles.tabContent}>
            {loading ? (
              <SkeletonList count={3} />
            ) : activeAlerts.length > 0 ? (
              activeAlerts.map((alert, idx) => {
                const residentName = alert.triggeredBy
                  ? `${alert.triggeredBy.firstName} ${alert.triggeredBy.lastName}`.trim()
                  : t('staff.sos.residentFallback');
                const phone = alert.triggeredBy?.phone;
                const unitStr = alert.unit
                  ? `${alert.unit.building?.blockName ? `${alert.unit.building.blockName}, ` : ''}${t('staff.sos.unit')} ${alert.unit.unitNumber}`
                  : null;
                const hasCoords = alert.latitude != null && alert.longitude != null;
                const isAccepted = Boolean(alert.acceptedById);
                const isAcceptedByMe = alert.acceptedById === user?.id;
                const acceptorName = alert.acceptedBy
                  ? `${alert.acceptedBy.firstName} ${alert.acceptedBy.lastName}`.trim()
                  : null;

                return (
                  <AnimatedEntrance key={alert.id} index={idx + 2}>
                    <Card
                      style={[
                        styles.alertCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: !isAccepted
                            ? theme.colors.danger
                            : theme.colors.border,
                          borderWidth: !isAccepted ? 2 : 1,
                        },
                      ]}
                    >
                      {/* Top Bar: Waiting Timer & Status Badge */}
                      <View style={styles.alertTopBar}>
                        <View style={styles.timerRow}>
                          <Clock size={14} color={theme.colors.danger} />
                          <Text
                            style={[
                              styles.timerText,
                              { color: theme.colors.danger },
                              theme.typography.caption,
                            ]}
                          >
                            {t('staff.sos.waitTimer', {
                              time: formatTimeWaiting(alert.createdAt, t),
                            })}
                          </Text>
                        </View>

                        {isAccepted ? (
                          <Badge
                            label={
                              isAcceptedByMe
                                ? t('staff.sos.acceptedByMe')
                                : t('staff.sos.acceptedByOther', {
                                    name: acceptorName || '—',
                                  })
                            }
                            variant={isAcceptedByMe ? 'success' : 'info'}
                            size="sm"
                          />
                        ) : (
                          <Badge
                            label={t('staff.sos.unacceptedPulse')}
                            variant="danger"
                            size="sm"
                          />
                        )}
                      </View>

                      {/* Resident Info Row */}
                      <View style={styles.residentRow}>
                        <View
                          style={[
                            styles.avatarCircle,
                            { backgroundColor: theme.colors.dangerBg },
                          ]}
                        >
                          <User size={20} color={theme.colors.danger} />
                        </View>
                        <View style={styles.residentTextWrap}>
                          <Text
                            style={[
                              styles.residentName,
                              { color: theme.colors.text },
                              theme.typography.headline,
                            ]}
                          >
                            {residentName}
                          </Text>
                          {Boolean(unitStr) && (
                            <Text
                              style={[
                                styles.unitText,
                                { color: theme.colors.textMuted },
                                theme.typography.callout,
                              ]}
                            >
                              {unitStr}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Phone & Map Quick Contacts */}
                      <View style={styles.contactsRow}>
                        {Boolean(phone) && (
                          <TouchableOpacity
                            style={[
                              styles.contactPill,
                              {
                                backgroundColor: theme.colors.surfaceSubtle,
                                borderColor: theme.colors.border,
                              },
                            ]}
                            onPress={() => handleCall(phone)}
                            accessibilityRole="button"
                            accessibilityLabel={t('staff.sos.callResident')}
                          >
                            <Phone size={14} color={theme.colors.primary} />
                            <Text
                              style={[
                                styles.contactPillText,
                                { color: theme.colors.text },
                                theme.typography.caption,
                              ]}
                            >
                              {phone}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {hasCoords && (
                          <TouchableOpacity
                            style={[
                              styles.contactPill,
                              {
                                backgroundColor: theme.colors.surfaceSubtle,
                                borderColor: theme.colors.border,
                              },
                            ]}
                            onPress={() =>
                              handleOpenMap(alert.latitude, alert.longitude)
                            }
                            accessibilityRole="button"
                            accessibilityLabel={t('staff.sos.viewOnMap')}
                          >
                            <MapPin size={14} color={theme.colors.info} />
                            <Text
                              style={[
                                styles.contactPillText,
                                { color: theme.colors.info },
                                theme.typography.caption,
                              ]}
                            >
                              {t('staff.sos.viewOnMap')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Staff Actions (Hidden for HOA_CHAIRMAN) */}
                      {!isChairman && (
                        <View style={styles.actionsRow}>
                          {!isAccepted && (
                            <Button
                              title={t('staff.sos.acceptAction')}
                              variant="primary"
                              size="md"
                              onPress={() => handleAcceptAlert(alert.id)}
                              loading={acceptingId === alert.id}
                              style={styles.actionBtn}
                              leftIcon={<Check size={16} color="#FFFFFF" />}
                            />
                          )}

                          <Button
                            title={t('staff.sos.resolveAction')}
                            variant={isAccepted ? 'primary' : 'secondary'}
                            size="md"
                            onPress={() => handleOpenResolveSheet(alert)}
                            style={styles.actionBtn}
                            leftIcon={
                              <CheckCircle2
                                size={16}
                                color={isAccepted ? '#FFFFFF' : theme.colors.primary}
                              />
                            }
                          />
                        </View>
                      )}
                    </Card>
                  </AnimatedEntrance>
                );
              })
            ) : (
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
                  title={t('staff.sos.noActiveAlerts')}
                  description={t('staff.sos.allAlertsHandled')}
                />
              </Card>
            )}

            {/* Resolved Alerts List */}
            {resolvedAlerts.length > 0 && (
              <View style={styles.resolvedSection}>
                <Text
                  style={[
                    styles.resolvedSectionTitle,
                    { color: theme.colors.textMuted },
                    theme.typography.headline,
                  ]}
                >
                  {t('staff.sos.history')}
                </Text>

                {resolvedAlerts.slice(0, 5).map((alert) => (
                  <View
                    key={alert.id}
                    style={[
                      styles.resolvedItem,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.resolvedItemTop}>
                      <Badge
                        label={
                          alert.status === 'RESOLVED'
                            ? t('staff.sos.status.RESOLVED')
                            : t('staff.sos.status.FALSE_ALARM')
                        }
                        variant={alert.status === 'RESOLVED' ? 'success' : 'neutral'}
                        size="sm"
                      />
                      <Text
                        style={[
                          styles.resolvedDate,
                          { color: theme.colors.textMuted },
                          theme.typography.caption,
                        ]}
                      >
                        {new Date(alert.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.resolvedName,
                        { color: theme.colors.text },
                        theme.typography.callout,
                      ]}
                    >
                      {alert.triggeredBy
                        ? `${alert.triggeredBy.firstName} ${alert.triggeredBy.lastName}`
                        : t('staff.sos.residentFallback')}
                    </Text>

                    {Boolean(alert.resolutionNote) && (
                      <Text
                        style={[
                          styles.resolvedNote,
                          { color: theme.colors.textMuted },
                          theme.typography.caption,
                        ]}
                      >
                        {alert.resolutionNote}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Tab 2: Statistics */}
        {selectedTab === 'STATS' && (
          <View style={styles.tabContent}>
            {stats ? (
              <AnimatedEntrance index={0}>
                {/* 30-Day Metrics Cards */}
                <View style={styles.statsGrid}>
                  <Card
                    style={[
                      styles.statTile,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statTileLabel,
                        { color: theme.colors.textMuted },
                        theme.typography.caption,
                      ]}
                    >
                      {t('staff.sos.totalAlerts')}
                    </Text>
                    <CountUp
                      value={stats.totalAlerts}
                      currency=""
                      style={[styles.statTileValue, theme.typography.display]}
                    />
                  </Card>

                  <Card
                    style={[
                      styles.statTile,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statTileLabel,
                        { color: theme.colors.textMuted },
                        theme.typography.caption,
                      ]}
                    >
                      {t('staff.sos.avgResponseTime')}
                    </Text>
                    <Text
                      style={[
                        styles.statTileValue,
                        { color: theme.colors.primary },
                        theme.typography.title,
                      ]}
                    >
                      {stats.averageResponseTimeMinutes > 0
                        ? `${stats.averageResponseTimeMinutes} ${t('staff.sos.timeMin')}`
                        : '< 1 ' + t('staff.sos.timeMin')}
                    </Text>
                  </Card>

                  <Card
                    style={[
                      styles.statTile,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statTileLabel,
                        { color: theme.colors.textMuted },
                        theme.typography.caption,
                      ]}
                    >
                      {t('staff.sos.status.RESOLVED')}
                    </Text>
                    <CountUp
                      value={stats.byStatus.RESOLVED}
                      currency=""
                      style={[
                        styles.statTileValue,
                        { color: theme.colors.success },
                        theme.typography.title,
                      ]}
                    />
                  </Card>

                  <Card
                    style={[
                      styles.statTile,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statTileLabel,
                        { color: theme.colors.textMuted },
                        theme.typography.caption,
                      ]}
                    >
                      {t('staff.sos.status.FALSE_ALARM')}
                    </Text>
                    <CountUp
                      value={stats.byStatus.FALSE_ALARM}
                      currency=""
                      style={[
                        styles.statTileValue,
                        { color: theme.colors.textMuted },
                        theme.typography.title,
                      ]}
                    />
                  </Card>
                </View>
              </AnimatedEntrance>
            ) : (
              <SkeletonList count={2} />
            )}
          </View>
        )}
      </ScrollView>

      {/* Resolution BottomSheet */}
      <BottomSheet
        visible={Boolean(selectedAlertForResolve)}
        onClose={() => setSelectedAlertForResolve(null)}
        title={t('staff.sos.resolveSheetTitle')}
      >
        <View style={styles.sheetBody}>
          {/* Resolution Type Selector */}
          <View style={styles.sheetSegmentWrap}>
            <SegmentedControl<'RESOLVED' | 'FALSE_ALARM'>
              options={[
                {
                  value: 'RESOLVED',
                  label: t('staff.sos.resolveSuccessNotice'),
                },
                {
                  value: 'FALSE_ALARM',
                  label: t('staff.sos.resolveFalseAlarmNotice'),
                },
              ]}
              value={resolveType}
              onChange={(val) => {
                safeHaptic.selection();
                setResolveType(val);
              }}
            />
          </View>

          {/* Resolution Note Input */}
          <Input
            label={t('staff.sos.resolutionNoteLabel')}
            placeholder={t('staff.sos.resolutionNotePlaceholder')}
            value={resolveNote}
            onChangeText={setResolveNote}
            multiline
            numberOfLines={3}
          />

          {/* Confirm Button */}
          <Button
            title={t('staff.sos.confirmResolve')}
            variant="primary"
            size="lg"
            onPress={handleConfirmResolve}
            loading={resolving}
            style={styles.sheetConfirmBtn}
          />
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIconBox: {
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
  chairmanNotice: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  chairmanNoticeText: {
    fontWeight: '600',
  },
  tabSwitcher: {
    marginBottom: 16,
  },
  tabContent: {
    gap: 12,
  },
  alertCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 4,
  },
  alertTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerText: {
    fontWeight: '700',
  },
  residentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  residentTextWrap: {
    flex: 1,
  },
  residentName: {
    fontWeight: '700',
  },
  unitText: {
    fontWeight: '500',
  },
  contactsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  contactPillText: {
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
  emptyCard: {
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  resolvedSection: {
    marginTop: 16,
    gap: 8,
  },
  resolvedSectionTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  resolvedItem: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  resolvedItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  resolvedDate: {
    fontWeight: '400',
  },
  resolvedName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  resolvedNote: {
    fontWeight: '400',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  statTileLabel: {
    marginBottom: 8,
  },
  statTileValue: {
    fontWeight: '700',
  },
  sheetBody: {
    paddingBottom: 24,
    gap: 16,
  },
  sheetSegmentWrap: {
    marginBottom: 4,
  },
  sheetConfirmBtn: {
    marginTop: 8,
  },
});
