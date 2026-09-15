export const CATALOG_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const CATALOG_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export type CatalogMediaAsset = {
  storage_key: string;
  preview_url: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
  sha256: string;
};

export type CatalogMediaFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class CatalogMediaApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'CatalogMediaApiError';
    this.code = code;
    this.status = status;
  }
}

function supportedMime(type: string): type is CatalogMediaAsset['mime_type'] {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

export function validateCatalogImageFile(file: Pick<File, 'type' | 'size'>): void {
  if (!supportedMime(file.type)) {
    throw new CatalogMediaApiError(
      'CATALOG_IMAGE_TYPE_UNSUPPORTED',
      'catalog image type is unsupported',
      415,
    );
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new CatalogMediaApiError(
      'CATALOG_IMAGE_REQUIRED',
      'catalog image is required',
      400,
    );
  }
  if (file.size > CATALOG_IMAGE_MAX_BYTES) {
    throw new CatalogMediaApiError(
      'CATALOG_IMAGE_TOO_LARGE',
      'catalog image is too large',
      413,
    );
  }
}

export async function uploadCatalogImage(
  file: File,
  fetcher: CatalogMediaFetch = globalThis.fetch.bind(globalThis),
): Promise<CatalogMediaAsset> {
  validateCatalogImageFile(file);

  let response: Response;
  try {
    response = await fetcher('/api/catalog/media/images', {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });
  } catch (cause) {
    throw new CatalogMediaApiError(
      'CATALOG_MEDIA_NETWORK_FAILED',
      cause instanceof Error ? cause.message : 'catalog image upload failed',
      0,
    );
  }

  const body = (await response.json().catch(() => null)) as
    | { ok?: unknown; code?: unknown; error?: unknown; asset?: unknown }
    | null;

  if (!response.ok || body?.ok !== true) {
    throw new CatalogMediaApiError(
      typeof body?.code === 'string' ? body.code : 'CATALOG_IMAGE_UPLOAD_FAILED',
      typeof body?.error === 'string' ? body.error : 'catalog image upload failed',
      response.status,
    );
  }

  const asset = body.asset as Partial<CatalogMediaAsset> | undefined;
  if (
    !asset ||
    typeof asset.storage_key !== 'string' ||
    !asset.storage_key ||
    typeof asset.preview_url !== 'string' ||
    !asset.preview_url ||
    !supportedMime(String(asset.mime_type)) ||
    typeof asset.size_bytes !== 'number' ||
    !Number.isFinite(asset.size_bytes) ||
    typeof asset.sha256 !== 'string' ||
    !asset.sha256
  ) {
    throw new CatalogMediaApiError(
      'CATALOG_IMAGE_UPLOAD_RESPONSE_INVALID',
      'catalog image upload response is invalid',
      502,
    );
  }

  return asset as CatalogMediaAsset;
}

export function catalogImagePreviewUrl(storageKey: string): string {
  const normalized = String(storageKey || '').trim();
  return normalized
    ? `/api/catalog/media/images?storage_key=${encodeURIComponent(normalized)}`
    : '';
}
