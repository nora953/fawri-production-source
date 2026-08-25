import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const i18nSource = await readFile(new URL('../src/lib/i18n.tsx', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const languageCss = await readFile(new URL('../src/styles/fawriLanguageAuthority.css', import.meta.url), 'utf8');
const baselineCss = await readFile(new URL('../src/styles/fawriUiBaseline.css', import.meta.url), 'utf8');
const indexCss = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const signupSource = await readFile(new URL('../src/pages/SignupPage.tsx', import.meta.url), 'utf8');
const loginSource = await readFile(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8');
const adminShellSource = await readFile(new URL('../src/pages/admin/AdminPageShell.tsx', import.meta.url), 'utf8');

test('language selection is explicit and drives document language plus direction', () => {
  assert.match(i18nSource, /value === 'ar' \|\| value === 'ku' \|\| value === 'en'/);
  assert.match(i18nSource, /setAttribute\('lang', lang\)/);
  assert.match(i18nSource, /setAttribute\('dir', direction\)/);
  assert.match(i18nSource, /return lang === 'en' \? 'ltr' : 'rtl'/);
});

test('Arabic, Kurdish, and English each keep a dedicated project-wide font authority', () => {
  assert.match(mainSource, /fawriLanguageAuthority\.css/);
  assert.match(languageCss, /html\[lang="ar"\][\s\S]*Noto Sans Arabic/);
  assert.match(languageCss, /html\[lang="ku"\][\s\S]*Noto Naskh Arabic/);
  assert.match(languageCss, /html\[lang="en"\][\s\S]*Inter/);
  assert.match(languageCss, /button, input, textarea, select, option/);
  assert.match(languageCss, /Technical values may switch direction, but never switch visual typography/);
});

test('reviewed auth field geometry remains the common form baseline', () => {
  assert.match(signupSource, /fieldInputClass = "h-12 rounded-xl"/);
  assert.match(signupSource, /className="space-y-2"/);
  assert.match(loginSource, /className="h-12 rounded-xl"/);
  assert.match(baselineCss, /--fawri-control-height:\s*3rem/);
  assert.match(baselineCss, /--fawri-control-radius:\s*0\.75rem/);
  assert.match(baselineCss, /--fawri-field-gap:\s*0\.5rem/);
  assert.match(baselineCss, /--fawri-label-size:\s*0\.875rem/);
});

test('language-specific reviewed display exceptions remain language scoped', () => {
  assert.match(indexCss, /html\[lang="ar"\] \.fowri-auth-title/);
  assert.match(indexCss, /html\[lang="ku"\] \.fowri-auth-title/);
  assert.match(indexCss, /html\[lang="en"\] \.fowri-auth-title/);
  assert.match(indexCss, /html\[lang="ar"\] \.fowri-header-brand-font/);
  assert.match(indexCss, /html\[lang="ku"\] \.fowri-header-brand-font/);
});

test('admin shell follows translated direction instead of hard-coding one language layout', () => {
  assert.match(adminShellSource, /const isRTL = adminText\.dir === "rtl"/);
  assert.match(adminShellSource, /dir=\{adminText\.dir\}/);
});
