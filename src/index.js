// Public API
export * from './core.js';
export * from './svg.js';
export * from './solver.js';

import { fetchContributionsSmart, normalizeTrailingYear, normalizeCalendarYear, mapContributionsToBoard, placeMinesByContribution, computeAdjacents, snapshotBoard, safeRevealCell } from './core.js';
import { buildBoardSVG, buildAnimationSVG } from './svg.js';
import { autoSolve } from './solver.js';

/**
 * Generate board SVG from GitHub contributions.
 */
export async function generateBoardSVG({ username, ratio=0.1, year=null, trailing=true, theme='light', lightenFactor=0.45, useMockOnError=true, source='auto' }){
  if(!username) throw new Error('username required');
  let days = await fetchContributionsSmart(username, { useMockOnError, source });
  if(year) days = normalizeCalendarYear(year, days); else if(trailing) days = normalizeTrailingYear(days);
  const board = mapContributionsToBoard(days);
  placeMinesByContribution(board, ratio); computeAdjacents(board);
  return buildBoardSVG(board, { theme, lightenFactor });
}

/**
 * Generate replay animation SVG by auto solving (simple strategy).
 */
export async function generateAnimationSVG({ username, ratio=0.1, year=null, trailing=true, theme='light', lightenFactor=0.45, stepSeconds=1, fadeDuration=0.25, speed=1, simultaneousFlood=true, loop=true, useMockOnError=true, source='auto' }){
  if(!username) throw new Error('username required');
  let days = await fetchContributionsSmart(username, { useMockOnError, source });
  if(year) days = normalizeCalendarYear(year, days); else if(trailing) days = normalizeTrailingYear(days);
  const board = mapContributionsToBoard(days);
  placeMinesByContribution(board, ratio); computeAdjacents(board);
  // 使用 safeRevealCell 確保第一步為零區（若可能）
  let firstCell = null;
  outer: for(let y=0;y<board.rows;y++) for(let x=0;x<board.cols;x++){ const c=board.grid[y][x]; if(c.date){ firstCell = c; safeRevealCell(board, x, y); break outer; } }
  let { actions } = autoSolve(board, 5000, true);
  // 確保至少有第一步記錄
  if(actions.length === 0 && firstCell){
    actions.push({ type:'reveal', x:firstCell.x, y:firstCell.y, result: firstCell.mine ? 'boom':'safe' });
  }
  // 若仍無動作，建立 fallback：依序揭開所有有日期的格子形成動畫
  if(!actions.length){
    for(let y=0;y<board.rows;y++) for(let x=0;x<board.cols;x++){
      const c=board.grid[y][x]; if(!c.date) continue; if(c.state!== 'revealed'){ revealCell(board, x, y); }
      actions.push({ type:'reveal', x, y, result: c.mine?'boom':'safe' });
      if(actions.length >= 50) break; // 避免過長
    }
  }
  const snap = snapshotBoard(board);
  const effStep = stepSeconds / (speed || 1);
  const effFade = fadeDuration / (speed || 1);
  return buildAnimationSVG(snap, actions, { theme, lightenFactor, stepSeconds: effStep, fadeDuration: effFade, simultaneousFlood, loop });
}

export const OPTION_DOC = {
  generateBoardSVG: {
    username: 'GitHub username (required)',
    ratio: 'Mine ratio 0.01~0.5 (default 0.1)',
    year: 'Specific year (number). If set, calendar-year normalization is used.',
    trailing: 'If true (default) and year not set, normalize to trailing 52 weeks',
    theme: 'light | dark',
    lightenFactor: '0~1 lighten revealed safe cells (default 0.45)',
    useMockOnError: 'Use synthetic data if network fetch fails (default true)'
  , source: "Data source: 'auto' (api->html->mock), 'api', 'html', 'mock' (default 'auto')"
  },
  generateAnimationSVG: {
    username: 'GitHub username (required)',
    ratio: 'Mine ratio 0.01~0.5 (default 0.1)',
    year: 'Specific year (number)',
    trailing: 'Trailing 52 weeks if true (default true)',
    theme: 'light | dark',
    lightenFactor: '0~1 lighten revealed safe cells (default 0.45)',
    stepSeconds: 'Seconds per logical action (default 1)',
    fadeDuration: 'Fade animation duration per cell (default 0.25)',
    simultaneousFlood: 'true: flood cells appear together (default true)',
    loop: 'Loop animation (default true)',
  useMockOnError: 'Use synthetic data if fetch fails (default true)',
  source: "Data source: 'auto' | 'api' | 'html' | 'mock' (default 'auto')"
  }
};
