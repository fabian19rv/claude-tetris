# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build step, no package.json. The entire game logic lives in `game.js` (~300 lines); `index.html` holds the DOM/canvas structure; `style.css` is the dark/retro visual theme.

## Running the game

There is no build or test tooling. To run/preview changes, just serve the static files:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`. Opening `index.html` directly in a browser also works (no bundler/transpiler involved).

## Architecture

Everything (state, update loop, rendering, input) lives in `game.js` as module-level globals and functions — there is no component/class structure.

- **Board model**: `board` is a `ROWS × COLS` matrix (10×20); each cell is `0` (empty) or a color index 1–7 identifying which piece locked there.
- **Pieces**: `PIECES` defines the 7 tetrominoes as square matrices. Rotation is done via `rotateCW` (transpose + reverse rows), not precomputed rotation states.
- **Collision**: `collide(shape, ox, oy)` checks board bounds and overlap against the current `board` — called before every move/rotate/drop.
- **Wall kicks**: `tryRotate()` rotates then tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, else the rotation is discarded.
- **Game loop**: `loop(ts)` runs on `requestAnimationFrame`, accumulates `dt` into `dropAccum`, and advances the piece down once `dropAccum >= dropInterval`; otherwise calls `lockPiece()`.
- **Locking/clearing**: `lockPiece()` → `merge()` (writes piece into `board`) → `clearLines()` (scans bottom-up, splices full rows, unshifts empty rows, updates score/level/dropInterval) → `spawn()` (promotes `next` to `current`, generates a new `next`, checks for game-over collision at spawn).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points/row traveled, soft drop adds 1 point/row.
- **Level/speed**: level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1) * 90)` ms.
- **Rendering**: `draw()` clears and redraws grid, locked board, ghost piece (`ghostY()` projects straight down, drawn at `globalAlpha = 0.2`), and the current piece, every frame. `drawNext()` renders the preview piece on a separate `next-canvas`.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `X` to rotate, `Space` for hard drop, `P` to pause); ignored when `paused` or `gameOver`.

### Tunable constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK` (cell pixel size), `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, also update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
