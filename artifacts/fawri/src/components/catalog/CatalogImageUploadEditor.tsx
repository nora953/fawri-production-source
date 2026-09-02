import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Star, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { CATALOG_IMAGE_UPLOAD_COPY } from '@/lib/translations/features/catalog/catalogEditorCopy';
import type { CatalogImageDraft } from '@/lib/catalogProductEditor';
import {
  CATALOG_IMAGE_ACCEPT,
  CatalogMediaApiError,
  catalogImagePreviewUrl,
  uploadCatalogImage,
} from '@/lib/catalogMediaUiApi';


export type CatalogImageUploadEditorProps = {
  images: CatalogImageDraft[];
  onChange: (images: CatalogImageDraft[]) => void;
  maxImages?: number;
  compact?: boolean;
  hideHeading?: boolean;
  dense?: boolean;
};

function protectedPreviewRequest(image: CatalogImageDraft): string {
  const storage = image.storage_key.trim();
  if (storage) return catalogImagePreviewUrl(storage);
  const direct = image.url.trim();
  return direct.startsWith('/api/') ? direct : '';
}

function ResilientImage({
  image,
  alt,
  className,
  failureLabel,
  onClick,
}: {
  image: CatalogImageDraft;
  alt: string;
  className: string;
  failureLabel: string;
  onClick?: () => void;
}) {
  const protectedRequest = protectedPreviewRequest(image);
  const direct = protectedRequest ? '' : image.url.trim();
  const [source, setSource] = useState(direct);
  const [loading, setLoading] = useState(Boolean(protectedRequest));
  const [failed, setFailed] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setFailed(false);

    if (!protectedRequest) {
      setSource(direct);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setSource('');
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(protectedRequest, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*' },
        });
        if (!response.ok) throw new Error(`preview failed: ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('preview is not an image');
        const nextObjectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        objectUrl.current = nextObjectUrl;
        setSource(nextObjectUrl);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [protectedRequest, direct]);

  if (loading) {
    return (
      <div className={`${className} flex min-h-12 min-w-12 items-center justify-center bg-muted/30`} aria-label={alt}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source || failed) {
    return (
      <button type="button" onClick={onClick} className={`${className} flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 bg-muted/30 px-1 text-center`}>
        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
        <span className="text-[9px] font-medium text-muted-foreground">{failureLabel}</span>
      </button>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      onClick={onClick}
    />
  );
}

export function CatalogImageUploadEditor({
  images,
  onChange,
  maxImages = 20,
  compact = true,
  hideHeading = false,
  dense = false,
}: CatalogImageUploadEditorProps) {
  const { lang } = useI18n();
  const labels = CATALOG_IMAGE_UPLOAD_COPY[lang] || CATALOG_IMAGE_UPLOAD_COPY.en;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const effectiveMaxImages = dense ? Math.max(maxImages, 10) : maxImages;

  const updateAlt = (index: number, alt: string) => {
    onChange(images.map((image, itemIndex) => (itemIndex === index ? { ...image, alt } : image)));
  };

  const makePrimary = (index: number) => {
    if (index <= 0 || index >= images.length) return;
    const selected = images[index];
    onChange([selected, ...images.filter((_, itemIndex) => itemIndex !== index)]);
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, itemIndex) => itemIndex !== index));
    setLightboxIndex(current => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0 || isUploading) return;
    const remaining = Math.max(0, effectiveMaxImages - images.length);
    if (remaining === 0) {
      toast.error(labels.limit);
      return;
    }
    const selected = incoming.slice(0, remaining);
    if (incoming.length > remaining) toast.error(labels.limit);

    setIsUploading(true);
    try {
      const uploaded: CatalogImageDraft[] = [];
      for (const file of selected) {
        const asset = await uploadCatalogImage(file);
        uploaded.push({
          key: `uploaded-${asset.sha256.slice(0, 16)}-${Date.now()}-${uploaded.length}`,
          url: '',
          storage_key: asset.storage_key,
          alt: file.name.replace(/\.[^.]+$/, '').trim(),
        });
      }
      if (uploaded.length > 0) onChange([...images, ...uploaded]);
    } catch (error) {
      const suffix = error instanceof CatalogMediaApiError ? ` (${error.code})` : '';
      toast.error(`${labels.failed}${suffix}`);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer.files) void handleFiles(event.dataTransfer.files);
    },
  };

  const selectedLightbox = lightboxIndex === null ? null : images[lightboxIndex];
  const denseSummary = compact && dense;
  const latestImageIndex = images.length > 0 ? images.length - 1 : -1;
  const visibleImages = denseSummary
    ? latestImageIndex >= 0
      ? [{ image: images[latestImageIndex], index: latestImageIndex }]
      : []
    : images.map((image, index) => ({ image, index }));
  const compactUploadSize = dense ? 'h-12 w-11 shrink-0 px-1' : 'h-20 w-24 shrink-0 px-2';
  const compactThumbSize = dense ? 'h-12 w-12' : 'h-20 w-20';
  const compactShellClass = hideHeading
    ? (dense ? 'space-y-1' : 'space-y-2')
    : `${dense ? 'space-y-1 rounded-lg p-1.5' : 'space-y-2 rounded-xl p-2.5'} border bg-muted/10`;
  const imageStripClass = denseSummary
    ? 'flex flex-nowrap items-center justify-center gap-1.5 overflow-hidden'
    : 'flex flex-wrap items-center gap-2';

  return (
    <section className={compact ? compactShellClass : 'space-y-3 rounded-2xl border bg-muted/10 p-4'}>
      <input
        ref={inputRef}
        type="file"
        accept={CATALOG_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={event => {
          if (event.target.files) void handleFiles(event.target.files);
        }}
      />

      {!hideHeading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{labels.title}</h3>
            {!compact && <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.help}</p>}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            disabled={isUploading || images.length >= effectiveMaxImages}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Upload className="me-1 h-4 w-4" />}
            {isUploading ? labels.uploading : labels.upload}
          </Button>
        </div>
      )}

      <div className={imageStripClass}>
        <button
          type="button"
          disabled={isUploading || images.length >= effectiveMaxImages}
          onClick={() => inputRef.current?.click()}
          {...dropHandlers}
          className={`${compact ? compactUploadSize : 'min-h-20 min-w-[12rem] flex-1 px-4'} flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition ${isDragging ? 'border-orange-500 bg-orange-50/60' : 'border-muted-foreground/25 bg-background hover:border-orange-400/70'} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isUploading ? <Loader2 className={`${dense ? 'mb-0.5 h-4 w-4' : 'mb-1 h-5 w-5'} animate-spin text-orange-500`} /> : <Upload className={`${dense ? 'mb-0.5 h-4 w-4' : 'mb-1 h-5 w-5'} text-muted-foreground`} />}
          <span className={`${dense ? 'text-[9px]' : 'text-xs'} font-semibold`}>{isUploading ? labels.uploading : labels.upload}</span>
          {!compact && <span className="mt-1 text-[11px] text-muted-foreground">{labels.formats}</span>}
        </button>

        {visibleImages.map(({ image, index }) => (
          <div key={image.key} className={`group relative ${compactThumbSize} shrink-0 overflow-hidden rounded-xl border bg-background`}>
            <ResilientImage
              image={image}
              alt={image.alt || labels.title}
              failureLabel={labels.previewFailed}
              className="h-full w-full cursor-zoom-in object-cover"
              onClick={() => setLightboxIndex(index)}
            />
            {index === 0 && (
              <span className="absolute start-1 top-1 inline-flex items-center rounded-full bg-background/95 px-1 py-0.5 text-[8px] font-bold shadow-sm">
                <Star className="me-0.5 h-2.5 w-2.5 fill-current text-orange-500" />
                {labels.primary}
              </span>
            )}
            <button
              type="button"
              aria-label={labels.remove}
              onClick={() => removeImage(index)}
              className="absolute end-1 bottom-1 rounded-full bg-background/95 p-1 text-destructive shadow"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {denseSummary && images.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-12 w-14 shrink-0 flex-col gap-0 rounded-xl px-1 text-[9px] leading-3"
            onClick={() => setGalleryOpen(true)}
          >
            <ImageIcon className="mb-0.5 h-4 w-4" />
            <span>{labels.viewImages}</span>
            <span className="font-bold">({images.length})</span>
          </Button>
        )}
      </div>

      {!compact && images.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => (
            <div key={`${image.key}-meta`} className="flex items-center gap-2 rounded-xl border bg-background p-2">
              <Input
                value={image.alt}
                onChange={event => updateAlt(index, event.target.value)}
                placeholder={labels.alt}
                className="h-8 min-w-0 flex-1 rounded-lg text-xs"
              />
              {index > 0 && (
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={() => makePrimary(index)}>
                  <Star className="me-1 h-3 w-3" />
                  {labels.makePrimary}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {galleryOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4" onClick={() => setGalleryOpen(false)}>
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-background shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2 font-bold">
                <ImageIcon className="h-4 w-4" />
                <span>{labels.viewImages}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{images.length}</span>
              </div>
              <Button type="button" variant="outline" size="icon" aria-label={labels.close} onClick={() => setGalleryOpen(false)} className="h-10 w-10 shrink-0 rounded-xl">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {images.map((image, index) => (
                  <div key={`${image.key}-gallery`} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted/20">
                    <ResilientImage
                      image={image}
                      alt={image.alt || labels.title}
                      failureLabel={labels.previewFailed}
                      className="h-full w-full cursor-zoom-in object-cover"
                      onClick={() => setLightboxIndex(index)}
                    />
                    {index === 0 && (
                      <span className="absolute start-2 top-2 inline-flex items-center rounded-full bg-background/95 px-2 py-1 text-[10px] font-bold shadow-sm">
                        <Star className="me-1 h-3 w-3 fill-current text-orange-500" />
                        {labels.primary}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={labels.remove}
                      onClick={() => removeImage(index)}
                      className="absolute end-2 bottom-2 rounded-full bg-background/95 p-1.5 text-destructive shadow"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => setLightboxIndex(null)}>
          <div className="relative flex min-h-64 min-w-64 max-h-[92vh] max-w-[94vw] items-center justify-center" onClick={event => event.stopPropagation()}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={labels.close}
              onClick={() => setLightboxIndex(null)}
              className="absolute -end-2 -top-2 z-10 h-10 w-10 rounded-xl bg-background shadow-lg"
            >
              <X className="h-4 w-4" />
            </Button>
            <ResilientImage
              image={selectedLightbox}
              alt={selectedLightbox.alt || labels.title}
              failureLabel={labels.previewFailed}
              className="max-h-[88vh] max-w-[92vw] rounded-2xl bg-background object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default CatalogImageUploadEditor;