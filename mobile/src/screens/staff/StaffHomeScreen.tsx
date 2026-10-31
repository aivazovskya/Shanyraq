import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from '../../components/ui/AppText';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAuth,
  canAccessChat,
  canAccessRequests,
  canAccessLogs,
  canManageSos,
} from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { NotificationsApi } from '../../api/notifications';
import { sosApi, SosAlert } from '../../api/sos';
import { ServiceRequestsApi, ServiceRequestItem } from '../../api/service-requests';
import { ChatApi } from '../../api/chat';
import { AccessApi } from '../../api/access';
import { isRequestOverdue, formatTimeWaiting } from '../../utils/sla';
import { roleLabel } from '../../lib/role-label';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  CountUp,
  IconButton,
  EmptyState,
  SkeletonCard,
  AnimatedEntrance,
  SectionTitle,
  ErrorState,
  QuickAction,
} from '../../components/ui';
import {
  Building2,
  MapPin,
  Bell,
  AlertTriangle,
  ClipboardList,
  MessageSquare,
  Shield,
  KeyRound,
  BookOpen,
  PieChart,
  Clock,
  ChevronRight,
} from 'lucide-react-native';

export const StaffHomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const role = user?.role;
  const isChairman = role === 'HOA_CHAIRMAN';
  const isSecurity = role === 'SECURITY';
  const isDispatcher = role === 'DISPATCHER';
  const isHoaAdmin = role === 'HOA_ADMIN';

  const tenantId = user?.tenantId || user?.tenant?.id || '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  // Operational metrics state
  const [activeSosAlerts, setActiveSosAlerts] = useState<SosAlert[]>([]);
  const [activeRequests, setActiveRequests] = useState<ServiceRequestItem[]>([]);
  const [overdueRequests, setOverdueRequests] = useState<ServiceRequestItem[]>([]);
  const [unreadConversationsCount, setUnreadConversationsCount] = useState(0);
  const [activePassesCount, setActivePassesCount] = useState(0);

  const loadData = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      setHasError(false);

      try {
        // Notifications
        NotificationsApi.getUnreadCount()
          .then((res) => setUnreadNotifsCount(res.unreadCount ?? res.count ?? 0))
          .catch(() => {});

        const promises: Promise<any>[] = [];

        // 1. SOS alerts (for roles with SOS access or chairman)
        if (tenantId && (canManageSos(role) || isChairman)) {
          promises.push(
            sosApi
              .getTenantSosAlerts(tenantId)
              .then((alerts) => {
                const openAlerts = (alerts || []).filter((a) => a.status === 'ACTIVE');
                setActiveSosAlerts(openAlerts);
              })
              .catch(() => setActiveSosAlerts([]))
          );
        }

        // 2. Service Requests & SLA (for Dispatcher, Admin, Chairman)
        if (canAccessRequests(role)) {
          promises.push(
            ServiceRequestsApi.getRequests()
              .then((reqs) => {
                const list = reqs || [];
                const active = list.filter((r) =>
                  ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)
                );
                const overdue = active.filter((r) => isRequestOverdue(r));
                setActiveRequests(active);
                setOverdueRequests(overdue);
              })
              .catch(() => {
                setActiveRequests([]);
                setOverdueRequests([]);
              })
          );
        }

        // 3. Resident Chats (for Dispatcher, Admin)
        if (tenantId && canAccessChat(role)) {
          promises.push(
            ChatApi.getTenantConversations(tenantId)
              .then((convs) => {
                const list = convs || [];
                const unread = list.filter((c) => (c.unreadCount ?? 0) > 0).length;
                setUnreadConversationsCount(unread);
              })
              .catch(() => setUnreadConversationsCount(0))
          );
        }

        // 4. Guest Passes (for Security, Admin)
        if (tenantId && canAccessLogs(role)) {
          promises.push(
            AccessApi.getTenantGuestPasses(tenantId)
              .then((passes) => {
                const active = (passes || []).filter((p) => p.status === 'ACTIVE').length;
                setActivePassesCount(active);
              })
              .catch(() => setActivePassesCount(0))
          );
        }

        await Promise.all(promises);
      } catch (err) {
        console.warn('StaffHomeScreen loadData error:', err);
        setHasError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, role, isChairman]
  );

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [loadData])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    loadData(true);
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const tenantName = user?.tenant?.name || user?.tenantName || t('staff.noTenantAssigned');
  const tenantAddress = user?.tenant?.address
    ? user.tenant.city
      ? `${user.tenant.city}, ${user.tenant.address}`
      : user.tenant.address
    : user?.tenant?.city || t('staff.addressNotSet');

  // Combined "Requires Attention" items
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'SOS' | 'REQUEST';
      title: string;
      subtitle: string;
      timeLabel: string;
      onPress: () => void;
    }> = [];

    // Active SOS alerts
    for (const alert of activeSosAlerts) {
      const resident = alert.triggeredBy
        ? `${alert.triggeredBy.firstName} ${alert.triggeredBy.lastName}`.trim()
        : t('staff.sos.residentFallback');
      const unit = alert.unit
        ? `${alert.unit.building?.blockName ? `${alert.unit.building.blockName}, ` : ''}${t('staff.sos.unit')} ${alert.unit.unitNumber}`
        : '';

      items.push({
        id: `sos-${alert.id}`,
        type: 'SOS',
        title: `${t('staff.home.actionSos')}: ${resident}`,
        subtitle: unit || t('staff.sos.subtitle'),
        timeLabel: formatTimeWaiting(alert.createdAt, t),
        onPress: () => {
          safeHaptic.selection();
          navigation.navigate('SosTab');
        },
      });
    }

    // Overdue requests
    for (const req of overdueRequests) {
      const unit = req.unit?.unitNumber
        ? `${t('staff.requests.unitPrefix', { unit: req.unit.unitNumber })}`
        : '';

      items.push({
        id: `req-${req.id}`,
        type: 'REQUEST',
        title: req.title,
        subtitle: unit || req.description,
        timeLabel: t('staff.requests.overdueBadge'),
        onPress: () => {
          safeHaptic.selection();
          navigation.navigate('RequestDetail', { requestId: req.id });
        },
      });
    }

    return items;
  }, [activeSosAlerts, overdueRequests, t, navigation]);

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
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Top Header */}
        <AnimatedEntrance index={0}>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <View style={styles.badgeRow}>
                <Badge
                  label={roleLabel(role, t)}
                  variant={isChairman ? 'warning' : 'primary'}
                  size="sm"
                />
              </View>
              <Text
                style={[
                  styles.greetingTitle,
                  { color: theme.colors.text },
                  theme.typography.title,
                ]}
                numberOfLines={1}
              >
                {fullName || user?.phone || t('staff.staffInfo')}
              </Text>
              <Text
                style={[
                  styles.greetingSubtitle,
                  { color: theme.colors.textMuted },
                  theme.typography.callout,
                ]}
              >
                {t('staff.home.shiftGreeting')}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <View style={styles.bellWrapper}>
                <IconButton
                  icon={<Bell size={22} color={theme.colors.text} />}
                  accessibilityLabel={t('notifications.title')}
                  onPress={() => {
                    safeHaptic.selection();
                    navigation.navigate('Notifications');
                  }}
                  variant="ghost"
                  size={44}
                />
                {unreadNotifsCount > 0 && (
                  <View
                    style={[
                      styles.notifBadge,
                      { backgroundColor: theme.colors.danger },
                    ]}
                  >
                    <Text style={styles.notifBadgeText}>
                      {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </AnimatedEntrance>

        {hasError && !loading && (
          <AnimatedEntrance index={1}>
            <Card
              style={[
                styles.errorCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <ErrorState
                title={t('common.error')}
                message={t('common.networkError')}
                retryTitle={t('common.retry')}
                onRetry={() => loadData(false)}
              />
            </Card>
          </AnimatedEntrance>
        )}

        {/* Complex / Tenant Info Hero Card */}
        <AnimatedEntrance index={1}>
          <Card
            style={[
              styles.complexCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.complexRow}>
              <View
                style={[
                  styles.complexIconCircle,
                  { backgroundColor: theme.colors.primaryBg },
                ]}
              >
                <Building2 size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.complexTextContainer}>
                <Text
                  style={[
                    styles.complexLabel,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                >
                  {t('staff.complexInfo')}
                </Text>
                <Text
                  style={[
                    styles.complexName,
                    { color: theme.colors.text },
                    theme.typography.headline,
                  ]}
                  numberOfLines={2}
                >
                  {tenantName}
                </Text>
                <View style={styles.addressRow}>
                  <MapPin size={13} color={theme.colors.textMuted} />
                  <Text
                    style={[
                      styles.addressText,
                      { color: theme.colors.textMuted },
                      theme.typography.caption,
                    ]}
                    numberOfLines={1}
                  >
                    {tenantAddress}
                  </Text>
                </View>
              </View>
            </View>
          </Card>
        </AnimatedEntrance>

        {/* KPI Shift Tiles Grid */}
        <AnimatedEntrance index={2}>
          <View style={styles.kpiGrid}>
            {/* 1. Active SOS KPI */}
            {(canManageSos(role) || isChairman) && (
              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor:
                      activeSosAlerts.length > 0
                        ? theme.colors.danger
                        : theme.colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('SosTab');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('staff.home.kpiActiveSos')}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconBox,
                      {
                        backgroundColor:
                          activeSosAlerts.length > 0
                            ? theme.colors.dangerBg
                            : theme.colors.surfaceSubtle,
                      },
                    ]}
                  >
                    <AlertTriangle
                      size={18}
                      color={
                        activeSosAlerts.length > 0
                          ? theme.colors.danger
                          : theme.colors.textMuted
                      }
                    />
                  </View>
                  {activeSosAlerts.length > 0 && (
                    <Badge
                      label={t('staff.sos.status.ACTIVE')}
                      variant="danger"
                      size="sm"
                    />
                  )}
                </View>
                <CountUp
                  value={activeSosAlerts.length}
                  currency=""
                  style={[
                    styles.kpiValue,
                    {
                      color:
                        activeSosAlerts.length > 0
                          ? theme.colors.danger
                          : theme.colors.text,
                    },
                    theme.typography.title,
                  ]}
                />
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                  numberOfLines={1}
                >
                  {t('staff.home.kpiActiveSos')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 2. Requests In Progress KPI */}
            {canAccessRequests(role) && (
              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('RequestsTab');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('staff.home.kpiRequests')}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconBox,
                      { backgroundColor: theme.colors.infoBg },
                    ]}
                  >
                    <ClipboardList size={18} color={theme.colors.info} />
                  </View>
                </View>
                <CountUp
                  value={activeRequests.length}
                  currency=""
                  style={[
                    styles.kpiValue,
                    { color: theme.colors.text },
                    theme.typography.title,
                  ]}
                />
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                  numberOfLines={1}
                >
                  {t('staff.home.kpiRequests')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 3. Overdue SLA KPI */}
            {canAccessRequests(role) && (
              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor:
                      overdueRequests.length > 0
                        ? theme.colors.warning
                        : theme.colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('RequestsTab');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('staff.home.kpiOverdueSla')}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconBox,
                      {
                        backgroundColor:
                          overdueRequests.length > 0
                            ? theme.colors.warningBg
                            : theme.colors.surfaceSubtle,
                      },
                    ]}
                  >
                    <Clock
                      size={18}
                      color={
                        overdueRequests.length > 0
                          ? theme.colors.warning
                          : theme.colors.textMuted
                      }
                    />
                  </View>
                  {overdueRequests.length > 0 && (
                    <Badge
                      label={t('staff.requests.urgentBadge')}
                      variant="warning"
                      size="sm"
                    />
                  )}
                </View>
                <CountUp
                  value={overdueRequests.length}
                  currency=""
                  style={[
                    styles.kpiValue,
                    {
                      color:
                        overdueRequests.length > 0
                          ? theme.colors.warning
                          : theme.colors.text,
                    },
                    theme.typography.title,
                  ]}
                />
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                  numberOfLines={1}
                >
                  {t('staff.home.kpiOverdueSla')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 4. Unread Resident Chats KPI */}
            {canAccessChat(role) && (
              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('ChatInboxTab');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('staff.home.kpiUnreadChats')}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconBox,
                      { backgroundColor: theme.colors.primaryBg },
                    ]}
                  >
                    <MessageSquare size={18} color={theme.colors.primary} />
                  </View>
                </View>
                <CountUp
                  value={unreadConversationsCount}
                  currency=""
                  style={[
                    styles.kpiValue,
                    { color: theme.colors.text },
                    theme.typography.title,
                  ]}
                />
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                  numberOfLines={1}
                >
                  {t('staff.home.kpiUnreadChats')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 5. Active Guest Passes KPI */}
            {canAccessLogs(role) && (
              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  safeHaptic.selection();
                  if (isSecurity) navigation.navigate('GuestPassTab');
                  else navigation.navigate('StaffGuestPass');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('staff.home.kpiActivePasses')}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconBox,
                      { backgroundColor: theme.colors.surfaceSubtle },
                    ]}
                  >
                    <KeyRound size={18} color={theme.colors.primary} />
                  </View>
                </View>
                <CountUp
                  value={activePassesCount}
                  currency=""
                  style={[
                    styles.kpiValue,
                    { color: theme.colors.text },
                    theme.typography.title,
                  ]}
                />
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                  numberOfLines={1}
                >
                  {t('staff.home.kpiActivePasses')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </AnimatedEntrance>

        {/* Requires Attention Section */}
        <AnimatedEntrance index={3}>
          <View style={styles.sectionWrap}>
            <SectionTitle
              title={t('staff.home.attentionTitle')}
              subtitle={attentionItems.length > 0 ? `${attentionItems.length}` : undefined}
            />

            {loading ? (
              <SkeletonCard />
            ) : attentionItems.length > 0 ? (
              <View style={styles.attentionList}>
                {attentionItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.attentionCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor:
                          item.type === 'SOS'
                            ? theme.colors.danger
                            : theme.colors.warning,
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={item.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                  >
                    <View
                      style={[
                        styles.attentionIconCircle,
                        {
                          backgroundColor:
                            item.type === 'SOS'
                              ? theme.colors.dangerBg
                              : theme.colors.warningBg,
                        },
                      ]}
                    >
                      {item.type === 'SOS' ? (
                        <AlertTriangle size={18} color={theme.colors.danger} />
                      ) : (
                        <Clock size={18} color={theme.colors.warning} />
                      )}
                    </View>

                    <View style={styles.attentionContent}>
                      <View style={styles.attentionHeader}>
                        <Text
                          style={[
                            styles.attentionTitle,
                            { color: theme.colors.text },
                            theme.typography.headline,
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Badge
                          label={item.timeLabel}
                          variant={item.type === 'SOS' ? 'danger' : 'warning'}
                          size="sm"
                        />
                      </View>
                      <Text
                        style={[
                          styles.attentionSubtitle,
                          { color: theme.colors.textMuted },
                          theme.typography.caption,
                        ]}
                        numberOfLines={1}
                      >
                        {item.subtitle}
                      </Text>
                    </View>

                    <ChevronRight size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Card
                style={[
                  styles.emptyAttentionCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <EmptyState
                  title={t('staff.home.attentionEmptyTitle')}
                  description={t('staff.home.attentionEmptySubtitle')}
                />
              </Card>
            )}
          </View>
        </AnimatedEntrance>

        {/* Quick Actions Under Role */}
        <AnimatedEntrance index={4}>
          <View style={styles.sectionWrap}>
            <SectionTitle title={t('staff.home.quickActions')} />

            <View style={styles.actionsGrid}>
              {/* Security Actions */}
              {isSecurity && (
                <>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<AlertTriangle size={22} color={theme.colors.danger} />}
                      iconBgColor={theme.colors.dangerBg}
                      label={t('staff.home.actionSos')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('SosTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<Shield size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionAccessLog')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('AccessLogTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<KeyRound size={22} color={theme.colors.info} />}
                      iconBgColor={theme.colors.infoBg}
                      label={t('staff.home.actionGuestPass')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('GuestPassTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<BookOpen size={22} color={theme.colors.warning} />}
                      iconBgColor={theme.colors.warningBg}
                      label={t('staff.home.actionShiftHandover')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('ShiftHandoverTab');
                      }}
                    />
                  </View>
                </>
              )}

              {/* Dispatcher Actions */}
              {isDispatcher && (
                <>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<ClipboardList size={22} color={theme.colors.info} />}
                      iconBgColor={theme.colors.infoBg}
                      label={t('staff.home.actionRequests')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('RequestsTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<MessageSquare size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionChat')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('ChatInboxTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<AlertTriangle size={22} color={theme.colors.danger} />}
                      iconBgColor={theme.colors.dangerBg}
                      label={t('staff.home.actionSos')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('SosTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<BookOpen size={22} color={theme.colors.warning} />}
                      iconBgColor={theme.colors.warningBg}
                      label={t('staff.home.actionShiftHandover')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('StaffShiftHandover');
                      }}
                    />
                  </View>
                </>
              )}

              {/* HOA_ADMIN Actions */}
              {isHoaAdmin && (
                <>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<ClipboardList size={22} color={theme.colors.info} />}
                      iconBgColor={theme.colors.infoBg}
                      label={t('staff.home.actionRequests')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('RequestsTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<MessageSquare size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionChat')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('ChatInboxTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<AlertTriangle size={22} color={theme.colors.danger} />}
                      iconBgColor={theme.colors.dangerBg}
                      label={t('staff.home.actionSos')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('SosTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<Shield size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionAccessLog')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('StaffAccessLog');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<KeyRound size={22} color={theme.colors.info} />}
                      iconBgColor={theme.colors.infoBg}
                      label={t('staff.home.actionGuestPass')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('StaffGuestPass');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<BookOpen size={22} color={theme.colors.warning} />}
                      iconBgColor={theme.colors.warningBg}
                      label={t('staff.home.actionShiftHandover')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('StaffShiftHandover');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<PieChart size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionTransparency')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('TransparencyReport', { tenantId });
                      }}
                    />
                  </View>
                </>
              )}

              {/* HOA_CHAIRMAN Actions */}
              {isChairman && (
                <>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<ClipboardList size={22} color={theme.colors.info} />}
                      iconBgColor={theme.colors.infoBg}
                      label={t('staff.home.actionRequests')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('RequestsTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<MessageSquare size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionChat')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('ChatInboxTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<AlertTriangle size={22} color={theme.colors.danger} />}
                      iconBgColor={theme.colors.dangerBg}
                      label={t('staff.home.actionSos')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('SosTab');
                      }}
                    />
                  </View>
                  <View style={styles.gridItem}>
                    <QuickAction
                      icon={<PieChart size={22} color={theme.colors.primary} />}
                      iconBgColor={theme.colors.primaryBg}
                      label={t('staff.home.actionTransparency')}
                      onPress={() => {
                        safeHaptic.selection();
                        navigation.navigate('TransparencyReport', { tenantId });
                      }}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </AnimatedEntrance>
      </ScrollView>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  greetingTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  greetingSubtitle: {
    fontWeight: '400',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bellWrapper: {
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  complexCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  complexRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  complexIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  complexTextContainer: {
    flex: 1,
  },
  complexLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  complexName: {
    fontWeight: '700',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressText: {
    flex: 1,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 140,
    minHeight: 100,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiValue: {
    fontWeight: '700',
    marginBottom: 2,
  },
  kpiLabel: {
    fontWeight: '500',
  },
  sectionWrap: {
    marginBottom: 20,
  },
  attentionList: {
    gap: 10,
  },
  attentionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  attentionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  attentionContent: {
    flex: 1,
    marginRight: 8,
  },
  attentionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  attentionTitle: {
    flex: 1,
    fontWeight: '600',
    marginRight: 6,
  },
  attentionSubtitle: {
    fontWeight: '400',
  },
  emptyAttentionCard: {
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  gridItem: {
    width: '25%',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  errorCard: {
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
});
