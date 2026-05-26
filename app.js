// Крестики · Задачник — минималистичная версия
// Пазлы приходят из puzzles.js глобальным window.PUZZLES.

(function () {
  const SVG = 'http://www.w3.org/2000/svg';
  const byTier = { '3x3': [], '4x4': [], '5x5': [] };
  for (const p of (window.PUZZLES || [])) {
    if (!byTier[p.tier]) byTier[p.tier] = [];
    byTier[p.tier].push(p);
  }
  // Перемешать каждый банк (Fisher-Yates) чтобы порядок был случайным.
  for (const tier of Object.keys(byTier)) {
    const arr = byTier[tier];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  const state = {
    tier: '3x3',
    index: 0,
    phase: 'idle', // 'idle' | 'win' | 'loss'
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); };

  function currentPuzzle() {
    const bank = byTier[state.tier];
    if (!bank || bank.length === 0) return null;
    return bank[state.index % bank.length];
  }

  function makeX() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.classList.add('mark', 'x-mark');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M5 5 L19 19 M19 5 L5 19');
    svg.appendChild(path);
    return svg;
  }
  function makeO() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.classList.add('mark', 'o-mark');
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '12');
    c.setAttribute('r', '7.2');
    svg.appendChild(c);
    return svg;
  }
  function makeGhost() {
    const span = document.createElement('span');
    span.className = 'ghost';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M5 5 L19 19 M19 5 L5 19');
    svg.appendChild(path);
    span.appendChild(svg);
    return span;
  }

  function render() {
    const p = currentPuzzle();
    if (!p) {
      $('#status .txt').textContent = 'Нет задач для выбранного режима';
      return;
    }

    $$('.tier').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tier === state.tier)));

    const board = $('#board');
    board.dataset.size = String(p.size);
    clear(board);

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
      const v = p.board[i];
      if (v === 'X') { cell.disabled = true; cell.appendChild(makeX()); }
      else if (v === 'O') { cell.disabled = true; cell.appendChild(makeO()); }
      else {
        cell.appendChild(makeGhost());
        cell.addEventListener('click', () => onMove(i));
      }
      board.appendChild(cell);
    }

    state.phase = 'idle';
    const status = $('#status');
    status.className = 'status status-idle';
    status.querySelector('.txt').textContent = 'Ваш ход';
    $('#nextBtn').hidden = true;
    $('#retryBtn').hidden = true;
  }

  function buildLines(size, winLen) {
    const N = size, out = [];
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
  function findWinLine(board, size, winLen, player) {
    for (const L of buildLines(size, winLen)) {
      if (L.every(i => board[i] === player)) return L;
    }
    return null;
  }
  function findOWin(board, size, winLen) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== ' ') continue;
      board[i] = 'O';
      const w = findWinLine(board, size, winLen, 'O');
      board[i] = ' ';
      if (w) return i;
    }
    return -1;
  }

  function drawLine(cells, size, kind) {
    const overlay = $('#overlay');
    overlay.classList.add(kind === 'win' ? 'is-win' : 'is-loss');
    const first = cells[0], last = cells[cells.length - 1];
    const cs = 100;
    const x1 = (first % size) * cs + cs / 2;
    const y1 = Math.floor(first / size) * cs + cs / 2;
    const x2 = (last % size) * cs + cs / 2;
    const y2 = Math.floor(last / size) * cs + cs / 2;
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    overlay.appendChild(line);
  }

  function onMove(idx) {
    if (state.phase !== 'idle') return;
    const p = currentPuzzle();
    const cells = $$('.cell');

    if (idx === p.answer) {
      state.phase = 'win';
      const cell = cells[idx];
      cell.classList.add('is-correct');
      cell.disabled = true;
      clear(cell);
      cell.appendChild(makeX());

      const b = p.board.slice();
      b[idx] = 'X';
      const line = findWinLine(b, p.size, p.win, 'X');
      if (line) {
        drawLine(line, p.size, 'win');
        for (const ci of line) if (ci !== idx) cells[ci].classList.add('is-correct');
      }
      const status = $('#status');
      status.className = 'status status-win';
      status.querySelector('.txt').textContent = 'Победа';
      $('#nextBtn').hidden = false;
      $('#retryBtn').hidden = true;
      setTimeout(() => $('#nextBtn').focus(), 80);
      if (navigator.vibrate) navigator.vibrate(12);
    } else {
      state.phase = 'loss';
      const cell = cells[idx];
      cell.classList.add('is-wrong');
      cell.disabled = true;
      clear(cell);
      cell.appendChild(makeX());

      const status = $('#status');
      status.className = 'status status-loss';
      status.querySelector('.txt').textContent = 'Соперник отвечает…';

      const b = p.board.slice();
      b[idx] = 'X';
      const om = findOWin(b, p.size, p.win);

      setTimeout(() => {
        if (om !== -1) {
          const oc = cells[om];
          oc.classList.add('is-o-winning');
          clear(oc);
          oc.appendChild(makeO());
          b[om] = 'O';
          const lossLine = findWinLine(b, p.size, p.win, 'O');
          if (lossLine) {
            drawLine(lossLine, p.size, 'loss');
            for (const ci of lossLine) if (ci !== om) cells[ci].classList.add('is-o-winning');
          }
        }
        status.querySelector('.txt').textContent = 'Поражение';
        $('#nextBtn').hidden = false;
        $('#retryBtn').hidden = false;
        setTimeout(() => $('#retryBtn').focus(), 60);
      }, 520);

      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    }
  }

  function nextPuzzle() {
    const bank = byTier[state.tier];
    if (!bank || bank.length === 0) return;
    state.index = (state.index + 1) % bank.length;
    render();
  }
  function retry() { render(); }
  function switchTier(tier) {
    if (!byTier[tier] || byTier[tier].length === 0) return;
    state.tier = tier;
    state.index = 0;
    render();
  }

  function bind() {
    $$('.tier').forEach(btn => btn.addEventListener('click', () => switchTier(btn.dataset.tier)));
    $('#nextBtn').addEventListener('click', nextPuzzle);
    $('#retryBtn').addEventListener('click', retry);
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea')) return;
      if ((e.key === 'Enter' || e.key === ' ') && !$('#nextBtn').hidden) {
        e.preventDefault(); nextPuzzle();
      }
      if ((e.key === 'r' || e.key === 'R') && state.phase === 'loss') {
        e.preventDefault(); retry();
      }
    });
  }

  bind();
  render();
})();
