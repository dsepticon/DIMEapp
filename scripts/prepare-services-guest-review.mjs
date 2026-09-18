// Offline review only. Never contacts AWS or changes deployed routing.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const output = 'docs/dime-m44-industrial-services-review';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [
  'index.html',
  ...readdirSync('dist/guest/assets')
    .sort()
    .map((file) => 'assets/' + file),
];
if (!files.every((file) => file === 'index.html' || /^assets\/[A-Za-z0-9_-]+\.(css|js)$/.test(file)))
  throw Error('UNREVIEWED_GUEST_FILE');
const entries = files.map((file) => {
  const bytes = readFileSync('dist/guest/' + file);
  return {
    key: file === 'index.html' ? 'game/index.html' : 'game/0.9.0/' + file,
    size: bytes.length,
    sha256: hash(bytes),
    contentType: file.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : file.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8',
    cacheControl: file.endsWith('.html')
      ? 'no-cache, max-age=0, must-revalidate'
      : 'public, max-age=31536000, immutable',
  };
});
const before = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
const match = before.match(/ {2}var files = (\[[^\n]+\]);/);
if (!match) throw Error('UNREVIEWED_ROUTING_SOURCE');
const existing = JSON.parse(match[1].replaceAll("'", '"'));
const allowed = [...new Set([...existing, ...entries.map((entry) => '/' + entry.key)])];
const after = before.replace(match[0], '  var files = ' + JSON.stringify(allowed) + ';');
mkdirSync(output, { recursive: true });
writeFileSync(output + '/guest-function.review.js', after);
writeFileSync(
  output + '/guest-publication.review.json',
  JSON.stringify(
    {
      reviewOnly: true,
      entries,
      routing: {
        beforeSha256: hash(before),
        afterSha256: hash(after),
        addedAssets: allowed.filter((path) => !existing.includes(path)),
        removedAssets: [],
        behaviorChanges: [],
        note: 'Only additive asset allowlist changes. Preserve old assets for rollback. Refresh the deployed snapshot and review its diff before any later publication.',
      },
    },
    null,
    2,
  ) + '\n',
);
