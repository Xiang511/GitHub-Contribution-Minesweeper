// Solver (simplified advanced logic for Node)
import { CellState, iterateNeighbors, revealCell, toggleFlag } from './core.js';

export function autoStep(board, actions){
  if(board.status!=='playing') return false; let acted=false;
  for(let y=0;y<board.rows;y++) for(let x=0;x<board.cols;x++){
    const cell=board.grid[y][x]; if(cell.state!==CellState.REVEALED) continue; if(cell.adjacent<=0) continue;
    let hidden=[]; let flagged=0; iterateNeighbors(board,x,y,n=>{ if(n.state===CellState.HIDDEN) hidden.push(n); else if(n.state===CellState.FLAGGED) flagged++; });
    if(!hidden.length) continue;
    if(flagged===cell.adjacent){ hidden.forEach(h=>{ if(board.status==='playing' && h.state===CellState.HIDDEN){ revealCell(board,h.x,h.y); actions&&actions.push({type:'reveal',x:h.x,y:h.y,result: h.mine?'boom':'safe'}); acted=true; }}); }
    else if(flagged + hidden.length === cell.adjacent){ hidden.forEach(h=>{ if(h.state===CellState.HIDDEN){ toggleFlag(board,h.x,h.y); actions&&actions.push({type:'flag',x:h.x,y:h.y}); acted=true; }}); }
  }
  return acted;
}

export function autoSolve(board, maxIterations=10000, allowGuess=true){
  const actions=[]; let iterations=0;
  while(iterations<maxIterations && board.status==='playing'){
    const progressed = autoStep(board, actions);
    if(!progressed){
      if(!allowGuess) break;
      // 隨機挑一個 hidden 做猜測，增加動畫步驟
      const hidden=[]; for(let y=0;y<board.rows;y++) for(let x=0;x<board.cols;x++){ const c=board.grid[y][x]; if(c.state===CellState.HIDDEN) hidden.push(c);} 
      if(!hidden.length) break;
      const pick = hidden[Math.floor(Math.random()*hidden.length)];
      revealCell(board, pick.x, pick.y);
      actions.push({ type:'guess', x:pick.x, y:pick.y, result: pick.mine?'boom':'safe' });
    }
    iterations++;
  }
  return { actions, status: board.status };
}
