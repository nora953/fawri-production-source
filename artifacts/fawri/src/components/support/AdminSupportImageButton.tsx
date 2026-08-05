import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const TEXT = {
  ar: {
    label: 'إرسال صورة',
    invalidType: 'اختر صورة بصيغة JPEG أو PNG أو WebP فقط.',
    tooLarge: 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت.',
    uploadError: 'تعذر إرسال الصورة. حاول مرة أخرى.',
  },
  ku: {
    label: 'ناردنی وێنە',
    invalidType: 'تەنها وێنەی JPEG یان PNG یان WebP هەڵبژێرە.',
    tooLarge: 'قەبارەی وێنەکە نابێت لە 5 مێگابایت زیاتر بێت.',
    uploadError: 'ناردنی وێنەکە سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.',
  },
  en: {
    label: 'Send image',
    invalidType: 'Choose a JPEG, PNG, or WebP image only.',
    tooLarge: 'The image must not exceed 5 MB.',
    uploadError: 'Could not send the image. Try again.',
  },
} as const;

type AdminSupportImageButtonProps<TTicket> = {
  ticketId: string;
  lang: string;
  authHeaders: Record<string, string>;
  disabled?: boolean;
  onUploaded: (ticket: TTicket) => void;
  onError: (message: string) => void;
};

export default function AdminSupportImageButton<TTicket>({
  ticketId,
  lang,
  authHeaders,
  disabled = false,
  onUploaded,
  onError,
}: AdminSupportImageButtonProps<TTicket>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const text = lang === 'en' ? TEXT.en : lang === 'ku' ? TEXT.ku : TEXT.ar;

  const uploadImage = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      onError(text.invalidType);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onError(text.tooLarge);
      return;
    }

    setUploading(true);
    onError('');
    try {
      const extension =
        file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : 'jpg';
      const response = await fetch(
        `/api/auth/support-images/admin/tickets/${encodeURIComponent(ticketId)}/messages`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': file.type,
            'X-File-Name': `support-image.${extension}`,
          },
          body: file,
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'support image upload failed');
      }
      onUploaded(data.ticket as TTicket);
    } catch (error) {
      console.error('Could not upload admin support image:', error);
      onError(text.uploadError);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadImage(file);
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        aria-label={text.label}
        title={text.label}
        onClick={() => inputRef.current?.click()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground transition hover:bg-muted disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
