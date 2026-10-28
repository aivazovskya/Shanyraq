import { Platform } from 'react-native';
import { apiClient } from './client';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

export const UploadsApi = {
  async uploadFile(
    fileUri: string,
    fileName: string,
    mimeType: string,
    category: 'media' | 'document' = 'media',
    signal?: AbortSignal,
  ): Promise<UploadResult> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const blobRes = await fetch(fileUri);
      if (!blobRes.ok) {
        throw new Error(`Failed to read file: ${blobRes.status} ${blobRes.statusText}`);
      }
      const fetchedBlob = await blobRes.blob();
      const fileBlob = new Blob([fetchedBlob], { type: mimeType || 'image/jpeg' });
      formData.append('file', fileBlob, fileName);
    } else {
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: mimeType,
      } as any);
    }

    const res = await apiClient.post(`/uploads?category=${category}`, formData, {
      signal,
      timeout: 60000,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      transformRequest: (data) => data,
    });

    return res.data;
  },
};
