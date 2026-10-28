import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { AuthApi } from '../../api/auth';
import { NotificationsApi, NotificationPreferences } from '../../api/notifications';
import { CommunityBoardApi } from '../../api/community-board';
import { changeAppLanguage, SupportedLocale } from '../../i18n';
import { ThemeMode } from '../../storage/theme-storage';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { ListItem } from '../../components/ui/ListItem';
import { Divider } from '../../components/ui/Divider';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { safeHaptic } from '../../lib/haptics';
import { roleLabel } from '../../lib/role-label';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import {
  Phone,
  PhoneOff,
  Home,
  ShieldCheck,
  LogOut,
  Bell,
  KeyRound,
  Globe,
  Palette,
  Check,
  Plus,
  MessageSquare,
  Wrench,
  CreditCard,
  Sun,
  Moon,
  Smartphone,
} from 'lucide-react-native';

const LANGUAGES: { code: SupportedLocale; label: string; nativeName: string }[] = [
  { code: 'kk', label: 'Қазақша', nativeName: 'Қазақ тілі' },
  { code: 'ru', label: 'Русский', nativeName: 'Русский язык' },
  { code: 'en', label: 'English', nativeName: 'English (US)' },
];

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { user, logout, refreshProfile } = useAuth();
  const { theme, mode, setThemeMode } = useTheme();
  const { t, i18n } = useTranslation();

  const [isPinSet, setIsPinSet] = useState<boolean | null>(null);
  const [hidePhoneInListings, setHidePhoneInListings] = useState<boolean>(
    user?.hidePhoneInListings ?? false,
  );
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    CHAT: true,
    SERVICE_REQUEST: true,
    ANNOUNCEMENT: true,
    FINANCE: true,
  });

  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const [langSheetVisible, setLangSheetVisible] = useState(false);

  useEffect(() => {
    if (user?.hidePhoneInListings !== undefined) {
      setHidePhoneInListings(user.hidePhoneInListings);
    }
  }, [user?.hidePhoneInListings]);

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
    safeHaptic.selection();
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

  const handleTogglePhoneVisibility = async (value: boolean) => {
    safeHaptic.selection();
    setHidePhoneInListings(value);
    try {
      const res = await CommunityBoardApi.updatePhoneVisibility(value);
      if (res && typeof res.hidePhoneInListings === 'boolean') {
        setHidePhoneInListings(res.hidePhoneInListings);
      }
      refreshProfile().catch(() => {});
    } catch {
      setHidePhoneInListings(!value);
      Alert.alert(t('common.error'), t('common.networkError'));
    }
  };

  const handleConfirmLogout = () => {
    safeHaptic.selection();
    Alert.alert(
      t('profile.logoutDialogTitle'),
      t('profile.logoutDialogMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logoutButton'), style: 'destructive', onPress: logout },
      ],
    );
  };

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  const getThemeModeLabel = (m: ThemeMode) => {
    switch (m) {
      case 'light': return t('profile.themeLight');
      case 'dark': return t('profile.themeDark');
      case 'system':
      default: return t('profile.themeSystem');
    }
  };

  const getLanguageLabel = (code: string) => {
    const found = LANGUAGES.find((l) => l.code === code);
    return found ? found.label : (LANGUAGES[1]?.label || 'RU');
  };

  const userName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || t('dashboard.defaultResident');

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16) + 12,
            paddingBottom: tabBarInset,
          },
        ]}
      >
        {/* Title */}
        <AnimatedEntrance index={0}>
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>
            {t('profile.title')}
          </Text>
        </AnimatedEntrance>

        {/* User Card */}
        <AnimatedEntrance index={1}>
          <Card style={styles.userCard}>
            <View style={styles.userRow}>
              <Avatar name={userName} size="xl" />
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1}>
                  {userName}
                </Text>
                <View style={styles.phoneRow}>
                  <Phone color={theme.colors.textMuted} size={14} />
                  <Text style={[styles.userPhone, { color: theme.colors.textMuted }]}>
                    {user?.phone}
                  </Text>
                </View>
                <View style={styles.userBadgeRow}>
                  <Badge
                    label={roleLabel(user?.role, t)}
                    variant="primary"
                    size="sm"
                  />
                </View>
              </View>
            </View>
          </Card>
        </AnimatedEntrance>

        {/* Section: Appearance */}
        <AnimatedEntrance index={2}>
          <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
            {t('profile.appearanceSection')}
          </Text>
          <Card style={styles.groupedCard}>
            <ListItem
              title={t('profile.themeTitle')}
              subtitle={getThemeModeLabel(mode)}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.primaryBg }]}>
                  <Palette color={theme.colors.primary} size={20} />
                </View>
              }
              onPress={() => setThemeSheetVisible(true)}
              showChevron={true}
            />
            <Divider />
            <ListItem
              title={t('profile.languageSection')}
              subtitle={getLanguageLabel(currentLang)}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.infoBg }]}>
                  <Globe color={theme.colors.info} size={20} />
                </View>
              }
              onPress={() => setLangSheetVisible(true)}
              showChevron={true}
            />
          </Card>
        </AnimatedEntrance>

        {/* Section: Properties */}
        <AnimatedEntrance index={3}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
              {t('profile.myProperties', { count: user?.ownerships?.length || 0 })}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ClaimUnit')}
              style={styles.addPropertyBtn}
              accessibilityRole="button"
              accessibilityLabel={t('profile.addProperty')}
            >
              <Plus size={16} color={theme.colors.primary} />
              <Text style={[styles.addPropertyText, { color: theme.colors.primary }]}>
                {t('profile.addProperty')}
              </Text>
            </TouchableOpacity>
          </View>

          {user?.ownerships && user.ownerships.length > 0 ? (
            user.ownerships.map((o) => (
              <Card key={o.id} style={styles.propertyCard}>
                <View style={styles.propertyHeader}>
                  <View style={styles.propertyTitleRow}>
                    <Home color={theme.colors.primary} size={20} />
                    <Text style={[styles.propertyTitle, { color: theme.colors.text }]}>
                      {t('profile.unitPrefix')} {o.unit?.unitNumber}
                    </Text>
                  </View>
                  <Badge
                    label={o.isVerified ? t('profile.verified') : t('profile.pending')}
                    variant={o.isVerified ? 'success' : 'warning'}
                    size="sm"
                  />
                </View>

                <Text style={[styles.complexName, { color: theme.colors.textMuted }]}>
                  {user.tenant?.name || t('profile.defaultComplex')} • {o.unit?.building?.blockName || t('profile.defaultBlock')}
                </Text>

                <View style={[styles.propertyMeta, { borderTopColor: theme.colors.border }]}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
                    {t('profile.roleLabel')}{' '}
                    <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                      {roleLabel(o.ownershipType, t)}
                    </Text>
                  </Text>
                  <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
                    {t('profile.areaLabel')}{' '}
                    <Text style={[styles.metaValue, { color: theme.colors.text }]}>{o.unit?.area} m²</Text>
                  </Text>
                  <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
                    {t('profile.shareLabel')}{' '}
                    <Text style={[styles.metaValue, { color: theme.colors.text }]}>{o.sharePercent}%</Text>
                  </Text>
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                {t('profile.noProperties')}
              </Text>
            </Card>
          )}
        </AnimatedEntrance>

        {/* Section: Notifications */}
        <AnimatedEntrance index={4}>
          <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
            {t('profile.pushSection')}
          </Text>
          <Card style={styles.groupedCard}>
            {/* 1. Chat */}
            <ListItem
              title={t('profile.prefChatTitle')}
              subtitle={t('profile.prefChatSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.primaryBg }]}>
                  <MessageSquare color={theme.colors.primary} size={20} />
                </View>
              }
              rightElement={
                <Switch
                  value={preferences.CHAT}
                  onValueChange={(val) => handleTogglePreference('CHAT', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <Divider />
            {/* 2. Requests */}
            <ListItem
              title={t('profile.prefRequestTitle')}
              subtitle={t('profile.prefRequestSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.warningBg }]}>
                  <Wrench color={theme.colors.warning} size={20} />
                </View>
              }
              rightElement={
                <Switch
                  value={preferences.SERVICE_REQUEST}
                  onValueChange={(val) => handleTogglePreference('SERVICE_REQUEST', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <Divider />
            {/* 3. Announcements */}
            <ListItem
              title={t('profile.prefAnnouncementTitle')}
              subtitle={t('profile.prefAnnouncementSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.infoBg }]}>
                  <Bell color={theme.colors.info} size={20} />
                </View>
              }
              rightElement={
                <Switch
                  value={preferences.ANNOUNCEMENT}
                  onValueChange={(val) => handleTogglePreference('ANNOUNCEMENT', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <Divider />
            {/* 4. Finance */}
            <ListItem
              title={t('profile.prefFinanceTitle')}
              subtitle={t('profile.prefFinanceSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.primaryBg }]}>
                  <CreditCard color={theme.colors.primary} size={20} />
                </View>
              }
              rightElement={
                <Switch
                  value={preferences.FINANCE}
                  onValueChange={(val) => handleTogglePreference('FINANCE', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </Card>
        </AnimatedEntrance>

        {/* Section: Security & Privacy */}
        <AnimatedEntrance index={5}>
          <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
            {t('profile.securitySection')}
          </Text>
          <Card style={styles.groupedCard}>
            <ListItem
              title={t('profile.signatureTitle')}
              subtitle={t('profile.signatureSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.primaryBg }]}>
                  <ShieldCheck color={theme.colors.primary} size={20} />
                </View>
              }
              rightElement={<Badge label={t('common.enabled')} variant="success" size="sm" />}
            />
            <Divider />
            <ListItem
              title={t('profile.pinTitle')}
              subtitle={t('profile.pinSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.warningBg }]}>
                  <KeyRound color={theme.colors.warning} size={20} />
                </View>
              }
              rightElement={
                <Badge
                  label={
                    isPinSet === true
                      ? t('common.configured')
                      : isPinSet === false
                      ? t('common.notConfigured')
                      : '...'
                  }
                  variant={isPinSet ? 'success' : 'warning'}
                  size="sm"
                />
              }
              onPress={() => navigation.navigate('PinSetup')}
              showChevron={true}
            />
            <Divider />
            <ListItem
              title={t('profile.hidePhoneTitle')}
              subtitle={t('profile.hidePhoneSub')}
              leftIcon={
                <View style={[styles.itemIconCircle, { backgroundColor: theme.colors.surfaceSubtle }]}>
                  <PhoneOff color={theme.colors.textMuted} size={20} />
                </View>
              }
              rightElement={
                <Switch
                  value={hidePhoneInListings}
                  onValueChange={handleTogglePhoneVisibility}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </Card>
        </AnimatedEntrance>

        {/* Logout Button */}
        <AnimatedEntrance index={6}>
          <Button
            title={t('profile.logoutButton')}
            onPress={handleConfirmLogout}
            variant="destructive"
            size="lg"
            leftIcon={<LogOut color="#FFFFFF" size={20} />}
            style={styles.logoutButton}
          />

          <Text style={[styles.versionText, { color: theme.colors.textLight }]}>
            {t('profile.appVersion')}
          </Text>
        </AnimatedEntrance>
      </ScrollView>

      {/* Theme Selection BottomSheet */}
      <BottomSheet
        visible={themeSheetVisible}
        onClose={() => setThemeSheetVisible(false)}
        title={t('profile.themeTitle')}
      >
        <View style={styles.sheetContent}>
          <TouchableOpacity
            style={[
              styles.sheetOption,
              mode === 'system' && { backgroundColor: theme.colors.primaryBg },
            ]}
            onPress={async () => {
              await setThemeMode('system');
              setThemeSheetVisible(false);
            }}
          >
            <View style={styles.sheetOptionLeft}>
              <Smartphone size={22} color={theme.colors.text} />
              <View>
                <Text style={[styles.sheetOptionTitle, { color: theme.colors.text }]}>
                  {t('profile.themeSystem')}
                </Text>
                <Text style={[styles.sheetOptionSub, { color: theme.colors.textMuted }]}>
                  {t('profile.themeSub')}
                </Text>
              </View>
            </View>
            {mode === 'system' && <Check size={20} color={theme.colors.primary} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sheetOption,
              mode === 'light' && { backgroundColor: theme.colors.primaryBg },
            ]}
            onPress={async () => {
              await setThemeMode('light');
              setThemeSheetVisible(false);
            }}
          >
            <View style={styles.sheetOptionLeft}>
              <Sun size={22} color="#D97706" />
              <Text style={[styles.sheetOptionTitle, { color: theme.colors.text }]}>
                {t('profile.themeLight')}
              </Text>
            </View>
            {mode === 'light' && <Check size={20} color={theme.colors.primary} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sheetOption,
              mode === 'dark' && { backgroundColor: theme.colors.primaryBg },
            ]}
            onPress={async () => {
              await setThemeMode('dark');
              setThemeSheetVisible(false);
            }}
          >
            <View style={styles.sheetOptionLeft}>
              <Moon size={22} color="#60A5FA" />
              <Text style={[styles.sheetOptionTitle, { color: theme.colors.text }]}>
                {t('profile.themeDark')}
              </Text>
            </View>
            {mode === 'dark' && <Check size={20} color={theme.colors.primary} />}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Language Selection BottomSheet */}
      <BottomSheet
        visible={langSheetVisible}
        onClose={() => setLangSheetVisible(false)}
        title={t('profile.languageSection')}
      >
        <View style={styles.sheetContent}>
          {LANGUAGES.map((lang) => {
            const isSelected = currentLang === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.sheetOption,
                  isSelected && { backgroundColor: theme.colors.primaryBg },
                ]}
                onPress={async () => {
                  safeHaptic.selection();
                  await changeAppLanguage(lang.code);
                  setLangSheetVisible(false);
                }}
              >
                <View style={styles.sheetOptionLeft}>
                  <Globe size={22} color={isSelected ? theme.colors.primary : theme.colors.text} />
                  <View>
                    <Text style={[styles.sheetOptionTitle, { color: theme.colors.text }]}>
                      {lang.label}
                    </Text>
                    <Text style={[styles.sheetOptionSub, { color: theme.colors.textMuted }]}>
                      {lang.nativeName}
                    </Text>
                  </View>
                </View>
                {isSelected && <Check size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  userCard: {
    marginBottom: 20,
    padding: 18,
    borderRadius: 22,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  userPhone: {
    fontSize: 13,
    fontWeight: '500',
  },
  userBadgeRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 10,
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  addPropertyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  addPropertyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  groupedCard: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  itemIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propertyCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
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
    fontSize: 16,
    fontWeight: '700',
  },
  complexName: {
    fontSize: 13,
    marginBottom: 12,
  },
  propertyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  metaLabel: {
    fontSize: 12,
  },
  metaValue: {
    fontWeight: '700',
  },
  emptyCard: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
  },
  logoutButton: {
    marginTop: 12,
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  sheetContent: {
    paddingBottom: 8,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 6,
    minHeight: 52,
  },
  sheetOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  sheetOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sheetOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
});
