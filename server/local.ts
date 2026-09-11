import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryStore, Receipt } from './store';
import { PlayerState, stateSchema } from '../shared/schema';
import { GameService } from './service';
import { createApi } from './http';
if (process.env.NODE_ENV === 'production' || process.env.DIME_ENV !== 'local')
  throw new Error('Set DIME_ENV=local explicitly; this server is never a production backend.');
const directory = resolve('.local');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, 'state.json');
class FileStore extends MemoryStore {
  constructor() {
    super();
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8')) as {
        states: [string, unknown][];
        receipts: [string, Receipt][];
      };
      this.states = new Map(data.states.map(([key, value]) => [key, stateSchema.parse(value)]));
      this.receipts = new Map(data.receipts);
    }
  }
  override async commit(
    player: string,
    expected: number | null,
    state: PlayerState,
    request?: { id: string; receipt: Receipt },
  ) {
    // Entire compare/write/persist runs synchronously before returning, including rollback on disk failure.
    const current = this.states.get(player);
    if (
      (expected === null ? current !== undefined : current?.revision !== expected) ||
      (request && this.receipts.has(player + ':' + request.id))
    )
      return false;
    this.states.set(player, structuredClone(state));
    if (request) this.receipts.set(player + ':' + request.id, request.receipt);
    try {
      writeFileSync(
        path + '.tmp',
        JSON.stringify({ states: [...this.states], receipts: [...this.receipts] }),
        { mode: 0o600 },
      );
      renameSync(path + '.tmp', path);
    } catch (error) {
      if (current) this.states.set(player, current);
      else this.states.delete(player);
      if (request) this.receipts.delete(player + ':' + request.id);
      throw error;
    }
    return true;
  }
}
const api = createApi(new GameService(new FileStore()), async () => 'LOCAL_ONLY', [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
createServer(async (req, res) => {
  if (!['127.0.0.1:8787', 'localhost:8787'].includes(req.headers.host ?? '')) {
    res.writeHead(403);
    res.end();
    return;
  }
  let body = '';
  for await (const chunk of req) {
    body += String(chunk);
    if (body.length > 4096) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  const result = await api({
    method: req.method ?? '',
    path: req.url ?? '',
    headers: { origin: req.headers.origin, authorization: req.headers.authorization },
    body,
  });
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}).listen(8787, '127.0.0.1', () =>
  console.info('DIME local-only API at http://127.0.0.1:8787; state in .local/state.json'),
);
