import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Star, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import type { CatalogImageDraft } from '@/lib/catalogProductEditor';
import {
  CATALOG_IMAGE_ACCEPT,
  CatalogMediaApiError,
  catalogImagePreviewUrl,
  uploadCatalogImage,
} from '@/lib/catalogMediaUiApi';

const copy = {
  ar: {
    title: 'الصور',
    help: 'أضف الصور دفعة واحدة. اضغط على أي صورة لتكبيرها.',
    upload: 'إضافة صور',
    uploading: 'جارٍ الرفع...',
    drop: 'اسحب الصور هنا أو اضغط للاختيار',
    formats: 'JPG / PNG / WebP — حتى 8 MB',
    primary: 'رئيسية',
    makePrimary: 'تعيين كرئيسية',
    alt: 'وصف الصورة',
    remove: 'إزالة',
    limit: 'تم الوصول إلى الحد الأقصى لعدد الصور.',
    failed: 'تعذر رفع الصورة.',
    previewFailed: 'تعذر عرض الصورة',
    close: 'إغلاق',
  },
  ku: {
    title: 'وێنەکان',
    help: 'وێنەکان بە یەکجار زیاد بکە. بۆ گەورەکردن کلیک لە وێنە بکە.',
    upload: 'زیادکردنی وێنە',
    uploading: 'باردەکرێت...',
    drop: 'وێنەکان لێرە دابنێ یان کلیک بکە',
    formats: 'JPG / PNG / WebP — تا 8 MB',
    primary: 'سەرەکی',
    makePrimary: 'بیکە بە سەرەکی',
    alt: 'وەسفی وێنە',
    remove: 'لابردن',
    limit: 'گەیشتیتە سنووری ژمارەی وێنەکان.',
    failed: 'بارکردنی وێنە سەرکەوتوو نەبوو.',
    previewFailed: 'وێنە پیشان نەدرا',
    close: 'داخستن',
  },
  en: {
    title: 'Images',
    help: 'Add images in one batch. Click any thumbnail to enlarge it.',
    upload: 'Add images',
    uploading: 'Uploading...',
    drop: 'Drop images here or click to choose',
    formats: 'JPG / PNG / WebP — up to 8 MB',
    primary: 'Primary',
    makePrimary: 'Make primary',
    alt: 'Image description',
    remove: 'Remove',
    limit: 'Maximum image count reached.',
    failed: 'Could not upload image.',
    previewFailed: 'Could not display image',
    close: 'Close',
  },
} as const;

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
  const labels = copy[lang] || copy.en;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    if (lightboxIndex === index) setLightboxIndex(null);
  };

  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0 || isUploading) return;
    const remaining = Math.max(0, maxImages - images.length);
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
  const compactUploadSize = dense ? 'h-14 w-16 shrink-0 px-1' : 'h-20 w-24 shrink-0 px-2';
  const compactThumbSize = dense ? 'h-14 w-14' : 'h-20 w-20';

  return (
    <section className={`${compact ? `${dense ? 'space-y-1 rounded-lg p-1.5' : 'space-y-2 rounded-xl p-2.5'} border bg-muted/10` : 'space-y-3 rounded-2xl border bg-muted/10 p-4'}`}>
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
            disabled={isUploading || images.length >= maxImages}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Upload className="me-1 h-4 w-4" />}
            {isUploading ? labels.uploading : labels.upload}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isUploading || images.length >= maxImages}
          onClick={() => inputRef.current?.click()}
          {...dropHandlers}
          className={`${compact ? compactUploadSize : 'min-h-20 min-w-[12rem] flex-1 px-4'} flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition ${isDragging ? 'border-orange-500 bg-orange-50/60' : 'border-muted-foreground/25 bg-background hover:border-orange-400/70'} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isUploading ? <Loader2 className={`${dense ? 'mb-0.5 h-4 w-4' : 'mb-1 h-5 w-5'} animate-spin text-orange-500`} /> : <Upload className={`${dense ? 'mb-0.5 h-4 w-4' : 'mb-1 h-5 w-5'} text-muted-foreground`} />}
          <span className={`${dense ? 'text-[10px]' : 'text-xs'} font-semibold`}>{isUploading ? labels.uploading : labels.upload}</span>
          {!compact && <span className="mt-1 text-[11px] text-muted-foreground">{labels.formats}</span>}
        </button>

        {images.map((image, index) => (
          <div key={image.key} className={`group relative ${compactThumbSize} shrink-0 overflow-hidden rounded-xl border bg-background`}>
            <ResilientImage
              image={image}
              alt={image.alt || labels.title}
              failureLabel={labels.previewFailed}
              className="h-full w-full cursor-zoom-in object-cover"
              onClick={() => setLightboxIndex(index)}
            />
            {index === 0 && (
              <span className="absolute start-1 top-1 inline-flex items-center rounded-full bg-background/95 px-1.5 py-0.5 text-[9px] font-bold shadow-sm">
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

      {selectedLightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => setLightboxIndex(null)}>
          <div className="relative flex min-h-64 min-w-64 max-h-[92vh] max-w-[94vw] items-center justify-center" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              aria-label={labels.close}
              onClick={() => setLightboxIndex(null)}
              className="absolute -end-2 -top-2 z-10 rounded-full bg-background p-2 shadow-lg"
            >
              <X className="h-5 w-5" />
            </button>
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