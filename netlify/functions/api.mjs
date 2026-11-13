/**
 * Netlify Function：好友房 API。
 *
 * 前端仍然请求 /api/*；Netlify Functions 2.0 的 config.path 把请求直接路由到这里。
 * 房间状态保存在 Netlify Blobs，函数实例之间共享，不依赖内存。
 */
import { getStore } from '@netlify/blobs';
import { createRoomService } from '../../shared/room-service.js';

const blobs = getStore({
  name: 'crown-highland-rooms',
  consistency: 'strong',
});

const store = {
  async get(key) {
    const found = await blobs.getWithMetadata(key, {
      type: 'json',
      consistency: 'strong',
    });
    return found ? { value: found.data, etag: found.etag } : null;
  },
  async create(key, value) {
    const written = await blobs.setJSON(key, value, { onlyIfNew: true });
    return Boolean(written.modified);
  },
  async update(key, value, etag) {
    if (!etag) return false;
    const written = await blobs.setJSON(key, value, { onlyIfMatch: etag });
    return Boolean(written.modified);
  },
  async delete(key) {
    await blobs.delete(key);
  },
};

const service = createRoomService({ store });

function requestPath(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return url.pathname;

  // 某些重写/预览环境会把原始路径放在这些头里。
  const original = request.headers.get('x-nf-original-path')
    || request.headers.get('x-nf-original-url');
  if (original) {
    try {
      return new URL(original, url.origin).pathname;
    } catch {
      /* ignore malformed header */
    }
  }
  return url.pathname;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export const config = {
  path: '/api/*',
};

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    let body = null;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.json();
      } catch {
        return jsonResponse(400, { ok: false, error: 'JSON 格式错误' });
      }
    }

    const result = await service.handle({
      method: request.method,
      pathname: requestPath(request),
      searchParams: url.searchParams,
      body,
    });
    return jsonResponse(result.status, result.body);
  } catch (error) {
    console.error('[netlify-api]', error);
    return jsonResponse(500, { ok: false, error: '服务器错误' });
  }
}
