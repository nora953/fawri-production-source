import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

export type SupportImageAttachment = {
  id: string;
  type: 'image';
  file_name: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
  url: string;
};

type PrivateSupportImageProps = {
  attachment: SupportImageAttachment;
  authHeaders?: Record<string, string>;
  className?: string;
};

export default function PrivateSupportImage({
  attachment,
  authHeaders,
  className = '',
}: PrivateSupportImageProps) {
  const [objectUrl, setObjectUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl = '';
    setObjectUrl('');
    setFailed(false);

    void fetch(attachment.url, {
      headers: authHeaders,
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('support image request failed');
        const blob = await response.blob();
        if (!attachment.mime_type.startsWith('image/')) {
          throw new Error('invalid support image type');
        }
        currentObjectUrl = URL.createObjectURL(blob);
        if (!cancelled) setObjectUrl(currentObjectUrl);
      })
      .catch((error) => {
        console.error('Could not load private support image:', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [attachment.id, attachment.mime_type, attachment.url, authHeaders]);

  if (failed) {
    return (
      <div className={`flex min-h-28 min-w-48 items-center justify-center rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground ${className}`}>
        <ImageIcon className="me-2 h-4 w-4" />
        {attachment.file_name}
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className={`flex min-h-28 min-w-48 items-center justify-center rounded-xl border bg-muted/30 p-4 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`block w-fit max-w-full overflow-hidden rounded-xl border bg-background ${className}`}
      title={attachment.file_name}
      onClick={() => window.open(objectUrl, '_blank', 'noopener,noreferrer')}
    >
      <img
        src={objectUrl}
        alt={attachment.file_name}
        className="max-h-48 w-auto max-w-full object-contain sm:max-w-80"
        loading="lazy"
      />
    </button>
  );
}
