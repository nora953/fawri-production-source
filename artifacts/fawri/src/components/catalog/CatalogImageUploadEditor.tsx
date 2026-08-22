import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Star, Trash2, Upload } from 'lucide-react';
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
    title: 'صور المنتج أو الخدمة',
    help: 'ارفع صورًا واضحة من جهازك. أول صورة هي الصورة الرئيسية ويمكن تغيير ترتيبها.',
    upload: 'رفع الصور',
    uploading: 'جارٍ رفع الصور...',
    drop: 'اسحب الصور هنا أو اضغط للاختيار من الجهاز',
    formats: 'JPG أو PNG أو WebP — حتى 8 MB للصورة',
    primary: 'الصورة الرئيسية',
    makePrimary: 'تعيين كرئيسية',
    alt: 'النص البديل للصورة',
    remove: 'إزالة',
    limit: 'تم الوصول إلى الحد الأقصى لعدد الصور.',
    failed: 'تعذر رفع الصورة.',
  },
  ku: {
    title: 'وێنەکانی بەرهەم یان خزمەتگوزاری',
    help: 'وێنەی ڕوون لە ئامێرەکەت باربکە. یەکەم وێنە وێنەی سەرەکییە و دەتوانیت بیگۆڕیت.',
    upload: 'بارکردنی وێنە',
    uploading: 'وێنەکان بار دەکرێن...',
    drop: 'وێنەکان لێرە دابنێ یان کلیک بکە بۆ هەڵبژاردن',
    formats: 'JPG یان PNG یان WebP — تا 8 MB بۆ هەر وێنەیەک',
    primary: 'وێنەی سەرەکی',
    makePrimary: 'بیکە بە سەرەکی',
    alt: 'دەقی جێگرەوەی وێنە',
    remove: 'لابردن',
    limit: 'گەیشتیتە سنووری ژمارەی وێنەکان.',
    failed: 'بارکردنی وێنە سەرکەوتوو نەبوو.',
  },
  en: {
    title: 'Product or service images',
    help: 'Upload clear images from your device. The first image is primary and can be changed.',
    upload: 'Upload images',
    uploading: 'Uploading images...',
    drop: 'Drop images here or click to choose from your device',
    formats: 'JPG, PNG, or WebP — up to 8 MB each',
    primary: 'Primary image',
    makePrimary: 'Make primary',
    alt: 'Image alt text',
    remove: 'Remove',
    limit: 'Maximum image count reached.',
    failed: 'Could not upload image.',
  },
} as const;

export type CatalogImageUploadEditorProps = {
  images: CatalogImageDraft[];
  onChange: (images: CatalogImageDraft[]) => void;
  maxImages?: number;
};

function previewFor(image: CatalogImageDraft): string {
  const url = image.url.trim();
  if (url) return url;
  return catalogImagePreviewUrl(image.storage_key);
}

export function CatalogImageUploadEditor({
  images,
  onChange,
  maxImages = 20,
}: CatalogImageUploadEditorProps) {
  const { lang } = useI18n();
  const labels = copy[lang] || copy.en;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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
          url: asset.preview_url,
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

  return (
    <section className="space-y-4 rounded-2xl border bg-muted/10 p-4">
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{labels.title}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{labels.help}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={isUploading || images.length >= maxImages}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          {isUploading ? labels.uploading : labels.upload}
        </Button>
      </div>

      <button
        type="button"
        disabled={isUploading || images.length >= maxImages}
        onClick={() => inputRef.current?.click()}
        onDragEnter={event => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={event => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={event => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={event => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files) void handleFiles(event.dataTransfer.files);
        }}
        className={`flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
          isDragging ? 'border-orange-500 bg-orange-50/60' : 'border-muted-foreground/25 bg-background hover:border-orange-400/70'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isUploading ? (
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-orange-500" />
        ) : (
          <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">{isUploading ? labels.uploading : labels.drop}</span>
        <span className="mt-1 text-xs text-muted-foreground">{labels.formats}</span>
      </button>

      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => {
            const preview = previewFor(image);
            return (
              <article key={image.key} className="overflow-hidden rounded-2xl border bg-background">
                <div className="relative aspect-[4/3] bg-muted/30">
                  {preview ? (
                    <img src={preview} alt={image.alt || labels.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {index === 0 && (
                    <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-background/95 px-2 py-1 text-[11px] font-bold shadow-sm">
                      <Star className="mr-1 h-3 w-3 fill-current text-orange-500" />
                      {labels.primary}
                    </span>
                  )}
                </div>

                <div className="space-y-2 p-3">
                  <Input
                    value={image.alt}
                    onChange={event => updateAlt(index, event.target.value)}
                    placeholder={labels.alt}
                    className="h-9 rounded-xl"
                  />
                  <div className="flex flex-wrap gap-2">
                    {index > 0 && (
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => makePrimary(index)}>
                        <Star className="mr-1 h-3.5 w-3.5" />
                        {labels.makePrimary}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-xl text-destructive"
                      onClick={() => removeImage(index)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {labels.remove}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default CatalogImageUploadEditor;
