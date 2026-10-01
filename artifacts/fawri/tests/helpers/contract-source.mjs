import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Source contracts inspect the same explicit translation modules the component
// imports, rather than assuming copy is still embedded in the component file.
export function readContractSourceSync(file, encoding = 'utf8') {
  if (encoding !== 'utf8' && encoding !== 'utf-8') return fs.readFileSync(file, encoding);
  const seen = new Set();
  function read(url) {
    if (seen.has(url.href)) return '';
    seen.add(url.href);
    const source = fs.readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
    const translations = [];
    for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      let target;
      if (specifier.startsWith('@/lib/translations/features/')) {
        target = new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url);
      } else if (specifier.startsWith('./translations/features/')) {
        target = new URL(`${specifier}.ts`, url);
      }
      if (target) translations.push(read(target));
    }
    return [source, ...translations].join('\n');
  }
  return read(file instanceof URL ? file : pathToFileURL(file));
}

export async function readContractSource(file, encoding = 'utf8') {
  return readContractSourceSync(file, encoding);
}

export default { ...fs, readFileSync: readContractSourceSync };
