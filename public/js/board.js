import {
  BOARD_W,
  BOARD_H,
  FILES,
  TERRAIN,
  PIECE_TYPES,
  subtypeDef,
  pieceName,
  squareName,
} from '/shared/engine.js';

const WHITE_GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', F: '♖', P: '♙' };
const BLACK_GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', F: '♜', P: '♟' };

export function displayToGame(dx, dy, orientation) {
  return orientation === 'black' ? { x: BOARD_W - 1 - dx, y: BOARD_H - 1 - dy } : { x: dx, y: dy };
}

export function gameToDisplay(x, y, orientation) {
  return orientation === 'black' ? { x: BOARD_W - 1 - x, y: BOARD_H - 1 - y } : { x, y };
}

export function glyphFor(piece) {
  const table = piece.side === 'white' ? WHITE_GLYPH : BLACK_GLYPH;
  return table[piece.type] || '?';
}

export function badgeFor(piece) {
  if (piece.promoted) return '升';
  if (piece.type === 'Q') return '';
  if (piece.type === 'R') {
    if (piece.subtype === 'transport') return '运';
    if (piece.subtype === 'siege' || piece.subtype === 'engineer') return '攻';
    return '';
  }
  const sub = subtypeDef(piece.type, piece.subtype);
  return sub?.short || '';
}

export function pieceLabel(piece) {
  return pieceName(piece);
}

function coordLabels(orientation) {
  const files = [...FILES];
  const ranks = Array.from({ length: BOARD_H }, (_, i) => String(i + 1));
  if (orientation === 'black') {
    files.reverse();
    ranks.reverse();
  }
  return { files, ranks };
}

function legalMap(legal) {
  const map = new Map();
  for (const m of legal || []) {
    if (!m.to) continue;
    const key = `${m.to.x},${m.to.y}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map;
}

function cellClasses(state, x, y, opts, legalHere) {
  const classes = ['cell', (x + y) % 2 === 0 ? 'square-dark' : 'square-light', `terrain-${state.terrain[y][x] || TERRAIN.PLAIN}`];
  if (opts.lastMove?.from && opts.lastMove.from.x === x && opts.lastMove.from.y === y) classes.push('last-from');
  if (opts.lastMove?.to && opts.lastMove.to.x === x && opts.lastMove.to.y === y) classes.push('last-to');
  if (opts.selected && opts.selected.x === x && opts.selected.y === y) classes.push('selected');
  if (legalHere?.length) {
    const hasCapture = legalHere.some((m) => m.captureId || m.kind === 'convert');
    const hasRanged = legalHere.some((m) => m.kind === 'ranged');
    classes.push(hasCapture ? 'legal-capture' : 'legal-move');
    if (hasRanged) classes.push('legal-ranged');
  }
  if (opts.setupInteractive) classes.push('setup-selectable');
  if (opts.promotion && opts.promotion.x === x && opts.promotion.y === y) classes.push('promotion-cell');
  if (opts.checkSide) {
    const p = state.board[y]?.[x] ? state.pieces[state.board[y][x]] : null;
    if (p && p.side === opts.checkSide && p.type === 'K') classes.push('in-check');
  }
  return classes.join(' ');
}

function renderPromotionBar(promo, x, y) {
  const align = x < 2 ? 'align-left' : x > BOARD_W - 3 ? 'align-right' : '';
  const below = y < 3 ? 'below' : '';
  return `
    <div class="promotion-popover ${align} ${below}" role="dialog" aria-label="兵升变">
      <div class="promotion-popover-title">兵升变 · 点击即确认</div>
      <div class="promotion-options">
        ${promo.choices.map((item) => `
          <button class="promotion-option" data-action="promotion-choice" data-choice="${item.choice}" title="${item.name}">
            <span class="promotion-option-glyph">${item.glyph}</span>
            <span class="promotion-option-name">${item.name}</span>
          </button>
        `).join('')}
      </div>
      <button class="promotion-cancel" data-action="promotion-cancel">取消</button>
    </div>
  `;
}

export function renderBoard(state, opts = {}) {
  const orientation = opts.orientation || 'white';
  const { files, ranks } = coordLabels(orientation);
  const legal = legalMap(opts.legal);
  const interactive = opts.interactive !== false;
  const setupInteractive = opts.setupInteractive === true;
  const cells = [];

  for (let dy = 0; dy < BOARD_H; dy++) {
    for (let dx = 0; dx < BOARD_W; dx++) {
      const { x, y } = displayToGame(dx, dy, orientation);
      const pieceId = state.board[y]?.[x] || null;
      const piece = pieceId ? state.pieces[pieceId] : null;
      const legalHere = legal.get(`${x},${y}`) || [];
      const cls = cellClasses(state, x, y, opts, legalHere);
      const actionLabels = [];
      if (legalHere.some((m) => m.kind === 'ranged')) actionLabels.push('远程攻击');
      if (legalHere.some((m) => m.kind === 'transport')) actionLabels.push('运载');
      if (legalHere.some((m) => m.kind === 'demolish')) actionLabels.push('拆高地');
      const title = `${squareName(x, y)}${piece ? ` · ${pieceLabel(piece)}` : ''}${actionLabels.length ? ` · ${actionLabels.join('/')}` : ''}`;
      const data = setupInteractive
        ? `data-action="setup-cell" data-x="${x}" data-y="${y}" data-piece-id="${pieceId || ''}"`
        : interactive
          ? `data-action="cell" data-x="${x}" data-y="${y}" data-piece-id="${pieceId || ''}"`
          : `data-x="${x}" data-y="${y}"`;
      const pieceHtml = piece
        ? `<span class="piece side-${piece.side} type-${piece.type.toLowerCase()}" data-piece-id="${piece.id}">
             <span class="piece-glyph">${glyphFor(piece)}</span>
             ${badgeFor(piece) ? `<span class="piece-badge">${badgeFor(piece)}</span>` : ''}
           </span>`
        : '';
      const promotionHtml = opts.promotion && opts.promotion.x === x && opts.promotion.y === y
        ? renderPromotionBar(opts.promotion, x, y)
        : '';
      const inner = `${pieceHtml}${promotionHtml}`;
      const a11y = interactive || setupInteractive ? 'role="button" tabindex="-1"' : 'role="presentation"';
      cells.push(`<div class="${cls}" ${data} title="${title}" ${a11y}><span class="cell-tone" aria-hidden="true"></span>${inner}</div>`);
    }
  }

  const topFiles = files.map((f) => `<span>${f}</span>`).join('');
  const bottomFiles = topFiles;
  const leftRanks = ranks.map((r) => `<span>${r}</span>`).join('');
  const rightRanks = leftRanks;

  return `
    <div class="board-shell" data-orientation="${orientation}">
      <div class="board-corner"></div>
      <div class="board-files board-files-top">${topFiles}</div>
      <div class="board-ranks board-ranks-left">${leftRanks}</div>
      <div class="board" id="board" role="grid" aria-label="王冠高地棋盘">${cells.join('')}</div>
      <div class="board-ranks board-ranks-right">${rightRanks}</div>
      <div class="board-corner"></div>
      <div class="board-files board-files-bottom">${bottomFiles}</div>
    </div>
  `;
}

export function renderMiniBoard(state, opts = {}) {
  const orientation = opts.orientation || 'white';
  const cells = [];
  for (let dy = 0; dy < BOARD_H; dy++) {
    for (let dx = 0; dx < BOARD_W; dx++) {
      const { x, y } = displayToGame(dx, dy, orientation);
      const pieceId = state.board[y]?.[x] || null;
      const piece = pieceId ? state.pieces[pieceId] : null;
      const cls = `mini-cell ${(x + y) % 2 === 0 ? 'square-dark' : 'square-light'} terrain-${state.terrain[y][x] || TERRAIN.PLAIN}${piece ? ` has-${piece.side}` : ''}`;
      const inner = piece
        ? `<span class="mini-piece side-${piece.side}">${glyphFor(piece)}</span>`
        : '';
      cells.push(`<div class="${cls}" title="${squareName(x, y)}">${inner}</div>`);
    }
  }
  return `<div class="mini-board" data-orientation="${orientation}">${cells.join('')}</div>`;
}
