import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../shared/engine.js';

function emptyState(turn = 'white') {
  const terrain = E.buildTerrain();
  const board = Array.from({ length: 12 }, () => Array(12).fill(null));
  return {
    board,
    terrain,
    highlandRegions: E.buildHighlandRegions(terrain),
    pieces: {},
    turn,
    turnNumber: 1,
    moveNumber: 1,
    status: 'playing',
    winner: null,
    reason: null,
    check: false,
    captured: { white: [], black: [] },
    history: [],
    lastMove: null,
    pendingBonus: null,
    flags: {
      white: { davidShield: true, immuneUntil: 0, divineShieldActive: false },
      black: { davidShield: true, immuneUntil: 0, divineShieldActive: false },
    },
    version: 0,
  };
}

function add(state, id, side, type, subtype, x, y) {
  state.pieces[id] = {
    id, side, type, subtype, x, y, startX: x, startY: y,
    moved: false, abilityUsed: false, promoted: false,
  };
  state.board[y][x] = id;
}

function plain(state) {
  for (const row of state.terrain) row.fill(E.TERRAIN.PLAIN);
  state.highlandRegions = E.buildHighlandRegions(state.terrain);
}

function highland(state, cells) {
  for (const [x, y] of cells) state.terrain[y][x] = E.TERRAIN.HIGHLAND;
  state.highlandRegions = E.buildHighlandRegions(state.terrain);
}

function river(state, cells) {
  for (const [x, y] of cells) state.terrain[y][x] = E.TERRAIN.RIVER;
  state.highlandRegions = E.buildHighlandRegions(state.terrain);
}

function freshGame() {
  return E.createGameState(
    E.normalizeLoadout(E.defaultLoadout(), 'white'),
    E.normalizeLoadout(E.defaultLoadout(), 'black'),
  );
}

test('棋谱使用英文棋子缩写', () => {
  assert.equal(E.pieceCode('K', 'david'), 'Kd');
  assert.equal(E.pieceCode({ type: 'N', subtype: 'armored' }), 'Knca');
  assert.equal(E.pieceCode('P', 'archer'), 'Par');
  const state = emptyState();
  assert.equal(E.moveNotation(state, {
    pieceType: 'K', pieceSubtype: 'david',
    from: { x: 4, y: 10 }, to: { x: 4, y: 9 },
  }, false), 'Kd e11-e10');
  assert.equal(E.moveNotation(state, {
    pieceType: 'P', pieceSubtype: 'archer', kind: 'ranged', captureId: 'x',
    from: { x: 0, y: 5 }, to: { x: 1, y: 3 },
  }, false), 'Par a6xb4 (R)');
  assert.equal(E.moveNotation(state, {
    pieceType: 'R', pieceSubtype: 'transport', kind: 'transport',
    from: { x: 0, y: 11 }, to: { x: 0, y: 10 }, drop: { x: 0, y: 9 },
  }, false), 'Rtr a12-a11 (drop a10)');
});

test('初始局面：44 子、地形数量正确、车没有普通车亚型', () => {
  const s = freshGame();
  assert.equal(Object.keys(s.pieces).length, 44);
  assert.equal(s.turn, 'white');
  assert.equal(s.terrain.flat().filter((t) => t === E.TERRAIN.HIGHLAND).length, 16);
  assert.equal(s.terrain.flat().filter((t) => t === E.TERRAIN.RIVER).length, 24);
  const rooks = Object.values(s.pieces).filter((p) => p.type === 'R');
  assert.equal(rooks.length, 6);
  assert.ok(rooks.every((p) => p.subtype === 'transport' || p.subtype === 'siege'));
});

test('阵型：e9/h9 前哨兵，d10/i10 一后一车', () => {
  const s = freshGame();
  assert.equal(E.squareName(s.pieces['w-P7'].x, s.pieces['w-P7'].y), 'e9');
  assert.equal(E.squareName(s.pieces['w-P8'].x, s.pieces['w-P8'].y), 'h9');
  assert.equal(E.squareName(s.pieces['b-P11'].x, s.pieces['b-P11'].y), 'e4');
  const m = [s.pieces['w-M1'], s.pieces['w-M2']];
  assert.equal(m.filter((p) => p.type === 'Q').length, 1);
  assert.equal(m.filter((p) => p.type === 'R').length, 1);
});

test('走法与撤销：makeMove 后 undoMove 恢复完整局面', () => {
  const s = freshGame();
  const before = JSON.stringify(s);
  const move = E.generateLegalMoves(s, 'white')[0];
  const undo = E.makeMove(s, move, true);
  assert.notEqual(JSON.stringify(s), before);
  E.undoMove(s, undo);
  assert.equal(JSON.stringify(s), before);
});

test('高地：普通王不能上下高地，凯撒可以', () => {
  const s = emptyState();
  add(s, 'wK', 'white', 'K', 'david', 5, 5);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 4]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wK).some((m) => m.to.x === 5 && m.to.y === 4), false);
  s.pieces.wK.subtype = 'caesar';
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wK).some((m) => m.to.x === 5 && m.to.y === 4), true);
});

test('连续高地按八方向连通；同一片高地上按平地攻击', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wQ', 'white', 'Q', null, 0, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 1, 2);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 3], [1, 2]]);
  assert.equal(E.highlandRegionAt(s, 0, 3), E.highlandRegionAt(s, 1, 2));
  assert.equal(E.canAttack(s, s.pieces.wQ, { x: 0, y: 3 }, { x: 1, y: 2 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wQ).some((m) => m.captureId === 'bP'), true);
});

test('高地阻挡滑行但不阻挡弓兵远程视线', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wQ', 'white', 'Q', null, 0, 3);
  add(s, 'wA', 'white', 'P', 'archer', 0, 3);
  add(s, 'bQ', 'black', 'P', 'infantry', 0, 1);
  add(s, 'bP', 'black', 'P', 'infantry', 1, 1);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 2], [1, 2]]);
  assert.equal(E.canAttack(s, s.pieces.wQ, { x: 0, y: 3 }, { x: 0, y: 1 }), false);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 0, y: 3 }, { x: 1, y: 1 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wA).some((m) => m.captureId === 'bP'), true);
});

test('连续高地上步兵和弓兵都能吃掉同片高地的敌子', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wI', 'white', 'P', 'infantry', 1, 11);
  add(s, 'wA', 'white', 'P', 'archer', 0, 11);
  add(s, 'bE', 'black', 'P', 'infantry', 0, 10);
  add(s, 'wK', 'white', 'K', 'david', 5, 11);
  add(s, 'bK', 'black', 'K', 'david', 11, 0);
  highland(s, [[0, 11], [1, 11], [0, 10]]);
  assert.equal(E.highlandRegionAt(s, 1, 11), E.highlandRegionAt(s, 0, 10));
  assert.equal(E.canAttack(s, s.pieces.wI, { x: 1, y: 11 }, { x: 0, y: 10 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wI).some((m) => m.captureId === 'bE'), true);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 0, y: 11 }, { x: 0, y: 10 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wA).some((m) => m.captureId === 'bE'), true);
});

test('小兵下高地：步兵不能斜下攻击，枪兵可正前 1 格攻击', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wI', 'white', 'P', 'infantry', 5, 5);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5]]);
  const infantryMoves = E.generatePseudoMoves(s, 'white', s.pieces.wI);
  assert.equal(infantryMoves.some((m) => m.to.x === 5 && m.to.y === 4), true);
  assert.equal(infantryMoves.some((m) => m.to.x === 5 && m.to.y === 3), false);

  add(s, 'bE', 'black', 'P', 'infantry', 4, 4);
  assert.equal(E.canAttack(s, s.pieces.wI, { x: 5, y: 5 }, { x: 4, y: 4 }), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wI).some((m) => m.captureId === 'bE'), false);

  s = emptyState();
  plain(s);
  add(s, 'wSp', 'white', 'P', 'spear', 5, 5);
  add(s, 'bE', 'black', 'P', 'infantry', 5, 4);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5]]);
  assert.equal(E.canAttack(s, s.pieces.wSp, { x: 5, y: 5 }, { x: 5, y: 4 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wSp).some((m) => m.captureId === 'bE'), true);
});

test('高地上的弓兵可以攻击斜前方 1 格的高地下敌人', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wA', 'white', 'P', 'archer', 5, 5);
  add(s, 'bE', 'black', 'P', 'infantry', 4, 4);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5]]);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 5, y: 5 }, { x: 4, y: 4 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wA).some((m) => m.captureId === 'bE'), true);
  assert.equal(E.generateLegalMoves(s, 'white').some((m) => m.captureId === 'bE'), true);

  // 同一片连续高地上的斜前方敌人不可攻击；斜下攻击只对低处生效。
  s = emptyState();
  plain(s);
  add(s, 'wA', 'white', 'P', 'archer', 5, 5);
  add(s, 'bE', 'black', 'P', 'infantry', 4, 4);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5], [4, 4]]);
  assert.equal(E.highlandRegionAt(s, 5, 5), E.highlandRegionAt(s, 4, 4));
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 5, y: 5 }, { x: 4, y: 4 }), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wA).some((m) => m.captureId === 'bE'), false);
  assert.equal(E.generateLegalMoves(s, 'white').some((m) => m.captureId === 'bE'), false);

  // 正前方和 L 形远程仍然不能越过高地边缘攻击低处。
  add(s, 'bF', 'black', 'P', 'infantry', 5, 4);
  add(s, 'bL', 'black', 'P', 'infantry', 4, 3);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 5, y: 5 }, { x: 5, y: 4 }), false);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 5, y: 5 }, { x: 4, y: 3 }), false);
  const moves = E.generatePseudoMoves(s, 'white', s.pieces.wA);
  assert.equal(moves.some((m) => m.captureId === 'bF'), false);
  assert.equal(moves.some((m) => m.captureId === 'bL'), false);

  // 黑方镜像：黑方弓兵在高地上攻击斜前方（y 增大方向）1 格。
  s = emptyState('black');
  plain(s);
  add(s, 'bA', 'black', 'P', 'archer', 5, 5);
  add(s, 'wE', 'white', 'P', 'infantry', 4, 6);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5]]);
  assert.equal(E.canAttack(s, s.pieces.bA, { x: 5, y: 5 }, { x: 4, y: 6 }), true);
  assert.equal(E.generatePseudoMoves(s, 'black', s.pieces.bA).some((m) => m.captureId === 'wE'), true);
  assert.equal(E.generateLegalMoves(s, 'black').some((m) => m.captureId === 'wE'), true);
});

test('盾兵攻击斜前方和正后方，不攻击斜后方', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wSh', 'white', 'P', 'shield', 5, 5);
  add(s, 'bF', 'black', 'P', 'infantry', 4, 4);
  add(s, 'bB', 'black', 'P', 'infantry', 5, 6);
  add(s, 'bD', 'black', 'P', 'infantry', 4, 6);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  assert.equal(E.canAttack(s, s.pieces.wSh, { x: 5, y: 5 }, { x: 4, y: 4 }), true);
  assert.equal(E.canAttack(s, s.pieces.wSh, { x: 5, y: 5 }, { x: 5, y: 6 }), true);
  assert.equal(E.canAttack(s, s.pieces.wSh, { x: 5, y: 5 }, { x: 4, y: 6 }), false);
  const moves = E.generatePseudoMoves(s, 'white', s.pieces.wSh);
  assert.equal(moves.some((m) => m.captureId === 'bF'), true);
  assert.equal(moves.some((m) => m.captureId === 'bB'), true);
  assert.equal(moves.some((m) => m.captureId === 'bD'), false);
  const legal = E.generateLegalMoves(s, 'white');
  assert.equal(legal.some((m) => m.captureId === 'bF'), true);
  assert.equal(legal.some((m) => m.captureId === 'bB'), true);
  assert.equal(legal.some((m) => m.captureId === 'bD'), false);
  const rearCapture = legal.find((m) => m.captureId === 'bB');
  E.makeMove(s, rearCapture);
  assert.equal(s.board[6][5], 'wSh');
  assert.equal(s.board[5][5], null);
  assert.equal(s.pieces.bB, undefined);

  // 高地上的盾兵仍不能攻击正后方的低地敌人。
  s = emptyState();
  plain(s);
  add(s, 'wSh', 'white', 'P', 'shield', 5, 5);
  add(s, 'bB', 'black', 'P', 'infantry', 5, 6);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5]]);
  assert.equal(E.canAttack(s, s.pieces.wSh, { x: 5, y: 5 }, { x: 5, y: 6 }), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wSh).some((m) => m.captureId === 'bB'), false);

  // 黑方镜像：斜前方和正后方可攻击，斜后方不可攻击。
  s = emptyState('black');
  plain(s);
  add(s, 'bSh', 'black', 'P', 'shield', 5, 5);
  add(s, 'wF', 'white', 'P', 'infantry', 6, 6);
  add(s, 'wB', 'white', 'P', 'infantry', 5, 4);
  add(s, 'wD', 'white', 'P', 'infantry', 6, 4);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  assert.equal(E.canAttack(s, s.pieces.bSh, { x: 5, y: 5 }, { x: 6, y: 6 }), true);
  assert.equal(E.canAttack(s, s.pieces.bSh, { x: 5, y: 5 }, { x: 5, y: 4 }), true);
  assert.equal(E.canAttack(s, s.pieces.bSh, { x: 5, y: 5 }, { x: 6, y: 4 }), false);
  const blackMoves = E.generatePseudoMoves(s, 'black', s.pieces.bSh);
  assert.equal(blackMoves.some((m) => m.captureId === 'wF'), true);
  assert.equal(blackMoves.some((m) => m.captureId === 'wB'), true);
  assert.equal(blackMoves.some((m) => m.captureId === 'wD'), false);
});

test('高地目标：普通棋子只能山脚/同片高地攻击，攻城车可远攻', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wQ', 'white', 'Q', null, 0, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 0, 0);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 2], [0, 1], [0, 0]]);
  assert.equal(E.canAttack(s, s.pieces.wQ, { x: 0, y: 3 }, { x: 0, y: 0 }), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wQ).some((m) => m.captureId === 'bP'), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wQ).some((m) => !m.captureId && m.to.x === 0 && m.to.y === 2), true);

  s = emptyState();
  plain(s);
  add(s, 'wS', 'white', 'R', 'siege', 0, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 0, 0);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 2], [0, 1], [0, 0]]);
  assert.equal(E.canAttack(s, s.pieces.wS, { x: 0, y: 3 }, { x: 0, y: 0 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wS).some((m) => m.captureId === 'bP'), true);
});

test('攻城车可穿过整片连续高地，落在其后一格；不能跨两片', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wQ', 'white', 'Q', null, 0, 5);
  add(s, 'wS', 'white', 'R', 'siege', 0, 5);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 4], [0, 3]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wQ).some((m) => m.to.x === 0 && m.to.y === 2), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wS).some((m) => m.to.x === 0 && m.to.y === 2), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wS).some((m) => m.to.x === 0 && m.to.y === 1), false);

  s = emptyState();
  plain(s);
  add(s, 'wS', 'white', 'R', 'siege', 0, 5);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 4], [0, 2]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wS).some((m) => m.to.x === 0 && m.to.y === 1), false);
});

test('攻城车可以攻击高地后一格的敌人', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wS', 'white', 'R', 'siege', 0, 5);
  add(s, 'bP', 'black', 'P', 'infantry', 0, 2);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 4], [0, 3]]);
  assert.equal(E.canAttack(s, s.pieces.wS, { x: 0, y: 5 }, { x: 0, y: 2 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wS).some((m) => m.captureId === 'bP'), true);
});

test('骑士 L 形可以越过高地进攻和移动', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wN', 'white', 'N', 'hunter', 1, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 0, 1);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 2], [1, 2]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wN).some((m) => m.to.x === 0 && m.to.y === 1), true);
  assert.equal(E.canAttack(s, s.pieces.wN, { x: 1, y: 3 }, { x: 0, y: 1 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wN).some((m) => m.captureId === 'bP'), true);
});

test('游猎骑士在连续高地上可正交两格；上下高地只走一格', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wN', 'white', 'N', 'hunter', 5, 5);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5], [5, 4], [5, 3]]);
  let moves = E.generatePseudoMoves(s, 'white', s.pieces.wN);
  assert.equal(moves.some((m) => m.to.x === 5 && m.to.y === 3), true, '连续高地上应能走两格');

  s = emptyState();
  plain(s);
  add(s, 'wN', 'white', 'N', 'hunter', 5, 5);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 4], [5, 3]]);
  moves = E.generatePseudoMoves(s, 'white', s.pieces.wN);
  assert.equal(moves.some((m) => m.to.x === 5 && m.to.y === 4), true, '上高地应能走一格');
  assert.equal(moves.some((m) => m.to.x === 5 && m.to.y === 3), false, '不能一次上两格高地');

  s = emptyState();
  plain(s);
  add(s, 'wN', 'white', 'N', 'hunter', 5, 5);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5], [5, 4]]);
  moves = E.generatePseudoMoves(s, 'white', s.pieces.wN);
  assert.equal(moves.some((m) => m.to.x === 5 && m.to.y === 6), true, '下高地应能走一格');
  assert.equal(moves.some((m) => m.to.x === 5 && m.to.y === 7), false, '不能一次下两格高地');
});

test('甲胄骑士只有四方向 1 格与 8 个 L 形，没有斜角 1 格', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wN', 'white', 'N', 'armored', 5, 5);
  add(s, 'bP', 'black', 'P', 'infantry', 6, 6);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  assert.equal(E.canAttack(s, s.pieces.wN, { x: 5, y: 5 }, { x: 6, y: 6 }), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wN).some((m) => m.to.x === 6 && m.to.y === 6), false);
});

test('运输车携带相邻友军上高地；运输车和乘客都可吃子', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wT', 'white', 'R', 'transport', 5, 5);
  add(s, 'wP', 'white', 'P', 'infantry', 4, 5);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  add(s, 'b1', 'black', 'P', 'infantry', 4, 4);
  add(s, 'b2', 'black', 'P', 'infantry', 5, 4);
  highland(s, [[4, 4]]);
  const move = E.generatePseudoMoves(s, 'white', s.pieces.wT).find((m) => m.kind === 'transport');
  assert.ok(move);
  assert.deepEqual(move.to, { x: 5, y: 4 });
  assert.deepEqual(move.drop, { x: 4, y: 4 });
  E.applyMove(s, move);
  assert.equal(s.pieces.wT.x, 5);
  assert.equal(s.pieces.wT.y, 4);
  assert.equal(s.pieces.wP.x, 4);
  assert.equal(s.pieces.wP.y, 4);
  assert.equal(s.pieces.b1, undefined);
  assert.equal(s.pieces.b2, undefined);
  assert.equal(s.captured.white.length, 2);
});

test('运输车可以走到友军原格，把友军送上相邻高地', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wT', 'white', 'R', 'transport', 5, 5);
  add(s, 'wP', 'white', 'P', 'infantry', 5, 4);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 3]]);
  const move = E.generatePseudoMoves(s, 'white', s.pieces.wT)
    .find((m) => m.kind === 'transport' && m.passengerId === 'wP');
  assert.ok(move);
  assert.deepEqual(move.to, { x: 5, y: 4 });
  assert.deepEqual(move.drop, { x: 5, y: 3 });
  E.applyMove(s, move);
  assert.equal(s.pieces.wT.x, 5);
  assert.equal(s.pieces.wT.y, 4);
  assert.equal(s.pieces.wP.x, 5);
  assert.equal(s.pieces.wP.y, 3);
  assert.equal(s.board[4][5], 'wT');
  assert.equal(s.board[3][5], 'wP');
});

test('攻城车停在空高地上可以拆高地，并刷新连续高地', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wS', 'white', 'R', 'siege', 5, 5);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 4], [5, 3]]);
  const d = E.generatePseudoMoves(s, 'white', s.pieces.wS).find((m) => m.kind === 'demolish' && m.to.x === 5 && m.to.y === 4);
  assert.ok(d);
  E.applyMove(s, d);
  assert.equal(s.terrain[4][5], E.TERRAIN.PLAIN);
  assert.equal(s.pieces.wS.x, 5);
  assert.equal(s.pieces.wS.y, 4);
});

test('兵：步兵永久两格、可上相邻高地但不能两格上高地', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wI', 'white', 'P', 'infantry', 5, 8);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  const moves = E.generatePseudoMoves(s, 'white', s.pieces.wI);
  assert.equal(moves.some((m) => m.to.x === 5 && m.to.y === 6), true);
  highland(s, [[5, 7]]);
  const moves2 = E.generatePseudoMoves(s, 'white', s.pieces.wI);
  assert.equal(moves2.some((m) => m.to.x === 5 && m.to.y === 7), true);
  assert.equal(moves2.some((m) => m.to.x === 5 && m.to.y === 6), false);
});

test('弓兵/枪兵/盾兵初次两格可上相邻高地，之后不能', () => {
  for (const sub of ['archer', 'spear', 'shield']) {
    const s = emptyState();
    plain(s);
    add(s, 'wP', 'white', 'P', sub, 5, 8);
    add(s, 'wK', 'white', 'K', 'david', 0, 0);
    add(s, 'bK', 'black', 'K', 'david', 11, 11);
    highland(s, [[5, 7]]);
    assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wP).some((m) => m.to.x === 5 && m.to.y === 7), true, sub);
    s.pieces.wP.moved = true;
    assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wP).some((m) => m.to.x === 5 && m.to.y === 7), false, sub);
  }
});

test('弓兵可越过路径高地攻击；枪兵可攻击相邻高地', () => {
  let s = emptyState();
  plain(s);
  add(s, 'wA', 'white', 'P', 'archer', 0, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 1, 1);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[1, 2]]);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 0, y: 3 }, { x: 1, y: 1 }), true);

  s = emptyState();
  plain(s);
  add(s, 'wS', 'white', 'P', 'spear', 0, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 0, 2);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 2]]);
  assert.equal(E.canAttack(s, s.pieces.wS, { x: 0, y: 3 }, { x: 0, y: 2 }), true);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wS).some((m) => m.captureId === 'bP'), true);
});

test('升变可选后/运输车/攻城车/主教/骑士，并记录亚型', () => {
  for (const choice of ['Q', 'R:transport', 'R:siege', 'B:red', 'B:heretic', 'N:armored', 'N:hunter']) {
    const s = emptyState();
    plain(s);
    add(s, 'wP', 'white', 'P', 'infantry', 5, 1);
    add(s, 'wK', 'white', 'K', 'david', 0, 0);
    add(s, 'bK', 'black', 'K', 'david', 11, 11);
    const move = E.generatePseudoMoves(s, 'white', s.pieces.wP).find((m) => m.to.x === 5 && m.to.y === 0);
    assert.ok(move, choice);
    E.applyMove(s, { ...move, promote: choice });
    const [type, sub] = choice.split(':');
    assert.equal(s.pieces.wP.type, type);
    if (sub) assert.equal(s.pieces.wP.subtype, sub);
    assert.equal(s.pieces.wP.promoted, true);
  }
});

test('阵容校验：没有普通车，d10/i10 仍必须一后一车', () => {
  const white = E.normalizeLoadout(E.defaultLoadout(), 'white');
  assert.equal(white.M2, 'R:transport');
  assert.equal(E.validateLoadout(white, 'white').ok, true);
  const bothQueens = { ...white, M1: 'Q', M2: 'Q' };
  assert.equal(E.validateLoadout(bothQueens, 'white').ok, false);
  const bothRooks = { ...white, M1: 'R:transport', M2: 'R:siege' };
  assert.equal(E.validateLoadout(bothRooks, 'white').ok, false);
  const legacy = { ...white, R1: 'R:engineer' };
  const repaired = E.normalizeLoadout(legacy, 'white');
  assert.equal(repaired.R1, 'R:siege');
  const s = E.createGameState(repaired, E.normalizeLoadout(E.defaultLoadout(), 'black'));
  assert.equal(E.moveRange(s, s.pieces['w-R1']), 99);
});

test('查理曼可以花 2 点上下高地，并消耗能力', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wK', 'white', 'K', 'charlemagne', 5, 5);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 4]]);
  const move = E.generatePseudoMoves(s, 'white', s.pieces.wK).find((m) => m.to.x === 5 && m.to.y === 4);
  assert.ok(move);
  assert.equal(move.ability, 'charlemagne');
  E.applyMove(s, move);
  assert.equal(s.pieces.wK.abilityUsed, true);
});

test('查理曼在高地上仍可正常移动到同一片高地', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wK', 'white', 'K', 'charlemagne', 5, 5);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 5], [5, 4]]);
  s.pieces.wK.abilityUsed = true;
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wK).some((m) => m.to.x === 5 && m.to.y === 4), true);
});

test('同一局面出现三次判和', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wK', 'white', 'K', 'david', 0, 11);
  add(s, 'bK', 'black', 'K', 'david', 11, 0);
  add(s, 'wR', 'white', 'R', 'transport', 0, 6);
  add(s, 'bR', 'black', 'R', 'transport', 11, 5);
  const go = (pieceId, x, y) => {
    const move = E.generateLegalMoves(s, s.turn)
      .find((m) => m.pieceId === pieceId && m.to.x === x && m.to.y === y);
    assert.ok(move, `${pieceId} -> ${x},${y}`);
    E.applyMove(s, move);
  };
  for (let cycle = 0; cycle < 3 && s.status === 'playing'; cycle++) {
    for (const [id, x, y] of [['wR', 0, 7], ['bR', 11, 6], ['wR', 0, 6], ['bR', 11, 5]]) {
      if (s.status !== 'playing') break;
      go(id, x, y);
    }
  }
  assert.equal(s.status, 'finished');
  assert.equal(s.reason, 'repetition');
  assert.equal(s.winner, null);
});

test('将死与逼和仍然成立', () => {
  let s = emptyState('black');
  add(s, 'bK', 'black', 'K', 'david', 0, 0);
  add(s, 'wK', 'white', 'K', 'david', 2, 1);
  add(s, 'wQ', 'white', 'Q', null, 1, 1);
  E.updateStatus(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.reason, 'checkmate');

  s = emptyState('black');
  add(s, 'bK', 'black', 'K', 'david', 0, 0);
  add(s, 'wK', 'white', 'K', 'david', 2, 1);
  add(s, 'wQ', 'white', 'Q', null, 1, 2);
  E.updateStatus(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.reason, 'stalemate');
});

test('河道阻断滑行攻击与将军，但不能停留', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wR', 'white', 'R', 'transport', 0, 3);
  add(s, 'bR', 'black', 'R', 'transport', 0, 0);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  s.terrain[1][0] = E.TERRAIN.RIVER;
  s.highlandRegions = E.buildHighlandRegions(s.terrain);
  assert.equal(E.canAttack(s, s.pieces.wR, { x: 0, y: 3 }, { x: 0, y: 0 }), false);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wR).some((m) => m.to.x === 0 && m.to.y === 1), false);
});

test('将军判定按实际攻击：滑行棋子不能隔河或隔高地将军', () => {
  const riverState = emptyState();
  plain(riverState);
  add(riverState, 'wQ', 'white', 'Q', null, 5, 5);
  add(riverState, 'bK', 'black', 'K', 'david', 5, 2);
  add(riverState, 'wK', 'white', 'K', 'david', 0, 0);
  river(riverState, [[5, 4], [5, 3]]);
  assert.equal(E.isKingInCheck(riverState, 'black'), false);

  const highlandState = emptyState();
  plain(highlandState);
  add(highlandState, 'wQ', 'white', 'Q', null, 5, 5);
  add(highlandState, 'bK', 'black', 'K', 'david', 5, 2);
  add(highlandState, 'wK', 'white', 'K', 'david', 0, 0);
  highland(highlandState, [[5, 4], [5, 3]]);
  assert.equal(E.isKingInCheck(highlandState, 'black'), false);
});

test('弓兵 L 形远程会被路径上的棋子阻挡，但不会被高地阻挡', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wA', 'white', 'P', 'archer', 0, 3);
  add(s, 'bP', 'black', 'P', 'infantry', 1, 1);
  add(s, 'wK', 'white', 'K', 'david', 11, 10);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[0, 2]]);
  add(s, 'block', 'white', 'P', 'infantry', 1, 2);
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 0, y: 3 }, { x: 1, y: 1 }), false);
  s.pieces.block.side = 'black';
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 0, y: 3 }, { x: 1, y: 1 }), false);
  s.board[2][1] = null;
  delete s.pieces.block;
  assert.equal(E.canAttack(s, s.pieces.wA, { x: 0, y: 3 }, { x: 1, y: 1 }), true);
});

test('步兵在高地上可以正常两格移动，但不能两格跨上高地', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wI', 'white', 'P', 'infantry', 5, 6);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[5, 6], [5, 5], [5, 4]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wI).some((m) => m.to.x === 5 && m.to.y === 4), true);
  const s2 = emptyState();
  plain(s2);
  add(s2, 'wI', 'white', 'P', 'infantry', 5, 6);
  add(s2, 'wK', 'white', 'K', 'david', 0, 0);
  add(s2, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s2, [[5, 5], [5, 4]]);
  assert.equal(E.generatePseudoMoves(s2, 'white', s2.pieces.wI).some((m) => m.to.x === 5 && m.to.y === 4), false);
});

test('运输车只携带正交相邻的兵，且只能把兵正交送上高地', () => {
  for (const type of ['K', 'R']) {
    const s = emptyState();
    plain(s);
    add(s, 'wT', 'white', 'R', 'transport', 5, 5);
    add(s, 'wU', 'white', type, type === 'K' ? 'david' : 'transport', 4, 5);
    add(s, 'wK', 'white', 'K', 'david', 0, 0);
    add(s, 'bK', 'black', 'K', 'david', 11, 11);
    highland(s, [[4, 4]]);
    assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wT)
      .some((m) => m.kind === 'transport' && m.passengerId === 'wU'), false, type);
  }

  // 斜向相邻的兵不能上车。
  let s = emptyState();
  plain(s);
  add(s, 'wT', 'white', 'R', 'transport', 5, 5);
  add(s, 'wP', 'white', 'P', 'infantry', 4, 4);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[3, 3]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wT)
    .some((m) => m.kind === 'transport'), false);

  // 兵只能沿正交方向上高地。
  s = emptyState();
  plain(s);
  add(s, 'wT', 'white', 'R', 'transport', 5, 5);
  add(s, 'wP', 'white', 'P', 'infantry', 4, 5);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[3, 4]]);
  assert.equal(E.generatePseudoMoves(s, 'white', s.pieces.wT)
    .some((m) => m.kind === 'transport'), false);
});

test('运输车把兵载上底线时，兵也可以选择升变', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wT', 'white', 'R', 'transport', 5, 1);
  add(s, 'wP', 'white', 'P', 'infantry', 4, 1);
  add(s, 'wK', 'white', 'K', 'david', 0, 5);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  highland(s, [[4, 0]]);
  const move = E.generatePseudoMoves(s, 'white', s.pieces.wT)
    .find((m) => m.kind === 'transport' && m.passengerId === 'wP' && m.drop?.y === 0);
  assert.ok(move);
  assert.equal(move.passengerPromote, 'Q');
  E.applyMove(s, { ...move, passengerPromote: 'B:heretic' });
  assert.equal(s.pieces.wP.type, 'B');
  assert.equal(s.pieces.wP.subtype, 'heretic');
  assert.equal(s.pieces.wP.y, 0);
});

test('枪兵不能隔着河道用正前两格攻击', () => {
  const s = emptyState();
  plain(s);
  add(s, 'wS', 'white', 'P', 'spear', 5, 6);
  add(s, 'bP', 'black', 'P', 'infantry', 5, 4);
  add(s, 'wK', 'white', 'K', 'david', 0, 0);
  add(s, 'bK', 'black', 'K', 'david', 11, 11);
  s.terrain[5][5] = E.TERRAIN.RIVER;
  s.highlandRegions = E.buildHighlandRegions(s.terrain);
  assert.equal(E.canAttack(s, s.pieces.wS, { x: 5, y: 6 }, { x: 5, y: 4 }), false);
});

test('AI 返回合法走法，升变选择合法', () => {
  const s = freshGame();
  const result = E.chooseAIMove(s, 'white', 'easy');
  assert.ok(result?.move);
  const legal = E.generateLegalMoves(s, 'white');
  assert.ok(legal.some((m) => m.pieceId === result.move.pieceId && m.to?.x === result.move.to?.x && m.to?.y === result.move.to?.y && m.kind === result.move.kind));
  if (result.move.promote) assert.ok(E.PROMOTION_CHOICES.includes(result.move.promote));
});
