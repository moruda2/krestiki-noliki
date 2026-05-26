// Крестики · Задачник — game logic & rendering
// Uses textContent + createElement throughout (no innerHTML).

const CATEGORY_LABELS = {
  'immediate':     'Завершить линию',
  'block-and-win': 'Блок и атака',
  'fork':          'Вилка',
  'trap':          'Ловушка',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const STATE = {
  puzzles: [],
  byTier: { '3x3': [], '4x4': [], '5x5': [] },
  tier: '3x3',
  index: 0,
  phase: 'idle',
  triedThisPuzzle: false,
  progress: loadProgress(),
};

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') node.className = attrs[k];
    else if (k === 'text') node.textContent = attrs[k];
    else if (k.startsWith('data-')) node.setAttribute(k, attrs[k]);
    else node.setAttribute(k, attrs[k]);
  }
  if (children) for (const c of children) if (c) node.appendChild(c);
  return node;
}

// ---- Persistence ----
function loadProgress() {
  try {
    const raw = localStorage.getItem('krestiki:progress');
    if (!raw) return { solvedFirstTry: {}, solvedAny: {}, currentStreak: 0, bestStreak: 0 };
    return JSON.parse(raw);
  } catch {
    return { solvedFirstTry: {}, solvedAny: {}, currentStreak: 0, bestStreak: 0 };
  }
}
function saveProgress() {
  try { localStorage.setItem('krestiki:progress', JSON.stringify(STATE.progress)); } catch {}
}
function loadLastPosition() {
  try {
    const raw = localStorage.getItem('krestiki:pos');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveLastPosition() {
  try { localStorage.setItem('krestiki:pos', JSON.stringify({ tier: STATE.tier, index: STATE.index })); } catch {}
}

// ---- Bootstrap ----
async function bootstrap() {
  try {
    const res = await fetch('puzzles.json', { cache: 'no-cache' });
    const data = await res.json();
    STATE.puzzles = data;
    for (const p of data) {
      if (!STATE.byTier[p.tier]) STATE.byTier[p.tier] = [];
      STATE.byTier[p.tier].push(p);
    }
  } catch (err) {
    showFatal('Не удалось загрузить задачи. Перезагрузите страницу.');
    console.error(err);
    return;
  }

  const last = loadLastPosition();
  if (last && STATE.byTier[last.tier] && last.index < STATE.byTier[last.tier].length) {
    STATE.tier = last.tier;
    STATE.index = last.index;
  }

  bindControls();
  render();
}

function showFatal(msg) {
  const card = $('#card');
  if (!card) return;
  clear(card);
  const p = el('p', { class: 'fatal', text: msg });
  p.style.cssText = 'text-align:center;color:var(--danger);padding:40px';
  card.appendChild(p);
}

// ---- Bindings ----
function bindControls() {
  $$('.tier-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTier(btn.dataset.tier));
  });
  $('#nextBtn').addEventListener('click', nextPuzzle);
  $('#retryBtn').addEventListener('click', retryPuzzle);
  $('#hintBtn').addEventListener('click', showHint);
  $('#revealBtn').addEventListener('click', revealAnswer);

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if ((e.key === 'Enter' || e.key === ' ') && !$('#nextBtn').hidden) {
      e.preventDefault();
      nextPuzzle();
    }
    if ((e.key === 'r' || e.key === 'R') && STATE.phase === 'loss') {
      e.preventDefault();
      retryPuzzle();
    }
  });
}

function switchTier(tier) {
  if (!STATE.byTier[tier] || STATE.byTier[tier].length === 0) return;
  STATE.tier = tier;
  STATE.index = 0;
  STATE.phase = 'idle';
  STATE.triedThisPuzzle = false;
  saveLastPosition();
  render();
}

function nextPuzzle() {
  const bank = STATE.byTier[STATE.tier];
  STATE.index = (STATE.index + 1) % bank.length;
  STATE.phase = 'idle';
  STATE.triedThisPuzzle = false;
  saveLastPosition();
  render();
}

function retryPuzzle() {
  STATE.phase = 'idle';
  render();
}

function showHint() {
  const p = currentPuzzle();
  if (!p) return;
  const row = Math.floor(p.answer / p.size);
  $$('.cell').forEach((c, i) => {
    if (Math.floor(i / p.size) === row) {
      c.animate(
        [{ borderColor: 'rgba(110,231,183,0.6)' }, { borderColor: 'var(--border)' }],
        { duration: 1200, easing: 'ease-out' }
      );
    }
  });
  STATE.triedThisPuzzle = true;
}

function revealAnswer() {
  const p = currentPuzzle();
  if (!p) return;
  const cells = $$('.cell');
  cells[p.answer].animate(
    [
      { boxShadow: '0 0 0 0 rgba(110,231,183,0.0)' },
      { boxShadow: '0 0 0 6px rgba(110,231,183,0.35)' },
      { boxShadow: '0 0 0 0 rgba(110,231,183,0.0)' },
    ],
    { duration: 1500, easing: 'ease-out' }
  );
  STATE.triedThisPuzzle = true;
}

// ---- Render ----
function currentPuzzle() {
  const bank = STATE.byTier[STATE.tier];
  if (!bank || bank.length === 0) return null;
  return bank[STATE.index % bank.length];
}

function render() {
  const p = currentPuzzle();
  if (!p) return;

  $$('.tier-tab').forEach(btn => {
    btn.setAttribute('aria-selected', String(btn.dataset.tier === STATE.tier));
  });

  const catTag = $('#catTag');
  catTag.textContent = CATEGORY_LABELS[p.category] || p.category;
  catTag.dataset.cat = p.category;

  $$('.diff .pip').forEach((pip, i) => pip.classList.toggle('on', i < p.difficulty));

  $('#coordNum').textContent = `№ ${String(STATE.index + 1).padStart(2, '0')} · ${STATE.byTier[STATE.tier].length}`;

  const boardEl = $('#board');
  boardEl.dataset.size = String(p.size);
  clear(boardEl);

  const overlay = $('#overlay');
  clear(overlay);
  overlay.classList.remove('is-win', 'is-loss');
  overlay.setAttribute('viewBox', `0 0 ${p.size * 100} ${p.size * 100}`);
  overlay.setAttribute('preserveAspectRatio', 'none');

  for (let i = 0; i < p.board.length; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.idx = String(i);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Клетка ${i + 1}`);
    const val = p.board[i];
    if (val === 'X') {
      cell.classList.add('is-x');
      cell.disabled = true;
      cell.appendChild(makeXSvg());
    } else if (val === 'O') {
      cell.classList.add('is-o');
      cell.disabled = true;
      cell.appendChild(makeOSvg());
    } else {
      const ghost = el('span', { class: 'ghost' }, [makeXSvg(true)]);
      cell.appendChild(ghost);
      cell.addEventListener('click', () => handleMove(i));
    }
    boardEl.appendChild(cell);
  }

  resetUiForPuzzle();
  renderProgress();
}

function makeXSvg(isGhost) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('mark', 'x-mark');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M5 5 L19 19 M19 5 L5 19');
  if (isGhost) path.style.animation = 'none';
  svg.appendChild(path);
  return svg;
}

function makeOSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('mark', 'o-mark');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '7.2');
  svg.appendChild(circle);
  return svg;
}

function resetUiForPuzzle() {
  STATE.phase = 'idle';
  const status = $('#status');
  status.className = 'status status-idle';
  status.querySelector('.status-text').textContent = 'Ваш ход — найдите единственный выигрышный';
  const ex = $('#explain');
  ex.hidden = true;
  ex.classList.remove('is-loss');
  clear(ex);
  $('#nextBtn').hidden = true;
  $('#retryBtn').hidden = true;
  $('#hintBtn').disabled = false;
  $('#revealBtn').disabled = false;
}

function renderExplain(headline, body, isLoss) {
  const ex = $('#explain');
  clear(ex);
  ex.hidden = false;
  ex.classList.toggle('is-loss', !!isLoss);
  const b = el('b', { text: headline + ' ' });
  ex.appendChild(b);
  ex.appendChild(document.createTextNode(body));
}

function renderExplainWithCell(headline, body, cellNumber) {
  const ex = $('#explain');
  clear(ex);
  ex.hidden = false;
  ex.classList.add('is-loss');
  ex.appendChild(el('b', { text: headline + ' ' }));
  ex.appendChild(document.createTextNode(body + ' Правильный ход — клетка '));
  ex.appendChild(el('b', { text: '№' + cellNumber }));
  ex.appendChild(document.createTextNode('.'));
}

// ---- Game logic ----
function handleMove(idx) {
  if (STATE.phase !== 'idle') return;
  const p = currentPuzzle();
  const cells = $$('.cell');

  if (idx === p.answer) {
    STATE.phase = 'win';
    const cell = cells[idx];
    cell.classList.add('is-correct');
    cell.disabled = true;
    clear(cell);
    cell.appendChild(makeXSvg());

    const b = p.board.slice();
    b[idx] = 'X';
    const winLine = findWinningLine(b, p.size, p.win, 'X');
    if (winLine) {
      drawLine(winLine, p.size, 'win');
      for (const ci of winLine) if (ci !== idx) cells[ci].classList.add('is-correct');
    }
    if (navigator.vibrate) navigator.vibrate(12);

    const firstTry = !STATE.triedThisPuzzle;
    STATE.progress.solvedAny[p.id] = true;
    if (firstTry) {
      STATE.progress.solvedFirstTry[p.id] = true;
      STATE.progress.currentStreak += 1;
      if (STATE.progress.currentStreak > STATE.progress.bestStreak) {
        STATE.progress.bestStreak = STATE.progress.currentStreak;
      }
    }
    saveProgress();

    const status = $('#status');
    status.className = 'status status-win';
    status.querySelector('.status-text').textContent = firstTry ? 'Победа · с первой попытки' : 'Победа';

    renderExplain('Почему верно.', p.explainWin, false);

    $('#nextBtn').hidden = false;
    $('#retryBtn').hidden = true;
    $('#hintBtn').disabled = true;
    $('#revealBtn').disabled = true;
    renderProgress();
    setTimeout(() => $('#nextBtn').focus(), 80);
  } else {
    STATE.phase = 'loss';
    STATE.triedThisPuzzle = true;
    STATE.progress.currentStreak = 0;
    saveProgress();
    const cell = cells[idx];
    cell.classList.add('is-wrong');
    cell.disabled = true;
    clear(cell);
    cell.appendChild(makeXSvg());

    const status = $('#status');
    status.className = 'status status-loss';
    status.querySelector('.status-text').textContent = 'Соперник отвечает…';

    const b = p.board.slice();
    b[idx] = 'X';
    const oMove = findOImmediateWin(b, p.size, p.win);

    setTimeout(() => {
      if (oMove !== -1) {
        const oCell = cells[oMove];
        oCell.classList.add('is-o-winning');
        clear(oCell);
        oCell.appendChild(makeOSvg());
        b[oMove] = 'O';
        const lossLine = findWinningLine(b, p.size, p.win, 'O');
        if (lossLine) {
          drawLine(lossLine, p.size, 'loss');
          for (const ci of lossLine) if (ci !== oMove) cells[ci].classList.add('is-o-winning');
        }
      }
      status.querySelector('.status-text').textContent = 'Поражение';
      renderExplainWithCell('Почему ошибка.', p.explainLoss, p.answer + 1);

      $('#nextBtn').hidden = false;
      $('#retryBtn').hidden = false;
      $('#hintBtn').disabled = true;
      $('#revealBtn').disabled = true;
      setTimeout(() => $('#retryBtn').focus(), 60);
    }, 520);

    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    renderProgress();
  }
}

function buildLines(size, winLen) {
  const N = size;
  const out = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c <= N - winLen; c++)
      out.push([...Array(winLen)].map((_, i) => r * N + c + i));
  for (let c = 0; c < N; c++)
    for (let r = 0; r <= N - winLen; r++)
      out.push([...Array(winLen)].map((_, i) => (r + i) * N + c));
  for (let r = 0; r <= N - winLen; r++)
    for (let c = 0; c <= N - winLen; c++)
      out.push([...Array(winLen)].map((_, i) => (r + i) * N + c + i));
  for (let r = 0; r <= N - winLen; r++)
    for (let c = winLen - 1; c < N; c++)
      out.push([...Array(winLen)].map((_, i) => (r + i) * N + c - i));
  return out;
}

function findWinningLine(board, size, winLen, player) {
  for (const L of buildLines(size, winLen)) {
    if (L.every(i => board[i] === player)) return L;
  }
  return null;
}

function findOImmediateWin(board, size, winLen) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== ' ') continue;
    board[i] = 'O';
    const w = findWinningLine(board, size, winLen, 'O');
    board[i] = ' ';
    if (w) return i;
  }
  return -1;
}

function drawLine(lineCells, size, kind) {
  const overlay = $('#overlay');
  overlay.classList.add(kind === 'win' ? 'is-win' : 'is-loss');
  const first = lineCells[0];
  const last = lineCells[lineCells.length - 1];
  const cs = 100;
  const fx = (first % size) * cs + cs / 2;
  const fy = Math.floor(first / size) * cs + cs / 2;
  const lx = (last % size) * cs + cs / 2;
  const ly = Math.floor(last / size) * cs + cs / 2;
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', fx);
  line.setAttribute('y1', fy);
  line.setAttribute('x2', lx);
  line.setAttribute('y2', ly);
  overlay.appendChild(line);
}

// ---- Progress rendering ----
function renderProgress() {
  const bank = STATE.byTier[STATE.tier] || [];
  const solved = bank.filter(p => STATE.progress.solvedAny[p.id]).length;
  const total = bank.length;
  $('#progressDone').textContent = String(solved);
  $('#progressTotal').textContent = String(total);
  const pct = total === 0 ? 0 : Math.round((solved / total) * 100);
  $('#progressPct').textContent = pct + '%';
  $('#progressFill').style.width = pct + '%';
  $('#statStreak').textContent = String(STATE.progress.currentStreak);
  $('#statBest').textContent = String(STATE.progress.bestStreak);
  const allSolved = Object.keys(STATE.progress.solvedAny).length;
  const allFirst = Object.keys(STATE.progress.solvedFirstTry).length;
  const firstPct = allSolved === 0 ? 0 : Math.round((allFirst / allSolved) * 100);
  $('#statFirst').textContent = firstPct + '%';
  $('#footSolved').textContent = String(allSolved);
}

bootstrap();
