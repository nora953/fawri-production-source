import React from 'react';
import { getPolicyText, type PolicyLanguage } from '@/content/policies';

export type PolicyType = 'privacy' | 'terms';
export type PolicyContentVariant = 'page' | 'modal';

type PolicyContentProps = {
  lang: string;
  type: PolicyType;
  variant?: PolicyContentVariant;
};

function normalizePolicyLanguage(lang: string): PolicyLanguage {
  if (lang === 'ar' || lang === 'ku') {
    return lang;
  }

  return 'en';
}

export function PolicyContent({
  lang,
  type,
  variant = 'page',
}: PolicyContentProps) {
  const normalizedLang = normalizePolicyLanguage(lang);
  const items = getPolicyText(normalizedLang)[type];
  const direction = normalizedLang === 'en' ? 'ltr' : 'rtl';

  if (variant === 'modal') {
    return (
      <div className="fowri-policy-content text-sm" dir={direction}>
        <ul className="space-y-3 list-none">
          {items.map((item, index) => (
            <li className="flex gap-2" key={`${type}-${normalizedLang}-${index}`}>
              <span className="text-primary mt-1">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul
      className="fowri-policy-content list-none text-sm"
      dir={direction}
    >
      {items.map((item, index) => (
        <li
          className="fowri-policy-list-item"
          key={`${type}-${normalizedLang}-${index}`}
        >
          <span className="text-primary font-bold mt-0.5">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
