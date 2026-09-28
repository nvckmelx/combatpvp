import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMsg } from '@hj/shared';
import { ConnCtx, Rooms } from './rooms';

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? '0.0.0.0';
/** Собранный клиент: server/src и server/dist лежат на одной глубине. */
const CLIENT_DIR = resolve(fileURLToPath(new URL('../../client/dist/', import.meta.url)));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

const rooms = new Rooms();

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (!existsSync(CLIENT_DIR)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Клиент не собран: запусти npm run build');
    return;
  }
  let file = normalize(join(CLIENT_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(CLIENT_DIR + sep) && file !== CLIENT_DIR) {
    res.writeHead(403);
    res.end();
    return;
  }
  const missing = !existsSync(file) || statSync(file).isDirectory();
  // Нет такого файла (например, арта ещё не нарисовали) — честный 404, чтобы клиент показал заглушку.
  if (missing && extname(url.pathname)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
    res.end('Не найдено');
    return;
  }
  // Любой другой путь — это экран игры (ссылки-приглашения /?r=КОД и т.п.).
  if (missing) file = join(CLIENT_DIR, 'index.html');
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
}

const server = createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

const MSG_PER_SEC = 20;
/** Отвечало ли соединение на последний ping. */
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws: WebSocket) => {
  const ctx: ConnCtx = { ws, room: null, side: null };
  let windowStart = Date.now();
  let count = 0;
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > MSG_PER_SEC) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
    try {
      rooms.handle(ws, ctx, msg);
    } catch (err) {
      console.error('Ошибка обработки сообщения', err);
    }
  });

  ws.on('close', () => rooms.detach(ctx, false));
});

// Проверка живых соединений и уборка брошенных комнат.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
  rooms.sweep();
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  console.log(`HUJARILOVO: сервер на http://localhost:${PORT} (WebSocket /ws)`);
});
