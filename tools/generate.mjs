#!/usr/bin/env node
// Tic-tac-toe puzzle generator.
// Finds positions where X-to-move has exactly one winning reply and every
// other move loses against best play. Outputs JSON to stdout, stats to stderr.

const VARIANTS = [
  { id: '3x3', size: 3, win: 3, mode: 'enumerate', target: 60,  searchDepth: 6 },
  { id: '4x4', size: 4, win: 4, mode: 'sample',    target: 140, samples: 150000, searchDepth: 4 },
  { id: '5x5', size: 5, win: 4, mode: 'sample',    target: 160, samples: 220000, searchDepth: 3 },
];

function buildLines(size, win) {
  const L = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c <= size - win; c++)
      L.push([...Array(win)].map((_, i) => r * size + (c + i)));
  for (let c = 0; c < size; c++)
    for (let r = 0; r <= size - win; r++)
      L.push([...Array(win)].map((_, i) => (r + i) * size + c));
  for (let r = 0; r <= size - win; r++)
    for (let c = 0; c <= size - win; c++)
      L.push([...Array(win)].map((_, i) => (r + i) * size + (c + i)));
  for (let r = 0; r <= size - win; r++)
    for (let c = win - 1; c < size; c++)
      L.push([...Array(win)].map((_, i) => (r + i) * size + (c - i)));
  return L;
}

function winnerOf(board, lines) {
  for (const L of lines) {
    const a = board[L[0]];
    if (a === ' ') continue;
    let ok = true;
    for (let i = 1; i < L.length; i++) if (board[L[i]] !== a) { ok = false; break; }
    if (ok) return a;
  }
  return null;
}

function legalMoves(board) {
  const out = [];
  for (let i = 0; i < board.length; i++) if (board[i] === ' ') out.push(i);
  return out;
}

// Minimax. Returns +1 if X wins, -1 if X loses, 0 if drawn or cutoff.
// Alpha-beta pruning via early return on best=1 / best=-1.
function search(board, toMove, lines, depth) {
  const w = winnerOf(board, lines);
  if (w === 'X') return 1;
  if (w === 'O') return -1;
  if (depth === 0) return 0;
  const moves = legalMoves(board);
  if (moves.length === 0) return 0;
  if (toMove === 'X') {
    let best = -2;
    for (const m of moves) {
      board[m] = 'X';
      const s = search(board, 'O', lines, depth - 1);
      board[m] = ' ';
      if (s > best) best = s;
      if (best === 1) return 1;
    }
    return best;
  } else {
    let best = 2;
    for (const m of moves) {
      board[m] = 'O';
      const s = search(board, 'X', lines, depth - 1);
      board[m] = ' ';
      if (s < best) best = s;
      if (best === -1) return -1;
    }
    return best;
  }
}

// For each empty cell, classify outcome if X plays there.
function classifyMoves(board, lines, depth) {
  const results = [];
  for (const m of legalMoves(board)) {
    board[m] = 'X';
    if (winnerOf(board, lines) === 'X') {
      results.push({ move: m, outcome: 'win', immediate: true });
      board[m] = ' ';
      continue;
    }
    // Fast pre-check: does O have an immediate winning reply?
    let oWinsNow = false;
    for (const om of legalMoves(board)) {
      board[om] = 'O';
      if (winnerOf(board, lines) === 'O') { oWinsNow = true; }
      board[om] = ' ';
      if (oWinsNow) break;
    }
    if (oWinsNow) {
      results.push({ move: m, outcome: 'loss', immediate: true });
      board[m] = ' ';
      continue;
    }
    const s = search(board, 'O', lines, depth - 1);
    board[m] = ' ';
    if (s === 1) results.push({ move: m, outcome: 'win' });
    else if (s === -1) results.push({ move: m, outcome: 'loss' });
    else results.push({ move: m, outcome: 'neutral' });
  }
  return results;
}

// D4 symmetry group canonical form for dedup.
function canonicalKey(board, size) {
  const N = size * size;
  const rotate = b => {
    const r = new Array(N);
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / size), col = i % size;
      r[col * size + (size - 1 - row)] = b[i];
    }
    return r;
  };
  const flip = b => {
    const r = new Array(N);
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / size), col = i % size;
      r[row * size + (size - 1 - col)] = b[i];
    }
    return r;
  };
  const variants = [];
  let cur = board.slice();
  for (let i = 0; i < 4; i++) { variants.push(cur.join('')); cur = rotate(cur); }
  cur = flip(board);
  for (let i = 0; i < 4; i++) { variants.push(cur.join('')); cur = rotate(cur); }
  variants.sort();
  return variants[0];
}

function classify(board, ans, lines, win) {
  const b = board.slice();
  b[ans] = 'X';
  if (winnerOf(b, lines) === 'X') return 'immediate';
  let threats = 0;
  for (const L of lines) {
    let x = 0, o = 0;
    for (const i of L) { if (b[i] === 'X') x++; else if (b[i] === 'O') o++; }
    if (x === win - 1 && o === 0) threats++;
  }
  let blocksO = false;
  for (const L of lines) {
    let x = 0, o = 0, empty = [];
    for (const i of L) {
      if (board[i] === 'X') x++;
      else if (board[i] === 'O') o++;
      else empty.push(i);
    }
    if (o === win - 1 && x === 0 && empty.length === 1 && empty[0] === ans) { blocksO = true; break; }
  }
  if (blocksO && threats >= 1) return 'block-and-win';
  if (threats >= 2) return 'fork';
  return 'trap';
}

function difficulty(board, classification) {
  const occupied = board.filter(c => c !== ' ').length;
  const base = Math.min(5, Math.max(1, Math.ceil(occupied / 2)));
  if (classification === 'immediate') return Math.min(2, base);
  if (classification === 'block-and-win') return Math.max(2, base);
  if (classification === 'fork') return Math.max(3, base);
  if (classification === 'trap') return Math.max(3, base);
  return base;
}

const EXPLAIN_WIN = {
  immediate: 'Завершает выигрышную линию.',
  fork: 'Создаёт две одновременные угрозы — соперник не закроет обе.',
  'block-and-win': 'Блокирует угрозу соперника и продолжает свою линию.',
  trap: 'Единственная клетка, после которой у соперника нет контригры.',
};
const EXPLAIN_LOSS = {
  immediate: 'Вы упустили ход, завершающий линию прямо сейчас.',
  fork: 'Другой ход даёт сопернику время поставить вилку.',
  'block-and-win': 'Соперник завершает свою линию следующим ходом.',
  trap: 'После этого хода у соперника появляется выигрышная вилка.',
};

// Random reachable position with X-to-move (xCount == oCount).
function randomPosition(size, xCount, oCount) {
  const N = size * size;
  const idx = [...Array(N).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const b = new Array(N).fill(' ');
  for (let i = 0; i < xCount; i++) b[idx[i]] = 'X';
  for (let i = 0; i < oCount; i++) b[idx[xCount + i]] = 'O';
  return b;
}

function* enumerate3x3() {
  // X to move ⇒ xCount == oCount. Iterate combos.
  const N = 9;
  for (let count = 1; count <= 3; count++) {
    const xCount = count, oCount = count;
    const cells = [...Array(N).keys()];
    function* combo(arr, k) {
      if (k === 0) { yield []; return; }
      for (let i = 0; i <= arr.length - k; i++) {
        for (const rest of combo(arr.slice(i + 1), k - 1)) yield [arr[i], ...rest];
      }
    }
    for (const xCells of combo(cells, xCount)) {
      const remaining = cells.filter(c => !xCells.includes(c));
      for (const oCells of combo(remaining, oCount)) {
        const b = new Array(N).fill(' ');
        for (const c of xCells) b[c] = 'X';
        for (const c of oCells) b[c] = 'O';
        yield b;
      }
    }
  }
}

function evaluateBoard(board, lines, depth, seen) {
  if (winnerOf(board, lines)) return null;
  const results = classifyMoves(board, lines, depth);
  const wins = results.filter(r => r.outcome === 'win');
  if (wins.length !== 1) return null;
  const losses = results.filter(r => r.outcome === 'loss');
  if (losses.length !== results.length - 1) return null;
  return wins[0].move;
}

function generate(variant) {
  const lines = buildLines(variant.size, variant.win);
  const seen = new Set();
  const puzzles = [];
  let scanned = 0;

  const consume = (board) => {
    scanned++;
    const ans = evaluateBoard(board, lines, variant.searchDepth);
    if (ans === null) return;
    const key = canonicalKey(board, variant.size);
    if (seen.has(key)) return;
    seen.add(key);
    const cat = classify(board, ans, lines, variant.win);
    puzzles.push({
      tier: variant.id,
      size: variant.size,
      win: variant.win,
      board: board.slice(),
      answer: ans,
      category: cat,
      difficulty: difficulty(board, cat),
      explainWin: EXPLAIN_WIN[cat],
      explainLoss: EXPLAIN_LOSS[cat],
    });
  };

  if (variant.mode === 'enumerate') {
    for (const b of enumerate3x3()) consume(b);
  } else {
    const N = variant.size * variant.size;
    const maxPieces = Math.min(Math.floor((N - 1) / 2), 6);
    for (let i = 0; i < variant.samples; i++) {
      const count = 1 + Math.floor(Math.random() * maxPieces);
      const b = randomPosition(variant.size, count, count);
      consume(b);
    }
  }

  process.stderr.write(`${variant.id}: scanned=${scanned}, unique=${puzzles.length}\n`);

  // Curate: take roughly equal share from each non-empty category, fill remainder
  // from whatever has surplus. Round-robin keeps the bank visibly varied.
  const byCat = { immediate: [], 'block-and-win': [], fork: [], trap: [] };
  for (const p of puzzles) byCat[p.category].push(p);
  for (const c of Object.keys(byCat)) {
    byCat[c].sort((a, b) => a.difficulty - b.difficulty || Math.random() - 0.5);
  }
  const curated = [];
  const cats = Object.keys(byCat).filter(c => byCat[c].length > 0);
  const cursors = Object.fromEntries(cats.map(c => [c, 0]));
  while (curated.length < variant.target) {
    let added = false;
    for (const c of cats) {
      if (curated.length >= variant.target) break;
      if (cursors[c] < byCat[c].length) {
        curated.push(byCat[c][cursors[c]++]);
        added = true;
      }
    }
    if (!added) break;
  }
  curated.sort((a, b) => a.difficulty - b.difficulty);
  const final = curated.map((p, i) => ({
    id: `${variant.id}-${String(i + 1).padStart(3, '0')}`,
    ...p,
  }));

  const counts = { immediate: 0, 'block-and-win': 0, fork: 0, trap: 0 };
  for (const p of final) counts[p.category]++;
  process.stderr.write(`${variant.id} curated: ${final.length} (${JSON.stringify(counts)})\n`);

  return final;
}

const all = [];
for (const v of VARIANTS) {
  const t0 = Date.now();
  all.push(...generate(v));
  process.stderr.write(`${v.id} took ${((Date.now() - t0) / 1000).toFixed(1)}s\n\n`);
}
process.stdout.write(JSON.stringify(all));
