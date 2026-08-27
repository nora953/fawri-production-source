import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

import { catalogImagePreviewUrl } from '@/lib/catalogMediaUiApi';
import type { CatalogImageRef } from '@/lib/catalogUiApi';

type CatalogProtectedImageProps = {
  image?: CatalogImageRef | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
};

function protectedPreviewRequest(image?: CatalogImageRef | null): string {
  if (!image) return '';
  if (image.storage_key?.trim()) return catalogImagePreviewUrl(image.storage_key.trim());
  const direct = image.url?.trim() || '';
  return direct.startsWith('/api/') ? direct : '';
}

function publicImageUrl(image?: CatalogImageRef | null): string {
  if (!image) return '';
  const direct = image.url?.trim() || '';
  return direct && !direct.startsWith('/api/') ? direct : '';
}

export function CatalogProtectedImage({
  image,
  alt,
  className = 'h-full w-full object-cover',
  fallbackClassName = 'flex h-full w-full items-center justify-center bg-muted/20 text-muted-foreground/50',
}: CatalogProtectedImageProps) {
  const protectedRequest = useMemo(() => protectedPreviewRequest(image), [image?.storage_key, image?.url]);
  const publicUrl = useMemo(() => publicImageUrl(image), [image?.url]);
  const [source, setSource] = useState(publicUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setFailed(false);
    setSource(publicUrl);

    if (!protectedRequest) {
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const response = await fetch(protectedRequest, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
          },
        });
        if (!response.ok) throw new Error(`catalog image preview failed (${response.status})`);
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch {
        if (active) {
          setSource('');
          setFailed(true);
        }
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [protectedRequest, publicUrl]);

  if (!image) return null;

  if (!source || failed) {
    return (
      <div className={fallbackClassName} role="img" aria-label={alt}>
        <ImageIcon className="h-7 w-7" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      className={className}
      onError={() => {
        setSource('');
        setFailed(true);
      }}
    />
  );
}
