// Core logic extracted for Node usage (no DOM access)
import fetch from 'node-fetch';

export const CellState = Object.freeze({
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  FLAGGED: 'flagged'
});

export function createEmptyCell(x,y,date=null, contrib=0){
  return { x,y,mine:false,adjacent:0,state:CellState.HIDDEN,date,contrib };
}
export function createBoardStructure(rows, cols){
  const grid=[]; for(let y=0;y<rows;y++){ const row=[]; for(let x=0;x<cols;x++) row.push(createEmptyCell(x,y)); grid.push(row);} 
  return { rows, cols, grid, mines:0, revealed:0, flags:0, status:'playing' };
}
export function boardDimensionsFromContributionData(days){
  return { rows:7, cols: Math.ceil(days.length/7) };
}
export function indexToCoord(index, cols){
  const x = Math.floor(index/7); const y = index % 7; return { x,y };
}
export function iterateNeighbors(board,x,y,cb){
  for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){
    if(!dx && !dy) continue; const nx=x+dx, ny=y+dy; if(nx>=0&&nx<board.cols&&ny>=0&&ny<board.rows) cb(board.grid[ny][nx]);
  }
}
export function computeAdjacents(board){
  for(let y=0;y<board.rows;y++) for(let x=0;x<board.cols;x++){
    const cell=board.grid[y][x]; if(cell.mine){ cell.adjacent=-1; continue; }
    let c=0; iterateNeighbors(board,x,y,n=>{ if(n.mine) c++; }); cell.adjacent=c; }
}
export function floodReveal(board,start){
  const st=[start]; const vis=new Set();
  while(st.length){ const cell = st.pop(); const k=cell.x+':'+cell.y; if(vis.has(k)) continue; vis.add(k);
    if(cell.state===CellState.REVEALED||cell.state===CellState.FLAGGED) continue;
    cell.state=CellState.REVEALED; board.revealed++; if(cell.adjacent===0){
      iterateNeighbors(board,cell.x,cell.y,n=>{ if(n.state===CellState.HIDDEN) st.push(n); });
    }
  }
}
export function checkWin(board){
  if(board.status!=='playing') return; const total=board.rows*board.cols;
  if(board.revealed === total - board.mines) board.status='won';
}
export function revealCell(board,x,y){
  if(board.status!=='playing') return; const cell=board.grid[y][x]; if(cell.state!==CellState.HIDDEN) return;
  if(cell.mine){ cell.state=CellState.REVEALED; board.status='lost'; return; }
  floodReveal(board, cell); checkWin(board);
}
export function toggleFlag(board,x,y){
  if(board.status!=='playing') return; const cell=board.grid[y][x]; if(cell.state===CellState.REVEALED) return;
  if(cell.state===CellState.HIDDEN){ cell.state=CellState.FLAGGED; board.flags++; }
  else if(cell.state===CellState.FLAGGED){ cell.state=CellState.HIDDEN; board.flags--; }
}
export function isFirstMove(board){ return board.revealed===0; }
export function ensureFirstZeroArea(board,x,y){
  const start=board.grid[y][x]; if(start.mine) return; computeAdjacents(board); if(start.adjacent===0) return;
  const neighbors=[]; iterateNeighbors(board,x,y,n=>neighbors.push(n)); const neighborMines=neighbors.filter(n=>n.mine);
  if(!neighborMines.length) return; const forbidden=new Set([start,...neighbors]);
  const candidates=board.grid.flat().filter(c=>c.date && !c.mine && !forbidden.has(c));
  if(candidates.length < neighborMines.length) return;
  for(let i=0;i<neighborMines.length;i++){ neighborMines[i].mine=false; candidates[i].mine=true; }
  computeAdjacents(board);
}
export function safeRevealCell(board,x,y){
  const first=isFirstMove(board); const cell=board.grid[y][x]; if(!first){ revealCell(board,x,y); return; }
  if(cell.mine){ const swap = board.grid.flat().find(c=>c.date && !c.mine && c!==cell); if(swap){ cell.mine=false; swap.mine=true; }}
  ensureFirstZeroArea(board,x,y); revealCell(board,x,y);
}

export function mapContributionsToBoard(days){
  const { rows, cols } = boardDimensionsFromContributionData(days); const board=createBoardStructure(rows, cols);
  days.forEach((d,i)=>{ const {x,y}=indexToCoord(i, cols); if(y<rows && x<cols){ board.grid[y][x].date=d.date; board.grid[y][x].contrib=d.count; }});
  return board;
}

export function placeMinesByContribution(board, ratio=0.15){
  const cells = board.grid.flat().filter(c=>c.date); const total=cells.length; const minesTarget=Math.max(1, Math.floor(total*ratio));
  const contribValues=cells.map(c=>c.contrib); const max=Math.max(...contribValues,0); const min=Math.min(...contribValues,0); const allZero=max===0 && min===0;
  const weight=c=> allZero?1:(max - c.contrib + 1); let remaining=minesTarget;
  while(remaining>0){ const totalWeight=cells.reduce((s,c)=>!c.mine?s+weight(c):s,0); if(!totalWeight) break; let r=Math.random()*totalWeight; for(const c of cells){ if(c.mine) continue; const w=weight(c); if(r<w){ c.mine=true; remaining--; break; } r-=w; }}
  board.mines = minesTarget - remaining; return board;
}

export function normalizeTrailingYear(days){
  if(!Array.isArray(days)||!days.length) return []; const parsed=days.map(d=>({...d,_d:new Date(d.date+'T00:00:00Z')})); parsed.sort((a,b)=>a._d-b._d);
  const latest=parsed[parsed.length-1]._d; const end=new Date(latest); const start=new Date(end); start.setUTCDate(start.getUTCDate() - (7*52 -1)); while(start.getUTCDay()!==0) start.setUTCDate(start.getUTCDate()-1);
  const map=new Map(parsed.map(d=>[d.date,d.count])); const out=[]; const cur=new Date(start); while(cur<=end){ const iso=cur.toISOString().slice(0,10); out.push({date:iso,count:map.get(iso)??0}); cur.setUTCDate(cur.getUTCDate()+1);} return out;
}
export function normalizeCalendarYear(year, days){
  if(!Array.isArray(days)||!days.length) return []; const start=new Date(Date.UTC(year,0,1)); const end=new Date(Date.UTC(year,11,31));
  const map=new Map(days.filter(d=>d.date.startsWith(String(year))).map(d=>[d.date,d.count])); const out=[]; const cur=new Date(start);
  while(cur<=end){ const iso=cur.toISOString().slice(0,10); out.push({date:iso,count:map.get(iso)??0}); cur.setUTCDate(cur.getUTCDate()+1);} return out;
}

// --- HTML scraping ---
export async function fetchContributionsHTML(username,{from=null,to=null}={}){
  const params=[]; if(from) params.push(`from=${from}`); if(to) params.push(`to=${to}`); const qs=params.length?`?${params.join('&')}`:'';
  const url=`https://github.com/users/${encodeURIComponent(username)}/contributions${qs}`; const res=await fetch(url,{ headers:{Accept:'text/html'} }); if(!res.ok) throw new Error('Fetch failed '+res.status); const html=await res.text();
  const rectRegex=/<rect[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-count="(\d+)"[^>]*>/g; const out=[]; let m; while((m=rectRegex.exec(html))){ out.push({date:m[1],count:Number(m[2])}); }
  if(!out.length) throw new Error('No contributions'); return out;
}

// --- Public API (grubersjoe) ---
export async function fetchContributionsViaAPI(username){
  const url = `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers:{Accept:'application/json'} });
  if(!res.ok) throw new Error('API failed '+res.status);
  const data = await res.json();
  let contributions=[];
  if(Array.isArray(data.years) && data.years.length){
    const latest = [...data.years].sort((a,b)=>b.year-a.year)[0];
    if(latest && Array.isArray(latest.contributions)) contributions = latest.contributions;
  } else if(Array.isArray(data.contributions)) contributions = data.contributions;
  if(!contributions.length) throw new Error('API empty');
  return contributions.map(c=>({ date:c.date, count:c.count }));
}
export function generateMockContributions(days=364){
  const today=new Date(); const result=[]; for(let i=days-1;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); const wd=d.getDay(); let base=(wd===0||wd===6)?0:2+Math.floor(Math.random()*6); if(Math.random()<0.1) base=0; result.push({date:d.toISOString().slice(0,10),count:base}); } result.mock=true; return result;
}
/**
 * Fetch contributions with strategy.
 * source: 'api' | 'html' | 'auto' | 'mock'
 * auto: try api -> html -> mock (if allowed)
 */
export async function fetchContributionsSmart(username,{from=null,to=null,useMockOnError=true, source='auto'}={}){
  async function maybeSlice(days){
    if(from || to) return days.filter(d => (!from || d.date>=from) && (!to || d.date<=to));
    return days;
  }
  if(source==='mock') return generateMockContributions();
  if(source==='api'){
    try { return await maybeSlice(await fetchContributionsViaAPI(username)); } catch(e){ if(!useMockOnError) throw e; if(!useMockOnError) throw e; return generateMockContributions(); }
  }
  if(source==='html'){
    try { return await fetchContributionsHTML(username,{from,to}); } catch(e){ if(!useMockOnError) throw e; return generateMockContributions(); }
  }
  // auto
  try { return await maybeSlice(await fetchContributionsViaAPI(username)); } catch(e){ /* fallthrough */ }
  try { return await fetchContributionsHTML(username,{from,to}); } catch(e){ if(!useMockOnError) throw e; }
  return generateMockContributions();
}

export function snapshotBoard(board){
  return { rows:board.rows, cols:board.cols, cells: board.grid.map(r=>r.map(c=>({x:c.x,y:c.y,mine:c.mine,adjacent:c.adjacent,date:c.date,contrib:c.contrib}))) };
}
export function rebuildFromSnapshot(snap){
  const b=createBoardStructure(snap.rows,snap.cols); for(let y=0;y<snap.rows;y++) for(let x=0;x<snap.cols;x++){ const src=snap.cells[y][x]; const dst=b.grid[y][x]; dst.mine=src.mine; dst.adjacent=src.adjacent; dst.date=src.date; dst.contrib=src.contrib; }
  return b;
}
