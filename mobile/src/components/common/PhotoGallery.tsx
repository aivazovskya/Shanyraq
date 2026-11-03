import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';

export function PhotoGallery({ images, variant = 'strip' }: { images: string[]; variant?: 'strip' | 'cover' | 'message' }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const photos = Array.from(new Set(images.filter(Boolean)));
  const open = (index: number) => { setState('loading'); setSelected(index); };
  if (!photos.length) return null;
  return <View style={variant === 'strip' ? styles.container : undefined}>
    {variant === 'strip' ?
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails} keyboardShouldPersistTaps="handled">
      {photos.map((uri, index) => <TouchableOpacity key={uri} onPress={() => open(index)} accessibilityRole="button" accessibilityLabel={t('photos.preview', { count: index + 1 })}>
        <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
      </TouchableOpacity>)}
    </ScrollView> : <TouchableOpacity onPress={() => open(0)} accessibilityRole="button" accessibilityLabel={t('photos.preview', { count: 1 })}>
      <Image source={{ uri: photos[0] }} style={variant === 'cover' ? styles.cover : styles.messageImage} resizeMode="cover" />
      {photos.length > 1 && <Text style={styles.photoCount}>{photos.length}</Text>}
    </TouchableOpacity>}
    <Modal visible={selected !== null} animationType="fade" onRequestClose={() => setSelected(null)}>
      <SafeAreaView style={styles.preview} accessibilityViewIsModal>
        <View style={styles.toolbar}>
          <Text style={styles.counter}>{selected === null ? '' : `${selected + 1} / ${photos.length}`}</Text>
          <TouchableOpacity style={styles.control} onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel={t('common.close')}><X size={24} color="#FFFFFF" /></TouchableOpacity>
        </View>
        <View style={styles.imageArea}>
          {selected !== null && photos[selected] && <Image key={photos[selected]} source={{ uri: photos[selected] }} style={styles.fullImage} resizeMode="contain"
            accessibilityLabel={t('photos.preview', { count: selected + 1 })} onLoad={() => setState('ready')} onError={() => setState('error')} />}
          {state === 'loading' && <ActivityIndicator style={styles.overlay} size="large" color="#FFFFFF" accessibilityLabel={t('common.loading')} />}
          {state === 'error' && <View style={styles.overlay}><ImageOff size={36} color="#CBD5E1" /><Text style={styles.error} accessibilityLiveRegion="polite">{t('photos.loadError')}</Text></View>}
        </View>
        {photos.length > 1 && <View style={styles.toolbar}>
          <TouchableOpacity style={[styles.control, selected === 0 && styles.disabled]} disabled={selected === null || selected === 0} onPress={() => selected !== null && open(selected - 1)} accessibilityRole="button" accessibilityLabel={t('photos.previous')}><ChevronLeft size={28} color="#FFFFFF" /></TouchableOpacity>
          <TouchableOpacity style={[styles.control, selected === photos.length - 1 && styles.disabled]} disabled={selected === null || selected >= photos.length - 1} onPress={() => selected !== null && open(selected + 1)} accessibilityRole="button" accessibilityLabel={t('photos.next')}><ChevronRight size={28} color="#FFFFFF" /></TouchableOpacity>
        </View>}
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  thumbnails: { gap: 10, paddingVertical: 4 },
  thumbnail: { width: 96, height: 96, borderRadius: 14, backgroundColor: Colors.border },
  cover: { width: '100%', height: 180, backgroundColor: Colors.border },
  messageImage: { width: 200, height: 160, maxWidth: '100%', borderRadius: 12, backgroundColor: Colors.border },
  photoCount: { position: 'absolute', right: 10, bottom: 10, color: '#FFFFFF', backgroundColor: '#0F172A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 12 },
  preview: { flex: 1, backgroundColor: '#0F172A' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  counter: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  control: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#1E293B' },
  imageArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#CBD5E1', fontSize: 14, padding: 24, textAlign: 'center' },
  disabled: { opacity: 0.3 },
});
