import { CellState, iterateNeighbors, revealCell, toggleFlag, safeRevealCell } from './minesweeper-types.js';

// === 進階邏輯說明 ===
// 1. 基本規則 (現有): 若已知格子數字 = 周圍旗數 => 其他全開；若 旗數 + 未知數 = 數字 => 未知全插旗。
// 2. 子集差推理: 對於兩個約束 A, B 若 A 覆蓋集合是 B 的子集，且 A.mineCount = k, B.mineCount = k 則 (B-A) 全安全；若 B.mineCount - A.mineCount = |B-A| 則 (B-A) 全是雷。
// 3. 小群組枚舉: 將前線 (已揭示有數字且周圍有隱藏格) 的連通組合拆成群組 (共享變數)，對每群組 ≤ 12 未知格做枚舉，計算每格為雷的機率。
// 4. 機率猜測: 無確定步驟時，選擇最小機率格開啟；若有多個等值，偏好遠離中心 (模擬人類尋找邊緣) 或隨機。
// 5. 目標：提高成功率 (>90% 視盤面與雷比例；本實作著重於降低不必要猜雷)。

// 工具: 蒐集前線約束
function collectFrontier(board) {
  const constraints = []; // {cells:Set(cell), mines:number}
  const hiddenGlobal = new Set();
  for (let y=0; y<board.rows; y++) for (let x=0; x<board.cols; x++) {
    const c = board.grid[y][x];
    if (c.state !== CellState.REVEALED) continue;
    if (c.adjacent <= 0) continue;
    let hidden=[]; let flagged=0;
    iterateNeighbors(board, x, y, n => {
      if (n.state === CellState.HIDDEN) { hidden.push(n); hiddenGlobal.add(n); }
      else if (n.state === CellState.FLAGGED) flagged++;
    });
    if (!hidden.length) continue;
    const remaining = c.adjacent - flagged;
    if (remaining < 0) continue; // 不一致
    constraints.push({ cells: new Set(hidden), mines: remaining });
  }
  return { constraints, hiddenGlobal };
}

// 子集差推理
function subsetDeductions(constraints) {
  const toFlag = new Set();
  const toSafe = new Set();
  for (let i=0; i<constraints.length; i++) {
    for (let j=0; j<constraints.length; j++) if (i!==j) {
      const A = constraints[i]; const B = constraints[j];
      if (A.cells.size === 0 || B.cells.size === 0) continue;
      // 判斷 A 是否 B 子集
      let aSubset = true;
      for (const c of A.cells) if (!B.cells.has(c)) { aSubset = false; break; }
      if (!aSubset) continue;
      // B - A
      const diff = []; for (const c of B.cells) if (!A.cells.has(c)) diff.push(c);
      if (!diff.length) continue;
      if (A.mines === B.mines) {
        // diff 全安全
        diff.forEach(c => toSafe.add(c));
      } else if (B.mines - A.mines === diff.length) {
        diff.forEach(c => toFlag.add(c));
      }
    }
  }
  return { toFlag, toSafe };
}

// 分群：若兩 constraint 共享 cell 則屬同一群
function groupConstraints(constraints) {
  const groups = [];
  const used = new Set();
  function dfs(idx, group, cellsSet) {
    used.add(idx);
    group.push(constraints[idx]);
    for (let j=0; j<constraints.length; j++) if (!used.has(j)) {
      const cst = constraints[j];
      let share = false;
      for (const c of cst.cells) if (cellsSet.has(c)) { share = true; break; }
      if (share) {
        for (const c of cst.cells) cellsSet.add(c);
        dfs(j, group, cellsSet);
      }
    }
  }
  for (let i=0; i<constraints.length; i++) if (!used.has(i)) {
    const first = constraints[i];
    const cellsSet = new Set(first.cells);
    const group = [];
    dfs(i, group, cellsSet);
    groups.push({ constraints: group, cells: Array.from(cellsSet) });
  }
  return groups;
}

// 列舉得到每個 cell 是雷的可能數 (count) 與總案例 total
function enumerateGroup(group) {
  const vars = group.cells; // array of cell objects
  if (vars.length > 12) return null; // 避免指數爆炸
  // 轉換 constraint 為索引集合
  const cDefs = group.constraints.map(c => ({ idxs: vars.map((v,i)=> c.cells.has(v)?i:-1).filter(i=>i>=0), mines: c.mines }));
  const counts = new Array(vars.length).fill(0);
  let total = 0;
  function dfs(i, assign, remainMinesPerC) {
    if (i === vars.length) {
      // 檢查所有剩餘都為 0
      for (let ci=0; ci<cDefs.length; ci++) if (remainMinesPerC[ci] !== 0) return;
      total++;
      for (let k=0; k<vars.length; k++) if (assign[k]===1) counts[k]++;
      return;
    }
    // 剪枝：檢查是否已不可能滿足
    for (let ci=0; ci<cDefs.length; ci++) if (remainMinesPerC[ci] < 0) return;
    // 嘗試 0 (非雷)
    dfs(i+1, assign, remainMinesPerC);
    // 嘗試 1 (雷) -> 檢查是否合理
    const newRemain = remainMinesPerC.slice();
    for (let ci=0; ci<cDefs.length; ci++) if (cDefs[ci].idxs.includes(i)) newRemain[ci]--;
    dfs(i+1, (()=>{ const a=assign.slice(); a[i]=1; return a; })(), newRemain);
  }
  const initRemain = cDefs.map(c=>c.mines);
  dfs(0, new Array(vars.length).fill(0), initRemain);
  return { counts, total, vars };
}

function chooseBestGuess(probMap, board) {
  let best = null; let bestP = 1e9;
  for (const [cell, p] of probMap.entries()) {
    if (p < bestP) { bestP = p; best = cell; }
    else if (p === bestP) {
      // 平手：挑離中心較遠 (人類偏好邊緣)
      const curDist = Math.abs(cell.x - board.cols/2) + Math.abs(cell.y - board.rows/2);
      const bestDist = Math.abs(best.x - board.cols/2) + Math.abs(best.y - board.rows/2);
      if (curDist > bestDist) best = cell;
    }
  }
  return best;
}

// 進階單步：返回是否有動作; actions 陣列會推動作
export function autoStepAdvanced(board, actions) {
  if (board.status !== 'playing') return false;
  // 先做基本規則 (可能已處理大部分)
  const basicDid = autoStep(board, actions);
  if (board.status !== 'playing') return basicDid;
  // 收集約束
  const { constraints } = collectFrontier(board);
  if (!constraints.length) return basicDid;
  // 子集差推理
  const { toFlag, toSafe } = subsetDeductions(constraints);
  let acted = basicDid;
  for (const c of toFlag) if (c.state === CellState.HIDDEN) { toggleFlag(board, c.x, c.y); actions && actions.push({ type:'flag', x:c.x, y:c.y }); acted = true; }
  for (const c of toSafe) if (c.state === CellState.HIDDEN) { revealCellWithTrace(board, c.x, c.y, actions); acted = true; }
  if (acted || board.status !== 'playing') return true;
  // 群組機率枚舉
  const groups = groupConstraints(constraints);
  const probMap = new Map(); // cell -> P(mine)
  let anyProb = false;
  for (const g of groups) {
    const res = enumerateGroup(g);
    if (!res || !res.total) continue;
    anyProb = true;
    const { counts, total, vars } = res;
    for (let i=0; i<vars.length; i++) {
      const p = counts[i] / total;
      if (!probMap.has(vars[i]) || p < probMap.get(vars[i])) probMap.set(vars[i], p);
      // 直接確定安全或必雷
      if (p === 0) { revealCellWithTrace(board, vars[i].x, vars[i].y, actions); acted = true; }
      else if (p === 1) { toggleFlag(board, vars[i].x, vars[i].y); actions && actions.push({ type:'flag', x:vars[i].x, y:vars[i].y }); acted = true; }
    }
  }
  if (acted || board.status !== 'playing') return true;
  // 無確定步驟且有機率資訊 -> 選最小風險
  if (anyProb) {
    const pick = chooseBestGuess(probMap, board);
    if (pick) {
      revealCellWithTrace(board, pick.x, pick.y, actions);
      actions[actions.length-1].type = 'guess';
      return true;
    }
  }
  return false;
}

// 動作格式: {type:'reveal'|'flag'|'guess', x, y, result?:'boom'|'safe'}

export function autoStep(board, actions) {
  if (board.status !== 'playing') return false;
  let acted = false;
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const cell = board.grid[y][x];
      if (cell.state !== CellState.REVEALED) continue;
      if (cell.adjacent <= 0) continue;
      let hidden = [];
      let flagged = 0;
      iterateNeighbors(board, x, y, n => {
        if (n.state === CellState.HIDDEN) hidden.push(n);
        else if (n.state === CellState.FLAGGED) flagged++;
      });
      if (hidden.length === 0) continue;
      if (flagged === cell.adjacent) {
        hidden.forEach(h => {
          if (board.status !== 'playing') return;
            revealCell(board, h.x, h.y);
            actions && actions.push({ type:'reveal', x:h.x, y:h.y, result: h.mine ? 'boom':'safe' });
            acted = true;
        });
      } else if (flagged + hidden.length === cell.adjacent) {
        hidden.forEach(h => { if (h.state === CellState.HIDDEN) { toggleFlag(board, h.x, h.y); actions && actions.push({ type:'flag', x:h.x, y:h.y }); acted = true; } });
      }
    }
  }
  return acted;
}

export function autoPlay(board, maxSteps = 100) {
  let steps = 0;
  while (steps < maxSteps && board.status === 'playing') {
    const changed = autoStep(board);
    if (!changed) break;
    steps++;
  }
  return steps;
}

export function autoSolve(board, maxIterations = 10000, enableGuess = true) {
  const actions = [];
  let iterations = 0;
  // 起手：若完全沒有已揭示格子，先隨機開一格（避免第一次呼叫沒有動作）
  const anyRevealed = board.grid.some(row => row.some(c => c.state === CellState.REVEALED));
  if (!anyRevealed) {
    const hiddenCells = [];
    for (let y=0; y<board.rows; y++) for (let x=0; x<board.cols; x++) {
      const c = board.grid[y][x];
      if (c.state === CellState.HIDDEN) hiddenCells.push(c);
    }
    if (hiddenCells.length) {
      const pick = hiddenCells[Math.floor(Math.random()*hiddenCells.length)];
      revealCellWithTrace(board, pick.x, pick.y, actions);
      actions[actions.length-1].type = 'guess';
    }
  }
  while (iterations < maxIterations && board.status === 'playing') {
    // 優先使用進階推理
    const progressed = autoStepAdvanced(board, actions);
    if (!progressed) {
      if (!enableGuess) break;
      const candidates = [];
      for (let y=0; y<board.rows; y++) {
        for (let x=0; x<board.cols; x++) {
          const c = board.grid[y][x];
            if (c.state === CellState.HIDDEN) candidates.push(c);
        }
      }
      if (!candidates.length) break;
      const pick = candidates[Math.floor(Math.random()*candidates.length)];
      revealCellWithTrace(board, pick.x, pick.y, actions);
      actions[actions.length-1].type = 'guess';
    }
    iterations++;
  }
  return { actions, status: board.status };
}

export function createSnapshot(board) {
  return {
    rows: board.rows,
    cols: board.cols,
    cells: board.grid.map(row => row.map(c => ({
      x: c.x, y: c.y, mine: c.mine, adjacent: c.adjacent, date: c.date, contrib: c.contrib
    })))
  };
}

export function rebuildBoardFromSnapshot(snapshot, helpers) {
  const { createBoardStructure } = helpers;
  const b = createBoardStructure(snapshot.rows, snapshot.cols);
  for (let y=0; y<snapshot.rows; y++) {
    for (let x=0; x<snapshot.cols; x++) {
      const src = snapshot.cells[y][x];
      const dst = b.grid[y][x];
      dst.mine = src.mine;
      dst.adjacent = src.adjacent;
      dst.date = src.date;
      dst.contrib = src.contrib;
    }
  }
  return b;
}

// 包一層 revealCell 以攔截 flood 展開
export function revealCellWithTrace(board, x, y, actions) {
  const before = board.revealed;
  const wasStatus = board.status;
  revealCell(board, x, y);
  const after = board.revealed;
  if (actions) {
    if (board.status === 'lost' && wasStatus !== 'lost') {
      actions.push({ type:'reveal', x, y, result:'boom' });
    } else {
      actions.push({ type:'reveal', x, y, result:'safe' });
      const diff = after - before - 1; // flood 展開的額外 reveal 數
      if (diff > 0) {
        actions.push({ type:'flood', count: diff });
      }
    }
  }
}

export function applyAction(board, action) {
  if (board.status !== 'playing' && action.type !== 'meta') return;
  switch(action.type) {
    case 'reveal':
    case 'guess':
      if (board.grid[action.y][action.x].state === CellState.HIDDEN) {
        revealCell(board, action.x, action.y);
      }
      break;
    case 'flag':
      if (board.grid[action.y][action.x].state === CellState.HIDDEN) {
        toggleFlag(board, action.x, action.y);
      }
      break;
    case 'flood':
      // flood 只是資訊性，狀態已在 reveal 時完成
      break;
  }
}

export function applyActionsSequential(board, actions, onStep, interval=400) {
  let i = 0;
  return new Promise(resolve => {
    function next() {
      if (i >= actions.length) { resolve(); return; }
      const act = actions[i++];
      applyAction(board, act);
      onStep && onStep(act, i, actions.length);
      setTimeout(next, interval);
    }
    next();
  });
}
