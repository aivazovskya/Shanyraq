import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, View, StyleSheet, Platform } from 'react-native';
import { Text } from '../ui/AppText';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react-native';
import { UploadsApi } from '../../api/uploads';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../ui/Button';
import { useTheme } from '../../theme/ThemeContext';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  maxPhotos?: number;
}

async function compressImageWeb(
  sourceUri: string,
  maxDimension = 1600,
  quality = 0.75,
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return sourceUri;
  }
  return new Promise((resolve) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      const maxSide = Math.max(width, height);
      if (maxSide > maxDimension) {
        const scale = maxDimension / maxSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceUri);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        const approxSize = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75);
        if (approxSize > 1024 * 1024) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        }
        resolve(dataUrl);
      } catch {
        resolve(sourceUri);
      }
    };
    img.onerror = () => resolve(sourceUri);
    img.src = sourceUri;
  });
}

/** Only completed uploads become form values; failed uploads can be retried. */
export function PhotoAttachments({
  value,
  onChange,
  onBusyChange,
  disabled = false,
  maxPhotos = 5,
}: Props) {
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
    setError(null);
    const result = await UploadsApi.uploadFile(
      uri,
      `photo-${Date.now()}.jpg`,
      'image/jpeg',
      'media',
      abort.current.signal,
    );
    if (!active.current) return;
    setPreviews((previous) => ({ ...previous, [result.url]: uri }));
    onChange([...values.current, result.url]);
    setPendingUri(null);
    setError(null);
  };

  const run = async (source: 'camera' | 'library' | 'retry') => {
    if (locked.current || disabled) return;
    if (source !== 'retry' && value.length >= maxPhotos) return;

    locked.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setPermissionDenied(false);

    try {
      if (source === 'retry') {
        if (pendingUri) {
          await upload(pendingUri);
        }
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

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: false,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!active.current || result.canceled) return;
      const asset = result.assets[0];

      if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
        setError(t('photos.tooLarge'));
        return;
      }

      // Normalize HEIC/other camera formats to JPEG on native and web (1600px, 0.75)
      let uri = asset.uri;
      if (Platform.OS !== 'web') {
        const context = ImageManipulator.manipulate(asset.uri);
        if (Math.max(asset.width, asset.height) > 1600) {
          context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
        }
        try {
          const image = await context.renderAsync();
          try {
            uri = (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 })).uri;
          } finally {
            image.release();
          }
        } finally {
          context.release();
        }
      } else {
        uri = await compressImageWeb(asset.uri, 1600, 0.75);
      }

      if (!active.current) return;
      setPendingUri(uri);
      await upload(uri);
    } catch (err: any) {
      if (active.current) {
        setError(getApiErrorMessage(err) || t('photos.failed'));
      }
    } finally {
      locked.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  const handleCancelPending = () => {
    setPendingUri(null);
    setError(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {value.map((url, index) => (
          <View key={url} style={styles.photo}>
            <Image
              source={{ uri: previews[url] || url }}
              style={styles.thumbnail}
              accessibilityLabel={t('photos.preview', { count: index + 1 })}
            />
            <Button
              title={t('common.delete')}
              variant="outline"
              size="sm"
              disabled={busy || disabled}
              onPress={() => onChange(value.filter((item) => item !== url))}
            />
          </View>
        ))}
      </View>

      {/* Pending upload / Error display */}
      {pendingUri && (
        <View
          style={[
            styles.pendingBox,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              borderColor: error ? theme.colors.dangerBorder : theme.colors.border,
            },
          ]}
        >
          <Image
            source={{ uri: pendingUri }}
            style={[
              styles.thumbnail,
              error ? { borderColor: theme.colors.danger, borderWidth: 2 } : { opacity: 0.7 },
            ]}
            accessibilityLabel={t('photos.pending')}
          />
          <View style={styles.pendingInfo}>
            {busy && (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.statusText, { color: theme.colors.text }]} accessibilityLiveRegion="polite">
                  {t('photos.uploading')}
                </Text>
              </View>
            )}
            {error && (
              <View style={styles.errorSection}>
                <View style={styles.errorRow}>
                  <AlertCircle size={14} color={theme.colors.danger} />
                  <Text
                    style={[styles.error, { color: theme.colors.danger }]}
                    accessibilityLiveRegion="polite"
                  >
                    {error}
                  </Text>
                </View>
                {!busy && (
                  <View style={styles.pendingBtnRow}>
                    <Button
                      title={t('common.retry')}
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onPress={() => run('retry')}
                    />
                    <Button
                      title={t('common.delete')}
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onPress={handleCancelPending}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Upload actions if limit not reached */}
      {value.length < maxPhotos && !pendingUri && (
        <View style={styles.row}>
          <Button
            title={t('photos.camera')}
            variant="outline"
            disabled={busy || disabled}
            onPress={() => run('camera')}
          />
          <Button
            title={t('photos.library')}
            variant="outline"
            disabled={busy || disabled}
            onPress={() => run('library')}
          />
        </View>
      )}

      {permissionDenied && (
        <Button
          title={t('photos.settings')}
          variant="outline"
          onPress={() => {
            Linking.openSettings().catch(() => setError(t('photos.cameraPermission')));
          }}
        />
      )}

      <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
        {t('photos.limit', { count: maxPhotos })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, marginBottom: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  photo: { gap: 6 },
  thumbnail: { width: 88, height: 88, borderRadius: 10 },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  pendingInfo: {
    flex: 1,
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  errorSection: {
    gap: 6,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  pendingBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  error: { fontSize: 13, fontWeight: '500' },
  hint: { fontSize: 12 },
});
