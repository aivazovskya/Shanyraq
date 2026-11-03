import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { apiClient } from '../../api/client';
import type { RequestAttachment } from '../../api/service-requests';
import { LoadError } from './LoadError';
import { PhotoGallery } from './PhotoGallery';

function readPhoto(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Invalid photo data'));
    reader.readAsDataURL(blob);
  });
}

export function RequestPhotos({ requestId, attachments }: {
  requestId: string;
  attachments: RequestAttachment[];
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setPhotos([]);

    async function load() {
      for (const attachment of attachments) {
        if (controller.signal.aborted) break;
        if (!attachment.fileType.startsWith('image/')) continue;
        try {
          const { data } = await apiClient.get<Blob>(
            `/service-requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(attachment.id)}`,
            { responseType: 'blob', signal: controller.signal },
          );
          const photo = await readPhoto(data);
          if (!controller.signal.aborted) setPhotos(previous => [...previous, photo]);
        } catch {
          if (!controller.signal.aborted) setFailed(true);
        }
      }
      if (!controller.signal.aborted) setLoading(false);
    }

    void load();
    return () => controller.abort();
  }, [requestId, attachments, attempt]);

  return <>
    <PhotoGallery images={photos} />
    {loading && <ActivityIndicator />}
    {failed && <LoadError onRetry={() => setAttempt(value => value + 1)} retrying={loading} />}
  </>;
}
