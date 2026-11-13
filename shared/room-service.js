/**
 * 好友房 API 的纯逻辑层。
 *
 * 本地 server.js 使用内存 Map；Netlify Function 使用 Netlify Blobs。
 * 两边共用这里的校验、公开房间视图和状态变更，避免规则分叉。
 */
import crypto from 'node:crypto';
import * as E from './engine.js';

export const ROOM_TTL = 8 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CODE_ATTEMPTS = 50;
const MAX_UPDATE_ATTEMPTS = 5;

export function makeToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function makeCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

export function roomSide(room, token) {
  if (!token) return null;
  if (room.host && room.host.token === token) return 'white';
  if (room.guest && room.guest.token === token) return 'black';
  return null;
}

export function publicRoom(room, side) {
  const game = room.game;
  const started = Boolean(game);
  const players = {
    white: {
      name: room.host?.name || '房主',
      ready: Boolean(room.host),
      loadout: side === 'white' || started ? room.host?.loadout || null : null,
    },
    black: {
      name: room.guest?.name || '等待加入',
      ready: Boolean(room.guest),
      loadout: side === 'black' || started ? room.guest?.loadout || null : null,
    },
  };
  return {
    ok: true,
    code: room.code,
    you: side,
    status: game ? game.status : room.guest ? 'starting' : 'waiting',
    epoch: room.epoch || 1,
    version: game ? game.version : room.version,
    players,
    game: game || null,
    rematchVotes: [...room.rematchVotes],
  };
}

function validMoveShape(move) {
  if (!move || typeof move !== 'object') return false;
  if (move.kind === 'skipBonus') return true;
  if (typeof move.pieceId !== 'string') return false;
  if (!move.from || !move.to) return false;
  for (const p of [move.from, move.to]) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return false;
    if (p.x < 0 || p.x >= 12 || p.y < 0 || p.y >= 12) return false;
  }
  return true;
}

function sameSquare(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function matchLegalMove(state, side, requested) {
  const legal = E.generateLegalMoves(state, side);
  const kind = requested.kind || 'normal';
  if (requested.promote && !E.PROMOTION_CHOICES.includes(requested.promote)) return null;
  if (requested.passengerPromote && !E.PROMOTION_CHOICES.includes(requested.passengerPromote)) return null;
  const matched = legal.find((m) => {
    if (m.kind !== kind) return false;
    if (m.pieceId !== requested.pieceId) return false;
    if (kind === 'skipBonus') return true;
    if (!sameSquare(m.from, requested.from) || !sameSquare(m.to, requested.to)) return false;
    if ((m.passengerId || null) !== (requested.passengerId || null)) return false;
    if (m.drop && requested.drop) {
      if (!sameSquare(m.drop, requested.drop)) return false;
    } else if (Boolean(m.drop) !== Boolean(requested.drop)) {
      return false;
    }
    return true;
  }) || null;
  if (!matched) return null;
  if (requested.promote) {
    if (!matched.promote) return null;
    matched.promote = requested.promote;
  }
  if (requested.passengerPromote) {
    if (matched.kind !== 'transport' || !matched.passengerId || !matched.passengerPromote) return null;
    matched.passengerPromote = requested.passengerPromote;
  }
  return matched;
}

function serializeRoom(room) {
  return {
    ...room,
    rematchVotes: [...room.rematchVotes],
  };
}

function deserializeRoom(value) {
  return {
    ...value,
    rematchVotes: new Set(value.rematchVotes || []),
  };
}

function result(status, body) {
  return { status, body };
}

function failure(status, error) {
  return result(status, { ok: false, error });
}

/**
 * @param {{
 *   get: (key: string) => Promise<{ value: any, etag: string } | null>,
 *   create: (key: string, value: any) => Promise<boolean>,
 *   update: (key: string, value: any, etag: string) => Promise<boolean>,
 *   delete: (key: string) => Promise<void>,
 * }} store
 */
export function createRoomService({ store }) {
  async function loadRoom(code) {
    const found = await store.get(code);
    if (!found) return null;
    const room = deserializeRoom(found.value);
    if (Date.now() - room.updatedAt > ROOM_TTL) {
      await store.delete(code);
      return null;
    }
    return { room, etag: found.etag };
  }

  async function mutateRoom(code, token, mutate) {
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
      const found = await loadRoom(code);
      if (!found) return failure(404, '房间不存在或已过期');
      const side = roomSide(found.room, token);
      if (!side) return failure(401, '房间令牌无效');

      const mutation = mutate(found.room, side);
      if (mutation?.error) return failure(mutation.status || 400, mutation.error);
      found.room.updatedAt = Date.now();

      const updated = await store.update(code, serializeRoom(found.room), found.etag);
      if (updated) return result(200, publicRoom(found.room, side));
    }
    return failure(409, '房间状态繁忙，请重试');
  }

  async function createRoom(body) {
    const check = E.validateLoadout(body?.loadout, 'white');
    if (!check.ok) return failure(400, check.error);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = makeCode();
      const token = makeToken();
      const room = {
        code,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        epoch: 1,
        version: 1,
        host: {
          token,
          name: String(body?.name || '房主').slice(0, 16),
          loadout: check.loadout,
        },
        guest: null,
        game: null,
        rematchVotes: new Set(),
      };
      if (await store.create(code, serializeRoom(room))) {
        return result(201, {
          ok: true,
          code,
          token,
          side: 'white',
          room: publicRoom(room, 'white'),
        });
      }
    }
    return failure(500, '无法生成房间码，请重试');
  }

  async function joinRoom(code, body) {
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
      const found = await loadRoom(code);
      if (!found) return failure(404, '房间不存在或已过期');
      if (found.room.guest) return failure(409, '房间已满');

      const check = E.validateLoadout(body?.loadout, 'black');
      if (!check.ok) return failure(400, check.error);

      const token = makeToken();
      found.room.guest = {
        token,
        name: String(body?.name || '挑战者').slice(0, 16),
        loadout: check.loadout,
      };
      found.room.game = E.createGameState(found.room.host.loadout, found.room.guest.loadout);
      found.room.game.version = 0;
      found.room.version = 1;
      found.room.epoch = (found.room.epoch || 1) + 1;
      found.room.updatedAt = Date.now();

      if (await store.update(code, serializeRoom(found.room), found.etag)) {
        return result(200, {
          ok: true,
          code,
          token,
          side: 'black',
          room: publicRoom(found.room, 'black'),
        });
      }
    }
    return failure(409, '房间状态繁忙，请重试');
  }

  async function getState(code, token, since) {
    const found = await loadRoom(code);
    if (!found) return failure(404, '房间不存在或已过期');
    const side = roomSide(found.room, token);
    if (!side) return failure(401, '房间令牌无效');
    const currentVersion = found.room.game ? found.room.game.version : found.room.version;
    if (Number.isFinite(since) && since === currentVersion) {
      return result(200, {
        ok: true,
        unchanged: true,
        version: currentVersion,
        status: found.room.game ? found.room.game.status : 'waiting',
      });
    }
    return result(200, publicRoom(found.room, side));
  }

  async function handle({ method, pathname, searchParams = new URLSearchParams(), body }) {
    if (method === 'GET' && pathname === '/api/health') {
      return result(200, { ok: true, rooms: null, uptime: 0 });
    }
    if (method === 'POST' && pathname === '/api/rooms') {
      return createRoom(body);
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== 'rooms' || !parts[2]) {
      return failure(404, '接口不存在');
    }
    const code = parts[2].toUpperCase();
    const token = searchParams.get('token') || body?.token || '';

    if (method === 'POST' && parts[3] === 'join' && parts.length === 4) {
      return joinRoom(code, body);
    }
    if (method === 'GET' && parts[3] === 'state' && parts.length === 4) {
      return getState(code, token, Number(searchParams.get('since')));
    }
    if (method === 'POST' && parts[3] === 'loadout' && parts.length === 4) {
      return mutateRoom(code, token, (room, side) => {
        if (room.game) return { status: 409, error: '对局已经开始' };
        const check = E.validateLoadout(body?.loadout, side);
        if (!check.ok) return { status: 400, error: check.error };
        if (side === 'white') room.host.loadout = check.loadout;
        else room.guest.loadout = check.loadout;
        room.version += 1;
      });
    }
    if (method === 'POST' && parts[3] === 'move' && parts.length === 4) {
      return mutateRoom(code, token, (room, side) => {
        if (!room.game) return { status: 409, error: '对局尚未开始' };
        if (room.game.status === 'finished') return { status: 409, error: '对局已经结束' };
        if (room.game.turn !== side) return { status: 409, error: '还没轮到你' };
        if (!validMoveShape(body?.move)) return { status: 400, error: '走法格式错误' };
        const matched = matchLegalMove(room.game, side, body.move);
        if (!matched) return { status: 400, error: '非法走法' };
        E.applyMove(room.game, matched);
      });
    }
    if (method === 'POST' && parts[3] === 'action' && parts.length === 4) {
      return mutateRoom(code, token, (room, side) => {
        const action = body?.action;
        if (action === 'david') {
          if (!room.game) return { status: 409, error: '对局尚未开始' };
          if (!E.activateDavid(room.game, side)) return { status: 400, error: '现在无法发动神佑' };
          return;
        }
        if (action === 'resign') {
          if (!room.game || room.game.status === 'finished') return { status: 409, error: '对局已经结束' };
          E.resign(room.game, side);
          return;
        }
        if (action === 'rematch') {
          if (!room.game || room.game.status !== 'finished') return { status: 409, error: '对局尚未结束' };
          room.rematchVotes.add(side);
          if (room.rematchVotes.size >= 2) {
            room.game = E.createGameState(room.host.loadout, room.guest.loadout);
            room.game.version = 0;
            room.rematchVotes.clear();
            room.epoch = (room.epoch || 1) + 1;
            room.version += 1;
          } else {
            room.game.version = (room.game.version || 0) + 1;
          }
          return;
        }
        return { status: 400, error: '未知动作' };
      });
    }
    return failure(404, '接口不存在');
  }

  return { handle };
}
