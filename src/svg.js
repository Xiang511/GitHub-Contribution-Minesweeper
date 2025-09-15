// SVG generation (static board + animation) for Node environment
import { CellState, computeAdjacents, snapshotBoard, rebuildFromSnapshot, createBoardStructure } from './core.js';

const THEMES = {
  light: {
    name: 'Light',
    hidden: '#e9ebeeff',
    flagged: '#e9ebeeff',
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

export function listThemes(){ return Object.keys(THEMES); }
export function getTheme(key){ return THEMES[key] || THEMES.light; }

function blendColor(fg,bg,f){
  function hexToRgb(h){ const m=h.replace('#',''); return { r:parseInt(m.slice(0,2),16), g:parseInt(m.slice(2,4),16), b:parseInt(m.slice(4,6),16) }; }
  const F=hexToRgb(fg), B=hexToRgb(bg); const r=Math.round(F.r+(B.r-F.r)*f); const g=Math.round(F.g+(B.g-F.g)*f); const b=Math.round(F.b+(B.b-F.b)*f); const toHex=v=>v.toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function buildBoardSVG(board, { theme='light', lightenFactor=0.45 }={}){
  const th=getTheme(theme); const size=16, pad=2; const W=board.cols*(size+pad); const H=board.rows*(size+pad);
  let out=[]; out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:${th.bg};font-family:monospace">`);
  out.push(`<style>text{pointer-events:none;dominant-baseline:middle;font-size:11px;fill:${th.text}}</style>`);
  function colorFor(cell){
    if(cell.state===CellState.FLAGGED) return th.flagged; if(cell.state===CellState.HIDDEN) return th.hidden;
    if(cell.mine && board.status==='lost') return th.mineLost; if(cell.mine && board.status==='won') return th.mineWon;
    const c = cell.contrib||0; let base; if(c===0) base=th.contrib[0]; else if(c<3) base=th.contrib[1]; else if(c<6) base=th.contrib[2]; else if(c<10) base=th.contrib[3]; else base=th.contrib[4];
    if(cell.state===CellState.REVEALED && !cell.mine) return blendColor(base, th.bg, lightenFactor); return base;
  }
  function textFor(cell){ if(cell.state===CellState.FLAGGED) return th.flagEmoji; if(cell.state!==CellState.REVEALED) return ''; if(cell.mine) return th.mineEmoji; return cell.adjacent>0?String(cell.adjacent):''; }
  for(let y=0;y<board.rows;y++) for(let x=0;x<board.cols;x++){
    const cell=board.grid[y][x]; const px=x*(size+pad), py=y*(size+pad); const id=`c_${x}_${y}`;
    out.push(`<g id="g_${x}_${y}"><rect id="${id}" x="${px}" y="${py}" width="${size}" height="${size}" rx="3" fill="${colorFor(cell)}" stroke="${cell.state===CellState.FLAGGED?th.flagged:'none'}" stroke-width="${cell.state===CellState.FLAGGED?2:0}"/>`+
      `<text x="${px+size/2}" y="${py+size/2+2}" text-anchor="middle">${textFor(cell)}</text></g>`);
  }
  out.push('</svg>');
  return out.join('');
}

// Animation
export function buildAnimationSVG(snapshot, actions, { theme='light', cellSize=16, padding=2, stepSeconds=1, fadeDuration=0.25, lightenFactor=0.45, simultaneousFlood=true, loop=true }={}){
  const th=getTheme(theme); const rows=snapshot.rows, cols=snapshot.cols; const W=cols*(cellSize+padding), H=rows*(cellSize+padding);
  const sim = createBoardStructure(rows, cols); // clone snapshot meta
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){ const s=snapshot.cells[y][x]; const d=sim.grid[y][x]; d.mine=s.mine; d.adjacent=s.adjacent; d.contrib=s.contrib; d.date=s.date; }
  sim.status='playing';
  function colorForCell(c){ const v=c.contrib||0; if(v===0) return th.contrib[0]; if(v<3) return th.contrib[1]; if(v<6) return th.contrib[2]; if(v<10) return th.contrib[3]; return th.contrib[4]; }
  function floodReveal(sx,sy){ const stack=[[sx,sy]], seq=[]; while(stack.length){ const [cx,cy]=stack.pop(); if(cx<0||cy<0||cx>=sim.cols||cy>=sim.rows) continue; const cell=sim.grid[cy][cx]; if(cell.state===CellState.REVEALED||cell.state===CellState.FLAGGED) continue; cell.state=CellState.REVEALED; seq.push(cell); if(!cell.mine && cell.adjacent===0){ for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(dx||dy) stack.push([cx+dx,cy+dy]); } if(cell.mine) sim.status='lost'; } return seq; }
  const parts=[]; parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:${th.bg};font-family:monospace">`);
  parts.push(`<style>text{pointer-events:none;dominant-baseline:middle;font-size:11px;fill:${th.text}}</style>`);
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){ const px=x*(cellSize+padding), py=y*(cellSize+padding); const base=snapshot.cells[y][x]; const baseText=base.mine?th.mineEmoji:(base.adjacent>0?base.adjacent:''); parts.push(`<g id="g_${x}_${y}"><rect id="c_${x}_${y}" x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" rx="3" fill="${th.hidden}" stroke="none" stroke-width="0"/>`+`<text id="t_${x}_${y}" x="${px+cellSize/2}" y="${py+cellSize/2+2}" text-anchor="middle" opacity="0">${baseText}</text>`+`<text id="f_${x}_${y}" x="${px+cellSize/2}" y="${py+cellSize/2+2}" text-anchor="middle" opacity="0">${th.flagEmoji}</text></g>`); }
  const timeExpr = t => loop?`loopCtl.begin+${t}s`:`${t}s`;
  const animFill=(id,to,beg,d)=>`<animate href="#${id}" xlink:href="#${id}" attributeName="fill" to="${to}" begin="${timeExpr(beg)}" dur="${d}s" fill="freeze" />`;
  const animStroke=(id,name,to,beg,d)=>`<animate href="#${id}" xlink:href="#${id}" attributeName="${name}" to="${to}" begin="${timeExpr(beg)}" dur="${d}s" fill="freeze" />`;
  const animOpacity=(id,beg,d=fadeDuration,to=1)=>`<animate href="#${id}" xlink:href="#${id}" attributeName="opacity" to="${to}" begin="${timeExpr(beg)}" dur="${d}s" fill="freeze" />`;
  let current=0; const step=stepSeconds; const floodPerCell = simultaneousFlood?0: step/10;
  function emitCell(cell, at, boom){ const id=`c_${cell.x}_${cell.y}`; const txtId=`t_${cell.x}_${cell.y}`; const baseColor=colorForCell(cell); const finalColor = (cell.mine && (boom || sim.status==='lost')) ? th.mineLost : blendColor(baseColor, th.bg, lightenFactor); parts.push(animFill(id, finalColor, at, fadeDuration)); if(cell.mine || cell.adjacent>0) parts.push(animOpacity(txtId, at)); }
  function scheduleCells(cells, base){ if(!cells.length) return base+step; if(simultaneousFlood){ cells.forEach(c=>emitCell(c, base)); return base+step; } else { let t=base; cells.forEach(c=>{ emitCell(c,t); t+=floodPerCell; }); return Math.max(base+step, t); } }
  for(const act of actions){ if(!act || act.x==null || act.y==null){ current+=step; continue; } if(act.type==='flag'){ const id=`c_${act.x}_${act.y}`; parts.push(animFill(id, th.flagged, current, fadeDuration)); parts.push(animStroke(id,'stroke', th.flagged, current, fadeDuration)); parts.push(animStroke(id,'stroke-width',2, current, fadeDuration)); parts.push(animOpacity(`f_${act.x}_${act.y}`, current)); current+=step; continue; } if(act.type==='reveal' || act.type==='guess'){ const newly=floodReveal(act.x, act.y); const boom=act.result==='boom'; if(boom){ const first=newly.find(c=>c.mine) || sim.grid[act.y][act.x]; emitCell(first,current,true); newly.filter(c=>c!==first).forEach(c=>emitCell(c,current)); current+=step; } else { current=scheduleCells(newly,current); } continue; } if(act.type==='flood'){ current+=step; } }
  // 若沒有任何動作，提供一個 0.001s 假動畫以確保瀏覽器執行 SMIL (避免 total=0 不播放)
  if(actions.length===0){
    current = Math.max(current, stepSeconds); // 保證至少一個 step 時長
    parts.push(`<animate href="#c_0_0" xlink:href="#c_0_0" attributeName="opacity" from="1" to="1" begin="0s" dur="0.001s" fill="freeze" />`);
  }
  const total=current || stepSeconds; if(loop){ parts.splice(2,0,`<rect id="loopAnchor" width="0" height="0" x="-5" y="-5"><animate id="loopCtl" attributeName="x" from="-5" to="-5" dur="${total}s" begin="0s;loopCtl.end" /></rect>`); for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){ const id=`c_${x}_${y}`, tId=`t_${x}_${y}`, fId=`f_${x}_${y}`; parts.push(`<animate href="#${id}" xlink:href="#${id}" attributeName="fill" to="${th.hidden}" begin="loopCtl.end" dur="0.001s" fill="freeze" />`); parts.push(`<animate href="#${id}" xlink:href="#${id}" attributeName="stroke-width" to="0" begin="loopCtl.end" dur="0.001s" fill="freeze" />`); parts.push(`<animate href="#${id}" xlink:href="#${id}" attributeName="stroke" to="none" begin="loopCtl.end" dur="0.001s" fill="freeze" />`); parts.push(`<animate href="#${tId}" xlink:href="#${tId}" attributeName="opacity" to="0" begin="loopCtl.end" dur="0.001s" fill="freeze" />`); parts.push(`<animate href="#${fId}" xlink:href="#${fId}" attributeName="opacity" to="0" begin="loopCtl.end" dur="0.001s" fill="freeze" />`); } }
  parts.push('</svg>'); return parts.join('');
}
