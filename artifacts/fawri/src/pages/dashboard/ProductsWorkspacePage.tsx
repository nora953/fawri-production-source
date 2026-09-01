import { useState } from 'react';
import { BadgePercent, Package } from 'lucide-react';

import CommerceCatalogPage from './CommerceCatalogSimplifiedPage';
import CatalogPromotionsPage from './CatalogPromotionsPage';
import './dashboardMerchantPolish.css';
import './catalogEditorFullscreen.css';
import './catalogEditorCardHarmony.css';
import './promotionCardActionAlignment.css';
import './productCardCompact.css';
import './catalogMeasurementAlignment.css';
import './catalogOptionBuilderLabels.css';
import './catalogSingleOptionVariants.css';
import './catalogMerchantWordingPolish.css';
import { useI18n } from '@/lib/i18n';

const copy = {
  ar: { catalog: 'المنتجات والخدمات', promotions: 'العروض' },
  ku: { catalog: 'بەرهەم و خزمەتگوزارییەکان', promotions: 'ئۆفەرەکان' },
  en: { catalog: 'Products & Services', promotions: 'Promotions' },
} as const;

export default function ProductsWorkspacePage() {
  const { lang, dir } = useI18n();
  const labels = copy[lang] || copy.en;
  const [tab, setTab] = useState<'catalog' | 'promotions'>('catalog');

  return (
    <div dir={dir} className="products-workspace-polish">
      <div className="px-4 pt-4">
        <div className="inline-flex w-full max-w-xl rounded-2xl border bg-card p-1 shadow-sm sm:w-auto">
          <button
            type="button"
            aria-pressed={tab === 'catalog'}
            onClick={() => setTab('catalog')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${
              tab === 'catalog'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Package className="h-4 w-4" />
            {labels.catalog}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'promotions'}
            onClick={() => setTab('promotions')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${
              tab === 'promotions'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <BadgePercent className="h-4 w-4" />
            {labels.promotions}
          </button>
        </div>
      </div>

      {tab === 'catalog' ? <CommerceCatalogPage /> : <CatalogPromotionsPage />}
    </div>
  );
}
