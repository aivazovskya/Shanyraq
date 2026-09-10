import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  useAuth,
  canAccessChat,
  canAccessRequests,
  canAccessLogs,
  isStaffUser,
} from '../../context/AuthContext';
import { NotificationsApi } from '../../api/notifications';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import {
  Building2,
  UserCheck,
  Phone,
  ShieldCheck,
  LogOut,
  Clock,
  AlertTriangle,
  MessageSquare,
  ClipboardList,
  ChevronRight,
  Shield,
  KeyRound,
  Bell,
} from 'lucide-react-native';

export const StaffHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const fetchUnreadNotifs = useCallback(async () => {
    try {
      const res = await NotificationsApi.getUnreadCount();
      setUnreadNotifsCount(res.unreadCount ?? res.count ?? 0);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUnreadNotifs();
    }, [fetchUnreadNotifs])
  );

  const canShowChat = canAccessChat(user?.role);
  const canShowRequests = canAccessRequests(user?.role);
  const canShowLogs = canAccessLogs(user?.role);
  const canShowGuestPass = isStaffUser(user?.role);

  const handleConfirmLogout = () => {
    Alert.alert(
      t('staff.logoutDialogTitle'),
      t('staff.logoutDialogMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('staff.logoutButton'), style: 'destructive', onPress: logout },
      ]
    );
  };

  const getRoleLabel = (role?: string | null) => {
    switch (role) {
      case 'HOA_ADMIN':
        return t('staff.roleHoaAdmin');
      case 'HOA_CHAIRMAN':
        return t('staff.roleHoaChairman');
      case 'DISPATCHER':
        return t('staff.roleDispatcher');
      case 'SECURITY':
        return t('staff.roleSecurity');
      default:
        return role || '—';
    }
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('staff.headerTitle')}</Text>
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              style={styles.notificationButton}
              accessibilityLabel={t('notifications.title')}
            >
              <Bell size={22} color={Colors.text} />
              {unreadNotifsCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <Badge
              label={user?.role || 'STAFF'}
              variant="info"
            />
          </View>
        </View>

        {/* Complex / Tenant Info */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Building2 size={20} color={Colors.primary} />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardLabel}>{t('staff.complexInfo')}</Text>
              <Text style={styles.complexName}>
                {user?.tenant?.name || t('staff.noTenantAssigned')}
              </Text>
            </View>
          </View>
          {user?.tenant?.address && (
            <View style={styles.addressRow}>
              <Text style={styles.addressText}>
                {user.tenant.city ? `${user.tenant.city}, ` : ''}
                {user.tenant.address}
              </Text>
            </View>
          )}
        </Card>

        {/* Staff User Profile Info */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, styles.userIconCircle]}>
              <UserCheck size={20} color={Colors.info} />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardLabel}>{t('staff.staffInfo')}</Text>
              <Text style={styles.userName}>
                {fullName || user?.phone || '—'}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Phone size={16} color={Colors.textMuted} />
            <Text style={styles.infoText}>{user?.phone || '—'}</Text>
          </View>

          <View style={styles.infoRow}>
            <ShieldCheck size={16} color={Colors.textMuted} />
            <View style={styles.roleContainer}>
              <Text style={styles.roleLabel}>{t('staff.role')}: </Text>
              <Text style={styles.roleValue}>{getRoleLabel(user?.role)}</Text>
            </View>
          </View>
        </Card>

        {/* SOS Emergency Dashboard Quick Action */}
        <TouchableOpacity
          onPress={() => navigation.navigate('SosTab')}
          activeOpacity={0.85}
        >
          <Card style={[styles.card, styles.sosCard]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, styles.sosIconCircle]}>
                <AlertTriangle size={20} color="#DC2626" />
              </View>
              <View style={styles.cardHeaderInfo}>
                <Text style={[styles.cardLabel, { color: '#DC2626' }]}>
                  {t('staff.sosTab')}
                </Text>
                <Text style={styles.sosCardTitle}>{t('staff.sos.title')}</Text>
                <Text style={styles.sosCardSubtitle}>{t('staff.sos.subtitle')}</Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </View>
          </Card>
        </TouchableOpacity>

        {/* Resident Chat Inbox Quick Action (DISPATCHER & HOA_ADMIN only) */}
        {canShowChat && (
          <TouchableOpacity
            onPress={() => navigation.navigate('ChatInboxTab')}
            activeOpacity={0.85}
          >
            <Card style={[styles.card, styles.chatCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, styles.chatIconCircle]}>
                  <MessageSquare size={20} color={Colors.primary} />
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={[styles.cardLabel, { color: Colors.primary }]}>
                    {t('staff.chatTab')}
                  </Text>
                  <Text style={styles.chatCardTitle}>{t('staff.chat.inboxTitle')}</Text>
                  <Text style={styles.chatCardSubtitle}>{t('staff.chat.activeChatsNote')}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Service Requests Quick Action (DISPATCHER, HOA_ADMIN & HOA_CHAIRMAN) */}
        {canShowRequests && (
          <TouchableOpacity
            onPress={() => navigation.navigate('RequestsTab')}
            activeOpacity={0.85}
          >
            <Card style={[styles.card, styles.requestsCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, styles.requestsIconCircle]}>
                  <ClipboardList size={20} color="#2563EB" />
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={[styles.cardLabel, { color: '#2563EB' }]}>
                    {t('staff.requestsTab')}
                  </Text>
                  <Text style={styles.requestsCardTitle}>{t('staff.requests.title')}</Text>
                  <Text style={styles.requestsCardSubtitle}>{t('staff.requests.activeRequestsNote')}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Access Log Quick Action (SECURITY & HOA_ADMIN only) */}
        {canShowLogs && (
          <TouchableOpacity
            onPress={() => navigation.navigate('StaffAccessLog')}
            activeOpacity={0.85}
          >
            <Card style={[styles.card, styles.accessLogCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, styles.accessLogIconCircle]}>
                  <Shield size={20} color="#059669" />
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={[styles.cardLabel, { color: '#059669' }]}>
                    {t('staff.accessLog.cardLabel')}
                  </Text>
                  <Text style={styles.accessLogCardTitle}>{t('staff.accessLog.cardTitle')}</Text>
                  <Text style={styles.accessLogCardSubtitle}>{t('staff.accessLog.cardSubtitle')}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Guest Pass Issuance Quick Action (all 4 staff roles) */}
        {canShowGuestPass && (
          <TouchableOpacity
            onPress={() => navigation.navigate('StaffGuestPass')}
            activeOpacity={0.85}
          >
            <Card style={[styles.card, styles.guestPassCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, styles.guestPassIconCircle]}>
                  <KeyRound size={20} color="#D97706" />
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={[styles.cardLabel, { color: '#D97706' }]}>
                    {t('staff.guestPass.cardLabel')}
                  </Text>
                  <Text style={styles.guestPassCardTitle}>{t('staff.guestPass.cardTitle')}</Text>
                  <Text style={styles.guestPassCardSubtitle}>{t('staff.guestPass.cardSubtitle')}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Operational Modules Preview / Status */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, styles.moduleIconCircle]}>
              <Clock size={20} color={Colors.warning} />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardLabel}>{t('staff.modulesTitle')}</Text>
              <Text style={styles.moduleNote}>{t('staff.modulesNote')}</Text>
            </View>
          </View>
        </Card>

        {/* Logout Section */}
        <View style={styles.logoutSection}>
          <Button
            title={t('staff.logoutButton')}
            onPress={handleConfirmLogout}
            variant="outline"
            icon={<LogOut size={18} color={Colors.danger} />}
            textStyle={{ color: Colors.danger }}
            style={styles.logoutButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationButton: {
    position: 'relative',
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userIconCircle: {
    backgroundColor: Colors.infoBg,
  },
  moduleIconCircle: {
    backgroundColor: Colors.warningBg,
  },
  sosCard: {
    borderColor: '#FECACA',
    borderWidth: 1.5,
    backgroundColor: '#FFF5F5',
  },
  sosIconCircle: {
    backgroundColor: '#FEE2E2',
  },
  sosCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  sosCardSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chatCard: {
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  chatIconCircle: {
    backgroundColor: Colors.primaryLight,
  },
  chatCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  chatCardSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  requestsCard: {
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  requestsIconCircle: {
    backgroundColor: '#EFF6FF',
  },
  requestsCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  requestsCardSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  accessLogCard: {
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  accessLogIconCircle: {
    backgroundColor: '#ECFDF5',
  },
  accessLogCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  accessLogCardSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  guestPassCard: {
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  guestPassIconCircle: {
    backgroundColor: '#FFFBEB',
  },
  guestPassCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  guestPassCardSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  complexName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  addressRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addressText: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.text,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  roleLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  roleValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  moduleNote: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    marginTop: 2,
  },
  logoutSection: {
    marginTop: 8,
  },
  logoutButton: {
    borderColor: Colors.danger,
  },
});
