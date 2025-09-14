// 基本型別與常數定義

/**
 * CellState: hidden: 未開, revealed: 已開, flagged: 旗標
 */
export const CellState = Object.freeze({
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  FLAGGED: 'flagged'
});

/**
 * 每個格子資料結構
 * @typedef {Object} CellData
 * @property {number} x - column index
 * @property {number} y - row index
 * @property {boolean} mine - 是否為地雷
 * @property {number} adjacent - 鄰近地雷數
 * @property {string} state - CellState
 * @property {string} date - 對應日期 (ISO)
 * @property {number} contrib - 當日貢獻數
 */

/**
 * 建立空白格子資料
 */
export function createEmptyCell(x, y, date = null, contrib = 0) {
  return {
    x,
    y,
    mine: false,
    adjacent: 0,
    state: CellState.HIDDEN,
    date,
    contrib
  };
}

export function boardDimensionsFromContributionData(days) {
  // GitHub 貢獻圖固定 7 列 (週日->週六)，列數 = 7
  // 欄數 = 週數 (weeks) = Math.ceil(days.length / 7)
  return { rows: 7, cols: Math.ceil(days.length / 7) };
}

export function indexToCoord(index, cols) {
  const x = Math.floor(index / 7); // column (week)
  const y = index % 7; // row (weekday)
  // 注意：GitHub SVG 是 <g> 週 -> <rect> 日序，這裡保持一致
  return { x, y };
}

export function coordToIndex(x, y) {
  return x * 7 + y;
}

export function iterateNeighbors(board, x, y, cb) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < board.cols && ny >= 0 && ny < board.rows) {
        cb(board.grid[ny][nx]);
      }
    }
  }
}

export function createBoardStructure(rows, cols) {
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      row.push(createEmptyCell(x, y));
    }
    grid.push(row);
  }
  return { rows, cols, grid, mines: 0, revealed: 0, flags: 0, status: 'playing' };
}

export function flattenBoard(board) {
  return board.grid.flat();
}

export function computeAdjacents(board) {
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const cell = board.grid[y][x];
      if (cell.mine) {
        cell.adjacent = -1;
        continue;
      }
      let count = 0;
      iterateNeighbors(board, x, y, n => { if (n.mine) count++; });
      cell.adjacent = count;
    }
  }
}

export function floodReveal(board, startCell) {
  const stack = [startCell];
  const visited = new Set();
  while (stack.length) {
    const cell = stack.pop();
    const key = cell.x + ':' + cell.y;
    if (visited.has(key)) continue;
    visited.add(key);
    if (cell.state === CellState.REVEALED || cell.state === CellState.FLAGGED) continue;
    cell.state = CellState.REVEALED;
    board.revealed++;
    if (cell.adjacent === 0) {
      iterateNeighbors(board, cell.x, cell.y, n => {
        if (n.state === CellState.HIDDEN) stack.push(n);
      });
    }
  }
}

export function revealCell(board, x, y) {
  if (board.status !== 'playing') return;
  const cell = board.grid[y][x];
  if (cell.state !== CellState.HIDDEN) return;
  if (cell.mine) {
    cell.state = CellState.REVEALED;
    board.status = 'lost';
    return;
  }
  floodReveal(board, cell);
  checkWin(board);
}

export function toggleFlag(board, x, y) {
  if (board.status !== 'playing') return;
  const cell = board.grid[y][x];
  if (cell.state === CellState.REVEALED) return;
  if (cell.state === CellState.HIDDEN) {
    cell.state = CellState.FLAGGED;
    board.flags++;
  } else if (cell.state === CellState.FLAGGED) {
    cell.state = CellState.HIDDEN;
    board.flags--;
  }
}

export function checkWin(board) {
  if (board.status !== 'playing') return;
  const total = board.rows * board.cols;
  if (board.revealed === total - board.mines) {
    board.status = 'won';
  }
}

export function isFirstMove(board) {
  return board.revealed === 0;
}

/**
 * 嘗試讓第一步成為零區 (adjacent=0) ：
 * 若起始格或其鄰居有地雷，嘗試把鄰居中的地雷搬走到其他安全可放位置。
 * 僅做一次 (best-effort)，若候選不足則放棄。
 */
export function ensureFirstZeroArea(board, x, y) {
  const start = board.grid[y][x];
  // 若起始本身是雷，後續 safeRevealCell 會先交換掉，這裡仍防禦性處理
  if (start.mine) return; // 等待 safeRevealCell 先處理 swap
  computeAdjacents(board);
  if (start.adjacent === 0) return; // 已是零區

  // 蒐集鄰居與其中的地雷
  const neighbors = [];
  iterateNeighbors(board, x, y, n => neighbors.push(n));
  const neighborMines = neighbors.filter(n => n.mine);
  if (!neighborMines.length) return; // 沒有鄰居雷就無法再降 (表示 >0 來自更外圍雷)

  // 禁止搬遷目標: 起始 + 鄰居 (保持零區周圍乾淨)
  const forbidden = new Set([start, ...neighbors]);
  const candidates = board.grid.flat().filter(c => c.date && !c.mine && !forbidden.has(c));
  if (candidates.length < neighborMines.length) return; // 不足以全部搬走

  for (let i = 0; i < neighborMines.length; i++) {
    neighborMines[i].mine = false;
    candidates[i].mine = true;
  }
  computeAdjacents(board);
}

export function safeRevealCell(board, x, y) {
  const first = isFirstMove(board);
  const cell = board.grid[y][x];
  if (!first) { revealCell(board, x, y); return; }

  // 第一步：若是雷，與其他非雷可移位置交換
  if (cell.mine) {
    const swap = board.grid.flat().find(c => c.date && !c.mine && c !== cell);
    if (swap) { cell.mine = false; swap.mine = true; }
  }
  // 嘗試將鄰近雷搬走以形成零區
  ensureFirstZeroArea(board, x, y);
  // 再揭開
  revealCell(board, x, y);
}
