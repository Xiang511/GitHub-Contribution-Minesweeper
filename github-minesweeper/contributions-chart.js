import { getTheme } from './svg-creator.js';

/**
 * 將 days 資料 (date,count) 繪製成迷你 GitHub 風格貢獻圖 (SVG)
 * @param {Array<{date:string,count:number}>} days
 * @param {HTMLElement} mount
 */
export function renderContributionChart(days, mount) {
  if (!days || !days.length) { mount.textContent = '無貢獻資料'; return; }
  mount.innerHTML = '';
  const th = getTheme();
  const rows = 7;
  const cols = Math.ceil(days.length / 7);
  const size = 12; const pad = 2;
  const leftLabelWidth = 24; // 給星期文字
  const topLabelHeight = 16; // 給月份文字
  const w = leftLabelWidth + cols * (size + pad);
  const h = topLabelHeight + rows * (size + pad);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.style.fontFamily = 'monospace';
  // 簡單取得最大值做分層
  const max = days.reduce((m,d)=>Math.max(m,d.count),0);
  function levelColor(v){
    if (max === 0) return th.contrib[0];
    const ratio = v / max;
    if (ratio === 0) return th.contrib[0];
    if (ratio < 0.25) return th.contrib[1];
    if (ratio < 0.5) return th.contrib[2];
    if (ratio < 0.75) return th.contrib[3];
    return th.contrib[4];
  }
  // 月份標籤：當第一列 (row=0) 且該週第一天 (col 變化) 並且月份改變時顯示
  const monthSeen = new Set();
  days.forEach((d,i)=>{
    const col = Math.floor(i / 7);
    const row = i % 7;
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('x', String(leftLabelWidth + col * (size + pad)));
    rect.setAttribute('y', String(topLabelHeight + row * (size + pad)));
    rect.setAttribute('width', String(size));
    rect.setAttribute('height', String(size));
    rect.setAttribute('rx','2');
    rect.setAttribute('fill', levelColor(d.count));
    rect.setAttribute('data-date', d.date);
    rect.setAttribute('data-count', String(d.count));
    rect.title = `${d.date}: ${d.count}`;
    svg.appendChild(rect);

    if (row === 0) {
      const m = d.date.slice(5,7); // 月份
      if (!monthSeen.has(m)) {
        monthSeen.add(m);
        const tx = document.createElementNS('http://www.w3.org/2000/svg','text');
        tx.setAttribute('x', String(leftLabelWidth + col * (size + pad)));
        tx.setAttribute('y', String(12));
        tx.setAttribute('fill', th.text);
        tx.setAttribute('font-size','10');
        tx.textContent = String(Number(m));
        svg.appendChild(tx);
      }
    }
  });

  // 星期標籤（顯示週一 週三 週五）GitHub 類似 Mon Wed Fri
  const weekLabels = [ { y:1, text:'Mon' }, { y:3, text:'Wed' }, { y:5, text:'Fri' } ];
  weekLabels.forEach(l => {
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', String(leftLabelWidth - 4));
    t.setAttribute('y', String(topLabelHeight + l.y * (size + pad) + size/2 + 4));
    t.setAttribute('text-anchor','end');
    t.setAttribute('fill', th.text);
    t.setAttribute('font-size','10');
    t.textContent = l.text;
    svg.appendChild(t);
  });
  mount.appendChild(svg);

  // 建立 tooltip (絕對定位 div)
  let tooltip = mount.querySelector('.contrib-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'contrib-tooltip';
    Object.assign(tooltip.style, {
      position:'fixed',
      pointerEvents:'none',
      background: th.bg,
      color: th.text,
      border: `1px solid ${th.text}33`,
      padding:'4px 6px',
      fontSize:'12px',
      fontFamily:'system-ui,monospace',
      borderRadius:'4px',
      boxShadow:'0 2px 6px #00000022',
      zIndex:9999,
      display:'none',
      whiteSpace:'nowrap'
    });
    document.body.appendChild(tooltip);
  }
  function showTip(e, date, count){
    tooltip.style.display = 'block';
    tooltip.textContent = `${date}: ${count}`;
    const offset = 12;
    tooltip.style.left = (e.clientX + offset) + 'px';
    tooltip.style.top = (e.clientY + offset) + 'px';
  }
  function hideTip(){ tooltip.style.display = 'none'; }
  svg.querySelectorAll('rect[data-date]').forEach(r => {
    r.addEventListener('mousemove', e => {
      showTip(e, r.getAttribute('data-date'), r.getAttribute('data-count'));
    });
    r.addEventListener('mouseleave', hideTip);
  });
}

export function updateContributionChart(days, mount){
  if (!mount.querySelector('svg')) { renderContributionChart(days, mount); return; }
  const th = getTheme();
  const rects = mount.querySelectorAll('rect[data-date]');
  const max = days.reduce((m,d)=>Math.max(m,d.count),0);
  function levelColor(v){
    if (max === 0) return th.contrib[0];
    const ratio = v / max;
    if (ratio === 0) return th.contrib[0];
    if (ratio < 0.25) return th.contrib[1];
    if (ratio < 0.5) return th.contrib[2];
    if (ratio < 0.75) return th.contrib[3];
    return th.contrib[4];
  }
  const map = new Map(days.map(d=>[d.date,d.count]));
  rects.forEach(r=>{
    const date = r.getAttribute('data-date');
    const v = map.get(date) || 0;
    r.setAttribute('fill', levelColor(v));
  r.setAttribute('data-count', String(v));
  });
}
