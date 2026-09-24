import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-based guards must inspect the code the page actually ships after
// extraction. Only explicitly marked, local, parser-ordered assets expand.
// Ordinary CDN/module/deferred scripts retain their original loading contract.
export function readPageSource(file, encoding = 'utf8') {
  const source = readFileSync(file, encoding);
  if (typeof source !== 'string' || !source.includes('data-page-source')) return source;
  const directory = dirname(file instanceof URL ? fileURLToPath(file) : file);
  return source.replace(/<link rel="stylesheet" href="(\/css\/[\w./-]+)(?:\?v=[\w.-]+)?" data-page-source>|<script src="(\/js\/[\w./-]+)" data-page-source><\/script>/g,
    (_tag, css, js) => {
      const asset = css || js;
      if (asset.includes('..')) throw new Error('Page source asset escapes its directory: ' + asset);
      const body = readFileSync(join(directory, asset.slice(1)), 'utf8');
      return css ? '<style>' + body + '</style>' : '<script>' + body + '</script>';
    });
}
