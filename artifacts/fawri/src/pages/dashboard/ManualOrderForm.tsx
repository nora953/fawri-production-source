import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { listCatalogProducts, type CatalogProduct } from '@/lib/catalogUiApi';

const copy = {
  ar: ['طلب جديد', 'اسم العميل', 'الهاتف', 'العنوان', 'منطقة التوصيل', 'المنتج', 'الكمية', 'إضافة منتج', 'حذف', 'حفظ الطلب', 'تعذّر إكمال الطلب. تحقّق من المنتجات وحاول مجددًا.', 'إلغاء', 'الدفع عند الاستلام'],
  ku: ['داواکاری نوێ', 'ناوی کڕیار', 'تەلەفۆن', 'ناونیشان', 'ناوچەی گەیاندن', 'بەرهەم', 'بڕ', 'زیادکردنی بەرهەم', 'سڕینەوە', 'پاشەکەوتکردن', 'داواکاری تۆمار نەکرا. بەرهەمەکان بپشکنە و دووبارە هەوڵ بدە.', 'هەڵوەشاندنەوە', 'پارەدان لە کاتی وەرگرتن'],
  en: ['New order', 'Customer name', 'Phone', 'Address', 'Delivery area', 'Product', 'Quantity', 'Add item', 'Remove', 'Save order', 'Could not complete the order. Check the products and try again.', 'Cancel', 'Cash on delivery'],
};

type Line = { id: string; selection: string; quantity: number };
const newLine = (): Line => ({ id: crypto.randomUUID(), selection: '', quantity: 1 });

export default function ManualOrderForm({ onSaved }: { onSaved: (id: string) => void }) {
  const { lang } = useI18n();
  const [title, name, phone, address, area, productLabel, quantity, add, remove, save, failure, cancel, payment] = copy[lang];
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listCatalogProducts().then(result => {
      if (active) setProducts(result.filter(product => !['draft', 'out_of_stock'].includes(product.status)));
    }).catch(() => { if (active) setError(failure); });
    return () => { active = false; };
  }, [open, failure]);

  const options = products.flatMap(product => product.variants.length
    ? product.variants.map(variant => ({
        value: JSON.stringify([product.id, variant.id]),
        label: `${product.name} — ${variant.name}`,
      }))
    : [{ value: JSON.stringify([product.id, '']), label: product.name }]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || lines.some(line => !line.selection)) return;
    const data = new FormData(event.currentTarget);
    const input = {
      ...Object.fromEntries(data),
      items: lines.map(line => {
        const [product_id, variant_id] = JSON.parse(line.selection) as [string, string];
        return { product_id, variant_id, quantity: line.quantity };
      }),
    };
    const payload = JSON.stringify(input);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, idempotency_key: attempt.current.key }),
      });
      const { order } = await response.json();
      if (!response.ok || typeof order?.id !== 'string') throw new Error(failure);
      attempt.current = null;
      setOpen(false);
      onSaved(order.id);
    } catch {
      setError(failure);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!open) return <Button onClick={() => {
    setLines([newLine()]);
    setError('');
    setOpen(true);
  }}>{title}</Button>;

  return (
    <form className="space-y-3 rounded-xl border p-4" onSubmit={submit}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{payment}</p>
      <fieldset className="space-y-3" disabled={busy}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>{name}<Input name="customer_name" required maxLength={160} /></label>
          <label>{phone}<Input name="customer_phone" type="tel" required maxLength={40} /></label>
          <label>{address}<Input name="customer_address" required maxLength={500} /></label>
          <label>{area}<Input name="customer_area" required maxLength={160} /></label>
        </div>
        {lines.map(line => (
          <div key={line.id} className="flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1">{productLabel}
              <select className="block w-full rounded-md border bg-background p-2"
                required value={line.selection}
                onChange={event => setLines(current => current.map(item =>
                  item.id === line.id ? { ...item, selection: event.target.value } : item))}>
                <option value="">—</option>
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="w-24">{quantity}
              <Input type="number" min={1} max={10000} required value={line.quantity || ''}
                onChange={event => setLines(current => current.map(item =>
                  item.id === line.id ? { ...item, quantity: Number(event.target.value) } : item))} />
            </label>
            <Button type="button" variant="outline" disabled={lines.length === 1}
              onClick={() => setLines(current => current.filter(item => item.id !== line.id))}>{remove}</Button>
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={lines.length >= 50}
            onClick={() => setLines(current => [...current, newLine()])}>{add}</Button>
          <Button type="submit" disabled={options.length === 0}>{save}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{cancel}</Button>
        </div>
      </fieldset>
    </form>
  );
}
