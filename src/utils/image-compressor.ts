import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

export interface CompressImageOptions {
  maxWidth?: number;
  quality?: number;
}

/**
 * Redimensiona e comprime imagens capturadas (12MP–50MP -> 1280px/512px) antes de gerar Base64,
 * reduzindo o tráfego de upload em 5x a 8x em redes 3G/4G de rodovia sem perder legibilidade fiscal.
 */
export async function compressImageAsset(
  asset: ImagePickerAsset,
  options: CompressImageOptions = {}
): Promise<{ uri: string; base64DataUrl: string }> {
  const maxWidth = options.maxWidth ?? 1280;
  const quality = options.quality ?? 0.65;

  try {
    const actions =
      asset.width && asset.width > maxWidth ? [{ resize: { width: maxWidth } }] : [];

    const result = await manipulateAsync(asset.uri, actions, {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });

    const base64DataUrl = result.base64
      ? `data:image/jpeg;base64,${result.base64}`
      : asset.base64
      ? `data:image/jpeg;base64,${asset.base64}`
      : result.uri;

    return {
      uri: result.uri,
      base64DataUrl,
    };
  } catch {
    const fallbackDataUrl = asset.base64
      ? `data:image/jpeg;base64,${asset.base64}`
      : asset.uri;
    return {
      uri: asset.uri,
      base64DataUrl: fallbackDataUrl,
    };
  }
}
