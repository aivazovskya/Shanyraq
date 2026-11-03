import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Colors } from '../../constants/colors';

/** Web confirmation, where React Native Alert is unavailable. */
export function FormExitDialog({ visible, busy, onKeepEditing, onDiscard }: {
  visible: boolean;
  busy: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepEditing}>
    <SafeAreaView style={styles.overlay}>
      <View style={styles.card} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={styles.title}>{t(busy ? 'common.savingTitle' : 'common.unsavedTitle')}</Text>
        <Text style={styles.message}>{t(busy ? 'common.savingMessage' : 'common.unsavedMessage')}</Text>
        <Button title={t(busy ? 'common.close' : 'common.keepEditing')} onPress={onKeepEditing} />
        {!busy && <Button title={t('common.discardChanges')} variant="outline" onPress={onDiscard} />}
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(15,23,42,0.45)' },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, backgroundColor: Colors.surface, padding: 24, gap: 12 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: Colors.text },
  message: { fontSize: 15, lineHeight: 23, color: Colors.textMuted, marginBottom: 8 },
});
