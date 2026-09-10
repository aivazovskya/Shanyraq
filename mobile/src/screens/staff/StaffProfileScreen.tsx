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
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import { changeAppLanguage, SupportedLocale } from '../../i18n';
import {
  User,
  Phone,
  Building2,
  ShieldCheck,
  LogOut,
  Globe,
  MapPin,
} from 'lucide-react-native';

const LANGUAGES: { code: SupportedLocale; label: string }[] = [
  { code: 'kk', label: 'Қазақша' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];

export const StaffProfileScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();

  const handleConfirmLogout = () => {
    Alert.alert(
      t('staff.logoutDialogTitle'),
      t('staff.logoutDialogMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('staff.logoutButton'), style: 'destructive', onPress: logout },
      ],
    );
  };

  const handleLanguageChange = async (lang: SupportedLocale) => {
    await changeAppLanguage(lang);
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

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('navigation.profile')}</Text>
        </View>

        {/* User Profile Card */}
        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatarCircle}>
              <User color="#FFFFFF" size={36} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{fullName || user?.phone || '—'}</Text>
              <View style={styles.phoneRow}>
                <Phone color={Colors.textMuted} size={14} />
                <Text style={styles.userPhone}>{user?.phone || '—'}</Text>
              </View>
              <View style={styles.badgeRow}>
                <Badge label={getRoleLabel(user?.role)} variant="info" />
              </View>
            </View>
          </View>
        </Card>

        {/* Complex / Tenant Details */}
        <Text style={styles.sectionHeading}>{t('staff.complexInfo')}</Text>
        <Card style={styles.complexCard}>
          <View style={styles.complexRow}>
            <View style={styles.complexIconWrap}>
              <Building2 color={Colors.primary} size={22} />
            </View>
            <View style={styles.complexInfo}>
              <Text style={styles.complexName}>
                {user?.tenant?.name || t('staff.noTenantAssigned')}
              </Text>
              {user?.tenant?.address ? (
                <View style={styles.complexAddressRow}>
                  <MapPin color={Colors.textMuted} size={14} style={{ marginRight: 4 }} />
                  <Text style={styles.complexAddress}>
                    {user.tenant.city ? `${user.tenant.city}, ` : ''}
                    {user.tenant.address}
                  </Text>
                </View>
              ) : (
                <Text style={styles.complexAddressMuted}>{t('staff.addressNotSet')}</Text>
              )}
            </View>
          </View>
        </Card>

        {/* Language Selection */}
        <Text style={styles.sectionHeading}>{t('common.language')}</Text>
        <Card style={styles.languageCard}>
          <View style={styles.languageRow}>
            <View style={styles.languageIconWrap}>
              <Globe color={Colors.primary} size={20} />
            </View>
            <View style={styles.languageButtons}>
              {LANGUAGES.map((lang) => {
                const isSelected = currentLang === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={() => handleLanguageChange(lang.code)}
                    style={[styles.langBtn, isSelected && styles.langBtnActive]}
                  >
                    <Text
                      style={[styles.langBtnText, isSelected && styles.langBtnTextActive]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  userCard: {
    padding: 16,
    marginBottom: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  userPhone: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  complexCard: {
    padding: 16,
    marginBottom: 20,
  },
  complexRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  complexIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  complexInfo: {
    flex: 1,
  },
  complexName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  complexAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  complexAddress: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  complexAddressMuted: {
    fontSize: 13,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  languageCard: {
    padding: 16,
    marginBottom: 24,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  languageButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  langBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  langBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  langBtnTextActive: {
    color: Colors.primary,
  },
  logoutSection: {
    marginTop: 8,
  },
  logoutButton: {
    borderColor: Colors.danger,
  },
});
