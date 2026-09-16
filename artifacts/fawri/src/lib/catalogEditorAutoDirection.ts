const CATALOG_EDITOR_AUTO_DIRECTION_SELECTOR = [
  '.catalog-editor-shell textarea',
  '.catalog-editor-shell input:not([dir="ltr"]):not([type="number"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"])',
].join(', ');

function applyAutoDirection(root: ParentNode = document) {
  const lang = document.documentElement.lang;
  if (lang !== 'en' && lang !== 'ku') return;

  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(CATALOG_EDITOR_AUTO_DIRECTION_SELECTOR)
    .forEach(field => {
      if (field.getAttribute('dir') !== 'auto') field.setAttribute('dir', 'auto');
    });
}

export function installCatalogEditorAutoDirection() {
  if (typeof document === 'undefined') return;

  const schedule = () => requestAnimationFrame(() => applyAutoDirection());

  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' && record.addedNodes.length > 0)) schedule();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('focusin', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (target.matches(CATALOG_EDITOR_AUTO_DIRECTION_SELECTOR)) applyAutoDirection(target.parentNode || document);
    }
  }, true);

  schedule();
}
