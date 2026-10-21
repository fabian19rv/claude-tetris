'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#9fa8da', // J - pale indigo
  '#ffb74d', // L - orange
  '#f06292', // Plus (+) - pink
  '#4db6ac', // U - teal
  '#7986cb', // Y - indigo
  '#fff59d', // Single (recompensa) - dorado pálido
  '#78909c', // 3x3 hueca (reto) - gris azulado
  '#ff8a65', // Bomba - naranja quemado
  '#fff176', // Rayo - amarillo eléctrico
  '#f48fb1', // Tinte - rosa pastel
  '#80cbc4', // Gravedad - verde azulado
  '#90caf9', // Congelar - celeste hielo
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // Plus (+)
  [[9,0,9],[9,9,9]],                          // U
  [[0,10,0,0],[10,10,10,10]],                 // Y
  [[11]],                                     // Single (1x1, recompensa tras Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hueca (reto)
  [[13]],                                     // Bomba (power-up)
  [[14]],                                     // Rayo (power-up)
  [[15]],                                     // Tinte (power-up)
  [[16]],                                     // Gravedad (power-up)
  [[17]],                                     // Congelar (power-up)
];

const SPECIAL_TYPES = [8, 9, 10, 12]; // pentominós + reto; el single (11) solo sale como recompensa
const SPECIAL_CHANCE = 0.15;
const REWARD_TYPE = 11;

const BOMB = 13, LIGHTNING = 14, DYE = 15, GRAVITY = 16, FREEZE = 17;
const POWERUP_TYPES = [BOMB, LIGHTNING, DYE, GRAVITY, FREEZE];
const POWERUP_CHANCE = 0.06; // independiente de SPECIAL_CHANCE
const POWERUP_ICONS = { 13: '💣', 14: '⚡', 15: '🎨', 16: '⬇', 17: '❄' };
const POWERUP_NAMES = { 13: 'BOMBA', 14: 'RAYO', 15: 'TINTE', 16: 'GRAVEDAD', 17: 'CONGELAR' };
const FREEZE_DURATION = 5000;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const toastEl = document.getElementById('toast');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const toggleControlsBtn = document.getElementById('toggle-controls-btn');
const pauseControlsEl = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, pendingReward, freezeUntil, toastTimeoutId;
let startLevel = 1;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function buildPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  const r = Math.random();
  let type;
  if (r < POWERUP_CHANCE) {
    type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  } else if (r < POWERUP_CHANCE + SPECIAL_CHANCE) {
    type = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
  } else {
    type = Math.floor(Math.random() * 7) + 1;
  }
  return buildPiece(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared === 4) pendingReward = true;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (POWERUP_TYPES.includes(current.type)) {
    applyPowerup(current.type, current.x, current.y);
  }
  clearLines();
  spawn();
}

function applyPowerup(type, cx, cy) {
  switch (type) {
    case BOMB:
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = cy + dr, c = cx + dc;
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
        }
      }
      break;
    case LIGHTNING:
      if (cy >= 0 && cy < ROWS) board[cy].fill(0);
      for (let r = 0; r < ROWS; r++) {
        if (cx >= 0 && cx < COLS) board[r][cx] = 0;
      }
      break;
    case DYE: {
      const counts = {};
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c]) counts[board[r][c]] = (counts[board[r][c]] || 0) + 1;
      let targetColor = 0, best = 0;
      for (const color in counts) {
        if (counts[color] > best) { best = counts[color]; targetColor = Number(color); }
      }
      if (targetColor) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === targetColor) board[r][c] = 0;
      }
      break;
    }
    case GRAVITY:
      for (let c = 0; c < COLS; c++) {
        const values = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) values.push(board[r][c]);
        for (let r = ROWS - 1; r >= 0; r--) {
          board[r][c] = values.length ? values.pop() : 0;
        }
      }
      break;
    case FREEZE:
      freezeUntil = performance.now() + FREEZE_DURATION;
      break;
  }
  showToast(POWERUP_NAMES[type]);
  updateHUD();
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => toastEl.classList.add('hidden'), 1500);
}

function spawn() {
  current = next;
  next = pendingReward ? buildPiece(REWARD_TYPE) : randomPiece();
  pendingReward = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawIcon(context, x, y, colorIndex, size) {
  const icon = POWERUP_ICONS[colorIndex];
  if (!icon) return;
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(icon, x * size + size / 2, y * size + size / 2 + 1);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      drawBlock(ctx, c, r, board[r][c], BLOCK);
      drawIcon(ctx, c, r, board[r][c], BLOCK);
    }

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++) {
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
      drawIcon(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
    }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
      drawIcon(nextCtx, offX + c, offY + r, shape[r][c], NB);
    }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseOverlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (ts < freezeUntil) {
    draw();
    animId = requestAnimationFrame(loop);
    return;
  }
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) {
        draw();
        return;
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  pendingReward = false;
  freezeUntil = 0;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  clearTimeout(toastTimeoutId);
  toastEl.classList.add('hidden');
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

resumeBtn.addEventListener('click', () => {
  togglePause();
  resumeBtn.blur();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  init();
  pauseRestartBtn.blur();
});

toggleControlsBtn.addEventListener('click', () => {
  pauseControlsEl.classList.toggle('hidden');
  toggleControlsBtn.blur();
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
  try { localStorage.setItem('theme', theme); } catch (e) {}
  if (current) draw(); // redibuja la cuadrícula aunque el juego esté en pausa
}

themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  themeBtn.blur(); // evita que Space active el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

init();
