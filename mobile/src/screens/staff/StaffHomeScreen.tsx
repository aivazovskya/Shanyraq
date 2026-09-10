import React from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
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
  ChevronRight,
} from 'lucide-react-native';

export const StaffHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const canAccessChat = user?.role === 'DISPATCHER' || user?.role === 'HOA_ADMIN';

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
          <Badge
            label={user?.role || 'STAFF'}
            variant="info"
          />
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
        {canAccessChat && (
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
