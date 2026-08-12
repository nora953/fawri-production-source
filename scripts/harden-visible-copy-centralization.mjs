#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'artifacts/fawri/src');
const COMMON_IMPORT = "import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';";
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

function replaceAll(source, from, to) {
  return source.split(from).join(to);
}

function patchInvariantVisibleCopy(file) {
  let source = read(file);
  const before = source;
  let needsImport = false;

  const replacements = [
    ['<option value="ar">العربية</option>', '<option value="ar">{COMMON_UI_LABELS.languageNames.ar}</option>'],
    ['<option value="ku">کوردی</option>', '<option value="ku">{COMMON_UI_LABELS.languageNames.ku}</option>'],
    ['<option value="en">English</option>', '<option value="en">{COMMON_UI_LABELS.languageNames.en}</option>'],
    ["<option value='ar'>العربية</option>", "<option value='ar'>{COMMON_UI_LABELS.languageNames.ar}</option>"],
    ["<option value='ku'>کوردی</option>", "<option value='ku'>{COMMON_UI_LABELS.languageNames.ku}</option>"],
    ["<option value='en'>English</option>", "<option value='en'>{COMMON_UI_LABELS.languageNames.en}</option>"],
    ['placeholder="SKU"', 'placeholder={COMMON_UI_LABELS.technical.sku}'],
    ['placeholder="Barcode"', 'placeholder={COMMON_UI_LABELS.technical.barcode}'],
    ['placeholder="SKU-001"', 'placeholder={COMMON_UI_LABELS.technical.skuExample}'],
    ["placeholder='SKU'", 'placeholder={COMMON_UI_LABELS.technical.sku}'],
    ["placeholder='Barcode'", 'placeholder={COMMON_UI_LABELS.technical.barcode}'],
    ["placeholder='SKU-001'", 'placeholder={COMMON_UI_LABELS.technical.skuExample}'],
    ['>SKU<', '>{COMMON_UI_LABELS.technical.sku}<'],
    ['>Barcode<', '>{COMMON_UI_LABELS.technical.barcode}<'],
    ['>kg<', '>{COMMON_UI_LABELS.technical.unitKg}<'],
    ['>cm<', '>{COMMON_UI_LABELS.technical.unitCm}<'],
    ['>SKU: {', '>{COMMON_UI_LABELS.technical.sku}: {'],
  ];

  for (const [from, to] of replacements) {
    if (source.includes(from)) {
      source = replaceAll(source, from, to);
      needsImport = true;
    }
  }

  if (needsImport) source = ensureImport(source, COMMON_IMPORT);
  if (source !== before) {
    write(file, source);
    return true;
  }
  return false;
}

function patchServerTraining() {
  const file = path.join(FRONTEND, 'pages/dashboard/ServerTrainingPage.tsx');
  let source = read(file);
  const before = source;
  source = ensureImport(source, COMMON_COPY_IMPORT);
  if (!source.includes('const commonCopy = COMMON_UI_COPY[language];')) {
    const anchor = '  const copy = COPY[language];';
    if (!source.includes(anchor)) throw new Error('ServerTrainingPage copy anchor not found');
    source = source.replace(anchor, `${anchor}\n  const commonCopy = COMMON_UI_COPY[language];`);
  }
  const oldOption = '<option value="all">All</option>';
  if (source.includes(oldOption)) {
    source = source.replace(oldOption, '<option value="all">{commonCopy.all}</option>');
  }
  if (source !== before) write(file, source);
}

function patchServerSettings() {
  const file = path.join(FRONTEND, 'pages/dashboard/ServerSettingsPage.tsx');
  let source = read(file);
  const before = source;
  source = ensureImport(source, COMMON_COPY_IMPORT);
  if (!source.includes('const commonCopy = COMMON_UI_COPY[language];')) {
    const anchor = '  const copy = COPY[language];';
    if (!source.includes(anchor)) throw new Error('ServerSettingsPage copy anchor not found');
    source = source.replace(anchor, `${anchor}\n  const commonCopy = COMMON_UI_COPY[language];`);
  }
  source = source.replace('<option value="auto">Auto</option>', '<option value="auto">{commonCopy.auto}</option>');
  if (source !== before) write(file, source);
}

function main() {
  if (!fs.existsSync(FRONTEND)) throw new Error('run from repository root');

  const changed = [];
  for (const file of walk(FRONTEND)) {
    if (!file.endsWith('.tsx')) continue;
    if (file.includes(`${path.sep}lib${path.sep}translations${path.sep}`)) continue;
    if (patchInvariantVisibleCopy(file)) changed.push(path.relative(ROOT, file));
  }

  patchServerTraining();
  patchServerSettings();

  console.log('VISIBLE_COPY_CENTRALIZATION_APPLIED');
  for (const file of changed) console.log(file);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

main();
