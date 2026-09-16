// Local review server, not part of the publication artifact or a replica of unrelated website paths.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
const root = resolve('dist/guest');
const security = JSON.parse(readFileSync('infra/web/guest-review/security-headers.json', 'utf8'));
const code = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
const denied = ['/api/v4/state', '/api/v4/actions', '/api/v4/profile/reset', '/api/v4/content/convert'];
createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!path.startsWith('/game/') && !denied.includes(path)) {
    res.writeHead(404);
    res.end('Outside this local game preview');
    return;
  }
  const headers = path.startsWith('/game/') ? { ...security } : {};
  if (headers['Content-Security-Policy'])
    headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
      '; upgrade-insecure-requests',
      '',
    );
  const result = runInNewContext(code + '\nhandler(event)', {
    event: { request: { method: req.method, uri: path } },
  });
  if (result.statusCode) {
    res.writeHead(result.statusCode, {
      ...headers,
      ...Object.fromEntries(Object.entries(result.headers).map(([k, v]) => [k, v.value])),
    });
    res.end(req.method === 'HEAD' ? undefined : result.body);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  const file = result.uri === '/game/index.html' ? 'index.html' : result.uri.replace('/game/0.9.0/', '');
  if (
    !(file === 'index.html' || /^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(file)) ||
    !existsSync(resolve(root, file))
  ) {
    res.writeHead(404, headers);
    res.end();
    return;
  }
  res.writeHead(200, {
    ...headers,
    'Cache-Control':
      file === 'index.html' ? 'no-cache, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable',
    'Content-Type': file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : 'text/html; charset=utf-8',
  });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(resolve(root, file)));
}).listen(4188, '127.0.0.1', () =>
  process.stdout.write('Guest review: http://127.0.0.1:4188/game/ (memory only)\n'),
);
