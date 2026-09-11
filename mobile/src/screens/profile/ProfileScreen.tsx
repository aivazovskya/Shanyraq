import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { AuthApi } from '../../api/auth';
import { NotificationsApi, NotificationPreferences } from '../../api/notifications';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Colors } from '../../constants/colors';
import { changeAppLanguage, SupportedLocale } from '../../i18n';
import {
  User,
  Phone,
  Home,
  ShieldCheck,
  LogOut,
  PlusCircle,
  Bell,
  KeyRound,
  ChevronRight,
  Globe,
  MessageSquare,
  Wrench,
  CreditCard,
} from 'lucide-react-native';

const LANGUAGES: { code: SupportedLocale; label: string }[] = [
  { code: 'kk', label: 'Қазақша' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [isPinSet, setIsPinSet] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    CHAT: true,
    SERVICE_REQUEST: true,
    ANNOUNCEMENT: true,
    FINANCE: true,
  });

  useEffect(() => {
    if (isFocused) {
      AuthApi.getPinStatus()
        .then((res) => setIsPinSet(res.isPinSet))
        .catch((err) => console.warn('Failed to fetch PIN status:', err));

      NotificationsApi.getPreferences()
        .then((prefs) => {
          if (prefs) setPreferences(prefs);
        })
        .catch((err) => console.warn('Failed to fetch notification preferences:', err));
    }
  }, [isFocused]);

  const handleTogglePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    try {
      const updated = await NotificationsApi.updatePreferences({ [key]: value });
      if (updated) {
        setPreferences(updated);
      }
    } catch {
      setPreferences((prev) => ({ ...prev, [key]: !value }));
      Alert.alert(t('common.error'), t('common.networkError'));
    }
  };

  const handleConfirmLogout = () => {
    Alert.alert(
      t('profile.logoutDialogTitle'),
      t('profile.logoutDialogMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logoutButton'), style: 'destructive', onPress: logout },
      ],
    );
  };

  const handleLanguageChange = async (lang: SupportedLocale) => {
    await changeAppLanguage(lang);
  };

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
        </View>

        {/* User Card */}
        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatarCircle}>
              <User color="#FFFFFF" size={36} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {user?.firstName} {user?.lastName}
              </Text>
              <View style={styles.phoneRow}>
                <Phone color={Colors.textMuted} size={14} />
                <Text style={styles.userPhone}>{user?.phone}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Language Selection */}
        <Text style={styles.sectionHeading}>{t('profile.languageSection')}</Text>
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
                    style={[
                      styles.langBtn,
                      isSelected && styles.langBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.langBtnText,
                        isSelected && styles.langBtnTextActive,
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>

        {/* Housing Units (Ownerships) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>
            {t('profile.myProperties', { count: user?.ownerships?.length || 0 })}
          </Text>
          <Button
            title={t('profile.addProperty')}
            onPress={() => navigation.navigate('ClaimUnit')}
            variant="outline"
            size="sm"
          />
        </View>

        {user?.ownerships && user.ownerships.length > 0 ? (
          user.ownerships.map((o) => (
            <Card key={o.id} style={styles.propertyCard}>
              <View style={styles.propertyHeader}>
                <View style={styles.propertyTitleRow}>
                  <Home color={Colors.primary} size={20} />
                  <Text style={styles.propertyTitle}>
                    {t('profile.unitPrefix')} {o.unit?.unitNumber}
                  </Text>
                </View>
                <Badge
                  label={o.isVerified ? t('profile.verified') : t('profile.pending')}
                  variant={o.isVerified ? 'success' : 'warning'}
                />
              </View>

              <Text style={styles.complexName}>
                {user.tenant?.name || t('profile.defaultComplex')} • {o.unit?.building?.blockName || t('profile.defaultBlock')}
              </Text>

              <View style={styles.propertyMeta}>
                <Text style={styles.metaLabel}>
                  {t('profile.roleLabel')}{' '}
                  <Text style={styles.metaValue}>
                    {o.ownershipType === 'OWNER' ? t('profile.ownerRole') : t('profile.tenantRole')}
                  </Text>
                </Text>
                <Text style={styles.metaLabel}>
                  {t('profile.areaLabel')}{' '}
                  <Text style={styles.metaValue}>{o.unit?.area} м²</Text>
                </Text>
                <Text style={styles.metaLabel}>
                  {t('profile.shareLabel')}{' '}
                  <Text style={styles.metaValue}>{o.sharePercent}%</Text>
                </Text>
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('profile.noProperties')}</Text>
          </Card>
        )}

        {/* Security & System Info */}
        <Text style={styles.sectionHeading}>{t('profile.securitySection')}</Text>
        <Card style={styles.settingsCard}>
          {/* 1. Chat notifications */}
          <View style={styles.settingItem}>
            <MessageSquare color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('profile.prefChatTitle')}</Text>
              <Text style={styles.settingSub}>{t('profile.prefChatSub')}</Text>
            </View>
            <Switch
              value={preferences.CHAT}
              onValueChange={(val) => handleTogglePreference('CHAT', val)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.separator} />

          {/* 2. Service request notifications */}
          <View style={styles.settingItem}>
            <Wrench color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('profile.prefRequestTitle')}</Text>
              <Text style={styles.settingSub}>{t('profile.prefRequestSub')}</Text>
            </View>
            <Switch
              value={preferences.SERVICE_REQUEST}
              onValueChange={(val) => handleTogglePreference('SERVICE_REQUEST', val)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.separator} />

          {/* 3. Announcement notifications */}
          <View style={styles.settingItem}>
            <Bell color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('profile.prefAnnouncementTitle')}</Text>
              <Text style={styles.settingSub}>{t('profile.prefAnnouncementSub')}</Text>
            </View>
            <Switch
              value={preferences.ANNOUNCEMENT}
              onValueChange={(val) => handleTogglePreference('ANNOUNCEMENT', val)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.separator} />

          {/* 4. Finance notifications */}
          <View style={styles.settingItem}>
            <CreditCard color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('profile.prefFinanceTitle')}</Text>
              <Text style={styles.settingSub}>{t('profile.prefFinanceSub')}</Text>
            </View>
            <Switch
              value={preferences.FINANCE}
              onValueChange={(val) => handleTogglePreference('FINANCE', val)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.settingItem}>
            <ShieldCheck color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('profile.signatureTitle')}</Text>
              <Text style={styles.settingSub}>{t('profile.signatureSub')}</Text>
            </View>
            <Badge label={t('common.enabled')} variant="info" />
          </View>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('PinSetup')}
            activeOpacity={0.7}
          >
            <KeyRound color={Colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('profile.pinTitle')}</Text>
              <Text style={styles.settingSub}>{t('profile.pinSub')}</Text>
            </View>
            <Badge
              label={isPinSet === true ? t('common.configured') : isPinSet === false ? t('common.notConfigured') : '...'}
              variant={isPinSet ? 'success' : 'warning'}
            />
            <ChevronRight color={Colors.textMuted} size={18} />
          </TouchableOpacity>
        </Card>

        {/* Logout Button */}
        <Button
          title={t('profile.logoutButton')}
          onPress={handleConfirmLogout}
          variant="danger"
          size="lg"
          icon={<LogOut color="#FFFFFF" size={20} />}
          style={styles.logoutButton}
        />

        <Text style={styles.versionText}>{t('profile.appVersion')}</Text>
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
    marginTop: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  userCard: {
    marginBottom: 16,
    padding: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  userPhone: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  propertyCard: {
    marginBottom: 10,
  },
  propertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  propertyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  propertyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  complexName: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  propertyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metaLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metaValue: {
    fontWeight: '700',
    color: Colors.text,
  },
  settingsCard: {
    marginBottom: 24,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  settingSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  logoutButton: {
    marginTop: 8,
  },
  versionText: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyCard: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  languageCard: {
    padding: 14,
    marginBottom: 10,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  langBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  langBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
