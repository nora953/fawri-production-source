import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, dir = 'ltr', ...props }, ref) => {
    const { t } = useI18n();
    const [isVisible, setIsVisible] = useState(false);
    const Icon = isVisible ? EyeOff : Eye;

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          dir={dir}
          disabled={disabled}
          className={cn('fawri-password-input pr-11', className)}
        />

        <button
          type="button"
          aria-label={isVisible ? t.password_hide : t.password_show}
          aria-pressed={isVisible}
          disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setIsVisible(value => !value)}
          className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
