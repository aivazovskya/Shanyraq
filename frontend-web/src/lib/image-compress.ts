export interface CompressOptions {
  maxDimension?: number;
  initialQuality?: number;
  fallbackQuality?: number;
  maxSizeBytes?: number;
}

/**
 * Calculates resized dimensions preserving aspect ratio, capped at maxDimension.
 */
export function calculateDimensions(
  width: number,
  height: number,
  maxDimension = 1600,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) return { width, height };

  const scale = maxDimension / maxSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Compresses an image File/Blob using an HTML canvas:
 * - Non-images return as-is.
 * - Resizes so max dimension <= 1600px.
 * - Compresses as JPEG 0.75.
 * - If result exceeds 1 MB, retries with JPEG 0.5.
 */
export async function compressImage(
  file: File | Blob,
  options: CompressOptions = {},
): Promise<File | Blob> {
  const {
    maxDimension = 1600,
    initialQuality = 0.75,
    fallbackQuality = 0.5,
    maxSizeBytes = 1024 * 1024,
  } = options;

  // Non-images return as-is
  if (file.type && !file.type.startsWith('image/')) {
    return file;
  }

  // In non-browser environments, return as-is
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  const fileName = 'name' in file ? (file as File).name : 'compressed.jpg';
  const outName = fileName.replace(/\.[^.]+$/, '') + '.jpg';

  try {
    const img = await loadImage(file);
    const { width, height } = calculateDimensions(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      maxDimension,
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    ctx.drawImage(img, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 'image/jpeg', initialQuality);

    // If result exceeds 1 MB, retry with fallback quality
    if (blob && blob.size > maxSizeBytes && fallbackQuality < initialQuality) {
      const secondBlob = await canvasToBlob(canvas, 'image/jpeg', fallbackQuality);
      if (secondBlob) {
        blob = secondBlob;
      }
    }

    if (!blob) {
      return file;
    }

    if (typeof File !== 'undefined' && 'name' in file) {
      return new File([blob], outName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }

    return blob;
  } catch {
    // If decoding or canvas fails, gracefully fall back to original file
    return file;
  }
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    } else {
      try {
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const binStr = atob(dataUrl.split(',')[1]);
        const len = binStr.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          arr[i] = binStr.charCodeAt(i);
        }
        resolve(new Blob([arr], { type: mimeType }));
      } catch {
        resolve(null);
      }
    }
  });
}
