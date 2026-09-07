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
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);

    const res = await apiClient.post(`/uploads?category=${category}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return res.data;
  },
};
