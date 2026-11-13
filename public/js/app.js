import * as E from '/shared/engine.js';
import {
  renderBoard,
  renderMiniBoard,
  displayToGame,
  glyphFor,
  badgeFor,
  pieceLabel,
} from './board.js';

/* ------------------------------------------------------------------ */
/* 全局状态                                                            */
/* ------------------------------------------------------------------ */

const appRoot = document.getElementById('app');
const toastRoot = document.getElementById('toast-root');

const R_CHOICES = [
  { value: 'R:transport', label: '运输车', glyph: '♜' },
  { value: 'R:siege', label: '攻城车', glyph: '♜' },
];
const M_CHOICES = [
  { value: 'Q', label: '后', glyph: '♛' },
  ...R_CHOICES,
];

const GROUP_NAMES = { K: '王', M: '后 / 车', R: '车', B: '主教', N: '骑士', P: '兵' };
const GROUP_ORDER = ['K', 'M', 'R', 'B', 'N', 'P'];

const app = {
  screen: 'home',
  mode: null, // ai | online | hotseat
  side: 'white',
  difficulty: 'normal',
  loadout: E.normalizeLoadout(E.defaultLoadout(), 'white'),
  opponentLoadout: E.normalizeLoadout(E.defaultLoadout(), 'black'),
  game: null,
  selected: null,
  legal: [],
  orientation: 'white',
  actionMenu: null,
  pendingPromotion: null,
  rulesOpen: false,
  previewKey: 'K:david',
  resultDismissed: false,
  setupFor: null,
  online: {
    code: null,
    token: null,
    side: null,
    role: null,
    joinCode: '',
    epoch: 0,
    lastVersion: -1,
    poll: null,
    polling: false,
    busy: false,
    players: null,
    rematchVotes: [],
    error: '',
  },
  hotseat: {
    whiteLoadout: E.normalizeLoadout(E.defaultLoadout(), 'white'),
    blackLoadout: E.normalizeLoadout(E.defaultLoadout(), 'black'),
    editing: 'white',
  },
  ai: {
    worker: null,
    pending: null,
    thinking: false,
    seq: 0,
  },
};

try {
  const saved = JSON.parse(localStorage.getItem('crown-highland-loadout') || 'null');
  if (saved) app.loadout = E.normalizeLoadout(saved, 'white');
} catch {
  /* ignore */
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toast(message) {
  if (!toastRoot) return;
  toastRoot.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toastRoot.innerHTML = '';
  }, 2600);
}

async function api(path, body) {
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) return { ok: false, error: data.error || `请求失败（${res.status}）` };
    return data;
  } catch (error) {
    return { ok: false, error: `网络错误：${error.message}` };
  }
}

function saveLoadout() {
  try {
    localStorage.setItem('crown-highland-loadout', JSON.stringify(app.loadout));
  } catch {
    /* ignore */
  }
}

function setScreen(screen) {
  app.screen = screen;
  app.actionMenu = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function stopPolling() {
  if (app.online.poll) clearInterval(app.online.poll);
  app.online.poll = null;
  app.online.polling = false;
}

function sideName(side) {
  return side === 'white' ? '白方' : '黑方';
}

function otherSide(side) {
  return side === 'white' ? 'black' : 'white';
}

function reasonText(reason) {
  return (
    {
      'king-captured': '擒王',
      checkmate: '将死',
      stalemate: '逼和',
      repetition: '三次重复',
      resign: '认输',
      'draw-agreed': '协议和棋',
    }[reason] || '对局结束'
  );
}

function resultTitle(game) {
  if (!game || game.status !== 'finished') return '';
  if (game.winner) return `${sideName(game.winner)}胜利`;
  return '和棋';
}

function resultSub(game) {
  if (!game) return '';
  if (game.reason === 'stalemate') return '无子可动，判为逼和。';
  if (game.reason === 'repetition') return '同一局面出现三次，判为和棋。';
  if (game.reason === 'draw-agreed') return '双方同意和棋。';
  if (game.reason === 'resign') return `${sideName(otherSide(game.winner))}认输。`;
  return reasonText(game.reason);
}

function modeLabel() {
  if (app.mode === 'ai') return '人机对战';
  if (app.mode === 'online') return '好友对弈';
  if (app.mode === 'hotseat') return '同屏双人';
  return '';
}

function difficultyLabel(value = app.difficulty) {
  return { easy: '见习', normal: '骑士', hard: '统帅' }[value] || value;
}

function material(state, side) {
  let total = 0;
  for (const p of Object.values(state.pieces)) {
    if (p.side !== side || p.type === 'K') continue;
    total += E.pieceValue(p);
  }
  return total;
}

function capturedGlyphs(state, side) {
  return (state.captured[side] || [])
    .map((p) => {
      const glyph = glyphFor({ type: p.type, side: p.side, subtype: p.subtype, promoted: p.promoted });
      return `<span class="${p.side === 'white' ? 'white-piece' : 'black-piece'}" title="${esc(pieceLabel(p))}">${glyph}</span>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ */
/* 首页                                                                */
/* ------------------------------------------------------------------ */

function renderHome() {
  return `
    <div class="screen">
      <section class="hero">
        <div>
          <span class="hero-kicker">Crown &amp; Highland · 12 × 12</span>
          <h1>王冠<br><em>高地</em></h1>
          <p class="lead">
            开局之前，先立王座。为你的王选择性格，为每一个兵种选择亚型，
            在河道与高地之间排出一套只属于你的二十二子战阵。然后落子。
          </p>
          <div class="hero-actions">
            <button class="btn primary" data-action="start-ai">开始人机对战</button>
            <button class="btn" data-action="start-online">创建 / 加入好友房</button>
            <button class="btn ghost" data-action="open-rules">阅读规则书</button>
          </div>
          <div class="hero-meta">
            <div><strong>12 × 12</strong><span>棋盘</span></div>
            <div><strong>22 vs 22</strong><span>固定阵型</span></div>
            <div><strong>5</strong><span>兵种亚型</span></div>
            <div><strong>3</strong><span>地形</span></div>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="crest">
            <div class="crest-inner">
              <div class="crest-crown">♛</div>
              <div class="crest-line"></div>
              <div class="crest-text">CROWN</div>
              <div class="crest-sub">HIGHLAND</div>
            </div>
          </div>
        </div>
      </section>

      <div class="mode-grid">
        <button class="mode-card" data-action="start-ai">
          <span class="mode-tag">SOLO</span>
          <span class="mode-icon">♞</span>
          <h3>人机对战</h3>
          <p>选择你的颜色与难度，和会布阵、会计算交换的 AI 对弈。</p>
        </button>
        <button class="mode-card" data-action="start-online">
          <span class="mode-tag">ONLINE</span>
          <span class="mode-icon">⚑</span>
          <h3>好友对弈</h3>
          <p>生成六位房间码，把链接发给朋友，轮流落子。</p>
        </button>
        <button class="mode-card" data-action="start-hotseat">
          <span class="mode-tag">LOCAL</span>
          <span class="mode-icon">♜</span>
          <h3>同屏双人</h3>
          <p>一台设备，两位棋手。各自布阵，轮流走子。</p>
        </button>
        <button class="mode-card" data-action="open-rules">
          <span class="mode-tag">CODEX</span>
          <span class="mode-icon">▤</span>
          <h3>规则书</h3>
          <p>地形、兵种、王的能力，以及所有本作扩展说明。</p>
        </button>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* 布阵                                                                */
/* ------------------------------------------------------------------ */

function openSetup(kind, extra = {}) {
  app.setupFor = kind;
  app.rulesOpen = false;
  app.actionMenu = null;
  if (kind === 'ai') {
    if (!['white', 'black', 'random'].includes(app.side)) app.side = 'white';
  } else if (kind === 'hotseat') {
    app.hotseat.editing = 'white';
    app.orientation = 'white';
  } else if (kind === 'online-host') {
    app.side = 'white';
    app.online.role = 'host';
    app.online.joinCode = '';
    app.online.error = '';
  } else if (kind === 'online-guest') {
    app.side = 'black';
    app.online.role = 'guest';
    app.online.joinCode = String(extra.code || app.online.joinCode || '').toUpperCase();
    app.online.error = '';
  }
  setScreen('setup');
}

function editingSide() {
  if (app.setupFor === 'hotseat') return app.hotseat.editing;
  if (app.setupFor === 'online-guest') return 'black';
  if (app.setupFor === 'online-host') return 'white';
  return app.side === 'black' ? 'black' : 'white';
}

function getLoadoutFor(side) {
  if (app.setupFor === 'hotseat') {
    return side === 'white' ? app.hotseat.whiteLoadout : app.hotseat.blackLoadout;
  }
  if (side === editingSide()) return app.loadout;
  return app.opponentLoadout;
}

function setLoadoutFor(side, next) {
  if (app.setupFor === 'hotseat') {
    if (side === 'white') app.hotseat.whiteLoadout = next;
    else app.hotseat.blackLoadout = next;
    return;
  }
  if (side === editingSide()) {
    app.loadout = next;
    saveLoadout();
  } else {
    app.opponentLoadout = next;
  }
}

function previewLoadouts() {
  if (app.setupFor === 'hotseat') {
    return { white: app.hotseat.whiteLoadout, black: app.hotseat.blackLoadout };
  }
  if (app.setupFor === 'online-host') {
    return { white: app.loadout, black: app.opponentLoadout };
  }
  if (app.setupFor === 'online-guest') {
    return { white: app.opponentLoadout, black: app.loadout };
  }
  const playerSide = app.side === 'black' ? 'black' : 'white';
  return playerSide === 'white'
    ? { white: app.loadout, black: app.opponentLoadout }
    : { white: app.opponentLoadout, black: app.loadout };
}

function slotChoices(slot) {
  const st = E.slotType(slot);
  if (st === 'M') return M_CHOICES;
  if (st === 'K') return E.SUBTYPES.K.map((s) => ({ value: s.id, label: s.name, glyph: E.PIECE_TYPES.K.symbol }));
  if (st === 'B') return E.SUBTYPES.B.map((s) => ({ value: s.id, label: s.name, glyph: E.PIECE_TYPES.B.symbol }));
  if (st === 'N') return E.SUBTYPES.N.map((s) => ({ value: s.id, label: s.name, glyph: E.PIECE_TYPES.N.symbol }));
  if (st === 'P') return E.SUBTYPES.P.map((s) => ({ value: s.id, label: s.name, glyph: E.PIECE_TYPES.P.symbol }));
  if (st === 'R') return R_CHOICES;
  return [{ value: null, label: '固定', glyph: E.PIECE_TYPES[st]?.symbol || '?' }];
}

function choiceLabel(slot, choice) {
  return slotChoices(slot).find((c) => c.value === choice)?.label || choice;
}

function choiceGlyph(slot, choice) {
  return slotChoices(slot).find((c) => c.value === choice)?.glyph || '?';
}

function loadoutSummary(side) {
  const loadout = getLoadoutFor(side);
  const counts = new Map();
  for (const f of E.FORMATION.filter((x) => x.side === side)) {
    const label = choiceLabel(f.slot, loadout[f.slot]);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `<span class="chip"><b>${esc(label)}</b> ×${count}</span>`)
    .join('');
}

function renderLoadoutEditor(side) {
  const loadout = getLoadoutFor(side);
  const slots = E.FORMATION.filter((f) => f.side === side);
  const groups = GROUP_ORDER.map((type) => ({
    type,
    name: GROUP_NAMES[type],
    slots: slots.filter((f) => E.slotType(f.slot) === type),
  })).filter((g) => g.slots.length);

  return `
    <div class="panel panel-pad">
      <div class="panel-title">
        <h3>${sideName(side)}阵容</h3>
        <span>${slots.length} 个槽位</span>
      </div>
      <div class="loadout-list">
        ${groups
          .map(
            (g) => `
          <div class="loadout-group">
            <div class="loadout-group-head">
              <strong>${g.name}</strong>
              <span>${g.slots.length} 枚</span>
            </div>
            <div class="loadout-rows">
              ${g.slots
                .map((f) => {
                  const value = loadout[f.slot];
                  const choices = slotChoices(f.slot);
                  return `
                    <div class="loadout-row">
                      <span class="slot-name">${f.slot} · ${E.squareName(f.x, f.y)}</span>
                      <div class="slot-preview">
                        <span class="mini-glyph">${choiceGlyph(f.slot, value)}</span>
                        <select data-action="set-slot" data-side="${side}" data-slot="${f.slot}" aria-label="${f.slot} 亚型">
                          ${choices
                            .map(
                              (c) =>
                                `<option value="${esc(c.value ?? '')}" ${c.value === value ? 'selected' : ''}>${esc(c.label)}</option>`,
                            )
                            .join('')}
                        </select>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="summary-chips">${loadoutSummary(side)}</div>
    </div>
  `;
}

function renderSetup() {
  const kind = app.setupFor;
  const side = editingSide();
  const { white, black } = previewLoadouts();
  const preview = E.createGameState(white, black);
  const orientation = side === 'black' ? 'black' : 'white';
  const title =
    kind === 'ai'
      ? '人机对战 · 战前布阵'
      : kind === 'hotseat'
        ? '同屏双人 · 双方布阵'
        : kind === 'online-host'
          ? '创建好友房 · 你的白方阵容'
          : '加入好友房 · 你的黑方阵容';

  const sideControl =
    kind === 'ai'
      ? `
        <div class="field">
          <label>你执</label>
          <div class="seg">
            <button class="${app.side === 'white' ? 'active' : ''}" data-action="ai-side" data-side="white">白方</button>
            <button class="${app.side === 'black' ? 'active' : ''}" data-action="ai-side" data-side="black">黑方</button>
            <button class="${app.side === 'random' ? 'active' : ''}" data-action="ai-side" data-side="random">随机</button>
          </div>
        </div>
        <div class="field">
          <label>AI 难度</label>
          <div class="seg">
            <button class="${app.difficulty === 'easy' ? 'active' : ''}" data-action="difficulty" data-level="easy">见习</button>
            <button class="${app.difficulty === 'normal' ? 'active' : ''}" data-action="difficulty" data-level="normal">骑士</button>
            <button class="${app.difficulty === 'hard' ? 'active' : ''}" data-action="difficulty" data-level="hard">统帅</button>
          </div>
        </div>
      `
      : kind === 'hotseat'
        ? `
        <div class="field">
          <label>正在编辑</label>
          <div class="seg" style="grid-template-columns:1fr 1fr">
            <button class="${app.hotseat.editing === 'white' ? 'active' : ''}" data-action="hotseat-tab" data-side="white">白方</button>
            <button class="${app.hotseat.editing === 'black' ? 'active' : ''}" data-action="hotseat-tab" data-side="black">黑方</button>
          </div>
        </div>
        <div class="field">
          <label>提示</label>
          <p class="empty-note" style="margin:0">白方先行。双方使用同一块屏幕，无隐藏信息。</p>
        </div>
      `
        : `
        <div class="field">
          <label>你的阵营</label>
          <div class="badge gold" style="display:inline-block;padding:7px 11px">${sideName(side)} · ${kind === 'online-host' ? '房主' : '挑战者'}</div>
        </div>
        <div class="field">
          <label>房间码</label>
          <div class="badge" style="display:inline-block;padding:7px 11px;letter-spacing:.18em">${esc(app.online.joinCode || '创建后生成')}</div>
        </div>
        ${app.online.error ? `<div class="error-text">${esc(app.online.error)}</div>` : ''}
      `;

  return `
    <div class="screen">
      <div class="section-head">
        <div>
          <h2>${title}</h2>
          <p>规则书阵型固定，你只需为每个槽位选择亚型。点击右侧下拉框调整，左侧棋盘会实时预览。</p>
        </div>
        <div class="top-actions">
          <button class="btn ghost" data-action="setup-back">返回</button>
          <button class="btn" data-action="open-rules">规则</button>
        </div>
      </div>

      <div class="setup-grid">
        <div class="panel setup-board-panel">
          ${renderBoard(preview, { orientation, interactive: false })}
          <div class="summary-chips" style="justify-content:center;margin-top:14px">
            <span class="chip">白方 <b>${material(preview, 'white')}</b></span>
            <span class="chip">黑方 <b>${material(preview, 'black')}</b></span>
            <span class="chip">高地 <b>${preview.terrain.flat().filter((t) => t === 'highland').length}</b></span>
            <span class="chip">河道 <b>${preview.terrain.flat().filter((t) => t === 'river').length}</b></span>
          </div>
        </div>

        <div class="setup-side">
          <div class="panel panel-pad">
            <div class="panel-title"><h3>对局设置</h3><span>${modeLabel() || '战前'}</span></div>
            ${sideControl}
          </div>

          ${renderLoadoutEditor(side)}

          <div class="panel panel-pad">
            <div class="setup-actions">
              <button class="btn primary" data-action="start-game">${kind === 'online-host' ? '创建房间' : kind === 'online-guest' ? '加入房间' : '开始对局'}</button>
              <button class="btn" data-action="random-loadout">随机阵容</button>
              <button class="btn" data-action="default-loadout">推荐配置</button>
              ${kind === 'hotseat' && side === 'black' ? '<button class="btn ghost" data-action="copy-white">复制白方</button>' : ''}
            </div>
            <p class="empty-note mt-8">${kind === 'ai' ? 'AI 会使用一套均衡的默认阵容；你可以随时重开。' : kind === 'hotseat' ? '双方都配置完成后开始；白方先走。' : '双方阵容在开局后公开。'}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* 在线大厅 / 等待                                                     */
/* ------------------------------------------------------------------ */

function renderOnlineLobby() {
  return `
    <div class="screen">
      <div class="section-head">
        <div>
          <h2>好友对弈</h2>
          <p>房主执白，挑战者执黑。创建后把六位房间码发给朋友即可。</p>
        </div>
        <button class="btn ghost" data-action="back-home">返回主页</button>
      </div>
      <div class="online-grid">
        <div class="panel online-card">
          <h3>创建房间</h3>
          <p>先配置你的白方阵容，再生成房间。朋友加入后立即开局。</p>
          <button class="btn primary" data-action="online-create">配置白方并创建</button>
        </div>
        <div class="panel online-card">
          <h3>加入房间</h3>
          <p>输入朋友发来的六位房间码。你将执黑，并配置自己的阵容。</p>
          <div class="join-row">
            <input id="join-code" maxlength="6" placeholder="ABC123" autocomplete="off" value="${esc(app.online.joinCode)}" />
            <button class="btn" data-action="online-join">加入</button>
          </div>
          <div class="error-text">${esc(app.online.error || '')}</div>
        </div>
      </div>
    </div>
  `;
}

function renderWaiting() {
  const code = app.online.code || '------';
  return `
    <div class="screen">
      <div class="section-head">
        <div>
          <h2>房间已创建</h2>
          <p>把房间码发给朋友。对方加入后会自动开局。</p>
        </div>
        <button class="btn ghost" data-action="cancel-online">取消</button>
      </div>
      <div class="panel panel-pad" style="max-width:680px;margin:0 auto;text-align:center">
        <div class="panel-title" style="justify-content:center"><h3>房间码</h3></div>
        <div class="room-code">${esc(code)}</div>
        <div class="setup-actions" style="justify-content:center;margin-top:14px">
          <button class="btn primary" data-action="copy-code">复制房间码</button>
          <button class="btn" data-action="open-rules">查看规则</button>
        </div>
        <div class="waiting-note" style="justify-content:center">
          <span class="spinner"></span>
          等待挑战者加入… 你是白方，先行。
        </div>
        <div class="summary-chips" style="justify-content:center;margin-top:16px">${loadoutSummary('white')}</div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* 对局                                                                */
/* ------------------------------------------------------------------ */

function humanCanMove() {
  if (!app.game || app.game.status !== 'playing') return false;
  if (app.mode === 'ai') return app.game.turn === app.side && !app.ai.thinking;
  if (app.mode === 'online') return app.game.turn === app.online.side && !app.online.busy;
  return true;
}

function selectedPiece() {
  if (!app.selected || !app.game) return null;
  return app.game.pieces[app.selected.pieceId] || null;
}

function playerName(side) {
  if (app.mode === 'ai') return side === app.side ? '你' : `AI · ${difficultyLabel()}`;
  if (app.mode === 'online') {
    if (side === app.online.side) return '你';
    return app.online.players?.[side]?.name || (side === 'white' ? '房主' : '挑战者');
  }
  return sideName(side);
}

function playerLine(side) {
  const game = app.game;
  const active = game.turn === side && game.status === 'playing';
  return `
    <div class="player-line">
      <div class="who">
        <i class="${side}"></i>
        <div>
          ${esc(playerName(side))}
          <span>${sideName(side)}${active ? ' · 行棋中' : ''}</span>
        </div>
      </div>
      <div class="score">${material(game, side)}</div>
    </div>
    <div class="captured-row">${capturedGlyphs(game, side)}</div>
  `;
}

function statusText() {
  const game = app.game;
  if (game.status === 'finished') return resultTitle(game);
  if (game.pendingBonus) return '亚历山大的再行动';
  if (app.mode === 'ai' && app.ai.thinking) return 'AI 正在计算…';
  if (game.check) return '将军！';
  return `${sideName(game.turn)}行棋`;
}

function renderGame() {
  const game = app.game;
  if (!game) return renderHome();
  const can = humanCanMove();
  const legal = can ? E.generateLegalMoves(game, game.turn) : [];
  if (app.selected) {
    const p = game.pieces[app.selected.pieceId];
    if (!p || p.side !== game.turn) {
      app.selected = null;
      app.legal = [];
    }
  }
  const selected = selectedPiece();
  const selectedLegal = selected ? legal.filter((m) => m.pieceId === selected.id) : [];
  const checkSide = game.check ? game.turn : null;
  const orientation = app.orientation;
  const isMyTurn = can;
  const pending = game.pendingBonus;
  const immuneSide = ['white', 'black'].find((s) => game.flags[s]?.immuneUntil >= game.turnNumber);
  const promotionTarget = app.pendingPromotion
    ? (app.pendingPromotion.passenger ? app.pendingPromotion.move.drop : app.pendingPromotion.move.to)
    : null;
  const promotion = promotionTarget
    ? {
        x: promotionTarget.x,
        y: promotionTarget.y,
        choices: E.PROMOTION_CHOICES.map((choice) => {
          const item = PROMOTION_LABELS[choice];
          return { choice, glyph: item.glyph, name: item.name };
        }),
      }
    : null;

  const menuMaxH = Math.min(320, window.innerHeight * 0.7);
  const menuLeft = Math.max(8, Math.min(app.actionMenu?.x ?? 0, window.innerWidth - 196));
  const menuTop = Math.max(8, Math.min(app.actionMenu?.y ?? 0, window.innerHeight - menuMaxH - 16));
  const ability = selected ? E.subtypeDef(selected.type, selected.subtype) : null;
  const davidAvailable =
    isMyTurn &&
    game.flags[game.turn]?.davidShield &&
    selected &&
    selected.type === 'K' &&
    selected.subtype === 'david';

  return `
    <div class="screen">
      <div class="panel game-topline">
        <div class="turn-pill">
          <span class="turn-dot ${game.turn}"></span>
          <strong>${statusText()}</strong>
          <span class="turn-sub">第 ${game.moveNumber} 回合 · ${modeLabel()}</span>
        </div>
        <div class="game-badges">
          ${game.check ? '<span class="badge red">将军</span>' : ''}
          ${pending ? '<span class="badge gold">再行动</span>' : ''}
          ${app.mode === 'online' ? `<span class="badge gold">房间 ${esc(app.online.code || '')}</span>` : ''}
          ${app.mode === 'ai' ? `<span class="badge">${difficultyLabel()}</span>` : ''}
        </div>
        <div class="top-actions">
          <button class="btn small" data-action="open-rules">规则</button>
          <button class="btn small" data-action="flip-board">翻转</button>
          ${game.status === 'playing' ? `<button class="btn small danger" data-action="resign">认输</button>` : ''}
          <button class="btn small ghost" data-action="back-home">返回</button>
        </div>
      </div>

      <div class="game-layout">
        <div class="game-main">
          <div class="panel board-panel">
            ${renderBoard(game, {
              orientation,
              selected: selected ? { x: selected.x, y: selected.y } : null,
              legal: selected ? selectedLegal : [],
              lastMove: game.lastMove,
              checkSide,
              interactive: can,
              promotion,
            })}
          </div>
          <p class="empty-note center" style="margin:0">
            ${can ? '点击己方棋子查看走法；再点目标格落子。' : game.status === 'finished' ? '对局已经结束。' : '等待对方落子…'}
          </p>
        </div>

        <aside class="side-panel">
          <div class="panel side-card">
            <h3>棋手</h3>
            ${playerLine('white')}
            ${playerLine('black')}
          </div>

          <div class="panel side-card">
            <h3>${selected ? '选中棋子' : '行动'}</h3>
            ${
              selected
                ? `
                <div class="player-line">
                  <div class="who"><i class="${selected.side}"></i><div>${esc(pieceLabel(selected))}<span>${E.squareName(selected.x, selected.y)} · ${selectedLegal.length} 种走法</span></div></div>
                  <div class="score">${E.PIECE_TYPES[selected.type]?.symbol || ''}</div>
                </div>
                ${ability ? `<p class="empty-note">${esc(ability.text)}</p>` : '<p class="empty-note">标准棋子。</p>'}
                ${
                  davidAvailable
                    ? `<div class="ability-box mt-8"><button class="ability-btn" data-action="david"><span class="ico">✦</span><span><strong>发动神佑</strong><small>本回合及对手下一回合免疫攻击与将军（每局一次）</small></span></button></div>`
                    : ''
                }
              `
                : `<p class="empty-note">${pending ? '王吃子后可以再行动一次。选择王的落点，或跳过。' : '选择一枚己方棋子开始。'}</p>`
            }
            ${
              pending && isMyTurn
                ? `<div class="ability-box mt-8"><button class="ability-btn" data-action="skip-bonus"><span class="ico">↷</span><span><strong>跳过再行动</strong><small>结束本回合，交给对手</small></span></button></div>`
                : ''
            }
            ${immuneSide ? `<p class="empty-note gold mt-8">${sideName(immuneSide)}神佑生效中：王暂不可被攻击或将军。</p>` : ''}
          </div>

          <div class="panel side-card">
            <h3>行棋记录</h3>
            <div class="move-log" id="move-log">
              ${
                game.history.length
                  ? game.history
                      .map(
                        (h, i) => `
                    <div class="move-row">
                      <span class="num">${i + 1}.</span>
                      <span class="txt ${h.captureId ? 'capture' : ''}">${esc(h.notation || E.moveNotation(game, h, false))}</span>
                    </div>
                  `,
                      )
                      .join('')
                  : '<p class="empty-note">还没有落子。白方先行。</p>'
              }
            </div>
          </div>

          ${
            app.mode === 'online'
              ? `
            <div class="panel side-card">
              <h3>房间</h3>
              <div class="player-line"><span class="muted">房间码</span><strong class="gold" style="letter-spacing:.18em">${esc(app.online.code || '')}</strong></div>
              <div class="setup-actions">
                <button class="btn small" data-action="copy-code">复制</button>
                ${app.online.rematchVotes?.includes(app.online.side) ? '<span class="badge gold">已请求再来一局</span>' : ''}
              </div>
            </div>
          `
              : ''
          }
        </aside>
      </div>

      ${
        app.actionMenu
          ? `<div class="action-menu" style="left:${menuLeft}px;top:${menuTop}px">
              ${app.actionMenu.moves
                .map(
                  (m, i) => `
                <button data-action="choose-move" data-index="${i}">
                  <span>${esc(moveActionLabel(m))}</span>
                  <small>${esc(moveActionDetail(m))}</small>
                </button>
              `,
                )
                .join('')}
            </div>`
          : ''
      }

      ${
        game.status === 'finished' && !app.resultDismissed
          ? `<div class="result-overlay">
              <div class="result-card">
                <div class="result-icon">${game.winner ? '♛' : '◇'}</div>
                <h2>${resultTitle(game)}</h2>
                <p>${esc(resultSub(game))}</p>
                <div class="result-actions">
                  <button class="btn primary" data-action="rematch">${app.mode === 'online' ? '请求再来一局' : '再来一局'}</button>
                  <button class="btn" data-action="dismiss-result">查看棋盘</button>
                  <button class="btn ghost" data-action="back-home">返回主页</button>
                </div>
              </div>
            </div>`
          : ''
      }
    </div>
  `;
}

function moveActionLabel(move) {
  if (move.kind === 'transport') return '运载';
  if (move.kind === 'demolish') return '拆除高地';
  if (move.kind === 'ranged') return '远程攻击';
  if (move.kind === 'convert') return '转化';
  if (move.ability === 'charlemagne') return '疾行';
  if (move.isBonus) return '再行动';
  return move.captureId ? '吃子' : '移动';
}

function moveActionDetail(move) {
  const parts = [];
  if (move.to) parts.push(`${E.squareName(move.from.x, move.from.y)} → ${E.squareName(move.to.x, move.to.y)}`);
  if (move.passengerId && app.game?.pieces[move.passengerId]) parts.push(`带 ${pieceLabel(app.game.pieces[move.passengerId])}`);
  if (move.drop) parts.push(`放到 ${E.squareName(move.drop.x, move.drop.y)}`);
  const promotion = move.promote || move.passengerPromote;
  if (promotion) {
    const [type, sub] = String(promotion).split(':');
    parts.push(`升变为${E.subtypeDef(type, sub)?.name || E.PIECE_TYPES[type]?.name || '后'}`);
  }
  if (move.kind === 'ranged') parts.push('不移动');
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/* 规则书                                                              */
/* ------------------------------------------------------------------ */

/** 图鉴里的范围示意：以棋子为中心，金色=移动，红色=攻击，蓝色=仅移动。 */
function pieceDemoRange(type, subtype) {
  const move = new Set();
  const attack = new Set();
  const moveOnly = new Set();
  const key = (dx, dy) => `${dx},${dy}`;
  const add = (dx, dy, kind = 'both') => {
    const k = key(dx, dy);
    if (kind === 'both' || kind === 'move' || kind === 'moveOnly') move.add(k);
    if (kind === 'both' || kind === 'attack') attack.add(k);
    if (kind === 'moveOnly') moveOnly.add(k);
  };
  const ray = (dirs) => {
    for (const [dx, dy] of dirs) {
      for (let i = 1; i <= 3; i++) add(dx * i, dy * i);
    }
  };

  if (type === 'K') {
    for (const [dx, dy] of E.ALL8) add(dx, dy);
  } else if (type === 'Q') {
    ray(E.ALL8);
  } else if (type === 'R') {
    ray(E.ORTHO);
  } else if (type === 'B') {
    ray(E.DIAG);
    if (subtype === 'red') {
      add(2, 0, 'moveOnly');
      add(-2, 0, 'moveOnly');
    }
    if (subtype === 'heretic') {
      add(0, 2, 'moveOnly');
      add(0, -2, 'moveOnly');
    }
  } else if (type === 'N') {
    for (const [dx, dy] of E.KNIGHT_MOVES) add(dx, dy);
    if (subtype === 'armored') for (const [dx, dy] of E.ORTHO) add(dx, dy);
    if (subtype === 'hunter') for (const [dx, dy] of E.ORTHO) add(dx * 2, dy * 2, 'moveOnly');
  } else if (type === 'P') {
    if (subtype === 'infantry') {
      add(0, -1, 'move'); add(0, -2, 'move');
      add(-1, -1, 'attack'); add(1, -1, 'attack');
    } else if (subtype === 'archer') {
      add(0, -1, 'both');
      add(-1, -2, 'attack'); add(1, -2, 'attack');
    } else if (subtype === 'spear') {
      add(0, -1, 'move'); add(0, -2, 'both');
      add(-1, -1, 'attack'); add(1, -1, 'attack');
    } else if (subtype === 'shield') {
      add(0, -1, 'move');
      add(-1, -1, 'attack'); add(1, -1, 'attack');
      add(-1, 1, 'attack'); add(1, 1, 'attack');
    }
  }
  return { move, attack, moveOnly };
}

function pieceDemoNote(type, subtype) {
  if (type === 'K') return '相邻 1 格；不能主动走入被攻击格。王的能力见下一节。';
  if (type === 'Q') return '直线或斜线任意格；移动与攻击范围相同。';
  if (type === 'R' && subtype === 'transport') return '直线任意格；另可携带正交相邻的兵上高地。';
  if (type === 'R' && subtype === 'siege') return '直线任意格；另可穿过连续高地、拆高地。';
  if (type === 'B' && subtype === 'red') return '斜线任意格；额外横向 2 格，仅移动。';
  if (type === 'B' && subtype === 'heretic') return '斜线任意格；额外纵向 2 格，仅移动。';
  if (type === 'N' && subtype === 'armored') return '正交 1 格 + 8 个 L 形；L 形可以越过高地。';
  if (type === 'N' && subtype === 'hunter') return '8 个 L 形；额外正交 2 格，仅移动。上下高地只走 1 格，连续高地上可走 2 格。';
  if (subtype === 'infantry') return '向前 1 或 2 格；斜前 1 格吃子。';
  if (subtype === 'archer') return '向前 1 格；左右 1、前方 2 的 L 形点位远程攻击。';
  if (subtype === 'spear') return '向前 1 或 2 格；斜前 1 格吃子。';
  if (subtype === 'shield') return '向前 1 格；斜前 1 格、正后 1 格吃子。';
  return '';
}

function pieceCardHtml(type, subtype, name) {
  const piece = { side: 'white', type, subtype };
  const code = E.pieceCode(type, subtype);
  const badge = badgeFor(piece);
  return `
    <button type="button" class="rules-piece-card" data-piece-demo="${type}:${subtype || ''}" aria-label="预览${esc(name)}的移动和攻击范围">
      <span class="rules-piece-avatar side-white">
        <span class="piece-glyph">${glyphFor(piece)}</span>
        ${badge ? `<i class="rules-piece-mini-badge">${esc(badge)}</i>` : ''}
      </span>
      <span class="rules-piece-meta"><b>${esc(name)}</b><small>${esc(code)}</small></span>
    </button>
  `;
}

function pieceDemoHtml(type, subtype) {
  const def = subtype ? E.subtypeDef(type, subtype) : null;
  const name = def?.name || E.PIECE_TYPES[type]?.name || '棋子';
  const code = E.pieceCode(type, subtype);
  const glyph = glyphFor({ side: 'white', type, subtype });
  const badge = badgeFor({ side: 'white', type, subtype });
  const { move, attack, moveOnly } = pieceDemoRange(type, subtype);
  const cells = [];
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const k = `${x},${y}`;
      const isOrigin = x === 0 && y === 0;
      const classes = ['demo-cell'];
      if (isOrigin) {
        classes.push('demo-origin');
      } else if (moveOnly.has(k)) {
        classes.push('demo-moveonly');
      } else if (move.has(k) && attack.has(k)) {
        classes.push('demo-both');
      } else if (move.has(k)) {
        classes.push('demo-move');
      } else if (attack.has(k)) {
        classes.push('demo-attack');
      }
      cells.push(`<span class="${classes.join(' ')}">${isOrigin ? `<span class="demo-piece side-white"><span class="piece-glyph">${glyph}</span></span>` : ''}</span>`);
    }
  }
  return `
    <div class="rules-demo-head">
      <span class="rules-demo-avatar side-white">
        <span class="piece-glyph">${glyph}</span>
        ${badge ? `<i class="rules-demo-badge">${esc(badge)}</i>` : ''}
      </span>
      <div>
        <h4>${esc(name)}</h4>
        <p><code>${esc(code)}</code> · ${esc(E.PIECE_TYPES[type]?.name || '')}</p>
      </div>
    </div>
    <div class="rules-demo-board" role="img" aria-label="${esc(name)}的移动和攻击范围">${cells.join('')}</div>
    <div class="rules-demo-legend">
      <span><i class="demo-dot demo-dot-move"></i>移动</span>
      <span><i class="demo-dot demo-dot-attack"></i>攻击</span>
      <span><i class="demo-dot demo-dot-moveonly"></i>仅移动</span>
    </div>
    <p class="rules-demo-note">${esc(pieceDemoNote(type, subtype))}</p>
    <p class="rules-demo-footnote">按平地示意，不含地形与棋子阻挡。</p>
  `;
}

function rulesHtml() {
  const rows = [];
  const push = (type, name, move, attack) => rows.push({ type, name, move, attack });

  push('王', '王', '相邻 1 格（直线或斜线）', '相邻 1 格；不可主动走入被攻击格');
  push('后', '后', '直线 / 斜线任意格', '同移动');
  for (const s of E.SUBTYPES.R) {
    const move = '直线任意格';
    const attack = s.id === 'transport'
      ? '同移动；可携带相邻友军上高地'
      : '同移动；可穿过一整片连续高地并落在其后一格';
    push('车', s.name, move, attack);
  }
  for (const s of E.SUBTYPES.B) push('主教', s.name, '斜线任意格' + (s.id === 'red' ? '；额外横向 2 格（仅移动）' : '；额外纵向 2 格（仅移动）'), '斜线任意格');
  for (const s of E.SUBTYPES.N) push('骑士', s.name, s.id === 'armored' ? '正交 1 格 + 8 个 L 形跳跃' : '8 个 L 形跳跃；额外正交 2 格（仅移动）', s.id === 'armored' ? '同移动；L 形可越过高地，正交 1 格不能从高地出发或落到高地' : 'L 形可越过高地；额外正交移动上下高地只走 1 格，连续高地上可走 2 格');
  const pawnRows = {
    infantry: ['向前 1 或 2 格', '斜前 1 格吃子并占据目标格；可上相邻空高地，可攻击同一片高地；下高地只能走正前方 1 格，且在高地上不能攻击高地下的敌人。'],
    archer: ['向前 1 格；初次可走 2 格并上相邻高地', '左右 1、前方 2 的 L 形点位远程攻击，不移动；路径不受高地阻挡；在高地上可以攻击斜前方 1 格的高地下敌人，但不能攻击正前方的高地下敌人。'],
    spear: ['向前 1 格；初次可走 2 格并上相邻高地', '斜前 1 格、正前 2 格攻击并占据目标格；正前 2 格可攻击相邻高地；从高地往下只能攻击正前方 1 格的高地下目标。'],
    shield: ['向前 1 格；初次可走 2 格并上相邻高地', '斜前 1 格、正后 1 格攻击并占据目标格；在高地上不能攻击高地下的敌人。'],
  };
  for (const s of E.SUBTYPES.P) push('兵', s.name, pawnRows[s.id][0], pawnRows[s.id][1]);

  const groups = ['王', '后', '车', '主教', '骑士', '兵'].map((type) => ({
    type,
    rows: rows.filter((r) => r.type === type),
  }));

  const galleryHtml = [
    ['K', E.SUBTYPES.K],
    ['Q', [{ id: null, name: '后' }]],
    ['R', E.SUBTYPES.R],
    ['B', E.SUBTYPES.B],
    ['N', E.SUBTYPES.N],
    ['P', E.SUBTYPES.P],
  ].map(([type, items]) => `
    <div class="rules-gallery-group">
      <h4>${esc(E.PIECE_TYPES[type].name)}</h4>
      <div class="rules-gallery-grid">${items.map((s) => pieceCardHtml(type, s.id, s.name)).join('')}</div>
    </div>
  `).join('');

  return `
    <div class="rules-modal" data-action="rules-backdrop">
      <div class="rules-dialog" role="dialog" aria-modal="true" aria-label="规则书">
        <button class="btn small rule-close" data-action="close-rules">关闭</button>

        <header class="rules-head">
          <p class="rules-kicker">CROWN HIGHLAND · 12×12</p>
          <h2>王冠高地 · 规则书</h2>
          <p class="rules-lead">基本规则与国际象棋相同。这份规则书只讲本作新增的地形、布阵与兵种差异；先看下面的速查，再按目录查细节。</p>
        </header>

        <nav class="rules-nav" aria-label="规则目录">
          <a href="#rules-goal">01 胜负</a>
          <a href="#rules-board">02 地形</a>
          <a href="#rules-setup">03 布阵</a>
          <a href="#rules-pieces">04 兵种</a>
          <a href="#rules-abilities">05 王的能力</a>
          <a href="#rules-actions">06 特殊行动</a>
          <a href="#rules-other">07 其他</a>
        </nav>

        <div class="rules-quick">
          <article class="rules-quick-card">
            <span class="rules-quick-num">01</span>
            <strong>擒王即胜</strong>
            <p>吃掉对方的王，或将死对方，立即获胜。</p>
          </article>
          <article class="rules-quick-card">
            <span class="rules-quick-num">02</span>
            <strong>高地多算一格</strong>
            <p>进入或离开高地都要多花 1 格；同一次移动不能先上后下。</p>
          </article>
          <article class="rules-quick-card">
            <span class="rules-quick-num">03</span>
            <strong>河道不能停留</strong>
            <p>任何单位都不能进入河道；弓兵远程可以跨河射击。</p>
          </article>
          <article class="rules-quick-card">
            <span class="rules-quick-num">04</span>
            <strong>无子可动 / 三次重复</strong>
            <p>逼和与三次重复局面都判和棋。</p>
          </article>
        </div>

        <section class="rules-section" id="rules-goal">
          <div class="rules-section-head">
            <span class="rules-num">01</span>
            <div>
              <h3>目标与胜负</h3>
              <p>先把对方的王将死，或者直接吃掉它。</p>
            </div>
          </div>
          <div class="rules-cols">
            <article class="rules-card">
              <h4>获胜</h4>
              <ul class="rules-list">
                <li><b>擒王</b>：吃掉对方的王，立即获胜。</li>
                <li><b>将死</b>：对方王被将军，且没有任何合法应手，立即获胜。</li>
                <li><b>认输</b>：对方认输，立即获胜。</li>
              </ul>
            </article>
            <article class="rules-card">
              <h4>和棋</h4>
              <ul class="rules-list">
                <li><b>逼和</b>：轮到一方行棋，但没有任何合法走法，且王未被将军。</li>
                <li><b>三次重复</b>：同一局面出现三次，包括循环走子和连续将军造成的重复。</li>
                <li><b>协议和棋</b>：双方同意和棋。</li>
              </ul>
            </article>
          </div>
          <p class="rules-callout"><b>什么是将军？</b>轮到一方时，如果对方存在一步可以实际攻击到王，就构成将军。判定按真实攻击路径处理：河道、高地、路径上的棋子都可能挡住攻击。</p>
        </section>

        <section class="rules-section" id="rules-board">
          <div class="rules-section-head">
            <span class="rules-num">02</span>
            <div>
              <h3>棋盘与地形</h3>
              <p>12×12 棋盘，白方在下方第 10–12 行，黑方在上方第 1–4 行，白方先行。</p>
            </div>
          </div>
          <div class="rules-statline">
            <span><b>12×12</b> 棋盘</span>
            <span><b>22</b> 子 / 方</span>
            <span><b>a–l</b> 横轴</span>
            <span><b>1–12</b> 纵轴</span>
            <span><b>e9 / h9</b> 白方前哨兵</span>
          </div>
          <div class="rules-terrain-grid">
            <article class="rules-terrain-card">
              <div class="rules-terrain-swatch swatch-plain"></div>
              <div>
                <h4>平地</h4>
                <p>普通格。按兵种正常移动和攻击。</p>
              </div>
            </article>
            <article class="rules-terrain-card">
              <div class="rules-terrain-swatch swatch-river"></div>
              <div>
                <h4>河道</h4>
                <p>不能进入或停留；移动和滑行攻击的路径会被阻断。弓兵远程可以跨河，但棋子仍会挡住 L 形射界。</p>
              </div>
            </article>
            <article class="rules-terrain-card">
              <div class="rules-terrain-swatch swatch-highland"></div>
              <div>
                <h4>高地</h4>
                <p>上下左右或斜角相连的高地算一整片。同一片高地内部按平地处理。</p>
              </div>
            </article>
          </div>
          <article class="rules-card rules-highland-card">
            <h4>高地三条关键规则</h4>
            <div class="rules-highland-grid">
              <div><span>1</span><b>额外一格</b><p>进入或离开高地都要多算 1 格；一次移动不能先上高地再下来。</p></div>
              <div><span>2</span><b>阻挡滑行</b><p>后、车、主教的滑行路径被高地挡住；骑士的 L 形跳跃可以越过高地。</p></div>
              <div><span>3</span><b>攻击高地</b><p>普通棋子只能在同片高地，或山脚相邻格攻击高地；攻城车可以沿直线远攻。</p></div>
            </div>
          </article>
          <p class="rules-callout rules-callout-muted">甲胄骑士的正交 1 格不能上下高地；游猎骑士的额外正交移动上下高地只走 1 格，连续高地上可走 2 格。</p>
        </section>

        <section class="rules-section" id="rules-setup">
          <div class="rules-section-head">
            <span class="rules-num">03</span>
            <div>
              <h3>布阵</h3>
              <p>双方使用固定的 22 子阵型；开局前只选亚型，不摆位置。</p>
            </div>
          </div>
          <ol class="rules-steps">
            <li><b>固定阵型</b><span>白方在下、黑方在上；白方 e9 / h9 各有一枚前哨兵，黑方镜像为 e4 / h4。</span></li>
            <li><b>选择亚型</b><span>为每个槽位选择兵种亚型；同一兵种的不同亚型可以混编。</span></li>
            <li><b>后 / 车槽位</b><span>d10 与 i10 必须分别放一个后和一个车；全场的车只能是运输车或攻城车，没有普通车。</span></li>
          </ol>
        </section>

        <section class="rules-section" id="rules-pieces">
          <div class="rules-section-head">
            <span class="rules-num">04</span>
            <div>
              <h3>兵种与亚型</h3>
              <p>悬停棋子，范围窗会跟随鼠标；触屏可点选。先看形象和范围，再看下面的移动、攻击细节。</p>
            </div>
          </div>
          <div class="rules-gallery">${galleryHtml}</div>
          <div class="rules-subhead"><span>棋子明细</span><small>金色为移动，红色为攻击，蓝色为仅移动</small></div>
          <div class="rules-table-wrap">
            <table class="rules-table rules-pieces">
              <thead><tr><th>棋子</th><th>移动</th><th>攻击 / 特性</th></tr></thead>
              ${groups.map((group) => `
                <tbody class="rules-piece-group">
                  <tr class="rules-group-row"><td colspan="3">${esc(group.type)}<small>${group.rows.length} 种</small></td></tr>
                  ${group.rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.move)}</td><td>${esc(r.attack)}</td></tr>`).join('')}
                </tbody>
              `).join('')}
            </table>
          </div>

          <div class="rules-subhead"><span>兵的细节</span><small>四种兵都以“向前”为正方向</small></div>
          <div class="rules-pawn-grid">
            <article class="rules-pawn-card">
              <h4>步兵 <code>Pin</code></h4>
              <ul class="rules-list compact">
                <li>永久可走 1 或 2 格。</li>
                <li>斜前 1 格吃子，并占据目标格。</li>
                <li>可上相邻空高地，可攻击同一片高地上的敌子；不能从低处攻击高地。</li>
                <li>下高地只能走正前方 1 格；在高地上不能攻击高地下的敌人。</li>
              </ul>
            </article>
            <article class="rules-pawn-card">
              <h4>弓兵 <code>Par</code></h4>
              <ul class="rules-list compact">
                <li>向前 1 格；初次行动可走 2 格并上相邻高地。</li>
                <li>攻击左右 1、前方 2 的 L 形点位，远程且不移动。</li>
                <li>路径不受高地阻挡，但棋子会挡住前方一格或拐角格。</li>
                <li>在高地上可以攻击斜前方 1 格的高地下敌人，但不能攻击正前方的高地下敌人。</li>
              </ul>
            </article>
            <article class="rules-pawn-card">
              <h4>枪兵 <code>Psp</code></h4>
              <ul class="rules-list compact">
                <li>向前 1 格；初次可上相邻高地。</li>
                <li>斜前 1 格、正前 2 格攻击并占据目标格。</li>
                <li>正前 2 格可攻击相邻高地。</li>
                <li>从高地往下时高地边缘占一格，只能攻击正前方 1 格的高地下目标。</li>
              </ul>
            </article>
            <article class="rules-pawn-card">
              <h4>盾兵 <code>Psh</code></h4>
              <ul class="rules-list compact">
                <li>向前 1 格；初次可上相邻高地。</li>
                <li>斜前 1 格、正后 1 格攻击并占据目标格。</li>
                <li>在高地上不能攻击高地下的敌人。</li>
                <li>本作没有盾兵免疫远程的设定。</li>
              </ul>
            </article>
          </div>
        </section>

        <section class="rules-section" id="rules-abilities">
          <div class="rules-section-head">
            <span class="rules-num">05</span>
            <div>
              <h3>王的能力</h3>
              <p>不同王有不同的一次性能力；选中王后可在侧栏发动。</p>
            </div>
          </div>
          <div class="rules-ability-grid">
            ${E.SUBTYPES.K.map((s) => `
              <article class="rules-ability-card">
                <h4>${esc(s.name)}</h4>
                <p>${esc(s.text)}</p>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="rules-section" id="rules-actions">
          <div class="rules-section-head">
            <span class="rules-num">06</span>
            <div>
              <h3>特殊行动</h3>
              <p>这些是特定棋子的额外能力；触发方式与限制见下。</p>
            </div>
          </div>
          <div class="rules-action-grid">
            <article class="rules-action-card"><span>✦</span><div><h4>神佑</h4><p>大卫王每局一次，在自己回合点击“发动神佑”。本回合及对手下一回合，王不会被攻击或将军。</p></div></article>
            <article class="rules-action-card"><span>↠</span><div><h4>疾行</h4><p>查理曼每局一次，拥有 2 点移动力；可走 2 格平地，也可花 2 点上下高地，但不能在同一次移动中先上后下。</p></div></article>
            <article class="rules-action-card"><span>↻</span><div><h4>再行动</h4><p>亚历山大每次吃子后，可以立刻再走一步王；也可以跳过。</p></div></article>
            <article class="rules-action-card"><span>⇧</span><div><h4>运载</h4><p>运输车只能携带一个正交相邻的兵（步兵 / 弓兵 / 枪兵 / 盾兵），并沿正交方向把兵送上高地。运输车沿乘客上高地的同方向移动一格，乘客上高地；也可以直接走到乘客原格。</p></div></article>
            <article class="rules-action-card"><span>⌁</span><div><h4>攻城车</h4><p>可以穿过一整片连续高地，停在最后一块高地后一格；也可以停在空高地上并把该高地拆成平地。攻城车可以沿直线从远处攻击高地。</p></div></article>
          </div>
        </section>

        <section class="rules-section" id="rules-other">
          <div class="rules-section-head">
            <span class="rules-num">07</span>
            <div>
              <h3>其他</h3>
              <p>升变、缺席规则与好友房。</p>
            </div>
          </div>
          <div class="rules-cols">
            <article class="rules-card">
              <h4>升变</h4>
              <p>兵到达对方底线时升变，可选择后、运输车、攻城车、红衣主教、异端主教、甲胄骑士或游猎骑士。升变栏显示在目标格上方，点击选项即确认；在线模式也会显示。</p>
            </article>
            <article class="rules-card">
              <h4>本作没有</h4>
              <p>没有王车易位，也没有吃过路兵。没有盾兵免疫远程、甲胄骑士免疫兵攻击的设定。</p>
            </article>
            <article class="rules-card">
              <h4>好友房</h4>
              <p>房主执白，挑战者执黑；房间码六位；双方阵容在开局后公开。</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* 渲染入口                                                            */
/* ------------------------------------------------------------------ */

const PROMOTION_LABELS = {
  Q: { name: '后', glyph: '♛' },
  'R:transport': { name: '运输车', glyph: '♜' },
  'R:siege': { name: '攻城车', glyph: '♜' },
  'B:red': { name: '红衣主教', glyph: '♝' },
  'B:heretic': { name: '异端主教', glyph: '♝' },
  'N:armored': { name: '甲胄骑士', glyph: '♞' },
  'N:hunter': { name: '游猎骑士', glyph: '♞' },
};

/**
 * 对局中的局部刷新：保留棋盘 DOM 和页面滚动位置，只更新格子状态、
 * 顶部状态、侧栏和弹层，避免每选一次棋子就整页重建。
 */
function refreshGameDom() {
  const oldScreen = appRoot.querySelector('.screen');
  const oldShell = oldScreen?.querySelector('.board-shell');
  if (!oldScreen || !oldShell || !oldScreen.querySelector('.game-layout')) return false;

  const tpl = document.createElement('template');
  tpl.innerHTML = renderGame();
  const newScreen = tpl.content.querySelector('.screen');
  const newShell = newScreen?.querySelector('.board-shell');
  if (!newScreen || !newShell || !newScreen.querySelector('.game-layout')) return false;
  if (oldShell.dataset.orientation !== newShell.dataset.orientation) return false;

  const oldBoard = oldShell.querySelector('#board');
  const newBoard = newShell.querySelector('#board');
  if (!oldBoard || !newBoard || oldBoard.children.length !== newBoard.children.length) return false;

  const oldLog = oldScreen.querySelector('#move-log');
  const oldScrollTop = oldLog?.scrollTop ?? 0;
  const oldRows = oldLog?.querySelectorAll('.move-row').length ?? 0;

  // 棋盘只改格子的类名、棋子和可点击属性，不替换棋盘容器。
  for (let i = 0; i < oldBoard.children.length; i++) {
    const a = oldBoard.children[i];
    const b = newBoard.children[i];
    if (a.className !== b.className) a.className = b.className;
    if (a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
    if (a.title !== b.title) a.title = b.title;
    const pieceId = b.getAttribute('data-piece-id') || '';
    if (a.getAttribute('data-piece-id') !== pieceId) a.setAttribute('data-piece-id', pieceId);
    for (const attr of ['data-action', 'role', 'tabindex']) {
      if (b.hasAttribute(attr)) {
        if (a.getAttribute(attr) !== b.getAttribute(attr)) a.setAttribute(attr, b.getAttribute(attr));
      } else {
        a.removeAttribute(attr);
      }
    }
  }

  const oldTop = oldScreen.querySelector('.game-topline');
  const newTop = newScreen.querySelector('.game-topline');
  if (oldTop && newTop && oldTop.outerHTML !== newTop.outerHTML) oldTop.replaceWith(newTop);

  const oldSide = oldScreen.querySelector('.side-panel');
  const newSide = newScreen.querySelector('.side-panel');
  if (oldSide && newSide && oldSide.outerHTML !== newSide.outerHTML) oldSide.replaceWith(newSide);

  const oldNote = oldScreen.querySelector('.game-main > .empty-note');
  const newNote = newScreen.querySelector('.game-main > .empty-note');
  if (oldNote && newNote && oldNote.outerHTML !== newNote.outerHTML) oldNote.replaceWith(newNote);

  oldScreen.querySelector('.action-menu')?.remove();
  oldScreen.querySelector('.result-overlay')?.remove();
  const newMenu = newScreen.querySelector('.action-menu');
  const newResult = newScreen.querySelector('.result-overlay');
  if (newMenu) oldScreen.append(newMenu);
  if (newResult) oldScreen.append(newResult);

  const newLog = oldScreen.querySelector('#move-log');
  if (newLog) {
    const newRows = newLog.querySelectorAll('.move-row').length;
    newLog.scrollTop = newRows > oldRows ? newLog.scrollHeight : oldScrollTop;
  }
  return true;
}

function render() {
  if (!app.rulesOpen) hidePiecePreview();
  if (app.screen === 'game' && app.game && !app.rulesOpen && refreshGameDom()) return;

  const prevLoadoutScroll = document.querySelector('.loadout-list')?.scrollTop || 0;
  let html = '';
  if (app.screen === 'home') html = renderHome();
  else if (app.screen === 'setup') html = renderSetup();
  else if (app.screen === 'online-lobby') html = renderOnlineLobby();
  else if (app.screen === 'waiting') html = renderWaiting();
  else if (app.screen === 'game') html = renderGame();
  else html = renderHome();

  if (app.rulesOpen) html += rulesHtml();
  appRoot.innerHTML = html;

  requestAnimationFrame(() => {
    const list = document.querySelector('.loadout-list');
    if (list) list.scrollTop = prevLoadoutScroll;
    const log = document.getElementById('move-log');
    if (log) log.scrollTop = log.scrollHeight;
  });
}

/* ------------------------------------------------------------------ */
/* 对局流程                                                            */
/* ------------------------------------------------------------------ */

function startAIGame() {
  let playerSide = app.side;
  if (playerSide === 'random') playerSide = Math.random() < 0.5 ? 'white' : 'black';
  const check = E.validateLoadout(app.loadout, playerSide);
  if (!check.ok) return toast(check.error);
  const opponentSide = otherSide(playerSide);
  const opponent = E.normalizeLoadout(app.opponentLoadout, opponentSide);
  const white = playerSide === 'white' ? check.loadout : opponent;
  const black = playerSide === 'black' ? check.loadout : opponent;
  app.side = playerSide;
  app.mode = 'ai';
  app.game = E.createGameState(white, black);
  app.orientation = playerSide;
  app.selected = null;
  app.pendingPromotion = null;
  app.legal = [];
  app.resultDismissed = false;
  app.ai.thinking = false;
  app.ai.pending = null;
  setScreen('game');
  if (app.game.turn !== app.side) setTimeout(scheduleAI, 420);
}

function startHotseatGame() {
  const whiteCheck = E.validateLoadout(app.hotseat.whiteLoadout, 'white');
  if (!whiteCheck.ok) return toast(`白方：${whiteCheck.error}`);
  const blackCheck = E.validateLoadout(app.hotseat.blackLoadout, 'black');
  if (!blackCheck.ok) return toast(`黑方：${blackCheck.error}`);
  app.mode = 'hotseat';
  app.game = E.createGameState(whiteCheck.loadout, blackCheck.loadout);
  app.orientation = 'white';
  app.selected = null;
  app.legal = [];
  app.pendingPromotion = null;
  app.resultDismissed = false;
  app.ai.thinking = false;
  app.ai.pending = null;
  setScreen('game');
}

async function createOnlineRoom() {
  if (app.online.busy) return;
  const check = E.validateLoadout(app.loadout, 'white');
  if (!check.ok) return toast(check.error);
  app.online.busy = true;
  const res = await api('/api/rooms', { loadout: check.loadout });
  app.online.busy = false;
  if (!res.ok) return toast(res.error);
  app.online.code = res.code;
  app.online.token = res.token;
  app.online.side = 'white';
  app.online.role = 'host';
  app.online.epoch = res.room?.epoch ?? 1;
  app.online.lastVersion = -1;
  app.online.players = res.room?.players || null;
  app.online.rematchVotes = res.room?.rematchVotes || [];
  app.online.error = '';
  app.mode = 'online';
  app.game = null;
  setScreen('waiting');
  startPolling();
}

async function joinOnlineRoom() {
  if (app.online.busy) return;
  const code = String(app.online.joinCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return toast('请输入六位房间码');
  const check = E.validateLoadout(app.loadout, 'black');
  if (!check.ok) return toast(check.error);
  app.online.busy = true;
  app.online.error = '';
  const res = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { loadout: check.loadout });
  app.online.busy = false;
  if (!res.ok) {
    app.online.error = res.error;
    render();
    return toast(res.error);
  }
  app.online.code = res.code;
  app.online.token = res.token;
  app.online.side = 'black';
  app.online.role = 'guest';
  app.online.epoch = res.room?.epoch ?? 1;
  app.online.lastVersion = res.room?.version ?? -1;
  app.online.players = res.room?.players || null;
  app.online.rematchVotes = res.room?.rematchVotes || [];
  app.mode = 'online';
  app.game = res.room?.game || null;
  app.orientation = 'black';
  app.selected = null;
  app.legal = [];
  app.resultDismissed = false;
  setScreen('game');
  startPolling();
}

function applyRoom(room) {
  if (!room || app.mode !== 'online') return;
  const epoch = Number(room.epoch) || app.online.epoch || 1;
  if (app.online.epoch && epoch < app.online.epoch) return;
  if (epoch > app.online.epoch) {
    app.online.epoch = epoch;
    app.online.lastVersion = -1;
  }
  if (Number.isFinite(room.version) && room.version < app.online.lastVersion) return;
  app.online.players = room.players || app.online.players;
  app.online.rematchVotes = room.rematchVotes || [];
  app.online.lastVersion = room.version;
  if (room.game) {
    const wasFinished = app.game?.status === 'finished';
    if (!app.game || app.game.version !== room.game.version) app.pendingPromotion = null;
    app.game = room.game;
    app.actionMenu = null;
    app.selected = null;
    app.legal = [];
    if (app.screen !== 'game') {
      app.orientation = app.online.side || 'white';
      app.selected = null;
      app.legal = [];
      app.resultDismissed = false;
      setScreen('game');
    } else if (wasFinished && room.game.status === 'playing' && room.game.history.length === 0) {
      app.resultDismissed = false;
      app.selected = null;
      app.legal = [];
      toast('新对局开始');
      render();
    } else {
      render();
    }
  } else if (app.screen === 'waiting') {
    render();
  }
}

async function pollRoom() {
  if (!app.online.code || !app.online.token || app.online.polling) return;
  const code = app.online.code;
  const token = app.online.token;
  app.online.polling = true;
  const res = await api(
    `/api/rooms/${encodeURIComponent(code)}/state?token=${encodeURIComponent(token)}&since=${app.online.lastVersion}`,
  );
  app.online.polling = false;
  if (app.online.code !== code || app.online.token !== token) return;
  if (!res.ok) {
    if (res.error?.includes('不存在') || res.error?.includes('令牌')) {
      stopPolling();
      toast(res.error);
      app.mode = null;
      setScreen('home');
    }
    return;
  }
  if (res.unchanged) return;
  applyRoom(res);
}

function startPolling() {
  stopPolling();
  app.online.poll = setInterval(pollRoom, 1200);
}

function exitToHome() {
  stopPolling();
  app.mode = null;
  app.game = null;
  app.selected = null;
  app.legal = [];
  app.actionMenu = null;
  app.pendingPromotion = null;
  app.resultDismissed = false;
  app.online.code = null;
  app.online.token = null;
  app.online.side = null;
  app.online.role = null;
  app.online.epoch = 0;
  app.online.lastVersion = -1;
  app.online.players = null;
  app.online.rematchVotes = [];
  app.online.busy = false;
  app.ai.thinking = false;
  app.ai.pending = null;
  setScreen('home');
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

function getWorker() {
  if (app.ai.worker) return app.ai.worker;
  try {
    const worker = new Worker('/js/ai-worker.js', { type: 'module' });
    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'result') {
        if (app.ai.pending && data.requestId === app.ai.pending.requestId) {
          finishAI(data.result);
        }
      } else if (data.type === 'error') {
        if (app.ai.pending) {
          const state = app.ai.pending.state;
          const result = E.chooseAIMove(state, app.ai.pending.side, app.difficulty);
          finishAI(result);
        }
      }
    };
    worker.onerror = () => {
      app.ai.worker = null;
      if (app.ai.pending) {
        const { state, side } = app.ai.pending;
        const result = E.chooseAIMove(state, side, app.difficulty);
        finishAI(result);
      }
    };
    app.ai.worker = worker;
    return worker;
  } catch {
    return null;
  }
}

function scheduleAI() {
  if (app.mode !== 'ai' || !app.game || app.game.status !== 'playing') return;
  const aiSide = otherSide(app.side);
  if (app.game.turn !== aiSide) return;
  if (app.ai.thinking) return;

  app.ai.thinking = true;
  render();

  const requestId = ++app.ai.seq;
  const state = E.cloneState(app.game);
  const worker = getWorker();
  app.ai.pending = { requestId, state, side: aiSide };
  if (worker) {
    worker.postMessage({ requestId, state, side: aiSide, difficulty: app.difficulty });
  } else {
    setTimeout(() => {
      const result = E.chooseAIMove(state, aiSide, app.difficulty);
      finishAI(result);
    }, 80);
  }
}

function finishAI(result) {
  app.ai.pending = null;
  if (!result || !result.move) {
    app.ai.thinking = false;
    render();
    return;
  }
  if (app.mode !== 'ai' || !app.game || app.game.status !== 'playing' || app.game.turn !== otherSide(app.side)) {
    app.ai.thinking = false;
    render();
    return;
  }
  const targetGame = app.game;
  setTimeout(() => {
    if (app.mode !== 'ai' || app.game !== targetGame || !app.game || app.game.status !== 'playing') {
      app.ai.thinking = false;
      return;
    }
    E.applyMove(app.game, result.move);
    app.ai.thinking = false;
    app.resultDismissed = false;
    app.selected = null;
    app.legal = [];
    render();
    if (app.game.status === 'playing' && app.game.turn === otherSide(app.side)) {
      setTimeout(scheduleAI, 380);
    }
  }, 220);
}

/* ------------------------------------------------------------------ */
/* 落子                                                                */
/* ------------------------------------------------------------------ */

async function postOnlineMove(move) {
  if (!app.online.code || !app.online.token || app.online.busy) return;
  const code = app.online.code;
  const token = app.online.token;
  app.online.busy = true;
  const res = await api(`/api/rooms/${encodeURIComponent(code)}/move`, { token, move });
  app.online.busy = false;
  if (app.online.code !== code || app.online.token !== token) return;
  if (!res.ok) {
    toast(res.error);
    render();
    return;
  }
  app.resultDismissed = false;
  applyRoom(res);
}

function executeMove(move, promotionResolved = false) {
  if (!promotionResolved && app.game && !app.pendingPromotion) {
    const passengerPromotion = Boolean(move?.passengerPromote);
    const pawn = app.game.pieces[passengerPromotion ? move.passengerId : move?.pieceId];
    const landing = passengerPromotion ? move?.drop : move?.to;
    if ((move?.promote || passengerPromotion) && pawn?.type === 'P' &&
      landing && landing.y === E.lastRank(pawn.side)) {
      app.pendingPromotion = { move, passenger: passengerPromotion };
      app.actionMenu = null;
      render();
      return;
    }
  }
  app.actionMenu = null;
  app.selected = null;
  app.legal = [];
  if (app.mode === 'online') {
    postOnlineMove(move);
    return;
  }
  E.applyMove(app.game, move);
  app.resultDismissed = false;
  render();
  if (app.mode === 'ai' && app.game.status === 'playing' && app.game.turn === otherSide(app.side)) {
    setTimeout(scheduleAI, 320);
  }
}

function handleCell(x, y, pieceId, event) {
  if (app.pendingPromotion) return;
  if (!humanCanMove()) return;
  const game = app.game;
  const side = game.turn;
  const piece = pieceId ? game.pieces[pieceId] : null;

  // 先检查“当前选中棋子的落点”。运输车可以把乘客原格作为落点，
  // 此时点击的是己方乘客，不能误当成重新选子。
  if (app.selected) {
    const moves = app.legal.filter((m) => m.to && m.to.x === x && m.to.y === y);
    if (moves.length) {
      if (moves.length === 1) {
        executeMove(moves[0]);
        return;
      }
      app.actionMenu = {
        moves,
        x: event?.clientX || window.innerWidth / 2,
        y: event?.clientY || 120,
      };
      render();
      return;
    }
  }

  if (piece && piece.side === side) {
    if (game.pendingBonus && piece.id !== game.pendingBonus.pieceId) {
      toast('亚历山大再行动：只能移动王，或跳过');
      return;
    }
    app.selected = { x, y, pieceId: piece.id };
    app.legal = E.generateLegalMoves(game, side).filter((m) => m.pieceId === piece.id);
    app.actionMenu = null;
    render();
    return;
  }

  if (!app.selected) return;
  app.selected = null;
  app.legal = [];
  render();
}

/* ------------------------------------------------------------------ */
/* 事件                                                                */
/* ------------------------------------------------------------------ */

let demoPopover = null;
let demoRenderedKey = null;

function getDemoPopover() {
  if (demoPopover) return demoPopover;
  demoPopover = document.createElement('div');
  demoPopover.id = 'rules-piece-preview';
  demoPopover.className = 'rules-demo-popover';
  demoPopover.setAttribute('role', 'tooltip');
  demoPopover.hidden = true;
  document.body.appendChild(demoPopover);
  return demoPopover;
}

function hidePiecePreview() {
  if (demoPopover) demoPopover.hidden = true;
}

function positionPiecePreview(x, y) {
  const el = getDemoPopover();
  const margin = 12;
  const gap = 16;
  const rect = el.getBoundingClientRect();
  let left = x + gap;
  let top = y + gap;
  if (left + rect.width > innerWidth - margin) left = x - rect.width - gap;
  if (top + rect.height > innerHeight - margin) top = y - rect.height - gap;
  left = Math.max(margin, Math.min(left, innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, innerHeight - rect.height - margin));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function showPiecePreview(key, x, y) {
  const el = getDemoPopover();
  if (demoRenderedKey !== key) {
    const [type, subtype] = key.split(':');
    el.innerHTML = pieceDemoHtml(type, subtype || null);
    demoRenderedKey = key;
  }
  app.previewKey = key;
  el.hidden = false;
  positionPiecePreview(x, y);
}

function onPiecePreview(event) {
  const card = event.target.closest?.('[data-piece-demo]');
  if (!card || !card.closest('.rules-modal')) return;
  const rect = card.getBoundingClientRect();
  const hasPointer = Number.isFinite(event.clientX) && Number.isFinite(event.clientY) && event.type !== 'focusin';
  showPiecePreview(
    card.dataset.pieceDemo,
    hasPointer ? event.clientX : rect.left + rect.width / 2,
    hasPointer ? event.clientY : rect.top + rect.height / 2,
  );
}

function onPiecePreviewMove(event) {
  if (!demoPopover || demoPopover.hidden) return;
  positionPiecePreview(event.clientX, event.clientY);
}

function onPiecePreviewOut(event) {
  if (event.pointerType === 'touch') return;
  const card = event.target.closest?.('[data-piece-demo]');
  if (!card || !card.closest('.rules-modal')) return;
  if (event.relatedTarget && card.contains(event.relatedTarget)) return;
  hidePiecePreview();
}

function onPiecePreviewBlur(event) {
  const card = event.target.closest?.('[data-piece-demo]');
  if (!card || !card.closest('.rules-modal')) return;
  if (event.relatedTarget && card.contains(event.relatedTarget)) return;
  hidePiecePreview();
}

function onClick(event) {
  const pieceCard = event.target.closest?.('[data-piece-demo]');
  if (pieceCard && pieceCard.closest('.rules-modal')) {
    const rect = pieceCard.getBoundingClientRect();
    const hasPointer = event.clientX || event.clientY;
    showPiecePreview(
      pieceCard.dataset.pieceDemo,
      hasPointer ? event.clientX : rect.left + rect.width / 2,
      hasPointer ? event.clientY : rect.top + rect.height / 2,
    );
    return;
  }
  if (demoPopover && !demoPopover.hidden) hidePiecePreview();
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) {
    if (app.actionMenu && !event.target.closest('.action-menu')) {
      app.actionMenu = null;
      render();
    }
    return;
  }
  const action = actionEl.dataset.action;

  if (action === 'cell') {
    handleCell(Number(actionEl.dataset.x), Number(actionEl.dataset.y), actionEl.dataset.pieceId || '', event);
    return;
  }
  if (action === 'choose-move') {
    const index = Number(actionEl.dataset.index);
    const move = app.actionMenu?.moves?.[index];
    if (move) executeMove(move);
    return;
  }
  if (action === 'rules-backdrop') {
    if (event.target === actionEl) {
      app.rulesOpen = false;
      app.previewKey = 'K:david';
      hidePiecePreview();
      render();
    }
    return;
  }
  if (action === 'promotion-choice') {
    const choice = actionEl.dataset.choice;
    const pending = app.pendingPromotion;
    if (!pending || !choice) return;
    const move = pending.passenger
      ? { ...pending.move, passengerPromote: choice }
      : { ...pending.move, promote: choice };
    app.pendingPromotion = null;
    // 在线模式要等服务器回包，先立即收起升变栏，避免看起来卡住。
    if (app.mode === 'online') {
      app.selected = null;
      app.legal = [];
      render();
    }
    executeMove(move, true);
    return;
  }
  if (action === 'promotion-cancel') {
    app.pendingPromotion = null;
    render();
    return;
  }

  switch (action) {
    case 'start-ai':
      openSetup('ai');
      break;
    case 'start-online':
      app.online.error = '';
      setScreen('online-lobby');
      break;
    case 'start-hotseat':
      openSetup('hotseat');
      break;
    case 'open-rules':
      app.rulesOpen = true;
      app.previewKey = 'K:david';
      hidePiecePreview();
      render();
      break;
    case 'close-rules':
      app.rulesOpen = false;
      app.previewKey = 'K:david';
      hidePiecePreview();
      render();
      break;
    case 'back-home':
      exitToHome();
      break;
    case 'setup-back': {
      const fromOnline = String(app.setupFor || '').startsWith('online');
      app.setupFor = null;
      setScreen(fromOnline ? 'online-lobby' : 'home');
      break;
    }
    case 'online-create':
      openSetup('online-host');
      break;
    case 'online-join': {
      const input = document.getElementById('join-code');
      app.online.joinCode = String(input?.value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(app.online.joinCode)) {
        app.online.error = '请输入六位房间码';
        render();
        return;
      }
      openSetup('online-guest', { code: app.online.joinCode });
      break;
    }
    case 'copy-code':
      if (app.online.code) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(app.online.code).then(
            () => toast('房间码已复制'),
            () => toast(`房间码：${app.online.code}`),
          );
        } else {
          toast(`房间码：${app.online.code}`);
        }
      }
      break;
    case 'cancel-online':
      exitToHome();
      break;
    case 'ai-side':
      app.side = actionEl.dataset.side;
      render();
      break;
    case 'difficulty':
      app.difficulty = actionEl.dataset.level;
      render();
      break;
    case 'hotseat-tab':
      app.hotseat.editing = actionEl.dataset.side;
      render();
      break;
    case 'random-loadout':
      randomizeLoadout(editingSide());
      break;
    case 'default-loadout':
      setLoadoutFor(editingSide(), E.normalizeLoadout(E.defaultLoadout(), editingSide()));
      render();
      break;
    case 'copy-white':
      app.hotseat.blackLoadout = { ...app.hotseat.whiteLoadout };
      render();
      break;
    case 'start-game':
      if (app.setupFor === 'ai') startAIGame();
      else if (app.setupFor === 'hotseat') startHotseatGame();
      else if (app.setupFor === 'online-host') createOnlineRoom();
      else if (app.setupFor === 'online-guest') joinOnlineRoom();
      break;
    case 'flip-board':
      app.orientation = app.orientation === 'white' ? 'black' : 'white';
      render();
      break;
    case 'david':
      doDavid();
      break;
    case 'skip-bonus':
      if (humanCanMove() && app.game?.pendingBonus) {
        executeMove({ kind: 'skipBonus', pieceId: app.game.pendingBonus.pieceId });
      }
      break;
    case 'resign':
      doResign();
      break;
    case 'rematch':
      doRematch();
      break;
    case 'dismiss-result':
      app.resultDismissed = true;
      render();
      break;
    default:
      break;
  }
}

function onChange(event) {
  const el = event.target.closest('[data-action="set-slot"]');
  if (!el) return;
  const side = el.dataset.side;
  const slot = el.dataset.slot;
  const value = el.value;
  const current = { ...getLoadoutFor(side) };
  current[slot] = value === '' ? null : value;
  if (E.slotType(slot) === 'M') {
    const other = slot === 'M1' ? 'M2' : 'M1';
    if (current[slot] === 'Q' && current[other] === 'Q') current[other] = 'R:transport';
    else if (current[slot] !== 'Q' && current[other] !== 'Q') current[other] = 'Q';
  }
  setLoadoutFor(side, current);
  render();
}

function randomizeLoadout(side) {
  const next = {};
  const slots = E.FORMATION.filter((x) => x.side === side);
  const mSlots = slots.filter((f) => E.slotType(f.slot) === 'M');
  const qSlot = mSlots[Math.floor(Math.random() * mSlots.length)]?.slot;
  const pick = (choices) => choices[Math.floor(Math.random() * choices.length)];
  for (const f of slots) {
    const st = E.slotType(f.slot);
    if (st === 'M') next[f.slot] = f.slot === qSlot ? 'Q' : pick(R_CHOICES).value;
    else if (st === 'R') next[f.slot] = pick(R_CHOICES).value;
    else next[f.slot] = pick((E.SUBTYPES[st] || []).map((s) => s.id));
  }
  setLoadoutFor(side, next);
  render();
}

async function doDavid() {
  if (!app.game || app.game.status !== 'playing') return;
  if (app.mode === 'online') {
    if (app.online.busy) return;
    const code = app.online.code;
    const token = app.online.token;
    app.online.busy = true;
    const res = await api(`/api/rooms/${encodeURIComponent(code)}/action`, { token, action: 'david' });
    app.online.busy = false;
    if (app.online.code !== code || app.online.token !== token) return;
    if (!res.ok) return toast(res.error);
    applyRoom(res);
    return;
  }
  if (E.activateDavid(app.game, app.game.turn)) {
    toast('神佑已发动');
    render();
  } else {
    toast('现在无法发动神佑');
  }
}

async function doResign() {
  if (!app.game || app.game.status !== 'playing') return;
  const side = app.mode === 'online' ? app.online.side : app.mode === 'ai' ? app.side : app.game.turn;
  if (!window.confirm('确定认输吗？')) return;
  if (app.mode === 'online') {
    if (app.online.busy) return;
    const code = app.online.code;
    const token = app.online.token;
    app.online.busy = true;
    const res = await api(`/api/rooms/${encodeURIComponent(code)}/action`, { token, action: 'resign' });
    app.online.busy = false;
    if (app.online.code !== code || app.online.token !== token) return;
    if (!res.ok) return toast(res.error);
    applyRoom(res);
    return;
  }
  E.resign(app.game, side);
  app.resultDismissed = false;
  render();
}

async function doRematch() {
  if (app.mode === 'online') {
    if (app.online.busy) return;
    const code = app.online.code;
    const token = app.online.token;
    app.online.busy = true;
    const res = await api(`/api/rooms/${encodeURIComponent(code)}/action`, { token, action: 'rematch' });
    app.online.busy = false;
    if (app.online.code !== code || app.online.token !== token) return;
    if (!res.ok) return toast(res.error);
    if (Number.isFinite(res.epoch)) {
      if (res.epoch < app.online.epoch) return;
      app.online.epoch = res.epoch;
    }
    app.online.rematchVotes = res.rematchVotes || [];
    app.online.lastVersion = res.version;
    if (res.game && res.game.history.length === 0 && res.game.status === 'playing') {
      app.game = res.game;
      app.resultDismissed = false;
      app.selected = null;
      app.legal = [];
      toast('新对局开始');
      render();
    } else {
      toast('已请求再来一局，等待对手');
      render();
    }
    return;
  }

  if (app.mode === 'ai') {
    startAIGame();
    return;
  }
  if (app.mode === 'hotseat') {
    startHotseatGame();
  }
}

document.addEventListener('click', onClick);
document.addEventListener('change', onChange);
document.addEventListener('pointerover', onPiecePreview);
document.addEventListener('pointermove', onPiecePreviewMove);
document.addEventListener('pointerout', onPiecePreviewOut);
document.addEventListener('focusin', onPiecePreview);
document.addEventListener('focusout', onPiecePreviewBlur);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && app.rulesOpen) {
    app.rulesOpen = false;
    app.previewKey = 'K:david';
    hidePiecePreview();
    render();
  }
  if (event.key === 'Enter' && event.target?.id === 'join-code') {
    const button = document.querySelector('[data-action="online-join"]');
    button?.click();
  }
});

render();
