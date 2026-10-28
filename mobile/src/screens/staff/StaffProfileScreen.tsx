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
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { NotificationsApi, NotificationPreferences } from '../../api/notifications';
import { changeAppLanguage, SupportedLocale } from '../../i18n';
import { ThemeMode } from '../../storage/theme-storage';
import { roleLabel } from '../../lib/role-label';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  Avatar,
  ListItem,
  BottomSheet,
  AnimatedEntrance,
  Divider,
} from '../../components/ui';
import {
  User,
  Phone,
  Building2,
  MapPin,
  Globe,
  Palette,
  Bell,
  LogOut,
  Check,
  Sun,
  Moon,
  Smartphone,
} from 'lucide-react-native';

const LANGUAGES: { code: SupportedLocale; label: string; nativeName: string }[] = [
  { code: 'kk', label: 'Қазақша', nativeName: 'Қазақ тілі' },
  { code: 'ru', label: 'Русский', nativeName: 'Русский язык' },
  { code: 'en', label: 'English', nativeName: 'English (US)' },
];

export const StaffProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { user, logout } = useAuth();
  const { theme, mode, setThemeMode, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isFocused = useIsFocused();

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    CHAT: true,
    SERVICE_REQUEST: true,
    ANNOUNCEMENT: true,
    FINANCE: true,
  });

  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const [langSheetVisible, setLangSheetVisible] = useState(false);

  useEffect(() => {
    if (isFocused) {
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
      if (updated) setPreferences(updated);
    } catch {
      setPreferences((prev) => ({ ...prev, [key]: !value }));
    }
  };

  const handleConfirmLogout = () => {
    safeHaptic.selection();
    Alert.alert(
      t('staff.logoutDialogTitle'),
      t('staff.logoutDialogMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('staff.logoutButton'),
          style: 'destructive',
          onPress: async () => {
            safeHaptic.selection();
            await logout();
          },
        },
      ]
    );
  };

  const handleLanguageChange = async (lang: SupportedLocale) => {
    safeHaptic.selection();
    await changeAppLanguage(lang);
    setLangSheetVisible(false);
  };

  const handleThemeChange = async (newMode: ThemeMode) => {
    safeHaptic.selection();
    await setThemeMode(newMode);
    setThemeSheetVisible(false);
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const tenantName = user?.tenant?.name || user?.tenantName || t('staff.noTenantAssigned');
  const tenantAddress = user?.tenant?.address
    ? user.tenant.city
      ? `${user.tenant.city}, ${user.tenant.address}`
      : user.tenant.address
    : user?.tenant?.city || t('staff.addressNotSet');

  const currentLangLabel =
    LANGUAGES.find((l) => l.code === i18n.language)?.label || 'Русский';

  const themeLabelMap: Record<ThemeMode, string> = {
    system: t('profile.themeSystem'),
    light: t('profile.themeLight'),
    dark: t('profile.themeDark'),
  };

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
      >
        {/* User Hero Card */}
        <AnimatedEntrance index={0}>
          <Card
            style={[
              styles.userCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.userTopRow}>
              <Avatar
                name={fullName || user?.phone || 'Staff'}
                size="lg"
                style={styles.avatar}
              />
              <View style={styles.userInfoWrap}>
                <View style={styles.badgeRow}>
                  <Badge
                    label={roleLabel(user?.role, t)}
                    variant="primary"
                    size="sm"
                  />
                </View>
                <Text
                  style={[
                    styles.userName,
                    { color: theme.colors.text },
                    theme.typography.title,
                  ]}
                  numberOfLines={1}
                >
                  {fullName || t('staff.staffInfo')}
                </Text>
                {Boolean(user?.phone) && (
                  <View style={styles.phoneRow}>
                    <Phone size={13} color={theme.colors.textMuted} />
                    <Text
                      style={[
                        styles.phoneText,
                        { color: theme.colors.textMuted },
                        theme.typography.caption,
                      ]}
                    >
                      {user?.phone}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Card>
        </AnimatedEntrance>

        {/* Complex Info Card */}
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
                <Building2 size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.complexTextWrap}>
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

        {/* Settings Section */}
        <AnimatedEntrance index={2}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.colors.textMuted },
              theme.typography.caption,
            ]}
          >
            {t('staff.profile.settings')}
          </Text>

          <Card
            style={[
              styles.settingsCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            {/* Language */}
            <ListItem
              title={t('staff.profile.language')}
              subtitle={currentLangLabel}
              leftIcon={<Globe size={20} color={theme.colors.primary} />}
              onPress={() => {
                safeHaptic.selection();
                setLangSheetVisible(true);
              }}
              showChevron
            />

            <Divider />

            {/* Theme */}
            <ListItem
              title={t('staff.profile.themeMode')}
              subtitle={themeLabelMap[mode]}
              leftIcon={
                isDark ? (
                  <Moon size={20} color={theme.colors.warning} />
                ) : (
                  <Sun size={20} color={theme.colors.warning} />
                )
              }
              onPress={() => {
                safeHaptic.selection();
                setThemeSheetVisible(true);
              }}
              showChevron
            />
          </Card>
        </AnimatedEntrance>

        {/* Notifications Section */}
        <AnimatedEntrance index={3}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.colors.textMuted },
              theme.typography.caption,
            ]}
          >
            {t('staff.profile.notifications')}
          </Text>

          <Card
            style={[
              styles.settingsCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <ListItem
              title={t('profile.prefChatTitle')}
              subtitle={t('profile.prefChatSub')}
              leftIcon={<Bell size={20} color={theme.colors.primary} />}
              rightElement={
                <Switch
                  value={preferences.CHAT}
                  onValueChange={(val) => handleTogglePreference('CHAT', val)}
                  trackColor={{
                    false: theme.colors.surfaceSubtle,
                    true: theme.colors.primaryLight,
                  }}
                  thumbColor={preferences.CHAT ? theme.colors.primary : theme.colors.surface}
                />
              }
            />

            <Divider />

            <ListItem
              title={t('profile.prefRequestTitle')}
              subtitle={t('profile.prefRequestSub')}
              leftIcon={<Bell size={20} color={theme.colors.info} />}
              rightElement={
                <Switch
                  value={preferences.SERVICE_REQUEST}
                  onValueChange={(val) => handleTogglePreference('SERVICE_REQUEST', val)}
                  trackColor={{
                    false: theme.colors.surfaceSubtle,
                    true: theme.colors.primaryLight,
                  }}
                  thumbColor={
                    preferences.SERVICE_REQUEST ? theme.colors.primary : theme.colors.surface
                  }
                />
              }
            />
          </Card>
        </AnimatedEntrance>

        {/* Logout Section */}
        <AnimatedEntrance index={4}>
          <View style={styles.logoutWrap}>
            <Button
              title={t('staff.logoutButton')}
              variant="destructive"
              size="lg"
              onPress={handleConfirmLogout}
              leftIcon={<LogOut size={18} color="#FFFFFF" />}
            />
          </View>
        </AnimatedEntrance>
      </ScrollView>

      {/* Language BottomSheet */}
      <BottomSheet
        visible={langSheetVisible}
        onClose={() => setLangSheetVisible(false)}
        title={t('staff.profile.language')}
      >
        <View style={styles.sheetBody}>
          {LANGUAGES.map((item) => {
            const isSelected = i18n.language === item.code;
            return (
              <TouchableOpacity
                key={item.code}
                style={[
                  styles.sheetOption,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primaryBg
                      : theme.colors.surface,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
                onPress={() => handleLanguageChange(item.code)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View>
                  <Text
                    style={[
                      styles.sheetOptionTitle,
                      {
                        color: isSelected
                          ? theme.colors.primary
                          : theme.colors.text,
                      },
                      theme.typography.headline,
                    ]}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[
                      styles.sheetOptionSub,
                      { color: theme.colors.textMuted },
                      theme.typography.caption,
                    ]}
                  >
                    {item.nativeName}
                  </Text>
                </View>
                {isSelected && <Check size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>

      {/* Theme BottomSheet */}
      <BottomSheet
        visible={themeSheetVisible}
        onClose={() => setThemeSheetVisible(false)}
        title={t('staff.profile.themeMode')}
      >
        <View style={styles.sheetBody}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((tMode) => {
            const isSelected = mode === tMode;
            return (
              <TouchableOpacity
                key={tMode}
                style={[
                  styles.sheetOption,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primaryBg
                      : theme.colors.surface,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
                onPress={() => handleThemeChange(tMode)}
                accessibilityRole="button"
                accessibilityLabel={themeLabelMap[tMode]}
              >
                <View style={styles.themeOptionRow}>
                  {tMode === 'light' ? (
                    <Sun size={20} color={theme.colors.warning} />
                  ) : tMode === 'dark' ? (
                    <Moon size={20} color={theme.colors.warning} />
                  ) : (
                    <Smartphone size={20} color={theme.colors.primary} />
                  )}
                  <Text
                    style={[
                      styles.sheetOptionTitle,
                      {
                        color: isSelected
                          ? theme.colors.primary
                          : theme.colors.text,
                        marginLeft: 12,
                      },
                      theme.typography.headline,
                    ]}
                  >
                    {themeLabelMap[tMode]}
                  </Text>
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
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  userCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  userTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 14,
  },
  userInfoWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  userName: {
    fontWeight: '700',
    marginBottom: 2,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phoneText: {
    fontWeight: '500',
  },
  complexCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  complexRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  complexIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  complexTextWrap: {
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
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  logoutWrap: {
    marginTop: 8,
    marginBottom: 20,
  },
  sheetBody: {
    gap: 10,
    paddingBottom: 24,
  },
  sheetOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  sheetOptionTitle: {
    fontWeight: '600',
  },
  sheetOptionSub: {
    marginTop: 2,
  },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
