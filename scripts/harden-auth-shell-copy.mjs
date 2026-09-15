#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'artifacts/fawri/src');
const COMMON_COPY_IMPORT = "import { COMMON_UI_COPY } from '@/lib/translations/commonUi';";

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function ensureImport(source, importLine) {
  if (source.includes(importLine)) return source;
  return `${importLine}\n${source}`;
}

function patchDashboardLayout() {
  const file = path.join(FRONTEND, 'components/layout/DashboardLayout.tsx');
  let source = read(file);
  const before = source;

  source = ensureImport(source, COMMON_COPY_IMPORT);
  if (!source.includes('const commonCopy = COMMON_UI_COPY[lang];')) {
    const anchor = '  const { lang } = useI18n();';
    if (!source.includes(anchor)) throw new Error('DashboardLayout language anchor not found');
    source = source.replace(anchor, `${anchor}\n  const commonCopy = COMMON_UI_COPY[lang];`);
  }

  source = source.replace(
    "{lang === 'en' ? 'Checking account access…' : lang === 'ku' ? 'پشکنینی دەستگەیشتن بە هەژمار…' : 'جارٍ التحقق من صلاحية الدخول…'}",
    '{commonCopy.checkingAccountAccess}',
  );

  if (source === before) throw new Error('DashboardLayout residual copy was not changed');
  write(file, source);
}

function patchLoginPage() {
  const file = path.join(FRONTEND, 'pages/LoginPage.tsx');
  let source = read(file);
  const before = source;

  source = ensureImport(source, COMMON_COPY_IMPORT);
  if (!source.includes('const commonCopy = COMMON_UI_COPY[lang];')) {
    const anchor = '  const securityText = LOGIN_PAGE_SECURITY_TEXT[lang];';
    if (!source.includes(anchor)) throw new Error('LoginPage translation anchor not found');
    source = source.replace(anchor, `${anchor}\n  const commonCopy = COMMON_UI_COPY[lang];`);
  }

  source = source.replace(
    "{lang === 'en' ? 'Fawri' : lang === 'ku' ? 'فورى' : 'فوري'}",
    '{commonCopy.brandName}',
  );

  if (source === before) throw new Error('LoginPage residual copy was not changed');
  write(file, source);
}

patchDashboardLayout();
patchLoginPage();
console.log('AUTH_SHELL_COPY_CENTRALIZATION_APPLIED');
