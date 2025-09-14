# GitHub Contribution Minesweeper

![Stars](https://img.shields.io/github/stars/xiang511/GitHub-Contribution-Minesweeper?style=flat-square)
![Language](https://img.shields.io/badge/i18n-zh%2Fen-informational?style=flat-square)
![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)
![Minesweeper](https://img.shields.io/badge/game-minesweeper-9be9a8?style=flat-square)
![SVG](https://img.shields.io/badge/export-SVG%20animation-30a14e?style=flat-square)





Turn your (last 52 weeks or a specific year) GitHub contribution heatmap into a Minesweeper board. 
Low contribution days are more likely to hide mines, active days are usually safer. Includes advanced auto-solver, replay, and exportable animated SVG.

## Features
- Weighted mine placement based on contribution counts (configurable ratio, default 0.1)
- First click always safe + zero-area flood expansion
- Advanced solving: basic rules + subset difference inference + small frontier state enumeration + probabilistic lowest-risk guessing
- Replay with progress bar
- Export static board SVG and animated replay SVG (looping + speed control 0.25x ~ 32x)
- Light / Dark themes
- Original contribution heatmap with month / week labels
- Strict mode: disable mock fallback if GitHub fetch fails

## How to Use
1. Serve the folder with any static server (VS Code Live Server / Five Server etc.).
2. Enter a GitHub username.
3. (Optional) Enter a year (e.g. 2024) → uses Jan 1 ~ Dec 31 of that year (normalized); leave empty for trailing 52 weeks.
4. Adjust mine ratio.
5. Enable Strict Mode to forbid mock data (fetch failure will error out).
6. Click Load / Rebuild.
7. Left click to reveal, right click to flag.
8. Control buttons:
   - Auto Step: one inference pass
   - Auto Run: repeated basic inference
   - Auto Solve: advanced solver until completion
   - Replay: play back last auto-solve actions (uses speed select)
   - Export Board SVG: current static board
   - Export Replay SVG: animated SVG (loop capable)
9. Speed select controls both replay pacing and exported animation step duration.

## Advanced Animation Options (exportReplayAnimation)
| Option | Default | Description |
|--------|---------|-------------|
| `stepSeconds` | 1 | Seconds per logical step (UI maps speed = 1/stepSeconds) |
| `fadeDuration` | 0.25 | Color / text fade-in duration per step |
| `simultaneousFlood` | true | If true flood reveals appear together; false = staggered |
| `lightenFactor` | 0.45 | Blend factor for revealed safe cells toward theme background (0~1) |
| `loop` | true | Auto replay animation | 

## Solver Logic Summary
- Basic: if number = flagged → open others; if flagged + hidden = number → flag hidden.
- Subset Difference: If constraint A ⊆ B and same mine count → (B \ A) safe; if (B.mines - A.mines) = |B \ A| then (B \ A) all mines.
- Group Enumeration: Merge overlapping constraints, enumerate groups with ≤12 unknowns, count valid assignments for probabilities.
- Probabilistic Guess: pick cell with lowest mine probability (tie-break: farther from center / random), reducing forced blind luck.

## Project Structure
```
index.html                # UI + controls
svg-creator.js            # Board + animation SVG generation / export
minesweeper-types.js      # Data structures + reveal / flag logic
auto-player.js            # Auto solver, inference, replay action logging
github-integration.js     # Contribution fetch + normalization
contributions-chart.js    # Contribution heatmap rendering
```

## Development Notes
- Plain ES Modules; no bundler required.
- Theme + revealed cell blending in `svg-creator.js`.
- Solver internals in `auto-player.js`; you can extend with SAT / ILP or global probability models.

## Inspiration / References
- [GitHub Mines Browser Extension](https://github.com/bgonp/github-mines-extension)
- [GitHub Contributions API v4](https://github.com/grubersjoe/github-contributions-api)
- [snk](https://github.com/Platane/snk)

## License

Apache-2.0 
