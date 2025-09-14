// 取得 GitHub 使用者最近一年的貢獻資料並轉為結構化陣列
// 避免使用 GitHub API token，直接抓取使用者 profile 上的 contributions SVG

import { boardDimensionsFromContributionData, createBoardStructure, indexToCoord } from './minesweeper-types.js';

/**
 * 抓取 GitHub 貢獻 (近一年) - 回傳陣列: [{date: '2024-09-14', count: 3}, ...]
 * @param {string} username
 * @returns {Promise<Array<{date:string,count:number}>>}
 */
// 直接抓取 GitHub contributions SVG (可選 from/to 日期)
export async function fetchContributions(username, { from = null, to = null } = {}) {
  const params = [];
  if (from) params.push(`from=${from}`);
  if (to) params.push(`to=${to}`);
  const qs = params.length ? `?${params.join('&')}` : '';
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions${qs}`;
  const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`GitHub 回應失敗 ${res.status}`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rects = doc.querySelectorAll('svg rect[data-date]');
  if (!rects.length) throw new Error('找不到貢獻資料 (可能使用者不存在)');
  const days = Array.from(rects).map(r => ({
    date: r.getAttribute('data-date'),
    count: Number(r.getAttribute('data-count') || '0')
  }));
  return days;
}

/**
 * 依貢獻資料建立初步棋盤 (尚未放雷)，保留日期與貢獻數
 */
export function mapContributionsToBoard(days) {
  const { rows, cols } = boardDimensionsFromContributionData(days);
  const board = createBoardStructure(rows, cols);
  days.forEach((d, idx) => {
    const { x, y } = indexToCoord(idx, cols);
    if (y < rows && x < cols) {
      board.grid[y][x].date = d.date;
      board.grid[y][x].contrib = d.count;
    }
  });
  return board;
}

/**
 * 依貢獻密度配置地雷：低貢獻格優先成雷
 * 策略：
 *  1. 取得所有格子貢獻值 (contrib) -> 排序
 *  2. 設定地雷總數 = floor(totalPlayable * ratio)
 *  3. 以加權抽樣：權重 = (maxContrib - contrib + 1)
 * 可選模式：若 allZero 則均勻隨機
 * @param board
 * @param {number} ratio 0~1 建議 0.15
 * @param {number} seed 可選，未實作固定 seed（可延伸）
 */
export function placeMinesByContribution(board, ratio = 0.15) {
  const cells = board.grid.flat().filter(c => c.date); // 只放有日期的格子
  const total = cells.length;
  const minesTarget = Math.max(1, Math.floor(total * ratio));
  const contribValues = cells.map(c => c.contrib);
  const max = Math.max(...contribValues, 0);
  const min = Math.min(...contribValues, 0);
  const allZero = max === 0 && min === 0;
  // 權重設計：低貢獻 => 高權重
  function weight(c) {
    if (allZero) return 1;
    return (max - c.contrib + 1); // 至少 1
  }
  let remaining = minesTarget;
  // 以 Roulette Wheel 抽樣避免重複：每次抽一個
  while (remaining > 0) {
    const totalWeight = cells.reduce((sum, c) => !c.mine ? sum + weight(c) : sum, 0);
    if (totalWeight === 0) break;
    let r = Math.random() * totalWeight;
    for (const c of cells) {
      if (c.mine) continue;
      const w = weight(c);
      if (r < w) {
        c.mine = true;
        remaining--;
        break;
      }
      r -= w;
    }
  }
  board.mines = minesTarget - remaining;
  return board;
}

/**
 * 產生模擬貢獻資料
 * @param {number} days 天數，預設 364 天
 * @returns {Array<{date:string,count:number}>}
 */
export function generateMockContributions(days = 364) {
  const today = new Date();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wd = d.getDay();
    let base = (wd === 0 || wd === 6) ? 0 : 2 + Math.floor(Math.random() * 6);
    if (Math.random() < 0.1) base = 0;
    result.push({ date: d.toISOString().slice(0,10), count: base });
  }
  result.mock = true;
  return result;
}

/**
 * 抓取 GitHub 貢獻資料，失敗時可選擇回傳模擬資料
 * @param {string} username
 * @param {boolean} useMockOnError 失敗時是否使用模擬資料
 * @returns {Promise<Array<{date:string,count:number}>>}
 */
// 透過第三方 API (grubersjoe/github-contributions-api) 取得 JSON
// 回傳格式轉為與其他函式一致: [{date,count}]
export async function fetchContributionsViaAPI(username) {
  const url = `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`API 回應失敗 ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`API 錯誤: ${data.error}`);
  // 可能格式：{ years:[{year:2025, contributions:[{date,count},...]}, ...] }
  // 或未來擴充: { contributions:[{date,count},...]} 直接給一年
  let contributions = [];
  if (Array.isArray(data.years) && data.years.length) {
    // 取年份最大者
    const sorted = [...data.years].sort((a,b)=> b.year - a.year);
    const latest = sorted[0];
    if (latest && Array.isArray(latest.contributions)) contributions = latest.contributions;
  } else if (Array.isArray(data.contributions)) {
    contributions = data.contributions;
  }
  if (!contributions.length) throw new Error('API 資料格式不符 (無 contributions)');
  return contributions.map(c => ({ date: c.date, count: c.count }));
}

// 智慧抓取：優先使用 JSON API (更準確包含 private? 仍可能不含)，失敗再回退 HTML，再失敗 mock
export async function fetchContributionsSmart(username, { from = null, to = null, useMockOnError = true } = {}) {
  // 1. API
  try {
    const apiDays = await fetchContributionsViaAPI(username);
    if (from || to) {
      return apiDays.filter(d => (!from || d.date >= from) && (!to || d.date <= to));
    }
    return apiDays;
  } catch (e) {
    console.warn('[info] API 失敗: ', e.message);
  }
  // 2. HTML
  try {
    return await fetchContributions(username, { from, to });
  } catch (e2) {
    console.warn('[info] HTML 抓取失敗: ', e2.message);
    if (!useMockOnError) throw e2;
  }
  // 3. Mock
  console.warn('[info] 使用 mock 資料');
  return generateMockContributions();
}

export async function fetchContributionsWithFallback(username, useMockOnError = true) {
  return fetchContributionsSmart(username, { useMockOnError });
}

/**
 * 將任意 days 陣列對齊為最近 52 週 (364~371 天) 以『週日』開頭：
 * 1. 找出資料中最大日期 (視為 today 基準)；若無則回傳 []。
 * 2. 目標結尾 = 該最大日期；目標開始 = 該日期往前 51 週再回到週日。
 * 3. 產生從開始到結尾所有日期列表，無資料補 count:0。
 * 4. 回傳填滿後陣列。
 * 備註：GitHub 可能顯示 53 週（371 天）趨近一年，這裡固定向後推 52 週對齊週日，覆蓋最常見視覺寬度。
 * @param {Array<{date:string,count:number}>} days
 * @returns {Array<{date:string,count:number}>}
 */
export function normalizeTrailingYear(days) {
  if (!Array.isArray(days) || !days.length) return [];
  // 將字串日期轉成 Date 物件並找最大
  const parsed = days.map(d => ({ ...d, _d: new Date(d.date + 'T00:00:00Z') }));
  parsed.sort((a,b) => a._d - b._d);
  const latest = parsed[parsed.length - 1]._d; // UTC 基準
  // 找 latest 所在週的週日 (GitHub 以週日為列 0)
  const latestWeekday = latest.getUTCDay(); // 0=Sun
  const end = new Date(latest); // inclusive
  // start: 往前 52 週 (364 天) -> 先 - (7*52 -1) 天 再調整到週日
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (7 * 52 - 1)); // 包含 end 共 364 天
  // 對齊 start 到最近的週日
  while (start.getUTCDay() !== 0) {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  // 建立日期 map 方便查詢
  const map = new Map(parsed.map(d => [d.date, d.count]));
  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0,10);
    out.push({ date: iso, count: map.get(iso) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * 將資料限制為指定西元年度 (calendar year) 並補齊缺少日期為 0
 * @param {number} year
 * @param {Array<{date:string,count:number}>} days
 */
export function normalizeCalendarYear(year, days) {
  if (!Array.isArray(days) || !days.length) return [];
  const start = new Date(Date.UTC(year,0,1));
  const end = new Date(Date.UTC(year,11,31));
  const map = new Map(days.filter(d => d.date.startsWith(String(year))).map(d => [d.date, d.count]));
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0,10);
    out.push({ date: iso, count: map.get(iso) ?? 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
