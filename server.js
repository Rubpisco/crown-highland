/**
 * 王冠高地 — 本地静态站点 + 好友房间服务。
 * 无第三方依赖：Node 内置 http + 内存房间 + 轮询。
 *
 * 房间逻辑复用 shared/room-service.js；Netlify Function 使用同一逻辑，
 * 只把存储换成 Netlify Blobs。
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomService, ROOM_TTL } from './shared/room-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_DIR = path.join(__dirname, 'shared');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const rooms = new Map();
let localEtag = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const memoryStore = {
  async get(key) {
    const found = rooms.get(key);
    return found ? { value: clone(found.value), etag: found.etag } : null;
  },
  async create(key, value) {
    if (rooms.has(key)) return false;
    rooms.set(key, { value: clone(value), etag: `local-${++localEtag}` });
    return true;
  },
  async update(key, value, etag) {
    const found = rooms.get(key);
    if (!found || found.etag !== etag) return false;
    rooms.set(key, { value: clone(value), etag: `local-${++localEtag}` });
    return true;
  },
  async delete(key) {
    rooms.delete(key);
  },
};

const roomService = createRoomService({ store: memoryStore });

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function error(res, status, message) {
  json(res, status, { ok: false, error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  let filePath;
  if (pathname === '/shared/engine.js') {
    filePath = path.join(SHARED_DIR, 'engine.js');
  } else {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    filePath = path.join(PUBLIC_DIR, relative);
  }
  const resolved = path.resolve(filePath);
  const allowedRoot = pathname.startsWith('/shared/')
    ? path.resolve(SHARED_DIR)
    : path.resolve(PUBLIC_DIR);
  if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
    error(res, 403, '禁止访问');
    return;
  }

  try {
    const info = await stat(resolved);
    if (info.isDirectory()) {
      return serveStatic(req, res, path.join(pathname, 'index.html'));
    }
    const data = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
      // 前端是单页应用：未知路径回退到 index.html
      if (!path.extname(pathname)) {
        try {
          const data = await readFile(path.join(PUBLIC_DIR, 'index.html'));
          res.writeHead(200, {
            'Content-Type': MIME['.html'],
            'Content-Length': data.length,
            'Cache-Control': 'no-cache',
          });
          res.end(req.method === 'HEAD' ? undefined : data);
          return;
        } catch {
          /* fallthrough */
        }
      }
      error(res, 404, '文件不存在');
    } else {
      console.error(e);
      error(res, 500, '服务器错误');
    }
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, rooms: rooms.size, uptime: process.uptime() });
  }

  let body = null;
  if (req.method === 'POST') {
    try {
      body = await readBody(req);
    } catch (e) {
      return error(res, 400, e.message);
    }
  }

  const result = await roomService.handle({
    method: req.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    body,
  });
  json(res, result.status, result.body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return error(res, 405, '方法不允许');
    }
    await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) error(res, 500, '服务器错误');
    else res.end();
  }
});

// 兜底清理本地内存中的过期房间；Netlify 版在读取时惰性清理。
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of rooms) {
    if (now - entry.value.updatedAt > ROOM_TTL) rooms.delete(code);
  }
}, 30 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`王冠高地已启动：http://localhost:${PORT}`);
  console.log(`局域网访问：http://<本机IP>:${PORT}`);
});

export { server, rooms };
