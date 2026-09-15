// Centralized localized copy extracted from components/support/AdminSupportImageButton.tsx.
// Keep runtime behavior in the source component; keep language copy here.

export const ADMIN_SUPPORT_IMAGE_BUTTON_TEXT = {
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
