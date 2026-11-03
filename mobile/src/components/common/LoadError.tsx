import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Button } from './Button';

/** Keep existing data visible and make failed refreshes recoverable. */
export function LoadError({ onRetry, retrying = false, message }: { onRetry: () => void; retrying?: boolean; message?: string }) {
  const { t } = useTranslation();
  return <View style={styles.container}>
    <View style={styles.message}>
      <AlertCircle size={20} color={Colors.warning} />
      <Text style={styles.text} accessibilityLiveRegion="polite">{message || t('common.loadFailed')}</Text>
    </View>
    <Button title={t('common.retry')} onPress={onRetry} loading={retrying} variant="outline" size="sm" />
  </View>;
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginVertical: 12, padding: 16, gap: 12, borderRadius: 16, backgroundColor: Colors.warningBg },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  text: { flex: 1, fontSize: 14, lineHeight: 21, color: Colors.text },
});
