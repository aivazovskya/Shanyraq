import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Text, View, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { UploadsApi } from '../../api/uploads';
import { getApiErrorMessage } from '../../api/client';
import { Button } from './Button';
import { useTheme } from '../../theme/ThemeContext';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  maxPhotos?: number;
}

/** Only completed uploads become form values; failed uploads can be retried. */
export function PhotoAttachments({ value, onChange, onBusyChange, disabled = false, maxPhotos = 5 }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const active = useRef(true);
  const locked = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const values = useRef(value);
  values.current = value;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.abort();
    };
  }, []);

  const upload = async (uri: string) => {
    abort.current = new AbortController();
    const result = await UploadsApi.uploadFile(uri, `photo-${Date.now()}.jpg`, 'image/jpeg', 'media', abort.current.signal);
    if (!active.current) return;
    setPreviews((previous) => ({ ...previous, [result.url]: uri }));
    onChange([...values.current, result.url]);
    setPendingUri(null);
  };

  const run = async (source: 'camera' | 'library' | 'retry') => {
    if (locked.current || disabled || value.length >= maxPhotos) return;
    locked.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setPermissionDenied(false);
    try {
      if (source === 'retry') {
        if (pendingUri) await upload(pendingUri);
        return;
      }
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!active.current) return;
        if (!permission.granted) {
          setPermissionDenied(true);
          setError(t('photos.cameraPermission'));
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!active.current || result.canceled) return;
      const asset = result.assets[0];
      setPendingUri(null);
      if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
        setError(t('photos.tooLarge'));
        return;
      }
      // Normalize HEIC/other camera formats to the JPEG accepted by the API.
      const context = ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > 2048) {
        context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
      }
      let uri: string;
      try {
        const image = await context.renderAsync();
        try {
          uri = (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })).uri;
        } finally {
          image.release();
        }
      } finally {
        context.release();
      }
      if (!active.current) return;
      setPendingUri(uri);
      await upload(uri);
    } catch (err) {
      if (active.current) setError(getApiErrorMessage(err) || t('photos.failed'));
    } finally {
      locked.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {value.map((url, index) => (
          <View key={url} style={styles.photo}>
            <Image source={{ uri: previews[url] || url }} style={styles.thumbnail} accessibilityLabel={t('photos.preview', { count: index + 1 })} />
            <Button title={t('common.delete')} variant="outline" size="sm" disabled={busy || disabled}
              onPress={() => onChange(value.filter((item) => item !== url))} />
          </View>
        ))}
      </View>
      {pendingUri && <Image source={{ uri: pendingUri }} style={styles.thumbnail} accessibilityLabel={t('photos.pending')} />}
      {value.length < maxPhotos && (
        <View style={styles.row}>
          <Button title={t('photos.camera')} variant="outline" disabled={busy || disabled} onPress={() => run('camera')} />
          <Button title={t('photos.library')} variant="outline" disabled={busy || disabled} onPress={() => run('library')} />
        </View>
      )}
      {busy && <View style={styles.row}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.text }} accessibilityLiveRegion="polite">{t('photos.uploading')}</Text></View>}
      {error && <Text style={[styles.error, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">{error}</Text>}
      {pendingUri && !busy && <Button title={t('common.retry')} variant="secondary" disabled={disabled} onPress={() => run('retry')} />}
      {permissionDenied && <Button title={t('photos.settings')} variant="outline" onPress={() => { Linking.openSettings().catch(() => setError(t('photos.cameraPermission'))); }} />}
      <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('photos.limit', { count: maxPhotos })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, marginBottom: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  photo: { gap: 6 },
  thumbnail: { width: 88, height: 88, borderRadius: 10 },
  error: { fontSize: 14 },
  hint: { fontSize: 12 },
});
