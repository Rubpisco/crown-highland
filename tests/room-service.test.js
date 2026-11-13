import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../shared/engine.js';
import { createRoomService } from '../shared/room-service.js';

function memoryStore() {
  const data = new Map();
  let serial = 0;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return {
    async get(key) {
      const found = data.get(key);
      return found ? { value: clone(found.value), etag: found.etag } : null;
    },
    async create(key, value) {
      if (data.has(key)) return false;
      data.set(key, { value: clone(value), etag: `e${++serial}` });
      return true;
    },
    async update(key, value, etag) {
      const found = data.get(key);
      if (!found || found.etag !== etag) return false;
      data.set(key, { value: clone(value), etag: `e${++serial}` });
      return true;
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

function loadout(side) {
  return E.normalizeLoadout(E.defaultLoadout(), side);
}

test('好友房服务：创建、加入、读取状态和走子', async () => {
  const service = createRoomService({ store: memoryStore() });

  const created = await service.handle({
    method: 'POST',
    pathname: '/api/rooms',
    searchParams: new URLSearchParams(),
    body: { name: '房主', loadout: loadout('white') },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.match(created.body.code, /^[A-Z0-9]{6}$/);
  assert.ok(created.body.token);

  const code = created.body.code;
  const joined = await service.handle({
    method: 'POST',
    pathname: `/api/rooms/${code}/join`,
    searchParams: new URLSearchParams(),
    body: { name: '挑战者', loadout: loadout('black') },
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.side, 'black');
  assert.equal(joined.body.room.game.status, 'playing');

  const blackToken = joined.body.token;
  const state = await service.handle({
    method: 'GET',
    pathname: `/api/rooms/${code}/state`,
    searchParams: new URLSearchParams({ token: blackToken, since: '-1' }),
    body: null,
  });
  assert.equal(state.status, 200);
  assert.equal(state.body.unchanged, undefined);
  assert.equal(state.body.game.turn, 'white');

  const unchanged = await service.handle({
    method: 'GET',
    pathname: `/api/rooms/${code}/state`,
    searchParams: new URLSearchParams({ token: blackToken, since: String(state.body.version) }),
    body: null,
  });
  assert.equal(unchanged.body.unchanged, true);

  const move = E.generateLegalMoves(state.body.game, 'white')[0];
  const moved = await service.handle({
    method: 'POST',
    pathname: `/api/rooms/${code}/move`,
    searchParams: new URLSearchParams(),
    body: { token: created.body.token, move },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.game.turn, 'black');
  assert.ok(moved.body.game.version > state.body.version);
});

test('好友房服务：令牌错误返回 401，房间不存在返回 404', async () => {
  const service = createRoomService({ store: memoryStore() });
  const created = await service.handle({
    method: 'POST',
    pathname: '/api/rooms',
    searchParams: new URLSearchParams(),
    body: { loadout: loadout('white') },
  });
  const code = created.body.code;

  const badToken = await service.handle({
    method: 'GET',
    pathname: `/api/rooms/${code}/state`,
    searchParams: new URLSearchParams({ token: 'bad' }),
    body: null,
  });
  assert.equal(badToken.status, 401);

  const missing = await service.handle({
    method: 'GET',
    pathname: '/api/rooms/ZZZZZZ/state',
    searchParams: new URLSearchParams({ token: 'bad' }),
    body: null,
  });
  assert.equal(missing.status, 404);
});
