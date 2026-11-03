import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Switch, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Bell, CreditCard, MessageSquare, Wrench } from 'lucide-react-native';
import { NotificationsApi, type NotificationPreferences } from '../../api/notifications';
import { getApiErrorMessage } from '../../api/client';
import { Colors } from '../../constants/colors';
import { LoadError } from './LoadError';

const categories = [
  { key: 'CHAT', title: 'profile.prefChatTitle', hint: 'profile.prefChatSub', icon: MessageSquare },
  { key: 'SERVICE_REQUEST', title: 'profile.prefRequestTitle', hint: 'profile.prefRequestSub', icon: Wrench },
  { key: 'ANNOUNCEMENT', title: 'profile.prefAnnouncementTitle', hint: 'profile.prefAnnouncementSub', icon: Bell },
  { key: 'FINANCE', title: 'profile.prefFinanceTitle', hint: 'profile.prefFinanceSub', icon: CreditCard },
] as const;

/** Resident and staff profiles share loading, saving and rollback behavior. */
export function NotificationSettings({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<keyof NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (locked.current) return;
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await NotificationsApi.getPreferences();
      if (request !== generation.current) return;
      setPreferences(result);
      setLoadFailed(false);
    } catch {
      if (request === generation.current) setLoadFailed(true);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled) void load();
    return () => { generation.current++; };
  }, [enabled, load]);

  const toggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences || locked.current || loading || loadFailed) return;
    locked.current = true;
    const previous = preferences;
    setSaving(key);
    setError(null);
    setPreferences({ ...previous, [key]: value });
    try {
      setPreferences(await NotificationsApi.updatePreferences({ [key]: value }));
    } catch (err) {
      setPreferences(previous);
      setError(getApiErrorMessage(err));
    } finally {
      locked.current = false;
      setSaving(null);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={Colors.primary} /><Text style={styles.hint} accessibilityLiveRegion="polite">{t('common.loading')}</Text></View>;
  if (loadFailed || !preferences) return <LoadError onRetry={() => void load()} />;
  return <View>
    {categories.map(({ key, title, hint, icon: Icon }, index) => <View key={key} style={[styles.row, index > 0 && styles.separator]}>
      <Icon color={Colors.primary} size={20} />
      <View style={styles.copy}><Text style={styles.title}>{t(title)}</Text><Text style={styles.hint}>{t(hint)}</Text></View>
      {saving === key && <ActivityIndicator size="small" color={Colors.primary} />}
      <Switch value={preferences[key]} onValueChange={(value) => void toggle(key, value)} disabled={saving !== null}
        accessibilityLabel={t(title)} accessibilityHint={t(hint)} accessibilityState={{ busy: saving === key }}
        trackColor={{ false: Colors.borderDark, true: Colors.primary }} thumbColor="#FFFFFF" />
    </View>)}
    {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 14 },
  copy: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: Colors.text },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.textMuted, marginTop: 3 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  loading: { paddingVertical: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  error: { color: Colors.danger, fontSize: 13, lineHeight: 19, paddingVertical: 10 },
});
