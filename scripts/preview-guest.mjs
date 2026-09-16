// Local review server only. Serves the compiled memory-only guest and exact proposed edge capability.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
const root = resolve('dist/guest');
const security = JSON.parse(readFileSync('infra/web/guest-review/security-headers.json', 'utf8'));
const code = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const headers = { ...security, 'Cache-Control': 'no-store' };
  // HTTP localhost preview cannot use the deployment-only HTTPS-upgrade directive.
  headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
    '; upgrade-insecure-requests',
    '',
  );
  if (req.method === 'GET' && path === '/auth/status') {
    const result = runInNewContext(code + '\nhandler(event)', {
      event: { request: { method: 'GET', uri: path } },
    });
    res.writeHead(result.statusCode, { ...headers, 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (
    req.method !== 'GET' ||
    !(file === 'index.html' || /^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(file)) ||
    !existsSync(resolve(root, file))
  ) {
    res.writeHead(path.startsWith('/api/') ? 401 : 404, headers);
    res.end();
    return;
  }
  res.writeHead(200, {
    ...headers,
    'Content-Type': file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : 'text/html; charset=utf-8',
  });
  res.end(readFileSync(resolve(root, file)));
}).listen(4188, '127.0.0.1', () =>
  process.stdout.write('Guest review: http://127.0.0.1:4188 (memory only)\n'),
);
