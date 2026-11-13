/**
 * 王冠高地 / Crown & Highland — 共享规则引擎
 * 12x12 棋盘，白方在下（y=9..11），黑方在上（y=0..3），白方先行。
 */
export const BOARD_W = 12;
export const BOARD_H = 12;
export const SIDES = ['white', 'black'];
export const OTHER = { white: 'black', black: 'white' };
export const TERRAIN = { PLAIN: 'plain', RIVER: 'river', HIGHLAND: 'highland' };
export const FILES = 'abcdefghijkl';

export const MAP_ROWS = [
  '............',
  '............',
  '.....^^.....',
  '..~~....~~..',
  '..~~^..^~~..',
  '^^~~....~~^^',
  '^^~~....~~^^',
  '..~~^..^~~..',
  '..~~....~~..',
  '.....^^.....',
  '............',
  '............',
];

export function buildTerrain() {
  return MAP_ROWS.map((row) =>
    [...row].map((ch) => (ch === '~' ? TERRAIN.RIVER : ch === '^' ? TERRAIN.HIGHLAND : TERRAIN.PLAIN)),
  );
}

/** 连续高地按八方向连通；同一片高地内部按平地处理。 */
export function buildHighlandRegions(terrain) {
  const regions = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(0));
  let next = 0;
  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      if (terrain[y][x] !== TERRAIN.HIGHLAND || regions[y][x]) continue;
      next += 1;
      const stack = [[x, y]];
      regions[y][x] = next;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= BOARD_W || ny < 0 || ny >= BOARD_H) continue;
          if (terrain[ny][nx] !== TERRAIN.HIGHLAND || regions[ny][nx]) continue;
          regions[ny][nx] = next;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return regions;
}

export const PIECE_TYPES = {
  K: { key: 'K', name: '王', cls: 'king', value: 100000, symbol: '♚' },
  Q: { key: 'Q', name: '后', cls: 'queen', value: 900, symbol: '♛' },
  R: { key: 'R', name: '车', cls: 'rook', value: 500, symbol: '♜' },
  B: { key: 'B', name: '主教', cls: 'bishop', value: 330, symbol: '♝' },
  N: { key: 'N', name: '骑士', cls: 'knight', value: 320, symbol: '♞' },
  F: { key: 'F', name: '堡垒', cls: 'fortress', value: 400, symbol: '堡' },
  P: { key: 'P', name: '兵', cls: 'pawn', value: 100, symbol: '♟' },
};

export const SUBTYPES = {
  R: [
    { id: 'transport', name: '运输车', short: '运', text: '走法/攻击同普通车；只能携带正交相邻的兵（步兵/弓兵/枪兵/盾兵），并沿正交方向把兵送上高地；运输车也可以走到乘客原格。' },
    { id: 'siege', name: '攻城车', short: '攻', text: '走法/攻击同普通车；可穿过一整片连续高地并落在最后一块高地后一格；停在空高地上时可拆高地。' },
  ],
  K: [
    { id: 'david', name: '大卫王', short: '大', text: '神佑：每局一次，激活后本回合及对手下一回合，王不会被攻击或将军。' },
    { id: 'charlemagne', name: '查理曼大帝', short: '查', text: '疾行：每局一次，王可以沿直线或斜线移动 2 格（可借此上下高地）。' },
    { id: 'alexander', name: '亚历山大大帝', short: '亚', text: '征服：王吃子后可以立刻再行动一次（每回合一次，仅王移动）。' },
    { id: 'caesar', name: '凯撒大帝', short: '凯', text: '山地统帅：王上下高地不受额外一格惩罚，也可攻击高地目标。' },
  ],
  B: [
    { id: 'red', name: '红衣主教', short: '红', text: '标准主教斜线移动；额外可横向移动 2 格（仅移动，不能吃子）。' },
    { id: 'heretic', name: '异端主教', short: '异', text: '标准主教斜线移动；额外可纵向移动 2 格（仅移动，不能吃子）。' },
  ],
  N: [
    { id: 'armored', name: '甲胄骑士', short: '甲', text: '重装冲锋：4 个正交 1 格 + 8 个 L 形跳跃；正交 1 格不能上下高地，L 形可以越过高地。' },
    { id: 'hunter', name: '游猎骑士', short: '游', text: '8 个 L 形跳跃，可以越过高地；额外可正交移动 2 格（仅移动，不能吃子）：上下高地只走 1 格，连续高地上可正常走 2 格。' },
  ],
  F: [
    { id: 'transport', name: '运输车', short: '运', text: '旧版堡垒类型，仅用于旧存档兼容。' },
    { id: 'siege', name: '攻城车', short: '攻', text: '旧版堡垒类型，仅用于旧存档兼容。' },
  ],
  P: [
    { id: 'infantry', name: '步兵', short: '步', text: '向前 1 或 2 格；斜前 1 格吃子；可上相邻空高地，可攻击同一片高地上的敌子；下高地只能走正前方 1 格，且在高地上不能攻击高地下的敌人。' },
    { id: 'archer', name: '弓兵', short: '弓', text: '向前 1 格；初次可走 2 格并上相邻高地；左右 1、前方 2 的 L 形点位远程攻击，路径不受高地阻挡；在高地上只能攻击斜前方 1 格的高地下敌人，不能攻击同一片高地上的斜前方敌人，也不能攻击正前方的高地下敌人。' },
    { id: 'spear', name: '枪兵', short: '枪', text: '向前 1 格；初次可走 2 格并上相邻高地；斜前 1 格、正前 2 格攻击并移动；从高地往下只能攻击正前方 1 格。' },
    { id: 'shield', name: '盾兵', short: '盾', text: '向前 1 格；初次可走 2 格并上相邻高地；斜前 1 格、正后 1 格攻击并移动；在高地上不能攻击高地下的敌人。' },
  ],
};

const NOTATION_TYPE = {
  K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'Kn', F: 'F', P: 'P',
};
const NOTATION_SUBTYPE = {
  K: { david: 'd', charlemagne: 'ch', alexander: 'al', caesar: 'ce' },
  R: { transport: 'tr', siege: 'sg' },
  B: { red: 'rb', heretic: 'he' },
  N: { armored: 'ca', hunter: 'hu' },
  F: { transport: 'tr', siege: 'sg' },
  P: { infantry: 'in', archer: 'ar', spear: 'sp', shield: 'sh' },
};

/** 棋谱棋子缩写：类型大写，亚类小写。例如大卫王 Kd、甲胄骑士 Knca。 */
export function pieceCode(typeOrPiece, maybeSubtype) {
  const type = typeof typeOrPiece === 'object' ? typeOrPiece.type : typeOrPiece;
  const subtype = typeof typeOrPiece === 'object' ? typeOrPiece.subtype : maybeSubtype;
  const typeCode = NOTATION_TYPE[type] || type || '?';
  const subCode = subtype ? (NOTATION_SUBTYPE[type]?.[subtype] || String(subtype).slice(0, 2).toLowerCase()) : '';
  return `${typeCode}${subCode}`;
}

export const ROOK_CHOICES = ['R:transport', 'R:siege'];
export const M_CHOICES = ['Q', ...ROOK_CHOICES];
export const PROMOTION_CHOICES = [
  'Q', 'R:transport', 'R:siege',
  'B:red', 'B:heretic',
  'N:armored', 'N:hunter',
];

export function subtypeDef(type, subtype) {
  return (SUBTYPES[type] || []).find((s) => s.id === subtype) || null;
}
export function pieceName(piece) {
  const sub = subtypeDef(piece.type, piece.subtype);
  return sub ? sub.name : PIECE_TYPES[piece.type]?.name || '棋子';
}

/** 运输车/攻城车是“车”的两个变种；F 仅保留给旧存档与旧测试兼容。 */
export function isTransport(piece) {
  return !!piece && ((piece.type === 'R' && piece.subtype === 'transport') || (piece.type === 'F' && piece.subtype === 'transport'));
}
export function isSiege(piece) {
  return !!piece && (
    (piece.type === 'R' && piece.subtype === 'siege') ||
    (piece.type === 'F' && (piece.subtype === 'siege' || piece.subtype === 'engineer'))
  );
}
export const isEngineer = isSiege;
export function pieceValue(piece) {
  if (!piece) return 0;
  return PIECE_TYPES[piece.type]?.value || 0;
}

/** 规则书固定阵型。M 为“后/车”槽位：两侧各一个后、一个车。 */
export const FORMATION = [
  { side: 'black', slot: 'R1', type: 'R', x: 0, y: 0 },
  { side: 'black', slot: 'N1', type: 'N', x: 1, y: 0 },
  { side: 'black', slot: 'P1', type: 'P', x: 2, y: 0 },
  { side: 'black', slot: 'N2', type: 'N', x: 5, y: 0 },
  { side: 'black', slot: 'K', type: 'K', x: 6, y: 0 },
  { side: 'black', slot: 'P2', type: 'P', x: 9, y: 0 },
  { side: 'black', slot: 'N3', type: 'N', x: 10, y: 0 },
  { side: 'black', slot: 'R2', type: 'R', x: 11, y: 0 },
  { side: 'black', slot: 'P3', type: 'P', x: 0, y: 1 },
  { side: 'black', slot: 'P4', type: 'P', x: 1, y: 1 },
  { side: 'black', slot: 'P5', type: 'P', x: 10, y: 1 },
  { side: 'black', slot: 'P6', type: 'P', x: 11, y: 1 },
  { side: 'black', slot: 'P7', type: 'P', x: 1, y: 2 },
  { side: 'black', slot: 'B1', type: 'B', x: 2, y: 2 },
  { side: 'black', slot: 'M1', type: 'M', x: 3, y: 2 },
  { side: 'black', slot: 'P8', type: 'P', x: 4, y: 2 },
  { side: 'black', slot: 'P9', type: 'P', x: 7, y: 2 },
  { side: 'black', slot: 'M2', type: 'M', x: 8, y: 2 },
  { side: 'black', slot: 'B2', type: 'B', x: 9, y: 2 },
  { side: 'black', slot: 'P10', type: 'P', x: 10, y: 2 },
  { side: 'black', slot: 'P11', type: 'P', x: 4, y: 3 },
  { side: 'black', slot: 'P12', type: 'P', x: 7, y: 3 },
  { side: 'white', slot: 'P1', type: 'P', x: 1, y: 9 },
  { side: 'white', slot: 'B1', type: 'B', x: 2, y: 9 },
  { side: 'white', slot: 'M1', type: 'M', x: 3, y: 9 },
  { side: 'white', slot: 'P2', type: 'P', x: 4, y: 9 },
  { side: 'white', slot: 'P3', type: 'P', x: 7, y: 9 },
  { side: 'white', slot: 'M2', type: 'M', x: 8, y: 9 },
  { side: 'white', slot: 'B2', type: 'B', x: 9, y: 9 },
  { side: 'white', slot: 'P4', type: 'P', x: 10, y: 9 },
  { side: 'white', slot: 'P5', type: 'P', x: 0, y: 10 },
  { side: 'white', slot: 'P6', type: 'P', x: 1, y: 10 },
  { side: 'white', slot: 'P7', type: 'P', x: 4, y: 8 },
  { side: 'white', slot: 'P8', type: 'P', x: 7, y: 8 },
  { side: 'white', slot: 'P9', type: 'P', x: 10, y: 10 },
  { side: 'white', slot: 'P10', type: 'P', x: 11, y: 10 },
  { side: 'white', slot: 'R1', type: 'R', x: 0, y: 11 },
  { side: 'white', slot: 'N1', type: 'N', x: 1, y: 11 },
  { side: 'white', slot: 'P11', type: 'P', x: 2, y: 11 },
  { side: 'white', slot: 'K', type: 'K', x: 5, y: 11 },
  { side: 'white', slot: 'N2', type: 'N', x: 6, y: 11 },
  { side: 'white', slot: 'P12', type: 'P', x: 9, y: 11 },
  { side: 'white', slot: 'N3', type: 'N', x: 10, y: 11 },
  { side: 'white', slot: 'R2', type: 'R', x: 11, y: 11 },
];

export const DEFAULT_LOADOUT = {
  K: 'david',
  B1: 'red', B2: 'heretic',
  N1: 'armored', N2: 'hunter', N3: 'armored',
  R1: 'R:transport', R2: 'R:transport',
  M1: 'Q', M2: 'R:transport',
  P1: 'infantry', P2: 'infantry', P3: 'infantry',
  P4: 'archer', P5: 'archer', P6: 'archer',
  P7: 'spear', P8: 'spear', P9: 'spear',
  P10: 'shield', P11: 'shield', P12: 'shield',
};

export function slotType(slot) {
  if (slot === 'K') return 'K';
  if (slot.startsWith('M')) return 'M';
  return slot[0];
}
export function defaultLoadout() { return { ...DEFAULT_LOADOUT }; }

function normalizeMChoice(choice) {
  if (choice === 'Q') return 'Q';
  if (ROOK_CHOICES.includes(choice)) return choice;
  if (choice === 'R:standard' || choice === 'R' || choice === 'F') return 'R:transport';
  if (choice === 'R:engineer' || choice === 'F:engineer') return 'R:siege';
  return 'Q';
}
function normalizeRChoice(choice) {
  if (ROOK_CHOICES.includes(choice)) return choice;
  if (choice === 'R:standard' || choice === 'R' || choice === 'F') return 'R:transport';
  if (choice === 'R:engineer' || choice === 'F:engineer') return 'R:siege';
  return 'R:transport';
}
function isRookChoice(choice) {
  return ROOK_CHOICES.includes(choice) ||
    choice === 'R:standard' || choice === 'R:engineer' ||
    choice === 'R' || choice === 'F' || choice === 'F:engineer';
}

export function resolveSlot(slot, choice) {
  const st = slotType(slot);
  if (st === 'M') {
    const m = normalizeMChoice(choice);
    if (m === 'Q') return { type: 'Q', subtype: null };
    return { type: 'R', subtype: m.slice(2) };
  }
  if (st === 'R') {
    return { type: 'R', subtype: normalizeRChoice(choice).slice(2) };
  }
  if (st === 'K') return { type: 'K', subtype: choice || 'david' };
  if (st === 'B') return { type: 'B', subtype: choice || 'red' };
  if (st === 'N') return { type: 'N', subtype: choice || 'armored' };
  if (st === 'P') return { type: 'P', subtype: choice || 'infantry' };
  return { type: st, subtype: null };
}
export function normalizeLoadout(loadout, side) {
  const out = {};
  for (const f of FORMATION) {
    if (f.side !== side) continue;
    const choice = loadout?.[f.slot];
    const st = slotType(f.slot);
    if (st === 'M') out[f.slot] = normalizeMChoice(choice);
    else if (st === 'R') out[f.slot] = normalizeRChoice(choice);
    else if (st === 'K') out[f.slot] = SUBTYPES.K.some((s) => s.id === choice) ? choice : 'david';
    else if (st === 'B') out[f.slot] = SUBTYPES.B.some((s) => s.id === choice) ? choice : 'red';
    else if (st === 'N') out[f.slot] = SUBTYPES.N.some((s) => s.id === choice) ? choice : 'armored';
    else if (st === 'P') out[f.slot] = SUBTYPES.P.some((s) => s.id === choice) ? choice : 'infantry';
    else out[f.slot] = null;
  }
  const mSlots = FORMATION.filter((f) => f.side === side && slotType(f.slot) === 'M').map((f) => f.slot);
  if (mSlots.length >= 2) {
    const qCount = mSlots.filter((slot) => out[slot] === 'Q').length;
    if (qCount !== 1) {
      out[mSlots[0]] = 'Q';
      if (out[mSlots[1]] === 'Q') out[mSlots[1]] = 'R:transport';
    }
  }
  return out;
}
export function validateLoadout(loadout, side) {
  if (!loadout || typeof loadout !== 'object') return { ok: false, error: '阵容数据缺失' };
  const slots = FORMATION.filter((f) => f.side === side).map((f) => f.slot);
  for (const slot of slots) {
    if (!(slot in loadout)) {
      if (slotType(slot) === 'R') continue;
      return { ok: false, error: `槽位 ${slot} 未配置` };
    }
  }
  for (const [slot, choice] of Object.entries(loadout)) {
    if (!slots.includes(slot)) continue;
    const st = slotType(slot);
    if (st === 'M') {
      if (choice !== 'Q' && !isRookChoice(choice)) return { ok: false, error: `槽位 ${slot} 选择无效` };
    } else if (st === 'R') {
      if (!isRookChoice(choice)) return { ok: false, error: `槽位 ${slot} 车变种无效` };
    } else if (st === 'K') {
      if (!SUBTYPES.K.some((s) => s.id === choice)) return { ok: false, error: '王的选择无效' };
    } else if (st === 'B') {
      if (!SUBTYPES.B.some((s) => s.id === choice)) return { ok: false, error: '主教的选择无效' };
    } else if (st === 'N') {
      if (!SUBTYPES.N.some((s) => s.id === choice)) return { ok: false, error: '骑士的选择无效' };
    } else if (st === 'P') {
      if (!SUBTYPES.P.some((s) => s.id === choice)) return { ok: false, error: '兵的选择无效' };
    }
  }
  const mSlots = FORMATION.filter((f) => f.side === side && slotType(f.slot) === 'M').map((f) => f.slot);
  const mValues = mSlots.map((slot) => loadout[slot]);
  if (mValues.length !== 2 || mValues.filter((v) => v === 'Q').length !== 1 || mValues.filter(isRookChoice).length !== 1) {
    return { ok: false, error: 'd10 / i10 必须分别放置一个后和一个车' };
  }
  return { ok: true, loadout: normalizeLoadout(loadout, side) };
}

export function createGameState(whiteLoadout, blackLoadout) {
  const terrain = buildTerrain();
  const board = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(null));
  const pieces = {};
  const captured = { white: [], black: [] };
  for (const f of FORMATION) {
    const loadout = f.side === 'white' ? whiteLoadout : blackLoadout;
    const resolved = resolveSlot(f.slot, loadout[f.slot]);
    const id = `${f.side[0]}-${f.slot}`;
    pieces[id] = {
      id, side: f.side, slot: f.slot, type: resolved.type, subtype: resolved.subtype,
      x: f.x, y: f.y, startX: f.x, startY: f.y,
      moved: false, abilityUsed: false, promoted: false, baseSlot: f.slot,
    };
    board[f.y][f.x] = id;
  }
  const state = {
    board, terrain, highlandRegions: buildHighlandRegions(terrain), pieces, turn: 'white', turnNumber: 1, moveNumber: 1,
    status: 'playing', winner: null, reason: null, check: false,
    captured, history: [], lastMove: null, pendingBonus: null,
    flags: {
      white: { davidShield: true, immuneUntil: 0, divineShieldActive: false },
      black: { davidShield: true, immuneUntil: 0, divineShieldActive: false },
    },
    version: 0,
  };
  state.positionHistory = [positionKey(state)];
  const whiteCheck = isKingInCheck(state, 'white');
  const blackCheck = isKingInCheck(state, 'black');
  if (whiteCheck || blackCheck) state.openingCheck = { white: whiteCheck, black: blackCheck };
  return state;
}
export function cloneState(state) { return JSON.parse(JSON.stringify(state)); }

/**
 * 局面指纹：用于三次重复和棋。只包含会影响后续走法的信息，
 * 不包含回合数、走子记录等“历史”字段。
 */
export function positionKey(state) {
  const pieces = Object.values(state.pieces)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => [
      p.id, p.type, p.subtype || '', p.x, p.y,
      p.moved ? 1 : 0, p.abilityUsed ? 1 : 0, p.promoted ? 1 : 0,
    ].join(','));
  const flags = ['white', 'black'].map((side) => {
    const f = state.flags?.[side] || {};
    return [side, f.davidShield ? 1 : 0, f.immuneUntil || 0, f.divineShieldActive ? 1 : 0].join(',');
  });
  const pending = state.pendingBonus
    ? `${state.pendingBonus.pieceId || ''}:${state.pendingBonus.side || ''}`
    : '';
  return JSON.stringify({
    turn: state.turn,
    terrain: state.terrain,
    pieces,
    flags,
    pending,
  });
}

function ensurePositionHistory(state) {
  if (!Array.isArray(state.positionHistory)) state.positionHistory = [positionKey(state)];
}
function recordPosition(state) {
  ensurePositionHistory(state);
  state.positionHistory.push(positionKey(state));
}

/* ---------------- 坐标与地形 ---------------- */
export const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const ALL8 = [...ORTHO, ...DIAG];
export const KNIGHT_MOVES = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

export function inBounds(x, y) { return x >= 0 && x < BOARD_W && y >= 0 && y < BOARD_H; }
export function other(side) { return side === 'white' ? 'black' : 'white'; }
export function terrainAt(state, x, y) { return state.terrain[y][x]; }
export function pieceAt(state, x, y) {
  if (!inBounds(x, y)) return null;
  const id = state.board[y][x];
  return id ? state.pieces[id] : null;
}
export function isRiver(state, x, y) { return state.terrain[y][x] === TERRAIN.RIVER; }
export function isHighland(state, x, y) { return state.terrain[y][x] === TERRAIN.HIGHLAND; }
export function forward(side) { return side === 'white' ? -1 : 1; }
export function lastRank(side) { return side === 'white' ? 0 : BOARD_H - 1; }
export function squareName(x, y) { return `${FILES[x]}${y + 1}`; }

export function moveNotation(state, entry, includeState = true) {
  if (!entry) return '';
  if (entry.kind === 'skipBonus') return 'pass';
  const from = entry.from ? squareName(entry.from.x, entry.from.y) : '?';
  const to = entry.to ? squareName(entry.to.x, entry.to.y) : '?';
  const captured = entry.captureId || entry.passengerCaptureId;
  let text = `${pieceCode(entry.pieceType, entry.pieceSubtype)} ${from}${captured ? 'x' : '-'}${to}`;
  if (entry.kind === 'ranged') text += ' (R)';
  if (entry.kind === 'transport') {
    if (entry.drop) {
      const dropCapture = entry.passengerCaptureId ? 'x' : '';
      const passengerCode = entry.passengerType
        ? `${pieceCode(entry.passengerType, entry.passengerSubtype)} `
        : '';
      text += ` (${passengerCode}drop ${dropCapture}${squareName(entry.drop.x, entry.drop.y)})`;
    } else {
      text += ' (carry)';
    }
  }
  if (entry.kind === 'demolish') text += ' (D)';
  if (entry.kind === 'convert') text += ' (C)';
  const promotion = entry.promote || entry.passengerPromote;
  if (promotion) {
    const [pt, ps] = String(promotion).split(':');
    text += `=${pieceCode(pt, ps)}`;
  }
  if (includeState) {
    if (state.status === 'finished' && state.reason === 'checkmate') text += '#';
    else if (state.check) text += '+';
  }
  return text;
}
export function getKing(state, side) {
  for (const p of Object.values(state.pieces)) if (p.side === side && p.type === 'K') return p;
  return null;
}
export function getPiecesOf(state, side) { return Object.values(state.pieces).filter((p) => p.side === side); }

export function highlandRegionAt(state, x, y) {
  if (!state.highlandRegions) state.highlandRegions = buildHighlandRegions(state.terrain);
  return state.highlandRegions?.[y]?.[x] || 0;
}
function isHighlandSquare(state, x, y) {
  return state.terrain[y]?.[x] === TERRAIN.HIGHLAND;
}
function sameHighlandRegion(state, a, b) {
  const ra = highlandRegionAt(state, a.x, a.y);
  return ra !== 0 && ra === highlandRegionAt(state, b.x, b.y);
}
function adjacent8(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
}
export function ignoresElevation(state, piece) {
  return !!piece && piece.type === 'K' && piece.subtype === 'caesar';
}
export function elevationPenalty(state, from, to, piece) {
  if (ignoresElevation(state, piece) || isSiege(piece)) return 0;
  const a = isHighlandSquare(state, from.x, from.y);
  const b = isHighlandSquare(state, to.x, to.y);
  if (a && b) return sameHighlandRegion(state, from, to) ? 0 : 2;
  return a !== b ? 1 : 0;
}
/**
 * 沿直线累计移动力消耗：每步 1 点；进入/离开高地 +1；
 * 不同高地片之间会同时离开和进入，额外 +2。
 */
function movementCost(state, from, to, piece) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x;
  let y = from.y;
  let cost = 0;
  let prevHighland = isHighlandSquare(state, x, y);
  let prevRegion = highlandRegionAt(state, x, y);
  let guard = 0;
  const ignore = ignoresElevation(state, piece) || isSiege(piece);
  while ((x !== to.x || y !== to.y) && guard++ < 32) {
    x += dx;
    y += dy;
    if (!inBounds(x, y)) return Infinity;
    const highland = isHighlandSquare(state, x, y);
    const region = highlandRegionAt(state, x, y);
    if (!ignore) {
      if (prevHighland && highland) {
        if (prevRegion !== region) cost += 2;
      } else if (prevHighland !== highland) {
        cost += 1;
      }
    }
    cost += 1;
    prevHighland = highland;
    prevRegion = region;
  }
  return cost;
}
/**
 * 普通棋子的滑行路径：可以进入或离开一片高地，但不能在同一次移动里
 * 进入后离开，也不能跨过两片不相连的高地。攻城车不走此函数。
 */
function highlandPathAllowed(state, from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x;
  let y = from.y;
  let startH = isHighlandSquare(state, x, y);
  let endH = isHighlandSquare(state, to.x, to.y);
  let region = startH ? highlandRegionAt(state, x, y) : 0;
  let transitions = 0;
  let prevH = startH;
  let guard = 0;
  while ((x !== to.x || y !== to.y) && guard++ < 32) {
    x += dx;
    y += dy;
    if (!inBounds(x, y)) return false;
    const h = isHighlandSquare(state, x, y);
    if (h) {
      const r = highlandRegionAt(state, x, y);
      if (region && region !== r) return false;
      region = r;
    }
    if (h !== prevH) {
      transitions += 1;
      prevH = h;
    }
  }
  if (!startH && !endH) return transitions === 0;
  if (startH && endH) return transitions === 0 && sameHighlandRegion(state, from, to);
  return transitions === 1;
}
/** 弓兵远程攻击的 L 形射界：左右 1、前方 2；检查前方一格和拐角格是否被棋子挡住。 */
function archerLPathClear(state, from, to) {
  const dx = Math.sign(to.x - from.x);
  const fwd = Math.sign(to.y - from.y);
  const forward = { x: from.x, y: from.y + fwd };
  const corner = { x: from.x + dx, y: from.y + fwd };
  return !pieceAt(state, forward.x, forward.y) && !pieceAt(state, corner.x, corner.y);
}

export function movePathClear(state, from, to) {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  let x = from.x + dx, y = from.y + dy, guard = 0;
  while ((x !== to.x || y !== to.y) && guard++ < 32) {
    if (!inBounds(x, y)) return false;
    if (state.board[y][x]) return false;
    if (state.terrain[y][x] === TERRAIN.RIVER) return false;
    x += dx; y += dy;
  }
  return true;
}
export function moveRange(state, piece) {
  switch (piece.type) {
    case 'K': return 1;
    case 'Q': case 'B': case 'R': return 99;
    case 'N': return 2;
    case 'F': return 99;
    case 'P': return piece.subtype === 'infantry' ? 2 : 1;
    default: return 1;
  }
}
export function attackRange(piece) {
  switch (piece.type) {
    case 'K': return 1;
    case 'Q': case 'B': case 'R': return 99;
    case 'N': return 2;
    case 'F': return 99;
    case 'P': return piece.subtype === 'archer' || piece.subtype === 'spear' ? 2 : 1;
    default: return 1;
  }
}
function targetImmune(state, target) {
  if (!target || target.type !== 'K') return false;
  return state.flags[target.side]?.immuneUntil >= state.turnNumber;
}
function canTargetHighland(state, attacker, from, to) {
  if (!isHighlandSquare(state, to.x, to.y)) return true;
  if (isSiege(attacker)) return true;
  if (attacker.type === 'N') return true;
  if (isHighlandSquare(state, from.x, from.y)) return sameHighlandRegion(state, from, to);
  return adjacent8(from, to);
}
function attackPenalty(state, attacker, from, to) {
  if (attacker.type === 'N' || isSiege(attacker)) return 0;
  return elevationPenalty(state, from, to, attacker);
}
/** 攻城车沿直线穿过一整片连续高地；目标可以是高地，或高地后第一格。 */
function siegeLineCanReach(state, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!((dx === 0) !== (dy === 0))) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let region = 0;
  let afterHighland = 0;
  for (let x = from.x + sx, y = from.y + sy; x !== to.x || y !== to.y; x += sx, y += sy) {
    if (!inBounds(x, y)) return false;
    if (state.terrain[y][x] === TERRAIN.RIVER) return false;
    if (state.board[y][x]) return false;
    const h = isHighlandSquare(state, x, y);
    if (h) {
      const r = highlandRegionAt(state, x, y);
      if (region && r !== region) return false;
      if (afterHighland) return false;
      region = r;
    } else if (region) {
      afterHighland += 1;
      if (afterHighland > 1) return false;
    }
  }
  if (!inBounds(to.x, to.y)) return false;
  if (state.terrain[to.y][to.x] === TERRAIN.RIVER) return false;
  if (isHighlandSquare(state, to.x, to.y)) {
    if (afterHighland) return false;
    return !region || highlandRegionAt(state, to.x, to.y) === region;
  }
  return region === 0 || afterHighland === 0;
}

function charlemagneAbilityReach(state, attacker, from, to) {
  if (attacker.type !== 'K' || attacker.subtype !== 'charlemagne' || attacker.abilityUsed) return false;
  const dx = to.x - from.x, dy = to.y - from.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return false;
  if (adx > 2 || ady > 2) return false;
  if (!(adx === 0 || ady === 0 || adx === ady)) return false;
  if (Math.max(adx, ady) === 2) {
    const mx = from.x + dx / 2, my = from.y + dy / 2;
    if (!inBounds(mx, my)) return false;
    if (state.terrain[my][mx] === TERRAIN.RIVER || state.board[my][mx]) return false;
  }
  if (!highlandPathAllowed(state, from, to)) return false;
  return movementCost(state, from, to, attacker) <= 2;
}

export function canAttack(state, attacker, from, to) {
  if (!inBounds(to.x, to.y)) return false;
  if (state.terrain[to.y][to.x] === TERRAIN.RIVER) return false;
  const target = pieceAt(state, to.x, to.y);
  if (target && target.id === attacker.id) return false;
  if (targetImmune(state, target)) return false;
  const dx = to.x - from.x, dy = to.y - from.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return false;
  const fwd = forward(attacker.side);
  const sameRegionHighland = isHighlandSquare(state, from.x, from.y) &&
    isHighlandSquare(state, to.x, to.y) &&
    sameHighlandRegion(state, from, to);
  const dist = Math.max(adx, ady);
  const penalty = attackPenalty(state, attacker, from, to);
  const effDist = dist + penalty;
  let range = attackRange(attacker);
  const charlesAbility = charlemagneAbilityReach(state, attacker, from, to);
  if (charlesAbility) range = 99;
  if (effDist > range) return false;
  if (!charlesAbility && !canTargetHighland(state, attacker, from, to)) return false;

  let ok = false;
  switch (attacker.type) {
    case 'K':
      ok = dist === 1 || charlesAbility;
      break;
    case 'Q':
      if (adx === 0 || ady === 0 || adx === ady) {
        ok = movePathClear(state, from, to) && highlandPathAllowed(state, from, to);
      }
      break;
    case 'R':
      if (isSiege(attacker)) {
        ok = siegeLineCanReach(state, from, to);
      } else if (adx === 0 || ady === 0) {
        ok = movePathClear(state, from, to) && highlandPathAllowed(state, from, to);
      }
      break;
    case 'B':
      if (adx === ady) ok = movePathClear(state, from, to) && highlandPathAllowed(state, from, to);
      break;
    case 'N': {
      const isL = KNIGHT_MOVES.some(([mx, my]) => mx === dx && my === dy);
      if (attacker.subtype === 'armored') {
        if (isL) ok = true;
        else if (adx + ady === 1) {
          ok = !isHighlandSquare(state, from.x, from.y) && !isHighlandSquare(state, to.x, to.y);
        }
      } else {
        ok = isL;
      }
      break;
    }
    case 'F':
      if (isSiege(attacker)) ok = siegeLineCanReach(state, from, to);
      else if (adx === 0 || ady === 0) ok = movePathClear(state, from, to) && highlandPathAllowed(state, from, to);
      break;
    case 'P': {
      const sub = attacker.subtype;
      const startH = isHighlandSquare(state, from.x, from.y);
      const targetH = isHighlandSquare(state, to.x, to.y);
      // 小兵在高地上不能攻击高地下的敌人；枪兵正前方一格、弓兵斜前方一格（仅低处）是高地边缘的例外。
      if (startH && !targetH &&
        !(sub === 'spear' && adx === 0 && dy === fwd) &&
        !(sub === 'archer' && adx === 1 && dy === fwd)) break;
      if (sub === 'infantry') {
        ok = adx === 1 && dy === fwd &&
          (!isHighlandSquare(state, to.x, to.y) || sameRegionHighland);
      } else if (sub === 'archer') {
        if (!startH && adx === 0 && dy === fwd) ok = !isHighlandSquare(state, to.x, to.y);
        else if (!startH && adx === 1 && dy === 2 * fwd) ok = archerLPathClear(state, from, to);
        else if (!startH && adx === 1 && dy === fwd && isHighlandSquare(state, to.x, to.y)) ok = true;
        else if (startH && adx === 0 && dy === fwd) ok = sameRegionHighland;
        else if (startH && adx === 1 && dy === fwd) {
          // 高地上的斜前方攻击只针对低处；同一片连续高地上的斜前方敌人不可攻击。
          ok = !targetH;
        }
      } else if (sub === 'spear') {
        if (adx === 1 && dy === fwd) {
          ok = !isHighlandSquare(state, to.x, to.y) || sameRegionHighland;
        } else if (adx === 0 && dy === 2 * fwd) {
          const first = { x: from.x, y: from.y + fwd };
          ok = !pieceAt(state, first.x, first.y) &&
            !isHighlandSquare(state, first.x, first.y) &&
            state.terrain[first.y][first.x] !== TERRAIN.RIVER;
          if (ok && isHighlandSquare(state, to.x, to.y)) {
            ok = adjacent8(from, to);
          }
        } else if (adx === 0 && dy === fwd && targetH) {
          ok = true;
        } else if (startH && adx === 0 && dy === fwd) {
          // 枪兵从高地往下，高地边缘占掉一格射程，只能打正下方一格。
          ok = true;
        }
      } else if (sub === 'shield') {
        // 盾兵攻击斜前方或正后方，不攻击斜后方。
        if ((adx === 1 && dy === fwd) || (adx === 0 && dy === -fwd)) {
          ok = !isHighlandSquare(state, to.x, to.y) || sameRegionHighland;
        }
      }
      break;
    }
    default: break;
  }
  return ok;
}

export function isSquareAttacked(state, x, y, bySide) {
  for (const p of Object.values(state.pieces)) {
    if (p.side !== bySide) continue;
    if (canAttack(state, p, { x: p.x, y: p.y }, { x, y })) return true;
  }
  return false;
}
export function isKingInCheck(state, side) {
  const king = getKing(state, side);
  if (!king) return false;
  if (state.flags[side]?.immuneUntil >= state.turnNumber) return false;
  return isSquareAttacked(state, king.x, king.y, other(side));
}

/* ---------------- 走法生成 ---------------- */
function mkMove(piece, to, extra = {}) {
  return { pieceId: piece.id, from: { x: piece.x, y: piece.y }, to: { x: to.x, y: to.y }, kind: 'normal', captureId: null, promote: null, ...extra };
}
function slide(state, piece, dirs, maxRange, out, opts = {}) {
  const from = { x: piece.x, y: piece.y };
  for (const [dx, dy] of dirs) {
    for (let step = 1; step <= maxRange; step++) {
      const x = from.x + dx * step, y = from.y + dy * step;
      if (!inBounds(x, y)) break;
      if (state.terrain[y][x] === TERRAIN.RIVER) break;
      const target = pieceAt(state, x, y);
      if (!highlandPathAllowed(state, from, { x, y })) break;
      if (target) {
        if (target.side !== piece.side) {
          const h = isHighlandSquare(state, x, y);
          if (!h || canTargetHighland(state, piece, from, { x, y })) {
            out.push(mkMove(piece, { x, y }, { captureId: target.id, ...opts }));
          }
        }
        break;
      }
      out.push(mkMove(piece, { x, y }, { ...opts }));
    }
  }
}
function addPromotion(piece, move, toY) {
  if (piece.type === 'P' && toY === lastRank(piece.side)) move.promote = move.promote || 'Q';
  return move;
}
function findTransportPassengers(state, piece) {
  const found = [];
  for (const [dx, dy] of ORTHO) {
    const q = pieceAt(state, piece.x + dx, piece.y + dy);
    if (q && q.side === piece.side && q.type === 'P') found.push(q);
  }
  return found;
}
function addTransportMoves(state, piece, out) {
  const from = { x: piece.x, y: piece.y };
  for (const passenger of findTransportPassengers(state, piece)) {
    for (const [dx, dy] of ORTHO) {
      const drop = { x: passenger.x + dx, y: passenger.y + dy };
      if (!inBounds(drop.x, drop.y)) continue;
      if (!isHighlandSquare(state, drop.x, drop.y)) continue;
      if (drop.x === piece.x && drop.y === piece.y) continue;
      const dropTarget = pieceAt(state, drop.x, drop.y);
      if (dropTarget && dropTarget.side === piece.side) continue;
      const to = { x: piece.x + dx, y: piece.y + dy };
      if (!inBounds(to.x, to.y)) continue;
      if (to.x === drop.x && to.y === drop.y) continue;
      if (state.terrain[to.y][to.x] === TERRAIN.RIVER) continue;
      const target = pieceAt(state, to.x, to.y);
      if (target && target.side === piece.side && target.id !== passenger.id) continue;
      const passengerPromote = passenger.type === 'P' && drop.y === lastRank(passenger.side) ? 'Q' : null;
      out.push(mkMove(piece, to, {
        kind: 'transport',
        passengerId: passenger.id,
        drop,
        captureId: target && target.side !== piece.side ? target.id : null,
        passengerCaptureId: dropTarget && dropTarget.side !== piece.side ? dropTarget.id : null,
        passengerPromote,
      }));
    }
  }
}
function generateSiegeMoves(state, piece, out) {
  const from = { x: piece.x, y: piece.y };
  for (const [dx, dy] of ORTHO) {
    let region = 0;
    let afterHighland = false;
    for (let step = 1; step <= 11; step++) {
      const x = from.x + dx * step, y = from.y + dy * step;
      if (!inBounds(x, y)) break;
      if (state.terrain[y][x] === TERRAIN.RIVER) break;
      const target = pieceAt(state, x, y);
      const h = isHighlandSquare(state, x, y);
      if (h) {
        const r = highlandRegionAt(state, x, y);
        if (region && region !== r) break;
        region = r;
        if (target) {
          if (target.side !== piece.side) out.push(mkMove(piece, { x, y }, { captureId: target.id }));
          break;
        }
        out.push(mkMove(piece, { x, y }));
        out.push(mkMove(piece, { x, y }, { kind: 'demolish' }));
        continue;
      }
      if (region) {
        if (afterHighland) break;
        afterHighland = true;
        if (target) {
          if (target.side !== piece.side) out.push(mkMove(piece, { x, y }, { captureId: target.id }));
          break;
        }
        out.push(mkMove(piece, { x, y }));
        break;
      }
      if (target) {
        if (target.side !== piece.side) out.push(mkMove(piece, { x, y }, { captureId: target.id }));
        break;
      }
      out.push(mkMove(piece, { x, y }));
    }
  }
}
function generateFortressMoves(state, piece, out) {
  if (isSiege(piece)) generateSiegeMoves(state, piece, out);
  else {
    slide(state, piece, ORTHO, 99, out);
    if (isTransport(piece)) addTransportMoves(state, piece, out);
  }
}

export function generatePseudoMoves(state, side, piece) {
  if (!piece || piece.side !== side) return [];
  const out = [];
  const from = { x: piece.x, y: piece.y };
  const fwd = forward(side);
  const startH = isHighlandSquare(state, from.x, from.y);
  const addAt = (x, y, extra = {}) => {
    if (!inBounds(x, y)) return false;
    if (state.terrain[y][x] === TERRAIN.RIVER) return false;
    const target = pieceAt(state, x, y);
    if (target && target.side === side) return false;
    out.push(mkMove(piece, { x, y }, { captureId: target ? target.id : null, ...extra }));
    return true;
  };

  switch (piece.type) {
    case 'K': {
      for (const [dx, dy] of ALL8) {
        const x = from.x + dx, y = from.y + dy;
        if (!inBounds(x, y)) continue;
        const h = isHighlandSquare(state, x, y);
        if (piece.subtype !== 'caesar') {
          if (h && !startH) continue;
          if (startH && !h) continue;
          if (startH && h && !sameHighlandRegion(state, from, { x, y })) continue;
        }
        addAt(x, y);
      }
      if (piece.subtype === 'charlemagne' && !piece.abilityUsed) {
        for (const [dx, dy] of ALL8) {
          for (let step = 1; step <= 2; step++) {
            const x = from.x + dx * step, y = from.y + dy * step;
            if (!inBounds(x, y)) break;
            if (state.terrain[y][x] === TERRAIN.RIVER) break;
            if (step === 2) {
              const mx = from.x + dx, my = from.y + dy;
              if (state.board[my][mx] || state.terrain[my][mx] === TERRAIN.RIVER) break;
            }
            if (!highlandPathAllowed(state, from, { x, y })) break;
            const target = pieceAt(state, x, y);
            if (target && target.side === side) break;
            const cost = movementCost(state, from, { x, y }, piece);
            if (cost > 2) break;
            if (cost === 2) {
              out.push(mkMove(piece, { x, y }, {
                captureId: target ? target.id : null,
                ability: 'charlemagne',
              }));
            }
          }
        }
      }
      break;
    }
    case 'Q':
      slide(state, piece, ALL8, 99, out);
      break;
    case 'R':
    case 'F':
      generateFortressMoves(state, piece, out);
      break;
    case 'B': {
      slide(state, piece, DIAG, 99, out);
      const extraDirs = piece.subtype === 'heretic' ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      for (const [dx, dy] of extraDirs) {
        const x1 = from.x + dx, y1 = from.y + dy;
        if (!inBounds(x1, y1)) continue;
        if (state.terrain[y1][x1] === TERRAIN.RIVER || state.board[y1][x1]) continue;
        if (isHighlandSquare(state, x1, y1)) {
          out.push(mkMove(piece, { x: x1, y: y1 }));
          continue;
        }
        const x2 = from.x + dx * 2, y2 = from.y + dy * 2;
        if (!inBounds(x2, y2)) continue;
        if (state.terrain[y2][x2] === TERRAIN.RIVER || state.board[y2][x2]) continue;
        if (isHighlandSquare(state, x2, y2)) continue;
        if (!highlandPathAllowed(state, from, { x: x2, y: y2 })) continue;
        out.push(mkMove(piece, { x: x2, y: y2 }));
      }
      break;
    }
    case 'N': {
      if (piece.subtype === 'armored') {
        for (const [dx, dy] of ORTHO) {
          const x = from.x + dx, y = from.y + dy;
          if (!inBounds(x, y)) continue;
          if (startH || isHighlandSquare(state, x, y)) continue;
          addAt(x, y);
        }
        for (const [dx, dy] of KNIGHT_MOVES) {
          const x = from.x + dx, y = from.y + dy;
          if (!inBounds(x, y)) continue;
          addAt(x, y);
        }
      } else {
        for (const [dx, dy] of KNIGHT_MOVES) {
          const x = from.x + dx, y = from.y + dy;
          if (!inBounds(x, y)) continue;
          addAt(x, y);
        }
        for (const [dx, dy] of ORTHO) {
          const x1 = from.x + dx, y1 = from.y + dy;
          if (!inBounds(x1, y1)) continue;
          if (state.terrain[y1][x1] === TERRAIN.RIVER || state.board[y1][x1]) continue;
          const h1 = isHighlandSquare(state, x1, y1);

          // 游猎骑士的正交额外移动：上下高地只走 1 格；
          // 在同一片连续高地上，仍按正常的两格移动。
          if (startH) {
            if (!h1) {
              out.push(mkMove(piece, { x: x1, y: y1 }));
              continue;
            }
            const x2 = from.x + dx * 2, y2 = from.y + dy * 2;
            if (!inBounds(x2, y2)) continue;
            if (state.terrain[y2][x2] === TERRAIN.RIVER || state.board[y2][x2]) continue;
            if (!isHighlandSquare(state, x2, y2)) continue;
            if (!sameHighlandRegion(state, from, { x: x2, y: y2 })) continue;
            out.push(mkMove(piece, { x: x2, y: y2 }));
            continue;
          }

          if (h1) {
            // 从低处上高地：高地边缘占一格，只能上相邻的一格。
            out.push(mkMove(piece, { x: x1, y: y1 }));
            continue;
          }
          const x2 = from.x + dx * 2, y2 = from.y + dy * 2;
          if (!inBounds(x2, y2)) continue;
          if (state.terrain[y2][x2] === TERRAIN.RIVER || state.board[y2][x2]) continue;
          if (isHighlandSquare(state, x2, y2)) continue;
          if (!highlandPathAllowed(state, from, { x: x2, y: y2 })) continue;
          out.push(mkMove(piece, { x: x2, y: y2 }));
        }
      }
      break;
    }
    case 'P': {
      const sub = piece.subtype;
      const oneY = from.y + fwd;
      const oneH = inBounds(from.x, oneY) && isHighlandSquare(state, from.x, oneY);
      if (inBounds(from.x, oneY) && state.terrain[oneY][from.x] !== TERRAIN.RIVER && !state.board[oneY][from.x]) {
        if (!oneH || startH || sub === 'infantry') {
          out.push(addPromotion(piece, mkMove(piece, { x: from.x, y: oneY }), oneY));
        }
      }
      const initialTwo = !piece.moved && !startH;
      if (sub === 'infantry') {
        const twoY = from.y + fwd * 2;
        const oneH2 = inBounds(from.x, oneY) && isHighlandSquare(state, from.x, oneY);
        const twoH = inBounds(from.x, twoY) && isHighlandSquare(state, from.x, twoY);
        const pathOk = startH
          ? highlandPathAllowed(state, from, { x: from.x, y: twoY })
          : !oneH2 && !twoH;
        // 高地边缘算额外一格：从高地往下走时，步兵也只能走正前方一格。
        const downhillTwo = startH && !twoH;
        if (inBounds(from.x, oneY) && inBounds(from.x, twoY) &&
          !state.board[oneY][from.x] && !state.board[twoY][from.x] &&
          state.terrain[oneY][from.x] !== TERRAIN.RIVER && state.terrain[twoY][from.x] !== TERRAIN.RIVER &&
          pathOk && !downhillTwo) {
          out.push(addPromotion(piece, mkMove(piece, { x: from.x, y: twoY }), twoY));
        }
      } else if (initialTwo) {
        const twoY = from.y + fwd * 2;
        if (oneH) {
          // 初次两格行动可以只走一格上高地，然后停下。
          out.push(addPromotion(piece, mkMove(piece, { x: from.x, y: oneY }), oneY));
        } else if (inBounds(from.x, twoY) &&
          !state.board[twoY][from.x] && state.terrain[twoY][from.x] !== TERRAIN.RIVER &&
          !isHighlandSquare(state, from.x, twoY)) {
          out.push(addPromotion(piece, mkMove(piece, { x: from.x, y: twoY }), twoY));
        }
      }

      const capture = (x, y, kind = 'normal', opts = {}) => {
        if (!inBounds(x, y)) return;
        if (state.terrain[y][x] === TERRAIN.RIVER) return;
        const target = pieceAt(state, x, y);
        if (!target || target.side === side) return;
        const h = isHighlandSquare(state, x, y);
        // 小兵在高地上不能攻击高地下的敌人；枪兵正前方、弓兵斜前方是例外：
        // 高地边缘算额外一格，枪兵从高地只能攻击正下方一格；弓兵可攻击斜下方一格。
        if (startH && !h && !opts.allowDownhill) return;
        if (opts.requireLowland && h) return;
        const sameRegion = startH && h && sameHighlandRegion(state, from, { x, y });
        if (h && !opts.allowHighland && !opts.requireHighland && !sameRegion) return;
        if (!h && opts.requireHighland) return;
        if (opts.sameRegion && !sameRegion) return;
        const move = mkMove(piece, { x, y }, { captureId: target.id, kind });
        if (kind === 'normal') addPromotion(piece, move, y);
        out.push(move);
      };
      if (sub === 'infantry') {
        capture(from.x - 1, from.y + fwd);
        capture(from.x + 1, from.y + fwd);
      } else if (sub === 'archer') {
        if (!startH) {
          capture(from.x, from.y + fwd);
          for (const sx of [-1, 1]) {
            const tx = from.x + sx, ty = from.y + fwd * 2;
            if (inBounds(tx, ty) && archerLPathClear(state, from, { x: tx, y: ty })) {
              capture(tx, ty, 'ranged');
            }
          }
          capture(from.x - 1, from.y + fwd, 'ranged', { requireHighland: true });
          capture(from.x + 1, from.y + fwd, 'ranged', { requireHighland: true });
        } else {
          capture(from.x, from.y + fwd, 'normal', { requireHighland: true, sameRegion: true });
          // 高地上的弓兵只能攻击斜前方 1 格的高地下敌人；同片高地的斜前方目标、正前方低处目标都不可攻击。
          capture(from.x - 1, from.y + fwd, 'ranged', { allowDownhill: true, requireLowland: true });
          capture(from.x + 1, from.y + fwd, 'ranged', { allowDownhill: true, requireLowland: true });
        }
      } else if (sub === 'spear') {
        if (!startH) {
          capture(from.x - 1, from.y + fwd);
          capture(from.x + 1, from.y + fwd);
          const fy = from.y + fwd;
          if (inBounds(from.x, fy) && !state.board[fy][from.x] &&
            !isHighlandSquare(state, from.x, fy) && state.terrain[fy][from.x] !== TERRAIN.RIVER) {
            capture(from.x, from.y + fwd * 2);
          }
          if (inBounds(from.x, fy) && isHighlandSquare(state, from.x, fy)) {
            capture(from.x, fy, 'normal', { requireHighland: true });
          }
        } else {
          capture(from.x - 1, from.y + fwd);
          capture(from.x + 1, from.y + fwd);
          // 高地边缘占一格：枪兵在高地上只能攻击正下方一格。
          capture(from.x, from.y + fwd, 'normal', { allowDownhill: true });
        }
      } else if (sub === 'shield') {
        // 斜前 1 格、正后 1 格；不攻击斜后方。
        capture(from.x - 1, from.y + fwd);
        capture(from.x + 1, from.y + fwd);
        capture(from.x, from.y - fwd);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

export function generateLegalMoves(state, side, opts = {}) {
  if (state.status === 'finished') return [];
  const moves = [];
  if (state.pendingBonus) {
    if (state.pendingBonus.side !== side) return [];
    const piece = state.pieces[state.pendingBonus.pieceId];
    if (piece) for (const m of generatePseudoMoves(state, side, piece)) { m.isBonus = true; m.pendingBonus = true; moves.push(m); }
    moves.push({ kind: 'skipBonus', pieceId: state.pendingBonus.pieceId, from: null, to: null });
  } else {
    for (const p of Object.values(state.pieces)) if (p.side === side) moves.push(...generatePseudoMoves(state, side, p));
  }
  const legal = [];
  const seen = new Set();
  for (const m of moves) {
    const key = [m.kind, m.pieceId, m.from ? `${m.from.x},${m.from.y}` : '-', m.to ? `${m.to.x},${m.to.y}` : '-', m.passengerId || '', m.drop ? `${m.drop.x},${m.drop.y}` : ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.to) {
      const target = pieceAt(state, m.to.x, m.to.y);
      if (target && target.type === 'K' && targetImmune(state, target)) continue;
    }
    const immuneBefore = state.flags[side]?.immuneUntil >= state.turnNumber;
    const undo = makeMove(state, m, true);
    const ok = immuneBefore ? true : !isKingInCheck(state, side);
    undoMove(state, undo);
    if (ok) legal.push(m);
  }
  return legal;
}
export function hasAnyLegalMove(state, side) { return generateLegalMoves(state, side).length > 0; }

/* ------------------------------------------------------------------ */
/* 执行与撤销                                                          */
/* ------------------------------------------------------------------ */

function snapshot(state) {
  return {
    board: state.board.map((r) => r.slice()),
    terrain: state.terrain.map((r) => r.slice()),
    highlandRegions: (state.highlandRegions || buildHighlandRegions(state.terrain)).map((r) => r.slice()),
    pieces: Object.fromEntries(Object.entries(state.pieces).map(([id, p]) => [id, { ...p }])),
    captured: { white: [...state.captured.white], black: [...state.captured.black] },
    flags: JSON.parse(JSON.stringify(state.flags)),
    turn: state.turn,
    turnNumber: state.turnNumber,
    moveNumber: state.moveNumber,
    status: state.status,
    winner: state.winner,
    reason: state.reason,
    check: state.check,
    lastMove: state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null,
    pendingBonus: state.pendingBonus ? { ...state.pendingBonus } : null,
    version: state.version,
    openingCheck: state.openingCheck,
    positionHistory: state.positionHistory ? [...state.positionHistory] : [positionKey(state)],
  };
}

function restore(state, snap) {
  state.board = snap.board;
  state.terrain = snap.terrain;
  state.highlandRegions = snap.highlandRegions;
  state.pieces = snap.pieces;
  state.captured = snap.captured;
  state.flags = snap.flags;
  state.turn = snap.turn;
  state.turnNumber = snap.turnNumber;
  state.moveNumber = snap.moveNumber;
  state.status = snap.status;
  state.winner = snap.winner;
  state.reason = snap.reason;
  state.check = snap.check;
  state.lastMove = snap.lastMove;
  state.pendingBonus = snap.pendingBonus;
  state.version = snap.version;
  state.openingCheck = snap.openingCheck;
  state.positionHistory = snap.positionHistory;
}

function endTurn(state, mover) {
  if (state.flags[mover]) state.flags[mover].divineShieldActive = false;
  state.turn = other(mover);
  state.turnNumber += 1;
  if (state.turn === 'white') state.moveNumber += 1;
  state.pendingBonus = null;
}

function removePiece(state, id) {
  const p = state.pieces[id];
  if (!p) return null;
  if (state.board[p.y][p.x] === id) state.board[p.y][p.x] = null;
  delete state.pieces[id];
  return p;
}

function placePiece(state, piece, x, y) {
  state.board[piece.y][piece.x] = null;
  piece.x = x;
  piece.y = y;
  state.board[y][x] = piece.id;
}

function promotePawn(piece, choice = 'Q') {
  const raw = String(choice || 'Q');
  const [type, sub] = raw.split(':');
  if (type === 'Q') {
    piece.type = 'Q';
    piece.subtype = null;
  } else if (type === 'R' && (sub === 'transport' || sub === 'siege' || sub === 'engineer')) {
    piece.type = 'R';
    piece.subtype = sub === 'engineer' ? 'siege' : sub;
  } else if (type === 'B' && (sub === 'red' || sub === 'heretic')) {
    piece.type = 'B';
    piece.subtype = sub;
  } else if (type === 'N' && (sub === 'armored' || sub === 'hunter')) {
    piece.type = 'N';
    piece.subtype = sub;
  } else {
    piece.type = 'Q';
    piece.subtype = null;
  }
  piece.promoted = true;
}

/**
 * 执行一步棋。返回 undo 快照，供搜索/合法性检查回滚。
 * silent=true 时不写 history（仍会改 state，必须 undo）。
 */
export function makeMove(state, move, silent = false) {
  const snap = snapshot(state);
  if (!move) return snap;
  if (!silent) ensurePositionHistory(state);

  if (move.kind === 'skipBonus') {
    const side = state.turn;
    state.lastMove = { kind: 'skipBonus', side };
    if (!silent) state.history.push({ kind: 'skipBonus', side, notation: null });
    endTurn(state, side);
    if (!silent) recordPosition(state);
    state.version += 1;
    return snap;
  }

  const piece = state.pieces[move.pieceId];
  if (!piece) return snap;
  const pieceTypeBefore = piece.type;
  const pieceSubtypeBefore = piece.subtype;

  const from = { x: piece.x, y: piece.y };
  if (!move.to || !inBounds(move.to.x, move.to.y)) return snap;
  const to = { x: move.to.x, y: move.to.y };
  const passenger = move.kind === 'transport' ? state.pieces[move.passengerId] : null;
  const passengerTypeBefore = passenger?.type || null;
  const passengerSubtypeBefore = passenger?.subtype || null;
  if (move.kind === 'transport') {
    if (!passenger || passenger.side !== piece.side || passenger.type !== 'P') return snap;
    if (!move.drop || !inBounds(move.drop.x, move.drop.y)) return snap;
    if (Math.abs(passenger.x - piece.x) + Math.abs(passenger.y - piece.y) !== 1) return snap;
    if (Math.abs(move.drop.x - passenger.x) + Math.abs(move.drop.y - passenger.y) !== 1) return snap;
    if (state.terrain[move.drop.y][move.drop.x] !== TERRAIN.HIGHLAND) return snap;
    if (move.drop.x === piece.x && move.drop.y === piece.y) return snap;
    if (to.x === move.drop.x && to.y === move.drop.y) return snap;
    if (state.terrain[to.y][to.x] === TERRAIN.RIVER) return snap;
    const stepX = move.drop.x - passenger.x;
    const stepY = move.drop.y - passenger.y;
    if (to.x !== piece.x + stepX || to.y !== piece.y + stepY) return snap;
    const dropTarget = state.board[move.drop.y][move.drop.x]
      ? state.pieces[state.board[move.drop.y][move.drop.x]]
      : null;
    if (dropTarget && dropTarget.side === piece.side) return snap;
  }

  let targetId = state.board[to.y]?.[to.x] || null;
  if (passenger && targetId === passenger.id) targetId = null;
  const target = targetId ? state.pieces[targetId] : null;
  if (target && target.side === piece.side) return snap;

  const mover = piece.side;
  let captured = null;
  const take = (id) => {
    const t = state.pieces[id];
    if (!t) return null;
    const copy = { ...t };
    removePiece(state, id);
    state.captured[mover].push({
      type: t.type,
      subtype: t.subtype,
      side: t.side,
      promoted: t.promoted,
    });
    if (t.type === 'K') {
      state.status = 'finished';
      state.winner = mover;
      state.reason = 'king-captured';
    }
    return copy;
  };

  if (move.kind === 'convert') {
    if (target && target.type === 'P') {
      // 转化：不产生俘虏，直接改换阵营
      target.side = mover;
      target.moved = true;
      piece.abilityUsed = true;
    }
  } else if (target) {
    captured = take(targetId);
  }

  let passengerCaptured = null;
  if (move.kind === 'transport') {
    const dropId = state.board[move.drop.y][move.drop.x] || null;
    if (dropId && dropId !== passenger.id) passengerCaptured = take(dropId);
  }

  const swapsSeat = move.kind === 'transport' && passenger &&
    to.x === passenger.x && to.y === passenger.y;
  if (swapsSeat) {
    // 运输车走到乘客原格时，乘客先让位，避免覆盖运输车。
    placePiece(state, passenger, move.drop.x, move.drop.y);
    passenger.moved = true;
    if (passenger.type === 'P' && move.drop.y === lastRank(passenger.side)) {
      promotePawn(passenger, move.passengerPromote || 'Q');
    }
  }

  if (move.kind !== 'ranged' && move.kind !== 'convert') {
    placePiece(state, piece, to.x, to.y);
    piece.moved = true;
  } else {
    piece.moved = true;
  }

  if (move.kind === 'demolish') {
    state.terrain[to.y][to.x] = TERRAIN.PLAIN;
    state.highlandRegions = buildHighlandRegions(state.terrain);
    piece.abilityUsed = true;
  }

  if (move.ability === 'charlemagne') {
    piece.abilityUsed = true;
  }

  if (move.kind === 'transport' && passenger && !swapsSeat) {
    placePiece(state, passenger, move.drop.x, move.drop.y);
    passenger.moved = true;
    if (passenger.type === 'P' && move.drop.y === lastRank(passenger.side)) {
      promotePawn(passenger, move.passengerPromote || 'Q');
    }
  }

  if (piece.type === 'P' && piece.y === lastRank(piece.side)) {
    promotePawn(piece, move.promote || 'Q');
  }

  state.lastMove = {
    from,
    to,
    pieceId: piece.id,
    pieceType: pieceTypeBefore,
    pieceSubtype: pieceSubtypeBefore,
    kind: move.kind,
    captureId: captured ? captured.id : null,
    captureType: captured ? captured.type : null,
    captureSubtype: captured ? captured.subtype : null,
    passengerId: move.passengerId || null,
    passengerType: passengerTypeBefore,
    passengerSubtype: passengerSubtypeBefore,
    drop: move.drop || null,
    passengerCaptureId: passengerCaptured ? passengerCaptured.id : null,
    passengerCaptureType: passengerCaptured ? passengerCaptured.type : null,
    promote: move.promote || null,
    passengerPromote: move.passengerPromote || null,
    side: mover,
  };

  if (!silent) state.history.push({ ...state.lastMove, notation: null });

  // 亚历山大：吃子后再行动一次
  const alexanderBonus =
    piece.type === 'K' &&
    piece.subtype === 'alexander' &&
    captured &&
    !move.isBonus &&
    state.status !== 'finished';

  if (alexanderBonus) {
    // 每回合最多一次：奖励走法本身带 isBonus，吃子也不会再触发。
    state.pendingBonus = { pieceId: piece.id, side: mover };
  } else {
    endTurn(state, mover);
  }

  if (!silent) recordPosition(state);
  state.version += 1;
  return snap;
}

export function undoMove(state, snap) {
  restore(state, snap);
}

/** 服务端/客户端正式落子：执行并刷新状态。 */
export function applyMove(state, move) {
  const undo = makeMove(state, move, false);
  updateStatus(state);
  const entry = state.history[state.history.length - 1];
  if (entry) entry.notation = moveNotation(state, entry);
  return { state, undo };
}

export function updateStatus(state) {
  if (state.status === 'finished') return state;
  const wk = getKing(state, 'white');
  const bk = getKing(state, 'black');
  if (!wk || !bk) {
    state.status = 'finished';
    state.winner = wk ? 'white' : 'black';
    state.reason = 'king-captured';
    return state;
  }
  state.check = isKingInCheck(state, state.turn);
  const moves = generateLegalMoves(state, state.turn);
  if (moves.length === 0) {
    state.status = 'finished';
    state.winner = state.check ? other(state.turn) : null;
    state.reason = state.check ? 'checkmate' : 'stalemate';
    return state;
  }
  ensurePositionHistory(state);
  const key = positionKey(state);
  if (state.positionHistory.filter((k) => k === key).length >= 3) {
    state.status = 'finished';
    state.winner = null;
    state.reason = 'repetition';
  }
  return state;
}

/** 大卫王：激活一回合神佑。 */
export function activateDavid(state, side) {
  if (state.turn !== side || state.status !== 'playing') return false;
  const f = state.flags[side];
  if (!f || !f.davidShield) return false;
  const king = getKing(state, side);
  if (!king || king.subtype !== 'david') return false;
  f.davidShield = false;
  f.divineShieldActive = true;
  f.immuneUntil = state.turnNumber + 1;
  state.check = false;
  state.version += 1;
  return true;
}

export function resign(state, side) {
  if (state.status === 'finished') return state;
  state.status = 'finished';
  state.winner = other(side);
  state.reason = 'resign';
  state.version += 1;
  return state;
}

export function agreeDraw(state) {
  if (state.status === 'finished') return state;
  state.status = 'finished';
  state.winner = null;
  state.reason = 'draw-agreed';
  state.version += 1;
  return state;
}

/* ------------------------------------------------------------------ */
/* 局面评估与 AI                                                       */
/* ------------------------------------------------------------------ */

const CENTER = [
  [0, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0],
  [1, 2, 3, 4, 4, 4, 4, 4, 4, 3, 2, 1],
  [2, 3, 4, 5, 5, 5, 5, 5, 5, 4, 3, 2],
  [3, 4, 5, 6, 6, 6, 6, 6, 6, 5, 4, 3],
  [3, 4, 5, 6, 7, 7, 7, 7, 6, 5, 4, 3],
  [3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3],
  [3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3],
  [3, 4, 5, 6, 7, 7, 7, 7, 6, 5, 4, 3],
  [3, 4, 5, 6, 6, 6, 6, 6, 6, 5, 4, 3],
  [2, 3, 4, 5, 5, 5, 5, 5, 5, 4, 3, 2],
  [1, 2, 3, 4, 4, 4, 4, 4, 4, 3, 2, 1],
  [0, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0],
];

export function evaluate(state, side) {
  let score = 0;
  for (const p of Object.values(state.pieces)) {
    let v = pieceValue(p);
    if (p.type === 'P') {
      const adv = p.side === 'white' ? 9 - p.y : p.y - 2;
      v += Math.max(0, adv) * 7;
      if (p.subtype === 'archer') v += 18;
      else if (p.subtype === 'spear') v += 10;
      else if (p.subtype === 'shield') v += 22;
    } else if (p.type === 'N') {
      if (p.subtype === 'armored') v += 35;
      else v += 15;
    } else if (p.type === 'B') {
      if (p.subtype === 'red') v += 10;
      else v += 18;
    } else if (p.type === 'R' || p.type === 'F') {
      if (isEngineer(p)) v += 25;
      else if (isTransport(p)) v += 15;
    } else if (p.type === 'K') {
      if (p.subtype === 'alexander') v += 20;
      else if (p.subtype === 'caesar') v += 15;
      else if (p.subtype === 'david') v += 10;
    }
    if (state.terrain[p.y][p.x] === TERRAIN.HIGHLAND) v += 28;
    v += CENTER[p.y][p.x] * 2;
    score += p.side === side ? v : -v;
  }
  const king = getKing(state, side);
  if (king && isKingInCheck(state, side)) score -= 90;
  const enemyKing = getKing(state, other(side));
  if (enemyKing && isKingInCheck(state, other(side))) score += 55;
  return score;
}

const MATE = 1_000_000;

function orderMoves(state, moves) {
  return moves
    .map((m) => {
      let s = 0;
      if (m.kind === 'skipBonus') return { m, s: -9999 };
      const targetId = m.to ? state.board[m.to.y]?.[m.to.x] : null;
      if (targetId) {
        const target = state.pieces[targetId];
        const attacker = state.pieces[m.pieceId];
        if (target && attacker) s += pieceValue(target) * 10 - pieceValue(attacker);
      }
      if (m.promote) s += 800;
      if (m.ability === 'charlemagne') s += 30;
      if (m.kind === 'convert') s += 90;
      if (m.kind === 'demolish') s += 20;
      if (m.kind === 'transport') s += 25;
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

function negamax(state, depth, alpha, beta, side, deadline, nodes) {
  nodes.n += 1;
  if ((nodes.n & 255) === 0 && Date.now() > deadline) {
    const err = new Error('AI_TIMEOUT');
    err.aiTimeout = true;
    throw err;
  }
  if (depth <= 0) return evaluate(state, side);
  const moves = generateLegalMoves(state, side);
  if (moves.length === 0) return isKingInCheck(state, side) ? -MATE + (10 - depth) : 0;
  let best = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const undo = makeMove(state, m, true);
    let score;
    if (state.status === 'finished') {
      score = state.winner === side ? MATE - 1 : state.winner === null ? 0 : -MATE + 1;
    } else {
      score = -negamax(state, depth - 1, -beta, -alpha, other(side), deadline, nodes);
    }
    undoMove(state, undo);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * 选择 AI 走法。difficulty: easy / normal / hard
 * 返回 {move, score, depth} 或 null。
 */
function chooseAIMoveRaw(state, side, difficulty = 'normal') {
  if (state.status !== 'playing' || state.turn !== side) return null;
  const all = generateLegalMoves(state, side);
  if (!all.length) return null;

  if (difficulty === 'easy') {
    const scored = all.map((m) => {
      const undo = makeMove(state, m, true);
      const s = evaluate(state, side) + (Math.random() - 0.5) * 180;
      undoMove(state, undo);
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    const pick = scored[Math.floor(Math.random() * Math.min(4, scored.length))];
    return { move: pick.m, score: pick.s, depth: 1 };
  }

  const maxDepth = difficulty === 'hard' ? 3 : 2;
  const timeMs = difficulty === 'hard' ? 1800 : 900;
  const deadline = Date.now() + timeMs;
  const nodes = { n: 0 };
  let bestMove = orderMoves(state, all)[0];
  let bestScore = -Infinity;
  let completedDepth = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let localBest = null;
    let localScore = -Infinity;
    let alpha = -Infinity;
    const ordered = orderMoves(state, all);
    try {
      for (const m of ordered) {
        const undo = makeMove(state, m, true);
        let score;
        if (state.status === 'finished') {
          score = state.winner === side ? MATE - 1 : -MATE + 1;
        } else {
          score = -negamax(state, depth - 1, -Infinity, -alpha, other(side), deadline, nodes);
        }
        undoMove(state, undo);
        if (score > localScore) {
          localScore = score;
          localBest = m;
        }
        if (score > alpha) alpha = score;
      }
      if (localBest) {
        bestMove = localBest;
        bestScore = localScore;
        completedDepth = depth;
      }
      if (bestScore >= MATE - 100) break;
    } catch (e) {
      if (!e.aiTimeout) throw e;
      break;
    }
  }

  // 同等分数时加入少量随机，避免每局完全一样
  if (completedDepth === 1) {
    const near = all.filter((m) => {
      const undo = makeMove(state, m, true);
      const s = evaluate(state, side);
      undoMove(state, undo);
      return s >= bestScore - 40;
    });
    if (near.length) bestMove = near[Math.floor(Math.random() * near.length)];
  }

  return { move: bestMove, score: bestScore, depth: completedDepth, nodes: nodes.n };
}

/** AI 升变按局面选择：逐个模拟升变结果，取评估最高者。 */
export function chooseAIMove(state, side, difficulty = 'normal') {
  const result = chooseAIMoveRaw(state, side, difficulty);
  const key = result?.move?.promote ? 'promote' : result?.move?.passengerPromote ? 'passengerPromote' : null;
  if (!key) return result;
  let best = result.move;
  let bestScore = -Infinity;
  for (const choice of PROMOTION_CHOICES) {
    const undo = makeMove(state, { ...result.move, [key]: choice }, true);
    updateStatus(state);
    let score;
    if (state.status === 'finished' && state.winner === side) {
      score = 10_000_000;
    } else {
      score = evaluate(state, side);
      if (isKingInCheck(state, other(side))) score += 120;
      const promoted = state.pieces[key === 'passengerPromote' ? result.move.passengerId : result.move.pieceId];
      if (promoted) {
        const attacked = isSquareAttacked(state, promoted.x, promoted.y, other(side));
        const defended = isSquareAttacked(state, promoted.x, promoted.y, side);
        if (attacked && !defended) score -= pieceValue(promoted) * 1.2;
      }
    }
    undoMove(state, undo);
    if (score > bestScore) {
      bestScore = score;
      best = { ...result.move, [key]: choice };
    }
  }
  return { ...result, move: best, score: bestScore };
}
