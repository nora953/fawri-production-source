import type { Lang } from '@/lib/types';

export type CatalogDetailsLabels = {
  productDetails: string;
  serviceDetails: string;
  editProduct: string;
  editService: string;
};

export const CATALOG_DETAILS_LABELS: Record<Lang, CatalogDetailsLabels> = {
  ar: {
    productDetails: 'تفاصيل المنتج',
    serviceDetails: 'تفاصيل الخدمة',
    editProduct: 'تعديل المنتج',
    editService: 'تعديل الخدمة',
  },
  ku: {
    productDetails: 'وردەکاری بەرهەم',
    serviceDetails: 'وردەکاری خزمەتگوزاری',
    editProduct: 'دەستکاری بەرهەم',
    editService: 'دەستکاری خزمەتگوزاری',
  },
  en: {
    productDetails: 'Product details',
    serviceDetails: 'Service details',
    editProduct: 'Edit product',
    editService: 'Edit service',
  },
};
