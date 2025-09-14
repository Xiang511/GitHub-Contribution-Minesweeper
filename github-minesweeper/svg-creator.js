import { CellState, toggleFlag, revealCell, safeRevealCell, createBoardStructure } from './minesweeper-types.js';

// 主題定義
const THEMES = {
  light: {
    name: 'Light',
    hidden: '#e9ebeeff',
  flagged: '#e9ebeeff', // 調整與 hidden 區分 (原本相同導致旗標色塊不明顯)
    mineLost: '#cf222e',
    mineWon: '#2da44e',
    contrib: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    bg: '#ffffff',
    text: '#24292f',
    flagEmoji: '🚩',
    mineEmoji: '💣'
  },
  dark: {
    name: 'Dark',
    hidden: '#161b22',
    flagged: '#d29922',
    mineLost: '#f85149',
    mineWon: '#2ea043',
    contrib: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    bg: '#0d1117',
    text: '#c9d1d9',
    flagEmoji: '🚩',
    mineEmoji: '💣'
  }
};

let currentThemeKey = 'light';
export function setTheme(key) { if (THEMES[key]) currentThemeKey = key; }
export function getTheme() { return THEMES[currentThemeKey]; }
export function listThemes() { return Object.keys(THEMES); }

/**
 * 產生並掛載 SVG 棋盤
 * @param board
 * @param {HTMLElement} mount
 * @param {Function} onUpdate - 每次狀態變動 callback
 */
export function renderBoard(board, mount, onUpdate) {
  mount.innerHTML = '';
  const size = 16; // 每格 px
  const padding = 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(board.cols * (size + padding)));
  svg.setAttribute('height', String(board.rows * (size + padding)));
  svg.setAttribute('data-status', board.status);
  svg.style.fontFamily = 'monospace';
  svg.style.userSelect = 'none';

  function colorFor(cell) {
    const th = getTheme();
    if (cell.state === CellState.FLAGGED) return th.flagged;
    if (cell.state === CellState.HIDDEN) return th.hidden;
    if (cell.mine && board.status === 'lost') return th.mineLost;
    if (cell.mine && board.status === 'won') return th.mineWon;
    const c = cell.contrib || 0;
    let base;
    if (c === 0) base = th.contrib[0];
    else if (c < 3) base = th.contrib[1];
    else if (c < 6) base = th.contrib[2];
    else if (c < 10) base = th.contrib[3];
    else base = th.contrib[4];
    // 已開啟之普通格淡化 (非雷)
    if (cell.state === CellState.REVEALED && !cell.mine) {
      return blendColor(base, th.bg, 0.45); // 45% toward background
    }
    return base;
  }

  function textFor(cell) {
    const th = getTheme();
    if (cell.state === CellState.FLAGGED) return th.flagEmoji;
    if (cell.state !== CellState.REVEALED) return '';
    if (cell.mine) return th.mineEmoji;
    return cell.adjacent > 0 ? String(cell.adjacent) : '';
  }

  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const cell = board.grid[y][x];
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x * (size + padding)));
      rect.setAttribute('y', String(y * (size + padding)));
      rect.setAttribute('width', String(size));
      rect.setAttribute('height', String(size));
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', colorFor(cell));
      // 旗標格加上描邊更顯眼
      if (cell.state === CellState.FLAGGED) {
        rect.setAttribute('stroke', getTheme().flagged);
        rect.setAttribute('stroke-width', '2');
      } else {
        rect.setAttribute('stroke', 'none');
      }
      rect.setAttribute('data-x', String(x));
      rect.setAttribute('data-y', String(y));
      rect.style.cursor = 'pointer';

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x * (size + padding) + size / 2));
      text.setAttribute('y', String(y * (size + padding) + size / 2 + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
  text.setAttribute('fill', getTheme().text);
      text.textContent = textFor(cell);

      g.appendChild(rect);
      g.appendChild(text);
      svg.appendChild(g);

      g.addEventListener('click', e => {
        e.preventDefault();
        if (board.status !== 'playing') return;
        safeRevealCell(board, x, y);
        onUpdate();
      });
      g.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (board.status !== 'playing') return;
        toggleFlag(board, x, y);
        onUpdate();
      });
    }
  }

  mount.appendChild(svg);
}

export function updateBoardSVG(board, mount) {
  const svg = mount.querySelector('svg');
  if (!svg) return;
  svg.setAttribute('data-status', board.status);
  const rects = svg.querySelectorAll('rect');
  const texts = svg.querySelectorAll('text');
  let ti = 0;
  function internalColor(cell, board) {
    const th = getTheme();
    if (cell.state === CellState.FLAGGED) return th.flagged;
    if (cell.state === CellState.HIDDEN) return th.hidden;
    if (cell.mine && board.status === 'lost') return th.mineLost;
    if (cell.mine && board.status === 'won') return th.mineWon;
    const c = cell.contrib || 0;
    let base;
    if (c === 0) base = th.contrib[0];
    else if (c < 3) base = th.contrib[1];
    else if (c < 6) base = th.contrib[2];
    else if (c < 10) base = th.contrib[3];
    else base = th.contrib[4];
    if (cell.state === CellState.REVEALED && !cell.mine) {
      return blendColor(base, th.bg, 0.45);
    }
    return base;
  }
  rects.forEach(rect => {
    const x = Number(rect.getAttribute('data-x'));
    const y = Number(rect.getAttribute('data-y'));
    const cell = board.grid[y][x];
    rect.setAttribute('fill', internalColor(cell, board));
    if (cell.state === CellState.FLAGGED) {
      rect.setAttribute('stroke', getTheme().flagged);
      rect.setAttribute('stroke-width', '2');
    } else {
      rect.setAttribute('stroke', 'none');
      rect.setAttribute('stroke-width', '0');
    }
    const text = texts[ti++];
    if (cell.state === CellState.REVEALED) {
      text.textContent = cell.mine ? '💣' : (cell.adjacent > 0 ? String(cell.adjacent) : '');
    } else {
  text.textContent = (cell.state === CellState.FLAGGED) ? getTheme().flagEmoji : '';
    }
  });
}

// 將前景色朝背景色淡化 factor (0~1) 比例
function blendColor(fg, bg, factor) {
  function hexToRgb(h){
    const m = h.replace('#','');
    return {
      r: parseInt(m.slice(0,2),16),
      g: parseInt(m.slice(2,4),16),
      b: parseInt(m.slice(4,6),16)
    };
  }
  const F = hexToRgb(fg), B = hexToRgb(bg);
  const r = Math.round(F.r + (B.r - F.r)*factor);
  const g = Math.round(F.g + (B.g - F.g)*factor);
  const b = Math.round(F.b + (B.b - F.b)*factor);
  const toHex = v => v.toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function exportCurrentSVG(mount, filename = 'github-minesweeper.svg') {
  const svg = mount.querySelector('svg');
  if (!svg) throw new Error('找不到 SVG');
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 匯出回放動畫：傳入 snapshot board 與 actions，生成逐步顯示的 <animate>。
// 每一步 1 秒 (1x 節奏)。僅簡化：顯示 reveal/flag/guess 動作；flood count 不單獨逐格，直接視為同一秒完成。
export function exportReplayAnimation(boardSnapshot, actions, filename = 'replay-animation.svg', options = {}) {
  const cfg = {
    cellSize: 16,
    padding: 2,
    stepSeconds: options.stepSeconds ?? 1,
    fadeDuration: options.fadeDuration ?? 0.25,
    flagStrokeWidth: 2,
    simultaneousFlood: true, // true: 同一秒顯示全部展開；false: 逐格 1/10 秒間隔
  };
  const th = getTheme();
  const lightenFactor = options.lightenFactor ?? 0.45; // 與即時棋盤一致的淡化比例
  const enableLoop = options.loop !== false; // 預設自動重播
  // 基本驗證
  if (!boardSnapshot || typeof boardSnapshot !== 'object') throw new Error('回放快照無效');
  if (!Array.isArray(boardSnapshot.cells)) {
    if (Array.isArray(boardSnapshot.grid)) {
      boardSnapshot.cells = boardSnapshot.grid.map(r => r.map(c => ({
        x:c.x,y:c.y,mine:c.mine,adjacent:c.adjacent,contrib:c.contrib,date:c.date
      })));
    } else throw new Error('快照缺少 cells');
  }
  const rows = boardSnapshot.rows; const cols = boardSnapshot.cols;
  const W = cols * (cfg.cellSize + cfg.padding);
  const H = rows * (cfg.cellSize + cfg.padding);

  const colorForCell = c => {
    const val = c.contrib || 0;
    if (val === 0) return th.contrib[0];
    if (val < 3) return th.contrib[1];
    if (val < 6) return th.contrib[2];
    if (val < 10) return th.contrib[3];
    return th.contrib[4];
  };

  // 模擬板（僅儲存 state）
  const sim = createBoardStructure(rows, cols);
  for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
    const s = boardSnapshot.cells[y][x];
    const d = sim.grid[y][x];
    d.mine = s.mine; d.adjacent = s.adjacent; d.contrib = s.contrib; d.date = s.date;
  }
  sim.status = 'playing';

  function floodReveal(b, sx, sy) {
    const stack = [[sx,sy]]; const seq = [];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx<0||cy<0||cx>=b.cols||cy>=b.rows) continue;
      const cell = b.grid[cy][cx];
      if (cell.state === CellState.REVEALED || cell.state === CellState.FLAGGED) continue;
      cell.state = CellState.REVEALED; seq.push(cell);
      if (!cell.mine && cell.adjacent === 0) {
        for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) if (dx||dy) stack.push([cx+dx, cy+dy]);
      }
      if (cell.mine) b.status = 'lost';
    }
    return seq;
  }

  // 動畫片段累積
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:${th.bg};font-family:monospace">`);
  parts.push(`<style>text{pointer-events:none;dominant-baseline:middle;font-size:11px;fill:${th.text}} .r{transition:none}</style>`);
  // 初始元素：預先放入數字/雷文字 (opacity=0) 以及旗標文字 (opacity=0)，用 opacity 動畫顯示，避免 textContent set 在部分瀏覽器失效
  for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
    const id = `c_${x}_${y}`; const txtId = `t_${x}_${y}`; const flagId = `f_${x}_${y}`;
    const px = x*(cfg.cellSize+cfg.padding); const py = y*(cfg.cellSize+cfg.padding);
    const cellInfo = boardSnapshot.cells[y][x];
    const baseText = cellInfo.mine ? th.mineEmoji : (cellInfo.adjacent > 0 ? cellInfo.adjacent : '');
    parts.push(`<g id="g_${x}_${y}">`+
      `<rect id="${id}" class="r" x="${px}" y="${py}" width="${cfg.cellSize}" height="${cfg.cellSize}" rx="3" fill="${th.hidden}" stroke="none" stroke-width="0"/>`+
      `<text id="${txtId}" x="${px + cfg.cellSize/2}" y="${py + cfg.cellSize/2 + 2}" text-anchor="middle" opacity="0">${baseText}</text>`+
      `<text id="${flagId}" x="${px + cfg.cellSize/2}" y="${py + cfg.cellSize/2 + 2}" text-anchor="middle" opacity="0">${th.flagEmoji}</text>`+
    `</g>`);
  }

  // 產生 <animate>/<set> helper：同時含 href 與 xlink:href，避免重複字串造成 XML 錯誤
  const timeExpr = t => enableLoop ? `loopCtl.begin+${t}s` : `${t}s`;
  const animFill = (targetId, to, begin, dur) => `<animate href="#${targetId}" xlink:href="#${targetId}" attributeName="fill" to="${to}" begin="${timeExpr(begin)}" dur="${dur}s" fill="freeze" />`;
  const animStroke = (targetId, name, to, begin, dur) => `<animate href="#${targetId}" xlink:href="#${targetId}" attributeName="${name}" to="${to}" begin="${timeExpr(begin)}" dur="${dur}s" fill="freeze" />`;
  const animOpacity = (targetId, begin, dur=cfg.fadeDuration, to=1) => `<animate href="#${targetId}" xlink:href="#${targetId}" attributeName="opacity" to="${to}" begin="${timeExpr(begin)}" dur="${dur}s" fill="freeze" />`;

  let currentTime = 0;
  const step = cfg.stepSeconds;
  const floodPerCell = cfg.simultaneousFlood ? 0 : (step/ (options.floodSpeedDivisor || 10));

  function scheduleCells(cells, baseTime) {
    if (!cells.length) return baseTime + step; // 空也推進
    if (cfg.simultaneousFlood) {
      for (const cell of cells) emitCell(cell, baseTime);
      return baseTime + step;
    } else {
      let t = baseTime; const delta = floodPerCell || 0.1;
      cells.forEach(cell => { emitCell(cell, t); t += delta; });
      // 確保至少 step 推進
      return Math.max(baseTime + step, t);
    }
  }

  function emitCell(cell, atTime, boomResult) {
    const id = `c_${cell.x}_${cell.y}`; const txtId = `t_${cell.x}_${cell.y}`;
    const isMine = cell.mine && (boomResult || sim.status==='lost');
  // 非雷格顯示時同樣套用淡化（貼近即時顯示效果）
  const baseColor = isMine ? th.mineLost : colorForCell(cell);
  const fill = isMine ? baseColor : blendColor(baseColor, th.bg, lightenFactor);
    parts.push(animFill(id, fill, atTime, cfg.fadeDuration));
    // 顯示數字或雷（zero 仍空白故無需文字動畫）
    if (isMine || cell.adjacent > 0) {
      parts.push(animOpacity(txtId, atTime));
    }
  }

  for (const act of actions) {
    if (!act || act.x == null || act.y == null) { currentTime += step; continue; }
    if (act.type === 'flag') {
      const id = `c_${act.x}_${act.y}`;
      const flagColor = th.flagged;
      parts.push(animFill(id, flagColor, currentTime, cfg.fadeDuration));
      parts.push(animStroke(id, 'stroke', flagColor, currentTime, cfg.fadeDuration));
      parts.push(animStroke(id, 'stroke-width', cfg.flagStrokeWidth, currentTime, cfg.fadeDuration));
      const flagId = `f_${act.x}_${act.y}`;
      parts.push(animOpacity(flagId, currentTime));
      currentTime += step;
      continue;
    }
    if (act.type === 'reveal' || act.type === 'guess') {
      const newly = floodReveal(sim, act.x, act.y);
      // 若爆炸，找到第一個雷（act.result==='boom'）
      const boom = act.result === 'boom';
      if (boom) {
        // 確保第一格是雷填色 + emoji
        const first = newly.find(c=>c.mine) || sim.grid[act.y][act.x];
        emitCell(first, currentTime, true);
        const others = newly.filter(c=>c!==first);
        for (const c of others) emitCell(c, currentTime);
      } else {
        currentTime = scheduleCells(newly, currentTime); // 內部會加 step
        continue;
      }
      currentTime += step;
      continue;
    }
    if (act.type === 'flood') {
      // flood 動作僅時間推進 (前一步 reveal 已展示)
      currentTime += step;
    }
  }

  const totalDuration = currentTime; // 已累積的總時間 (最後一動後已有 step 推進)
  if (enableLoop) {
    // 插入 loop 控制 (使用 try/anchor 不影響版面)
    parts.splice(2, 0, `<rect id="loopAnchor" width="0" height="0" x="-5" y="-5"><animate id="loopCtl" attributeName="x" from="-5" to="-5" dur="${totalDuration}s" begin="0s;loopCtl.end" /></rect>`);
    // 於結尾加入 reset 動畫 (loopCtl.end 時重置所有 cell 狀態)
    for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
      const id = `c_${x}_${y}`; const txtId = `t_${x}_${y}`; const flagId = `f_${x}_${y}`;
      // 重置成 hidden 顏色與文字透明
      parts.push(`<animate href="#${id}" xlink:href="#${id}" attributeName="fill" to="${th.hidden}" begin="loopCtl.end" dur="0.001s" fill="freeze" />`);
      parts.push(`<animate href="#${id}" xlink:href="#${id}" attributeName="stroke-width" to="0" begin="loopCtl.end" dur="0.001s" fill="freeze" />`);
      parts.push(`<animate href="#${id}" xlink:href="#${id}" attributeName="stroke" to="none" begin="loopCtl.end" dur="0.001s" fill="freeze" />`);
      parts.push(`<animate href="#${txtId}" xlink:href="#${txtId}" attributeName="opacity" to="0" begin="loopCtl.end" dur="0.001s" fill="freeze" />`);
      parts.push(`<animate href="#${flagId}" xlink:href="#${flagId}" attributeName="opacity" to="0" begin="loopCtl.end" dur="0.001s" fill="freeze" />`);
    }
  }
  parts.push('</svg>');
  const blob = new Blob([parts.join('')], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
