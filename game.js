// Platanus Hack 26 — CDMX Invasion
// Two-player co-op horizontal shmup. You are the UFOs. Earth fights back.

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const STORAGE_KEY = 'platanus-hack-26-cdmx-invasion-highscores';
const MAX_HIGH_SCORES = 5;
const WINNING_NAME_LENGTH = 3;

// Player play-area bounds in world pixels (used by player/enemy clamping in later tasks).
const PLAY = { minX: 30, maxX: 770, minY: 64, maxY: 560 };

// All balance numbers live here for cheap iteration.
const TUNING = {
  player: { speed: 300, radius: 16, maxHp: 100, lives: 3, invuln: 1500, regenPerSec: 0 }, // 0 = no passive regen by default; raised by the HP REGEN upgrade.
  enemyCapHard: 24,
  maxEggs: 9,
  spawn: { baseInterval: 1700, minInterval: 480, soloMul: 1.6, varietyMs: 3000 },
  intensity: { rampPerSec: 0.007, hpScalePerUnit: 0.18, speedScalePerUnit: 0.03 },
  xp: { base: 4, growth: 1.18 }, // xp needed for level n = base * growth^(n-1), rounded
  scoreTimeBonusPerSec: 2,
  abilities: {
    laser:  { cd: 900,  baseDmg: 14, len: 360 },
    flame:  { cd: 3000, dur: 1400, dps: 26, range: 150 },
    shield: { cd: 6000, dur: 4000, orbDmg: 10 },
    bomb:   { cd: 8000, baseR: 80,  dmg: 40 },
    cloak:  { cd: 9000, dur: 3000 },
  },
};

const COLORS = {
  background: 0x05060f,
  star: 0x9fb0ff,
  city: 0x10162e,
  frame: 0x2a2f55,
  accent: 0x7cf2ff,
  p1: 0xe1ff00,
  p2: 0xff6ec7,
  white: 0xf3f7ff,
  hpFull: 0x4dff7a,
  hpLow: 0xff5a5a,
  xp: 0x7cf2ff,
  cell: 0x121634,
  overlay: 0x05070f,
  danger: 0xff7a3a,
  egg: 0xfff2c8,
};

// minI = intensity needed to unlock (≈ seconds × 0.007). `max` = concurrent on-screen cap
// (omit `max` for the common fodder so they fill the remaining slots up to enemyCapHard).
const ENEMY_TYPES = {
  plane:      { tex: 'plane',      hp: 6,  speed: 150, dmgRes: 1,   weight: 10, minI: 0,    score: 10,  xp: 2, radius: 20, attack: 'none',     contact: 8,  bob: 0 },
  helicopter: { tex: 'helicopter', hp: 10, speed: 90,  dmgRes: 1,   weight: 9,  minI: 0,    score: 12,  xp: 2, radius: 20, attack: 'straight', contact: 8,  bob: 28, fireMs: 1600, bDmg: 6 },
  fighter:    { tex: 'fighter',    hp: 14, speed: 160, dmgRes: 1,   weight: 7,  minI: 0.07, score: 20,  xp: 3, radius: 20, attack: 'aimed',    contact: 12, bob: 0,  fireMs: 1500, bDmg: 12 },
  warplane:   { tex: 'warplane',   hp: 26, speed: 120, dmgRes: 1,   weight: 6,  minI: 0.14, score: 26,  xp: 4, radius: 21, attack: 'straight', contact: 14, bob: 0,  fireMs: 1100, bDmg: 12 },
  duck:       { tex: 'duck',       hp: 16, speed: 110, dmgRes: 1,   weight: 7,  minI: 0.21, score: 18,  xp: 3, radius: 20, attack: 'duck',     contact: 10, bob: 18, max: 3 },
  dolphin:    { tex: 'dolphin',    hp: 18, speed: 150, dmgRes: 1,   weight: 4,  minI: 0.28, score: 28,  xp: 4, radius: 20, attack: 'dolphin',  contact: 10, bob: 60, fireMs: 1600, max: 1 },
  witch:      { tex: 'witch',      hp: 34, speed: 110, dmgRes: 0.6, weight: 5,  minI: 0.35, score: 34,  xp: 5, radius: 20, attack: 'aimed',    contact: 12, bob: 40, fireMs: 1400, bDmg: 12, bColor: 0x9fe0ff, max: 3 },
  stealth:    { tex: 'stealth',    hp: 12, speed: 190, dmgRes: 1,   weight: 5,  minI: 0.42, score: 30,  xp: 5, radius: 20, attack: 'aimed',    contact: 16, bob: 0,  fireMs: 1700, bDmg: 16, alpha: 0.35, max: 2 },
  dragon:     { tex: 'dragon',     hp: 40, speed: 80,  dmgRes: 0.7, weight: 4,  minI: 0.49, score: 44,  xp: 7, radius: 22, attack: 'dragon',   contact: 14, bob: 24, max: 1 },
  hero:       { tex: 'hero',       hp: 60, speed: 70,  dmgRes: 0.1, weight: 3,  minI: 0.56, score: 80,  xp: 12, radius: 20, attack: 'hero',    contact: 20, bob: 0,  fireMs: 2600, max: 1 },
};

const UPGRADES = [
  { id: 'unlock_laser', label: 'UNLOCK: LASER', desc: 'Btn2 piercing beam', applies: (p) => !p.abilities.laser.unlocked, apply: (p) => { p.abilities.laser.unlocked = true; } },
  { id: 'unlock_flame', label: 'UNLOCK: FLAME', desc: 'Btn3 short cone', applies: (p) => !p.abilities.flame.unlocked, apply: (p) => { p.abilities.flame.unlocked = true; } },
  { id: 'unlock_shield', label: 'UNLOCK: SHIELD', desc: 'Btn4 orbiting guard', applies: (p) => !p.abilities.shield.unlocked, apply: (p) => { p.abilities.shield.unlocked = true; } },
  { id: 'unlock_bomb', label: 'UNLOCK: BOMB', desc: 'Btn5 area blast', applies: (p) => !p.abilities.bomb.unlocked, apply: (p) => { p.abilities.bomb.unlocked = true; } },
  { id: 'unlock_cloak', label: 'UNLOCK: CLOAK', desc: 'Btn6 untargetable', applies: (p) => !p.abilities.cloak.unlocked, apply: (p) => { p.abilities.cloak.unlocked = true; } },
  { id: 'basic_dmg', label: 'BASIC +DMG', desc: 'Stronger basic shot', applies: (p) => p.abilities.basic.level < 8, apply: (p) => { p.abilities.basic.level += 1; } },
  { id: 'laser_dmg', label: 'LASER +PWR', desc: 'Stronger/longer laser', applies: (p) => p.abilities.laser.unlocked && p.abilities.laser.level < 8, apply: (p) => { p.abilities.laser.level += 1; } },
  { id: 'flame_dmg', label: 'FLAME +PWR', desc: 'Hotter flame', applies: (p) => p.abilities.flame.unlocked && p.abilities.flame.level < 8, apply: (p) => { p.abilities.flame.level += 1; } },
  { id: 'shield_pwr', label: 'SHIELD +PWR', desc: 'More orbs / longer', applies: (p) => p.abilities.shield.unlocked && p.abilities.shield.level < 6, apply: (p) => { p.abilities.shield.level += 1; } },
  { id: 'bomb_pwr', label: 'BOMB +AREA', desc: 'Bigger blast', applies: (p) => p.abilities.bomb.unlocked && p.abilities.bomb.level < 6, apply: (p) => { p.abilities.bomb.level += 1; } },
  { id: 'cloak_dur', label: 'CLOAK +TIME', desc: 'Longer invisibility', applies: (p) => p.abilities.cloak.unlocked && p.abilities.cloak.level < 6, apply: (p) => { p.abilities.cloak.level += 1; } },
  { id: 'max_hp', label: 'MAX HP +25', desc: 'Tougher hull (heals)', applies: (p) => p.maxHp < 250, apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'regen', label: 'HP REGEN +', desc: 'Slow self-repair', applies: (p) => p.regenPerSec < 5, apply: (p) => { p.regenPerSec += 1; } },
  { id: 'speed', label: 'SPEED +', desc: 'Faster movement', applies: (p) => p.speedMul < 1.8, apply: (p) => { p.speedMul += 0.12; } },
];

const LETTER_GRID = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
  ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
  ['V', 'W', 'X', 'Y', 'Z', '.', '-'],
  ['DEL', 'END'],
];

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u'], P1_2: ['i'], P1_3: ['o'], P1_4: ['j'], P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'], P2_4: ['f'], P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};

function getStorage() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(key) { try { const raw = window.localStorage.getItem(key); return raw === null ? { found: false, value: null } : { found: true, value: JSON.parse(raw) }; } catch { return { found: false, value: null }; } },
    async set(key, value) { window.localStorage.setItem(key, JSON.stringify(value)); },
  };
}
async function storageGet(key) { return getStorage().get(key); }
async function storageSet(key, value) { return getStorage().set(key, value); }

function isHighScoreEntry(v) {
  return v && typeof v === 'object' && typeof v.name === 'string' && typeof v.score === 'number' && typeof v.time === 'number' && typeof v.savedAt === 'string';
}
async function loadHighScores() {
  const r = await storageGet(STORAGE_KEY);
  if (!r.found || !Array.isArray(r.value)) return [];
  return r.value.filter(isHighScoreEntry).sort((a, b) => b.score - a.score).slice(0, MAX_HIGH_SCORES);
}
async function persistHighScore(entry) {
  const existing = await loadHighScores();
  const next = existing.concat(entry).sort((a, b) => b.score - a.score).slice(0, MAX_HIGH_SCORES);
  await storageSet(STORAGE_KEY, next);
  return next;
}

function normalizeIncomingKey(key) {
  if (typeof key !== 'string' || key.length === 0) return '';
  if (key === ' ') return 'space';
  return key.toLowerCase();
}

const KEYBOARD_TO_ARCADE = {};
for (const [arcadeCode, keys] of Object.entries(CABINET_KEYS)) {
  for (const key of keys) KEYBOARD_TO_ARCADE[normalizeIncomingKey(key)] = arcadeCode;
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-root',
  backgroundColor: '#05060f',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_WIDTH, height: GAME_HEIGHT },
  scene: { preload, create, update },
};

new Phaser.Game(config);

function preload() {
  buildTextures(this);
}

function create() {
  const scene = this;
  scene.state = {
    phase: 'loading',
    elapsed: 0,
    intensity: 0,
    score: 0,
    highScores: [],
    saveStatus: 'Loading scores...',
    menu: { cursor: 0, cooldownUntil: 0, lastAxis: 0 },
    nameEntry: { letters: [], row: 0, col: 0, moveCooldownUntil: 0, confirmCooldownUntil: 0, lastMoveVector: { x: 0, y: 0 } },
  };

  createBackground(scene);
  createControls(scene);
  createStartScreen(scene);
  createPauseScreen(scene);
  showStartScreen(scene);
  loadHighScores()
    .then((hs) => { scene.state.highScores = hs; scene.state.saveStatus = 'Survive to set a score.'; refreshStartLeaderboard(scene); })
    .catch(() => { scene.state.highScores = []; scene.state.saveStatus = 'Storage unavailable.'; refreshStartLeaderboard(scene); });
}

function update(time, delta) {
  const scene = this;
  if (!scene.state) return;
  updateBackground(scene, delta);
  const phase = scene.state.phase;

  if (phase === 'start') { handleStartMenu(scene, time); return; }
  if (phase === 'info') {
    if (consumeAnyPressedControl(scene, ['START1', 'START2', 'P1_1', 'P2_1'])) { scene.infoScreen.container.setVisible(false); showStartScreen(scene); }
    return;
  }
  if (phase === 'levelup') { handleLevelUp(scene, time); return; }
  if (phase === 'playing') {
    scene.state.elapsed += delta;
    scene.state.intensity = scene.state.elapsed / 1000 * TUNING.intensity.rampPerSec;
    scene.state._bonusAcc = (scene.state._bonusAcc || 0) + (delta / 1000) * TUNING.scoreTimeBonusPerSec;
    if (scene.state._bonusAcc >= 1) {
      const add = Math.floor(scene.state._bonusAcc);
      scene.state.score += add;
      scene.state._bonusAcc -= add;
    }
    updatePlayers(scene, time, delta);
    handlePlayerFire(scene, time);
    updatePlayerBullets(scene);
    updateSpawner(scene, time, delta);
    updateVarietyFill(scene, time, delta);
    updateEnemies(scene, time);
    updateEnemyBullets(scene);
    updateEggs(scene, time);
    updateHazards(scene, time, delta);
    updateShieldOrbs(scene, time);
    updateFlames(scene, time, delta);
    refreshHud(scene);
    if (consumeAnyPressedControl(scene, ['START1', 'START2'])) pauseMatch(scene);
    return;
  }
  if (phase === 'paused') {
    if (consumeAnyPressedControl(scene, ['START1', 'START2'])) resumeMatch(scene);
    return;
  }
  if (phase === 'gameover') { handleNameEntry(scene, time); return; }
  if (phase === 'saved') { if (consumeAnyPressedControl(scene, ['START1', 'START2', 'P1_1', 'P2_1'])) returnToMenu(scene); return; }
}

// ---- Background (parallax) ----
function createBackground(scene) {
  scene.bg = { stars: [] };
  for (let i = 0; i < 60; i += 1) {
    const s = scene.add.rectangle(
      Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT),
      Phaser.Math.Between(1, 2), Phaser.Math.Between(1, 2), COLORS.star, Phaser.Math.FloatBetween(0.3, 0.9),
    );
    s.speed = Phaser.Math.FloatBetween(12, 60);
    scene.bg.stars.push(s);
  }
}

function updateBackground(scene, delta) {
  if (!scene.bg) return;
  const d = delta / 1000;
  for (const s of scene.bg.stars) {
    s.x -= s.speed * d;
    if (s.x < 0) { s.x = GAME_WIDTH; s.y = Phaser.Math.Between(0, GAME_HEIGHT); }
  }
}

// ---- Input (reused from starter) ----
function createControls(scene) {
  scene.controls = { held: Object.create(null), pressed: Object.create(null) };
  const onKeyDown = (e) => {
    const key = normalizeIncomingKey(e.key); if (!key) return;
    const code = KEYBOARD_TO_ARCADE[key]; if (!code) return;
    if (!scene.controls.held[code]) scene.controls.pressed[code] = true;
    scene.controls.held[code] = true;
  };
  const onKeyUp = (e) => {
    const key = normalizeIncomingKey(e.key); if (!key) return;
    const code = KEYBOARD_TO_ARCADE[key]; if (!code) return;
    scene.controls.held[code] = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  scene.events.once('shutdown', () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });
}

function isControlHeld(scene, code) { return scene.controls.held[code] === true; }
function consumeAnyPressedControl(scene, codes) {
  for (const c of codes) if (scene.controls.pressed[c]) { scene.controls.pressed[c] = false; return true; }
  return false;
}
function getVerticalMenuAxis(controls) {
  let a = 0;
  if (controls.held.P1_U || controls.held.P2_U) a -= 1;
  if (controls.held.P1_D || controls.held.P2_D) a += 1;
  return Phaser.Math.Clamp(a, -1, 1);
}
function getHorizontalMenuAxis(controls) {
  let a = 0;
  if (controls.held.P1_L || controls.held.P2_L) a -= 1;
  if (controls.held.P1_R || controls.held.P2_R) a += 1;
  return Phaser.Math.Clamp(a, -1, 1);
}

// ---- World setup (called on startMatch) ----
function createWorld(scene, numPlayers) {
  if (scene.world) destroyWorld(scene);
  scene.world = {
    players: [],
    enemies: scene.physics.add.group(),
    enemyBullets: scene.physics.add.group(),
    playerBullets: scene.physics.add.group(),
    eggs: scene.physics.add.group(),
    hazards: scene.add.group(),   // fire columns (manual overlap)
    orbs: scene.add.group(),      // shield orbs (manual overlap)
    spawnTimer: 0,
    varietyTimer: 0,
    levelQueue: [],
  };
  const solo = numPlayers === 1;
  scene.world.players.push(createPlayer(scene, 'p1', 'P1', 'ovniP1', COLORS.p1, 140, solo ? 300 : 200));
  if (!solo) scene.world.players.push(createPlayer(scene, 'p2', 'P2', 'ovniP2', COLORS.p2, 140, 380));
  registerCollisions(scene);
}

function destroyWorld(scene) {
  if (!scene.world) return;
  scene.world.enemies.clear(true, true);
  scene.world.enemyBullets.clear(true, true);
  scene.world.playerBullets.clear(true, true);
  scene.world.eggs.clear(true, true);
  scene.world.hazards.clear(true, true);
  scene.world.orbs.clear(true, true);
  for (const p of scene.world.players) { p.sprite.destroy(); if (p.flameGfx) p.flameGfx.destroy(); }
  scene.world = null;
}

function registerCollisions(scene) {
  const w = scene.world;
  scene.physics.add.overlap(w.playerBullets, w.enemies, (b, e) => onBulletHitsEnemy(scene, b, e));
  scene.physics.add.overlap(w.playerBullets, w.eggs, (b, egg) => onBulletHitsEgg(scene, b, egg));
  for (const p of w.players) {
    scene.physics.add.overlap(p.sprite, w.enemyBullets, (s, b) => onEnemyBulletHitsPlayer(scene, p, b));
    scene.physics.add.overlap(p.sprite, w.enemies, (s, e) => onEnemyTouchesPlayer(scene, p, e));
  }
  // Shield orbs: register once against the groups (orbs are added/destroyed dynamically).
  scene.physics.add.overlap(w.orbs, w.enemies, (o, e) => onOrbHitsEnemy(scene, o, e));
  scene.physics.add.overlap(w.orbs, w.enemyBullets, (o, b) => { if (o.active && b.active) recycle(b); });
}

function onOrbHitsEnemy(scene, o, e) {
  if (!o.active || !e.active) return;
  e.hp -= o.orbDmg * (e.def.dmgRes != null ? e.def.dmgRes : 1);
  spawnHitSpark(scene, e.x, e.y, 0x7cf2ff);
  if (e.hp <= 0) killEnemy(scene, e, o.ownerKey);
}

function onBulletHitsEnemy(scene, b, e) {
  if (!b.active || !e.active) return;
  const dmg = (b.damage || 1) * (e.def.dmgRes != null ? e.def.dmgRes : 1);
  e.hp -= dmg;
  spawnHitSpark(scene, b.x, b.y, 0xffffff);
  if (b.pierce > 0) { b.pierce -= 1; } else { recycle(b); }
  if (e.hp <= 0) killEnemy(scene, e, b.owner);
}

function onBulletHitsEgg(scene, b, egg) {
  if (!b.active || !egg.active) return;
  egg.hp -= (b.damage || 1);
  if (b.pierce > 0) { b.pierce -= 1; } else { recycle(b); }
  if (egg.hp <= 0) { spawnHitSpark(scene, egg.x, egg.y, COLORS.egg); recycle(egg); }
}

function killEnemy(scene, e, ownerKey) {
  const def = e.def;
  scene.state.score += def.score;
  spawnExplosion(scene, e.x, e.y, 0xffcf6a);
  playSound(scene, 'boom');
  const owner = scene.world.players.find((p) => p.key === ownerKey && !p.spectator);
  if (owner) grantXp(scene, owner, def.xp);
  recycle(e);
}

function onEnemyBulletHitsPlayer(scene, p, b) {
  if (!b.active || !p.alive || scene.time.now < p.invulnUntil) return;
  if (b.effect === 'slow') p.slowUntil = scene.time.now + 2500;
  damagePlayer(scene, p, b.damage || 5, scene.time.now);
  recycle(b);
}

function onEnemyTouchesPlayer(scene, p, e) {
  if (!e.active || !p.alive || scene.time.now < p.invulnUntil) return;
  damagePlayer(scene, p, e.def.contact || 8, scene.time.now);
  if (e.def.attack === 'duck' && e.ai && e.ai.kamikaze) { spawnExplosion(scene, e.x, e.y, COLORS.p1); recycle(e); }
}

function damagePlayer(scene, p, amount, time) {
  if (!p.alive) return;
  p.hp -= amount;
  spawnHitSpark(scene, p.sprite.x, p.sprite.y, COLORS.hpLow);
  playSound(scene, 'hurt');
  if (p.hp <= 0) loseLife(scene, p, time);
}

function loseLife(scene, p, time) {
  p.lives -= 1;
  playSound(scene, 'die');
  spawnExplosion(scene, p.sprite.x, p.sprite.y, p.color);
  if (p.lives <= 0) {
    p.alive = false; p.spectator = true;
    p.sprite.setVisible(false); p.sprite.body.enable = false;
    maybeGameOver(scene);
  } else {
    p.hp = p.maxHp;
    p.sprite.setPosition(p.spawnX, p.spawnY);
    p.invulnUntil = time + TUNING.player.invuln;
  }
}

function maybeGameOver(scene) {
  if (scene.world.players.every((p) => p.spectator)) finishMatch(scene);
}

function spawnHitSpark(scene, x, y, color) {
  const s = scene.add.image(x, y, 'spark').setTint(color).setDepth(7);
  scene.tweens.add({ targets: s, alpha: 0, scale: 0.2, duration: 160, onComplete: () => s.destroy() });
}

function spawnExplosion(scene, x, y, color) {
  for (let i = 0; i < 8; i += 1) {
    const pcl = scene.add.image(x, y, 'spark').setTint(color).setDepth(7);
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.Between(14, 40);
    scene.tweens.add({ targets: pcl, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, scale: 0.2, duration: Phaser.Math.Between(180, 340), onComplete: () => pcl.destroy() });
  }
}

function grantXp(scene, p, amount) {
  if (p.spectator) return;
  p.xp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    p.xpToNext = xpForLevel(p.level);
    scene.world.levelQueue.push(p);
  }
  if (scene.world.levelQueue.length && scene.state.phase === 'playing') enterLevelUp(scene);
}

function enterLevelUp(scene) {
  const p = scene.world.levelQueue[0];
  scene.state.phase = 'levelup';
  scene.physics.pause();
  playSound(scene, 'levelup');
  showCards(scene, p);
}

function rollCards(p) {
  const pool = UPGRADES.filter((u) => u.applies(p));
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, 3);
}
function createLevelUpUi(scene) {
  scene.levelUi = {};
  const c = scene.add.container(0, 0).setDepth(30).setVisible(false);
  scene.levelUi.container = c;
  c.add(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.9));
  scene.levelUi.title = scene.add.text(GAME_WIDTH / 2, 110, '', { fontFamily: 'monospace', fontSize: '26px', color: '#7cf2ff', fontStyle: 'bold' }).setOrigin(0.5);
  scene.levelUi.hint = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'MOVE < >   CONFIRM BTN1', { fontFamily: 'monospace', fontSize: '12px', color: '#8a93c8' }).setOrigin(0.5);
  c.add([scene.levelUi.title, scene.levelUi.hint]);
  scene.levelUi.cards = [];
  for (let i = 0; i < 3; i += 1) {
    const x = GAME_WIDTH / 2 + (i - 1) * 230;
    const bg = scene.add.rectangle(x, 300, 200, 240, COLORS.cell, 0.98).setStrokeStyle(3, COLORS.frame, 1);
    const name = scene.add.text(x, 240, '', { fontFamily: 'monospace', fontSize: '16px', color: '#f3f7ff', fontStyle: 'bold', align: 'center', wordWrap: { width: 180 } }).setOrigin(0.5);
    const desc = scene.add.text(x, 320, '', { fontFamily: 'monospace', fontSize: '12px', color: '#9aa3d0', align: 'center', wordWrap: { width: 180 } }).setOrigin(0.5);
    c.add([bg, name, desc]);
    scene.levelUi.cards.push({ bg, name, desc });
  }
  scene.levelUi.sel = { cursor: 0, cooldown: 0, lastAxis: 0, options: [], player: null };
}

function showCards(scene, p) {
  if (!scene.levelUi) createLevelUpUi(scene);
  const opts = rollCards(p);
  const sel = scene.levelUi.sel;
  sel.cursor = 0; sel.cooldown = 0; sel.lastAxis = 0; sel.options = opts; sel.player = p;
  scene.levelUi.title.setText(`${p.label} — LEVEL ${p.level}!  PICK ONE`).setColor(p.key === 'p1' ? '#e1ff00' : '#ff6ec7');
  scene.levelUi.cards.forEach((card, i) => {
    const o = opts[i];
    if (o) { card.bg.setVisible(true); card.name.setVisible(true).setText(o.label); card.desc.setVisible(true).setText(o.desc); }
    else { card.bg.setVisible(false); card.name.setVisible(false); card.desc.setVisible(false); }
  });
  highlightCards(scene);
  scene.levelUi.container.setVisible(true);
}

function highlightCards(scene) {
  const sel = scene.levelUi.sel;
  scene.levelUi.cards.forEach((card, i) => {
    const active = i === sel.cursor && i < sel.options.length;
    card.bg.setStrokeStyle(3, active ? COLORS.accent : COLORS.frame, 1);
    card.bg.setFillStyle(active ? 0x1c2350 : COLORS.cell, active ? 1 : 0.98);
  });
}

function handleLevelUp(scene, time) {
  const sel = scene.levelUi.sel;
  const p = sel.player;
  const prefix = p.key === 'p1' ? 'P1' : 'P2';
  let axis = 0;
  if (scene.controls.held[`${prefix}_L`]) axis -= 1;
  if (scene.controls.held[`${prefix}_R`]) axis += 1;
  if (time >= sel.cooldown && axis !== 0 && sel.lastAxis !== axis) {
    sel.cursor = Phaser.Math.Wrap(sel.cursor + axis, 0, sel.options.length);
    sel.cooldown = time + 160;
    highlightCards(scene);
  }
  sel.lastAxis = axis;
  if (consumeAnyPressedControl(scene, [`${prefix}_1`, p.key === 'p1' ? 'START1' : 'START2'])) {
    const chosen = sel.options[sel.cursor];
    if (chosen) chosen.apply(p);
    playSound(scene, 'select');
    scene.world.levelQueue.shift();
    if (scene.world.levelQueue.length) showCards(scene, scene.world.levelQueue[0]);
    else { scene.levelUi.container.setVisible(false); scene.physics.resume(); scene.state.phase = 'playing'; }
  }
}

function finishMatch(scene) {
  if (scene.state.phase === 'gameover' || scene.state.phase === 'saved') return;
  scene.state.phase = 'gameover';
  scene.physics.pause();
  scene.state.finalTime = Math.floor(scene.state.elapsed / 1000);
  scene.state.saveStatus = scene.state.saveStatus || '';
  scene.state.nameEntry = { letters: [], row: 0, col: 0, moveCooldownUntil: 0, confirmCooldownUntil: 0, lastMoveVector: { x: 0, y: 0 } };
  showGameOver(scene);
}

function createGameOverUi(scene) {
  scene.over = {};
  const c = scene.add.container(0, 0).setDepth(35).setVisible(false);
  scene.over.container = c;
  c.add(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.97));
  scene.over.title = scene.add.text(GAME_WIDTH / 2, 70, 'INVASION REPELLED', { fontFamily: 'monospace', fontSize: '30px', color: '#ff6ec7', fontStyle: 'bold' }).setOrigin(0.5);
  scene.over.summary = scene.add.text(GAME_WIDTH / 2, 110, '', { fontFamily: 'monospace', fontSize: '18px', color: '#7cf2ff' }).setOrigin(0.5);
  scene.over.nameLabel = scene.add.text(GAME_WIDTH / 2, 150, 'ENTER INITIALS', { fontFamily: 'monospace', fontSize: '12px', color: '#9aa3d0' }).setOrigin(0.5);
  scene.over.nameValue = scene.add.text(GAME_WIDTH / 2, 184, '_ _ _', { fontFamily: 'monospace', fontSize: '32px', color: '#f3f7ff', fontStyle: 'bold' }).setOrigin(0.5);
  scene.over.saveStatus = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, '', { fontFamily: 'monospace', fontSize: '11px', color: '#7cf2ff' }).setOrigin(0.5);
  c.add([scene.over.title, scene.over.summary, scene.over.nameLabel, scene.over.nameValue, scene.over.saveStatus]);
  scene.over.gridLabels = [];
  for (let row = 0; row < LETTER_GRID.length; row += 1) {
    const vals = LETTER_GRID[row];
    const rowW = vals.length * 56;
    for (let col = 0; col < vals.length; col += 1) {
      const value = vals[col];
      const x = GAME_WIDTH / 2 - rowW / 2 + 28 + col * 56;
      const y = 250 + row * 30;
      const cell = scene.add.rectangle(x, y, value.length > 1 ? 64 : 44, 26, COLORS.cell, 0.95).setStrokeStyle(2, COLORS.frame, 0.9);
      const label = scene.add.text(x, y, value, { fontFamily: 'monospace', fontSize: value.length > 1 ? '14px' : '18px', color: '#f3f7ff', fontStyle: 'bold' }).setOrigin(0.5);
      scene.over.gridLabels.push({ cell, label, row, col, value });
      c.add([cell, label]);
    }
  }
}

function showGameOver(scene) {
  if (!scene.over) createGameOverUi(scene);
  scene.over.summary.setText(`SCORE ${scene.state.score}   TIME ${scene.state.finalTime}s`);
  scene.over.saveStatus.setText(scene.state.saveStatus);
  refreshNameEntry(scene);
  updateLetterGridHighlight(scene);
  scene.over.container.setVisible(true);
}

function refreshNameEntry(scene) {
  const letters = scene.state.nameEntry.letters.slice();
  while (letters.length < WINNING_NAME_LENGTH) letters.push('_');
  scene.over.nameValue.setText(letters.join(' '));
}

function updateLetterGridHighlight(scene) {
  const e = scene.state.nameEntry;
  for (const item of scene.over.gridLabels) {
    const active = item.row === e.row && item.col === e.col;
    item.cell.setFillStyle(active ? COLORS.accent : COLORS.cell, active ? 1 : 0.95);
    item.cell.setStrokeStyle(2, active ? COLORS.white : COLORS.frame, active ? 1 : 0.9);
    item.label.setColor(active ? '#04110b' : '#f3f7ff');
  }
}

function handleNameEntry(scene, time) {
  const axisX = getHorizontalMenuAxis(scene.controls);
  const axisY = getVerticalMenuAxis(scene.controls);
  const e = scene.state.nameEntry;
  if (time >= e.moveCooldownUntil && (axisX !== 0 || axisY !== 0) && (e.lastMoveVector.x !== axisX || e.lastMoveVector.y !== axisY)) {
    if (axisY !== 0) { e.row = Phaser.Math.Wrap(e.row + axisY, 0, LETTER_GRID.length); e.col = Math.min(e.col, LETTER_GRID[e.row].length - 1); }
    if (axisX !== 0) { e.col = Phaser.Math.Wrap(e.col + axisX, 0, LETTER_GRID[e.row].length); }
    e.moveCooldownUntil = time + 150;
    updateLetterGridHighlight(scene);
  }
  e.lastMoveVector = { x: axisX, y: axisY };
  if (time >= e.confirmCooldownUntil && consumeAnyPressedControl(scene, ['P1_1', 'P2_1', 'START1', 'START2'])) {
    e.confirmCooldownUntil = time + 180;
    activateCurrentLetter(scene);
  }
}

function activateCurrentLetter(scene) {
  const e = scene.state.nameEntry;
  const v = LETTER_GRID[e.row][e.col];
  if (v === 'DEL') { e.letters.pop(); refreshNameEntry(scene); return; }
  if (v === 'END') {
    if (!e.letters.length) { scene.over.saveStatus.setText('Pick at least one letter.'); return; }
    submitHighScore(scene); return;
  }
  if (e.letters.length >= WINNING_NAME_LENGTH) e.letters.shift();
  e.letters.push(v); refreshNameEntry(scene);
}

function submitHighScore(scene) {
  if (scene.state.phase !== 'gameover') return;
  const initials = scene.state.nameEntry.letters.join('').slice(0, WINNING_NAME_LENGTH) || '???';
  const entry = { name: initials, score: scene.state.score, time: scene.state.finalTime, savedAt: new Date().toISOString().slice(0, 10) };
  scene.state.phase = 'saved';
  scene.over.saveStatus.setText(`Saved ${initials}! Press START for menu.`);
  persistHighScore(entry)
    .then((next) => { scene.state.highScores = next; refreshStartLeaderboard(scene); })
    .catch(() => { scene.over.saveStatus.setText('Could not save, result stands.'); });
}

function returnToMenu(scene) {
  scene.over.container.setVisible(false);
  destroyWorld(scene);
  if (scene.hud && scene.hud.container) { scene.hud.container.destroy(); scene.hud = null; }
  refreshStartLeaderboard(scene);
  showStartScreen(scene);
}

function createPlayer(scene, key, label, texture, color, x, y) {
  const sprite = scene.physics.add.image(x, y, texture);
  sprite.setCircle(TUNING.player.radius, sprite.width / 2 - TUNING.player.radius, sprite.height / 2 - TUNING.player.radius);
  sprite.body.setCollideWorldBounds(false);
  const player = {
    key, label, color, sprite,
    spawnX: x, spawnY: y,
    hp: TUNING.player.maxHp, maxHp: TUNING.player.maxHp,
    lives: TUNING.player.lives,
    alive: true, spectator: false,
    invulnUntil: 0,
    speedMul: 1, regenPerSec: TUNING.player.regenPerSec,
    level: 1, xp: 0, xpToNext: xpForLevel(1),
    abilities: makeAbilityState(),
    fireCooldown: {},
    slowUntil: 0,
  };
  sprite.player = player;
  return player;
}

function xpForLevel(n) { return Math.round(TUNING.xp.base * Math.pow(TUNING.xp.growth, n - 1)); }

function makeAbilityState() {
  return {
    basic:  { unlocked: true,  level: 1 },
    laser:  { unlocked: false, level: 1 },
    flame:  { unlocked: false, level: 1 },
    shield: { unlocked: false, level: 1 },
    bomb:   { unlocked: false, level: 1 },
    cloak:  { unlocked: false, level: 1 },
  };
}

function updatePlayers(scene, time, delta) {
  const d = delta / 1000;
  for (const p of scene.world.players) {
    if (!p.alive) continue;
    const prefix = p.key === 'p1' ? 'P1' : 'P2';
    let vx = 0; let vy = 0;
    if (isControlHeld(scene, `${prefix}_L`)) vx -= 1;
    if (isControlHeld(scene, `${prefix}_R`)) vx += 1;
    if (isControlHeld(scene, `${prefix}_U`)) vy -= 1;
    if (isControlHeld(scene, `${prefix}_D`)) vy += 1;
    const slowed = time < p.slowUntil ? 0.5 : 1;
    const speed = TUNING.player.speed * p.speedMul * slowed;
    if (vx !== 0 && vy !== 0) { const inv = 1 / Math.sqrt(2); vx *= inv; vy *= inv; }
    p.sprite.x = Phaser.Math.Clamp(p.sprite.x + vx * speed * d, PLAY.minX, PLAY.maxX);
    p.sprite.y = Phaser.Math.Clamp(p.sprite.y + vy * speed * d, PLAY.minY, PLAY.maxY);
    if (p.regenPerSec > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regenPerSec * d);
    const cloaked = isCloaked(p, time);
    const blink = time < p.invulnUntil ? (Math.floor(time / 80) % 2 ? 0.35 : 0.9) : 1;
    p.sprite.setAlpha(cloaked ? 0.3 : blink);
  }
}

// ---- Player bullets ----
function fireBasic(scene, player, time) {
  const ab = player.abilities.basic;
  const nextKey = 'basic';
  const cadence = 280 - (ab.level - 1) * 18; // ms between shots, faster with level
  if ((player.fireCooldown[nextKey] || 0) > time) return;
  player.fireCooldown[nextKey] = time + Math.max(110, cadence);
  spawnPlayerBullet(scene, player, player.sprite.x + 18, player.sprite.y, 520, 0, 6 + (ab.level - 1) * 2);
  playSound(scene, 'shoot');
}

function spawnPlayerBullet(scene, player, x, y, vx, vy, damage) {
  let b = scene.world.playerBullets.getFirstDead(false);
  if (!b) {
    b = scene.physics.add.image(x, y, 'pBullet');
    scene.world.playerBullets.add(b);
  } else {
    b.setActive(true).setVisible(true);
    b.body.enable = true;
    b.setPosition(x, y);
  }
  b.setTexture('pBullet');
  b.setTint(player.color);
  b.damage = damage;
  b.owner = player.key;
  b.pierce = 0;
  b.body.setAllowGravity(false);
  b.body.setVelocity(vx, vy);
  return b;
}

function updatePlayerBullets(scene) {
  scene.world.playerBullets.children.iterate((b) => {
    if (!b || !b.active) return;
    if (b.x > GAME_WIDTH + 30 || b.x < -30 || b.y < -30 || b.y > GAME_HEIGHT + 30) recycle(b);
  });
}

function recycle(obj) {
  obj.setActive(false).setVisible(false);
  if (obj.body) obj.body.enable = false;
}

function handlePlayerFire(scene, time) {
  for (const p of scene.world.players) {
    if (!p.alive) continue;
    const prefix = p.key === 'p1' ? 'P1' : 'P2';
    if (isControlHeld(scene, `${prefix}_1`)) fireBasic(scene, p, time);
    if (scene.controls.pressed[`${prefix}_2`] && p.abilities.laser.unlocked) { scene.controls.pressed[`${prefix}_2`] = false; tryAbility(scene, p, 'laser', time, () => fireLaser(scene, p, time)); }
    if (scene.controls.pressed[`${prefix}_3`] && p.abilities.flame.unlocked) { scene.controls.pressed[`${prefix}_3`] = false; tryAbility(scene, p, 'flame', time, () => activateFlame(scene, p, time)); }
    if (scene.controls.pressed[`${prefix}_4`] && p.abilities.shield.unlocked) { scene.controls.pressed[`${prefix}_4`] = false; tryAbility(scene, p, 'shield', time, () => activateShield(scene, p, time)); }
    if (scene.controls.pressed[`${prefix}_5`] && p.abilities.bomb.unlocked) { scene.controls.pressed[`${prefix}_5`] = false; tryAbility(scene, p, 'bomb', time, () => fireBomb(scene, p, time)); }
    if (scene.controls.pressed[`${prefix}_6`] && p.abilities.cloak.unlocked) { scene.controls.pressed[`${prefix}_6`] = false; tryAbility(scene, p, 'cloak', time, () => activateCloak(scene, p, time)); }
  }
}

function tryAbility(scene, p, id, time, fn) {
  const lv = p.abilities[id].level;
  const cd = TUNING.abilities[id].cd * Math.max(0.5, 1 - (lv - 1) * 0.08); // each level trims cooldown, floor 50%
  if ((p.fireCooldown[id] || 0) > time) return;
  p.fireCooldown[id] = time + cd;
  fn();
}

function playSound(scene, type) {
  try {
    const ctx = scene.sound && scene.sound.context ? scene.sound.context : null;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const env = (peak, dur, type2, f0, f1) => {
      osc.type = type2; osc.frequency.setValueAtTime(f0, now);
      if (f1 != null) osc.frequency.exponentialRampToValueAtTime(f1, now + dur);
      gain.gain.setValueAtTime(peak, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.start(now); osc.stop(now + dur);
    };
    if (type === 'shoot') env(0.05, 0.06, 'square', 720, 480);
    else if (type === 'laser') env(0.12, 0.18, 'sawtooth', 180, 1200);
    else if (type === 'flame') env(0.10, 0.16, 'sawtooth', 90, 220);
    else if (type === 'bomb') env(0.30, 0.40, 'sine', 160, 40);
    else if (type === 'shield') env(0.12, 0.20, 'triangle', 300, 700);
    else if (type === 'cloak') env(0.10, 0.30, 'sine', 900, 200);
    else if (type === 'boom') env(0.20, 0.18, 'square', 420, 120);
    else if (type === 'hurt') env(0.22, 0.22, 'sawtooth', 240, 70);
    else if (type === 'die') env(0.30, 0.5, 'sawtooth', 200, 50);
    else if (type === 'levelup') env(0.16, 0.22, 'square', 500, 1100);
    else if (type === 'select') env(0.12, 0.10, 'square', 700, 1300);
    else if (type === 'hatch') env(0.10, 0.10, 'triangle', 300, 600);
    else if (type === 'fire') env(0.14, 0.25, 'sawtooth', 120, 300);
    else env(0.08, 0.08, 'square', 600, 600);
  } catch (_) {}
}

// ---- Abilities ----
function fireLaser(scene, p, time) {
  const lv = p.abilities.laser.level;
  const cfg = TUNING.abilities.laser;
  const dmg = cfg.baseDmg + (lv - 1) * 8;
  const b = spawnPlayerBullet(scene, p, p.sprite.x + 40, p.sprite.y, 900, 0, dmg);
  b.setTint(0x9fe0ff).setScale(4.6, 1.5);
  b.pierce = 2 + lv;
  playSound(scene, 'laser');
}

function activateFlame(scene, p, time) {
  const lv = p.abilities.flame.level;
  const cfg = TUNING.abilities.flame;
  p.flameUntil = time + cfg.dur + lv * 150; // sustained flame stream in front of the UFO
  if (!p.flameGfx) p.flameGfx = scene.add.graphics().setDepth(6);
  playSound(scene, 'flame');
}

function updateFlames(scene, time, delta) {
  const d = delta / 1000;
  for (const p of scene.world.players) {
    if (!p.flameGfx) continue;
    if (!p.alive || time >= (p.flameUntil || 0)) { p.flameGfx.destroy(); p.flameGfx = null; continue; }
    const lv = p.abilities.flame.level;
    const cfg = TUNING.abilities.flame;
    const range = cfg.range + lv * 20;
    const halfH = 22 + lv * 3;
    const dps = cfg.dps + lv * 5;
    const ox = p.sprite.x;
    const oy = p.sprite.y;
    scene.world.enemies.children.iterate((e) => {
      if (!e || !e.active) return;
      const dx = e.x - ox;
      if (dx > 4 && dx < range && Math.abs(e.y - oy) < halfH * (0.4 + 0.6 * dx / range)) {
        e.hp -= dps * d * (e.def.dmgRes != null ? e.def.dmgRes : 1);
        if (e.hp <= 0) killEnemy(scene, e, p.key);
      }
    });
    const g = p.flameGfx;
    g.clear();
    g.setPosition(ox, oy);
    const flick = range * (0.85 + Math.random() * 0.15);
    g.fillStyle(0xff5a1a, 0.32); g.fillTriangle(14, -halfH, 14, halfH, flick, 0);
    g.fillStyle(0xffa83a, 0.5); g.fillTriangle(14, -halfH * 0.62, 14, halfH * 0.62, flick * 0.82, 0);
    g.fillStyle(0xffe87a, 0.7); g.fillTriangle(16, -halfH * 0.3, 16, halfH * 0.3, flick * 0.55, 0);
  }
}

function activateShield(scene, p, time) {
  const lv = p.abilities.shield.level;
  const cfg = TUNING.abilities.shield;
  const orbCount = 1 + Math.floor(lv / 2);
  p.shieldUntil = time + cfg.dur + lv * 600;
  if (!p.orbs) p.orbs = [];
  for (const o of p.orbs) o.destroy();
  p.orbs = [];
  for (let i = 0; i < orbCount; i += 1) {
    const o = scene.physics.add.image(p.sprite.x, p.sprite.y, 'spark').setTint(0x7cf2ff).setScale(2.4).setDepth(6);
    o.body.setAllowGravity(false);
    o.angleOffset = (i / orbCount) * Math.PI * 2;
    o.orbDmg = cfg.orbDmg + lv * 4;
    o.ownerKey = p.key;
    scene.world.orbs.add(o);
    p.orbs.push(o);
  }
  playSound(scene, 'shield');
}

function updateShieldOrbs(scene, time) {
  for (const p of scene.world.players) {
    if (!p.orbs || !p.orbs.length) continue;
    if (time > (p.shieldUntil || 0)) { for (const o of p.orbs) o.destroy(); p.orbs = []; continue; }
    const r = 34;
    p.orbs.forEach((o, i) => {
      const ang = o.angleOffset + time / 200;
      o.setPosition(p.sprite.x + Math.cos(ang) * r, p.sprite.y + Math.sin(ang) * r);
    });
  }
}

function fireBomb(scene, p, time) {
  const lv = p.abilities.bomb.level;
  const cfg = TUNING.abilities.bomb;
  const radius = cfg.baseR + lv * 20;
  const cx = p.sprite.x + 160; const cy = p.sprite.y;
  const blast = scene.add.circle(cx, cy, radius, COLORS.danger, 0.45).setDepth(6);
  scene.tweens.add({ targets: blast, alpha: 0, scale: 1.3, duration: 320, onComplete: () => blast.destroy() });
  scene.world.enemies.children.iterate((e) => {
    if (!e || !e.active) return;
    if (Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= radius) {
      e.hp -= cfg.dmg * (e.def.dmgRes != null ? e.def.dmgRes : 1);
      if (e.hp <= 0) killEnemy(scene, e, p.key);
    }
  });
  playSound(scene, 'bomb');
}

function activateCloak(scene, p, time) {
  const lv = p.abilities.cloak.level;
  const cfg = TUNING.abilities.cloak;
  p.cloakUntil = time + cfg.dur + lv * 700;
  playSound(scene, 'cloak');
}

function isCloaked(p, time) { return time < (p.cloakUntil || 0); }

// ---- Enemies ----
function countType(scene, name) {
  let n = 0;
  scene.world.enemies.children.iterate((e) => { if (e && e.active && e.etype === name) n += 1; });
  return n;
}

function atTypeCap(scene, name) {
  const m = ENEMY_TYPES[name].max;
  return m != null && countType(scene, name) >= m;
}

function pickEnemyType(scene) {
  const I = scene.state.intensity;
  const pool = [];
  let total = 0;
  for (const [name, def] of Object.entries(ENEMY_TYPES)) {
    if (I < def.minI) continue;
    if (atTypeCap(scene, name)) continue; // respect per-type concurrent caps
    const w = def.weight * (1 + Math.max(0, I - def.minI) * 0.15); // tougher enemies grow more common as intensity rises
    total += w;
    pool.push({ name, acc: total });
  }
  if (!pool.length) return null;
  const r = Phaser.Math.FloatBetween(0, total);
  for (const e of pool) if (r <= e.acc) return e.name;
  return pool[pool.length - 1].name;
}

// Variety fill: force-spawn capped/special types so the board shows the full roster.
function updateVarietyFill(scene, time, delta) {
  const w = scene.world;
  w.varietyTimer = (w.varietyTimer || 0) - delta;
  if (w.varietyTimer > 0) return;
  w.varietyTimer = TUNING.spawn.varietyMs;
  if (w.enemies.countActive(true) >= TUNING.enemyCapHard) return;
  const I = scene.state.intensity;
  const candidates = [];
  for (const [name, def] of Object.entries(ENEMY_TYPES)) {
    if (def.max == null) continue;            // commons are handled by the weighted spawner
    if (I < def.minI) continue;               // not unlocked yet
    if (countType(scene, name) >= def.max) continue; // already at its cap
    candidates.push(name);
  }
  if (!candidates.length) return;
  const absent = candidates.filter((n) => countType(scene, n) === 0);
  const pool = absent.length ? absent : candidates; // ensure one of each first, then top up
  spawnEnemy(scene, pool[Phaser.Math.Between(0, pool.length - 1)], 820, Phaser.Math.Between(80, 540));
}

function spawnEnemy(scene, name, x, y) {
  const def = ENEMY_TYPES[name];
  const I = scene.state.intensity;
  let e = scene.world.enemies.getFirstDead(false);
  if (!e) { e = scene.physics.add.image(0, 0, def.tex); scene.world.enemies.add(e); }
  else { e.setActive(true).setVisible(true); e.body.enable = true; }
  e.setTexture(def.tex);
  e.setPosition(x == null ? 820 : x, y == null ? Phaser.Math.Between(80, 540) : y);
  e.setAlpha(def.alpha != null ? def.alpha : 1);
  e.body.setAllowGravity(false);
  e.body.setCircle(def.radius, e.width / 2 - def.radius, e.height / 2 - def.radius);
  e.etype = name;
  e.def = def;
  e.maxHp = Math.round(def.hp * (1 + I * TUNING.intensity.hpScalePerUnit));
  e.hp = e.maxHp;
  e.speed = def.speed * (1 + I * TUNING.intensity.speedScalePerUnit);
  e.baseY = e.y;
  e.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
  e.nextFire = (scene.time.now || 0) + (def.fireMs ? Phaser.Math.Between(400, def.fireMs) : 0);
  e.ai = {};
  e.body.setVelocity(-e.speed, 0);
  return e;
}

function updateSpawner(scene, time, delta) {
  const w = scene.world;
  w.spawnTimer -= delta;
  const I = scene.state.intensity;
  const pMul = scene.state.numPlayers === 1 ? TUNING.spawn.soloMul : 1;
  const interval = Math.max(TUNING.spawn.minInterval, TUNING.spawn.baseInterval - I * 120) * pMul;
  const count = w.enemies.countActive(true);
  if (w.spawnTimer <= 0 && count < TUNING.enemyCapHard) {
    w.spawnTimer = interval;
    const name = pickEnemyType(scene);
    if (name) spawnEnemy(scene, name, 820, Phaser.Math.Between(80, 540));
  }
}

function updateEnemies(scene, time) {
  scene.world.enemies.children.iterate((e) => {
    if (!e || !e.active) return;
    if (e.def.bob) e.y = e.baseY + Math.sin(time / 500 + e.phase) * e.def.bob;
    if (e.x < -40) { e.x = 820; e.baseY = Phaser.Math.Between(80, 540); e.y = e.baseY; }
    updateEnemyAI(scene, e, time);
  });
}

function nearestAlivePlayer(scene, x, y) {
  let best = null; let bd = Infinity;
  for (const p of scene.world.players) {
    if (!p.alive) continue;
    if (isCloaked(p, scene.time.now)) continue;
    const dx = p.sprite.x - x; const dy = p.sprite.y - y; const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = p; }
  }
  return best;
}

function spawnEnemyBullet(scene, x, y, vx, vy, damage, color, effect) {
  let b = scene.world.enemyBullets.getFirstDead(false);
  if (!b) { b = scene.physics.add.image(x, y, 'eBullet'); scene.world.enemyBullets.add(b); }
  else { b.setActive(true).setVisible(true); b.body.enable = true; b.setPosition(x, y); }
  b.setTexture('eBullet');
  b.setTint(color || 0xffffff);
  b.damage = damage;
  b.effect = effect || null;
  b.body.setAllowGravity(false);
  b.body.setVelocity(vx, vy);
  return b;
}

function updateEnemyBullets(scene) {
  scene.world.enemyBullets.children.iterate((b) => {
    if (!b || !b.active) return;
    if (b.x < -30 || b.x > GAME_WIDTH + 30 || b.y < -30 || b.y > GAME_HEIGHT + 30) recycle(b);
  });
}

function layEgg(scene, x, y) {
  let egg = scene.world.eggs.getFirstDead(false);
  if (!egg) { egg = scene.physics.add.image(x, y, 'egg'); scene.world.eggs.add(egg); }
  else { egg.setActive(true).setVisible(true); egg.body.enable = true; egg.setPosition(x, y); }
  egg.setTexture('egg');
  egg.body.setAllowGravity(false);
  egg.body.setVelocity(0, 0);
  egg.hp = 3;
  egg.hatchAt = scene.time.now + 7000;
  return egg;
}

function updateEggs(scene, time) {
  scene.world.eggs.children.iterate((egg) => {
    if (!egg || !egg.active) return;
    if (time >= egg.hatchAt) {
      if (scene.world.enemies.countActive(true) < TUNING.enemyCapHard && !atTypeCap(scene, 'duck')) {
        spawnEnemy(scene, 'duck', egg.x, egg.y);
        recycle(egg);
        playSound(scene, 'hatch');
      } else {
        egg.hatchAt = time + 500; // wait for a free duck slot
      }
    }
  });
}

function spawnFireColumn(scene, x, y) {
  const h = 120;
  const col = scene.add.rectangle(x, y, 26, h, COLORS.danger, 0.55).setDepth(5);
  col.setStrokeStyle(2, 0xffd07a, 0.8);
  col.dmgPerSec = 26;
  col.expireAt = scene.time.now + 3500;
  col.hitRect = new Phaser.Geom.Rectangle(x - 13, y - h / 2, 26, h);
  scene.world.hazards.add(col);
  scene.tweens.add({ targets: col, alpha: 0.3, duration: 220, yoyo: true, repeat: -1 });
  playSound(scene, 'fire');
}

function updateHazards(scene, time, delta) {
  scene.world.hazards.children.entries.slice().forEach((col) => {
    if (!col.active) return;
    if (time >= col.expireAt) { col.destroy(); return; }
    const d = delta / 1000;
    for (const p of scene.world.players) {
      if (!p.alive || time < p.invulnUntil) continue;
      if (Phaser.Geom.Rectangle.Contains(col.hitRect, p.sprite.x, p.sprite.y)) {
        damagePlayer(scene, p, col.dmgPerSec * d, time);
      }
    }
  });
}

function updateEnemyAI(scene, e, time) {
  const def = e.def;
  const fire = def.fireMs && time >= e.nextFire;

  if (def.attack === 'straight') {
    if (fire) { e.nextFire = time + def.fireMs; spawnEnemyBullet(scene, e.x - 16, e.y, -300, 0, def.bDmg, 0xff8a4a); }
  } else if (def.attack === 'aimed') {
    if (fire) {
      e.nextFire = time + def.fireMs;
      const t = nearestAlivePlayer(scene, e.x, e.y);
      if (t) {
        const ang = Math.atan2(t.sprite.y - e.y, t.sprite.x - e.x);
        const sp = 300;
        spawnEnemyBullet(scene, e.x - 14, e.y, Math.cos(ang) * sp, Math.sin(ang) * sp, def.bDmg, def.bColor || 0xff8a4a);
      }
    }
  } else if (def.attack === 'dolphin') {
    if (fire) {
      e.nextFire = time + def.fireMs;
      const t = nearestAlivePlayer(scene, e.x, e.y);
      if (t) {
        const ang = Math.atan2(t.sprite.y - e.y, t.sprite.x - e.x);
        spawnEnemyBullet(scene, e.x - 14, e.y, Math.cos(ang) * 260, Math.sin(ang) * 260, 6, 0x6fd0ff, 'slow');
      }
    }
  } else if (def.attack === 'duck') {
    if (!e.ai.laid) e.ai.laid = 0;
    if (e.ai.laid < 3) {
      if (!e.ai.nextEgg) e.ai.nextEgg = time + 3000;
      if (time >= e.ai.nextEgg) {
        if (scene.world.eggs.countActive(true) < TUNING.maxEggs) {
          layEgg(scene, Phaser.Math.Between(PLAY.minX + 40, PLAY.maxX), Phaser.Math.Between(PLAY.minY + 20, PLAY.maxY));
          e.ai.laid += 1;
        }
        e.ai.nextEgg = time + 3000; // retry next cycle (waits if egg cap reached)
      }
    } else if (!e.ai.kamikaze) {
      e.ai.kamikaze = true;
      const t = nearestAlivePlayer(scene, e.x, e.y);
      if (t) {
        const ang = Math.atan2(t.sprite.y - e.y, t.sprite.x - e.x);
        e.body.setVelocity(Math.cos(ang) * 320, Math.sin(ang) * 320);
        e.def = Object.assign({}, def, { bob: 0 });
      }
    }
  } else if (def.attack === 'dragon') {
    if (fire) {
      e.nextFire = time + 4200;
      const t = nearestAlivePlayer(scene, e.x, e.y);
      const fx = Phaser.Math.Clamp((t ? t.sprite.x : e.x - 120), PLAY.minX, PLAY.maxX);
      const fy = Phaser.Math.Clamp((t ? t.sprite.y : e.y), 130, GAME_HEIGHT - 70);
      scene.time.delayedCall(500, () => { if (e.active) spawnFireColumn(scene, fx, fy); });
    }
  } else if (def.attack === 'hero') {
    if (fire) {
      e.nextFire = time + def.fireMs;
      const t = nearestAlivePlayer(scene, e.x, e.y);
      if (t) fireHeroLaser(scene, e, t, time);
    }
  }
}

function fireHeroLaser(scene, e, target, time) {
  const ty = target.sprite.y;
  const warn = scene.add.rectangle(e.x / 2, ty, e.x, 3, 0xff3a3a, 0.4).setDepth(4);
  scene.tweens.add({ targets: warn, alpha: 0.9, duration: 400, yoyo: true, onComplete: () => warn.destroy() });
  scene.time.delayedCall(450, () => {
    if (!scene.world || !e.active) return;
    const beam = scene.add.rectangle(e.x / 2, ty, e.x, 10, 0xff5a5a, 0.85).setDepth(6);
    beam.hitRect = new Phaser.Geom.Rectangle(0, ty - 6, e.x, 12);
    scene.tweens.add({ targets: beam, alpha: 0, duration: 260, onComplete: () => beam.destroy() });
    const now = scene.time.now;
    for (const p of scene.world.players) {
      if (p.alive && now >= p.invulnUntil && Phaser.Geom.Rectangle.Contains(beam.hitRect, p.sprite.x, p.sprite.y)) {
        damagePlayer(scene, p, 28, now);
      }
    }
  });
}

// ---- Full HUD ----
function createHud(scene) {
  if (scene.hud && scene.hud.container) scene.hud.container.destroy();
  const c = scene.add.container(0, 0).setDepth(10);
  scene.hud = { container: c, sides: {} };
  const makeSide = (p, x, originX) => {
    const label = scene.add.text(x, 6, p.label, { fontFamily: 'monospace', fontSize: '13px', color: p.key === 'p1' ? '#e1ff00' : '#ff6ec7', fontStyle: 'bold' }).setOrigin(originX, 0);
    const hpBg = scene.add.rectangle(x, 26, 150, 10, 0x222a44, 1).setOrigin(originX, 0.5);
    const hpFill = scene.add.rectangle(originX === 0 ? x : x - 150, 26, 150, 10, COLORS.hpFull, 1).setOrigin(0, 0.5);
    const lives = scene.add.text(x, 40, '', { fontFamily: 'monospace', fontSize: '12px', color: '#f3f7ff' }).setOrigin(originX, 0);
    const xpBg = scene.add.rectangle(x, 56, 150, 5, 0x222a44, 1).setOrigin(originX, 0.5);
    const xpFill = scene.add.rectangle(originX === 0 ? x : x - 150, 56, 0, 5, COLORS.xp, 1).setOrigin(0, 0.5);
    const ab = scene.add.text(x, 64, '', { fontFamily: 'monospace', fontSize: '11px', color: '#9aa3d0' }).setOrigin(originX, 0);
    c.add([label, hpBg, hpFill, lives, xpBg, xpFill, ab]);
    return { hpFill, hpBg, lives, xpFill, ab, x, originX };
  };
  scene.hud.sides.p1 = makeSide(scene.world.players[0], 12, 0);
  if (scene.world.players[1]) scene.hud.sides.p2 = makeSide(scene.world.players[1], GAME_WIDTH - 12, 1);
  scene.hud.center = scene.add.text(GAME_WIDTH / 2, 6, '', { fontFamily: 'monospace', fontSize: '14px', color: '#7cf2ff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0);
  c.add(scene.hud.center);
}

function refreshHud(scene) {
  const time = scene.time.now;
  const abIcons = [['1', 'basic'], ['2', 'laser'], ['3', 'flame'], ['4', 'shield'], ['5', 'bomb'], ['6', 'cloak']];
  for (const p of scene.world.players) {
    const s = scene.hud.sides[p.key];
    const hpPct = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    s.hpFill.width = 150 * hpPct;
    s.hpFill.x = s.originX === 0 ? s.x : s.x - 150;
    s.hpFill.setFillStyle(hpPct > 0.35 ? COLORS.hpFull : COLORS.hpLow, 1);
    s.lives.setText(p.spectator ? 'OUT' : `LIVES ${'♥'.repeat(Math.max(0, p.lives))}  LV${p.level}`);
    const xpPct = Phaser.Math.Clamp(p.xp / p.xpToNext, 0, 1);
    s.xpFill.width = 150 * xpPct;
    s.xpFill.x = s.originX === 0 ? s.x : s.x - 150;
    const row = abIcons.map(([n, id]) => {
      const a = p.abilities[id];
      if (!a.unlocked) return `${n}·`;
      const ready = (p.fireCooldown[id] || 0) <= time;
      return ready ? `${n}●` : `${n}○`;
    }).join(' ');
    s.ab.setText(row);
  }
  scene.hud.center.setText(`SCORE ${scene.state.score}\n${Math.floor(scene.state.elapsed / 1000)}s`);
}

// ---- Textures (filled in Task 2) ----
function buildTextures(scene) {
  const mk = (key, w, h, draw) => {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };

  mk('px', 2, 2, (g) => g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2));

  const saucer = (g, body) => {
    g.fillStyle(body, 1).fillEllipse(18, 20, 34, 14);
    g.fillStyle(0xcfe8ff, 1).fillEllipse(18, 13, 18, 14);
    g.fillStyle(0x9fd0ff, 0.6).fillEllipse(18, 12, 10, 8);
    g.fillStyle(0xffffff, 1).fillCircle(8, 22, 2).fillCircle(18, 24, 2).fillCircle(28, 22, 2);
  };
  mk('ovniP1', 36, 30, (g) => saucer(g, COLORS.p1));
  mk('ovniP2', 36, 30, (g) => saucer(g, COLORS.p2));

  mk('pBullet', 14, 6, (g) => { g.fillStyle(0xffffff, 1).fillRect(0, 1, 14, 4); g.fillStyle(COLORS.accent, 1).fillRect(0, 0, 10, 6); });
  mk('eBullet', 8, 8, (g) => { g.fillStyle(0xff8a4a, 1).fillCircle(4, 4, 4); g.fillStyle(0xfff0c0, 1).fillCircle(4, 4, 2); });
  mk('egg', 26, 32, (g) => { g.fillStyle(COLORS.egg, 1).fillEllipse(13, 17, 22, 28); g.fillStyle(0xd8c79a, 1).fillEllipse(13, 22, 12, 9); });
  mk('spark', 6, 6, (g) => g.fillStyle(0xffffff, 1).fillRect(0, 0, 6, 6));

  // Enemies — all face LEFT, now ~40-52px so the ~40px circular hitbox matches the art.
  mk('plane', 44, 40, (g) => {
    g.fillStyle(0xc8ccd6, 1).fillTriangle(2, 20, 40, 10, 40, 30);
    g.fillStyle(0x8a93c8, 1).fillTriangle(22, 20, 42, 2, 34, 20);
    g.fillStyle(0x8a93c8, 1).fillTriangle(22, 20, 42, 38, 34, 20);
    g.fillStyle(0xcfe8ff, 0.9).fillCircle(12, 20, 4);
  });
  mk('helicopter', 48, 40, (g) => {
    g.fillStyle(0x6f7a4a, 1).fillRoundedRect(8, 16, 30, 18, 7);
    g.fillStyle(0x9fb06a, 1).fillRect(2, 22, 8, 6);
    g.fillStyle(0xcfe8ff, 0.85).fillRect(12, 19, 12, 10);
    g.fillStyle(0xdddddd, 1).fillRect(2, 8, 44, 3);
    g.fillStyle(0x4a5232, 1).fillRect(20, 33, 14, 3);
  });
  mk('duck', 40, 40, (g) => {
    g.fillStyle(0xffe24d, 1).fillEllipse(24, 25, 28, 22);          // body
    g.fillStyle(0xf0c83a, 1).fillTriangle(26, 18, 39, 10, 37, 26); // wing
    g.fillStyle(0xffe24d, 1).fillCircle(17, 14, 9);               // head
    g.fillStyle(0xff8a3a, 1).fillTriangle(0, 15, 11, 10, 11, 20); // beak protruding left
    g.fillStyle(0xe06a1a, 1).fillTriangle(0, 15, 9, 13, 9, 18);   // beak shading (lower bill)
    g.fillStyle(0x222222, 1).fillCircle(16, 11, 2);              // eye
  });
  mk('fighter', 46, 40, (g) => {
    g.fillStyle(0x3a4a6a, 1).fillTriangle(2, 20, 44, 10, 44, 30);
    g.fillStyle(0x6fa8ff, 1).fillTriangle(24, 20, 42, 2, 34, 20);
    g.fillStyle(0x6fa8ff, 1).fillTriangle(24, 20, 42, 38, 34, 20);
    g.fillStyle(0xcfe8ff, 0.85).fillCircle(12, 20, 4);
  });
  mk('warplane', 50, 42, (g) => {
    g.fillStyle(0x5a5f3a, 1).fillTriangle(2, 21, 46, 10, 46, 32);
    g.fillStyle(0x3f4a2e, 1).fillRect(22, 4, 16, 34);
    g.fillStyle(0x2a2f1e, 1).fillRect(40, 14, 8, 14);
    g.fillStyle(0x222222, 1).fillCircle(12, 21, 4);
  });
  mk('stealth', 48, 40, (g) => {
    g.fillStyle(0x2a2f55, 1).fillTriangle(2, 20, 46, 6, 46, 34);
    g.fillStyle(0x4a5285, 1).fillTriangle(2, 20, 26, 12, 26, 28);
  });
  mk('witch', 40, 44, (g) => {
    g.fillStyle(0x6a4a2a, 1).fillRect(3, 30, 28, 3);                                            // broom handle
    g.fillStyle(0xc89a4a, 1).fillTriangle(29, 25, 40, 31, 29, 38);                              // bristles (back)
    g.fillStyle(0x2a1e3a, 1).fillPoints([{ x: 13, y: 18 }, { x: 25, y: 18 }, { x: 29, y: 33 }, { x: 9, y: 33 }], true); // cloak
    g.fillStyle(0xe8c8a0, 1).fillCircle(17, 16, 5);                                            // face
    g.fillStyle(0x140a22, 1).fillCircle(15, 16, 1.4);                                          // eye
    g.fillStyle(0x6b2fa0, 1).fillTriangle(5, 9, 16, 5, 19, 15);                                // hat cone (tilted left)
    g.fillStyle(0x4a1f70, 1).fillEllipse(13, 15, 20, 4);                                       // hat brim
    g.fillStyle(0xffe24d, 1).fillCircle(10, 9, 1.2);                                          // star
  });
  mk('hero', 40, 48, (g) => {
    g.fillStyle(0xff3a3a, 1).fillTriangle(20, 14, 38, 30, 20, 44); // cape trailing back
    g.fillStyle(0x2a44ff, 1).fillRect(12, 14, 16, 30);            // vertical body
    g.fillStyle(0xe8c8a0, 1).fillCircle(20, 10, 8);              // head
    g.fillStyle(0xffe24d, 1).fillRect(16, 22, 8, 6);            // emblem
    g.fillStyle(0x1a2aaa, 1).fillRect(12, 38, 6, 8).fillRect(22, 38, 6, 8); // legs
  });
  mk('dragon', 52, 44, (g) => {
    g.fillStyle(0x2e8a3c, 1).fillPoints([{ x: 30, y: 14 }, { x: 48, y: 3 }, { x: 47, y: 16 }, { x: 40, y: 13 }, { x: 45, y: 24 }], true); // wing
    g.fillStyle(0x3aa84a, 1).fillEllipse(32, 27, 30, 22);                                       // body
    g.fillStyle(0x3aa84a, 1).fillTriangle(48, 26, 52, 18, 52, 34);                              // tail fin
    g.fillStyle(0x3aa84a, 1).fillPoints([{ x: 30, y: 20 }, { x: 13, y: 13 }, { x: 3, y: 17 }, { x: 4, y: 24 }, { x: 14, y: 26 }, { x: 26, y: 28 }], true); // neck + head
    g.fillStyle(0x267a32, 1).fillTriangle(9, 13, 14, 4, 17, 14);                                // horn
    g.fillStyle(0xffd23a, 1).fillCircle(10, 17, 2);                                            // eye
    g.fillStyle(0x1d5a26, 1).fillTriangle(3, 20, 3, 25, 11, 23);                                // jaw
    g.fillStyle(0xff6a2a, 1).fillCircle(4, 22, 1.6);                                           // fire spark
    g.fillStyle(0x2e8a3c, 1).fillRect(24, 37, 5, 6).fillRect(34, 37, 5, 6);                     // legs
  });
  mk('dolphin', 44, 40, (g) => {
    g.fillStyle(0x3a90c8, 1).fillTriangle(36, 18, 44, 8, 44, 28);                               // tail fluke
    g.fillStyle(0x4aa0e0, 1).fillPoints([{ x: 2, y: 25 }, { x: 14, y: 15 }, { x: 30, y: 14 }, { x: 40, y: 19 }, { x: 36, y: 25 }, { x: 22, y: 30 }, { x: 9, y: 29 }], true); // body (nose left)
    g.fillStyle(0x4aa0e0, 1).fillTriangle(19, 14, 27, 3, 31, 15);                               // dorsal fin
    g.fillStyle(0xdff0ff, 1).fillEllipse(20, 26, 22, 7);                                        // belly
    g.fillStyle(0x2f7aa8, 1).fillTriangle(2, 25, 10, 22, 10, 28);                               // snout tip
    g.fillStyle(0x10283a, 1).fillCircle(11, 21, 1.8);                                          // eye
  });
}

// ---- Start menu ----
function createStartScreen(scene) {
  scene.startScreen = {};
  const c = scene.add.container(0, 0).setDepth(15);
  scene.startScreen.container = c;
  c.add(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.92));
  const title = scene.add.text(GAME_WIDTH / 2, 130, 'CDMX INVASION', {
    fontFamily: 'monospace', fontSize: '44px', color: '#7cf2ff', fontStyle: 'bold',
  }).setOrigin(0.5);
  c.add(scene.add.text(GAME_WIDTH / 2, 80, 'PLATANUS HACK 26', {
    fontFamily: 'monospace', fontSize: '16px', color: '#8a93c8',
  }).setOrigin(0.5));
  c.add(title);
  scene.tweens.add({ targets: title, scale: 1.03, alpha: 0.9, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  scene.startScreen.buttons = [];
  const labels = ['1 PLAYER', '2 PLAYERS', 'LEADERBOARD', 'CONTROLS'];
  for (let i = 0; i < labels.length; i += 1) {
    const y = 218 + i * 48;
    const bg = scene.add.rectangle(GAME_WIDTH / 2, y, 300, 44, COLORS.cell, 0.95).setStrokeStyle(2, COLORS.frame, 0.9);
    const label = scene.add.text(GAME_WIDTH / 2, y, labels[i], {
      fontFamily: 'monospace', fontSize: '22px', color: '#f3f7ff', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add(bg); c.add(label);
    scene.startScreen.buttons.push({ bg, label });
  }
  c.add(scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'MOVE ↕   CONFIRM BTN1 / START', {
    fontFamily: 'monospace', fontSize: '11px', color: '#5a628f',
  }).setOrigin(0.5));
  c.add(scene.add.text(GAME_WIDTH / 2, 412, 'TOP SURVIVORS', { fontFamily: 'monospace', fontSize: '13px', color: '#7cf2ff', fontStyle: 'bold' }).setOrigin(0.5));
  scene.startScreen.leaderboard = scene.add.text(GAME_WIDTH / 2, 432, 'NO SCORES YET', { fontFamily: 'monospace', fontSize: '13px', color: '#cdd5ff', align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0);
  c.add(scene.startScreen.leaderboard);
  c.setVisible(false);
}

function refreshStartLeaderboard(scene) {
  const hs = scene.state.highScores;
  const lines = hs.length ? hs.map((e, i) => `${String(i + 1).padStart(2, '0')} ${e.name.padEnd(3, ' ')} ${String(e.score).padStart(6, ' ')}  ${e.time}s`) : ['NO SCORES YET'];
  if (scene.startScreen.leaderboard) scene.startScreen.leaderboard.setText(lines.join('\n'));
}

function showStartScreen(scene) {
  scene.state.phase = 'start';
  scene.state.menu = { cursor: 0, cooldownUntil: 0, lastAxis: 0 };
  updateStartMenuHighlight(scene);
  scene.startScreen.container.setVisible(true);
}

function updateStartMenuHighlight(scene) {
  const cursor = scene.state.menu.cursor;
  scene.startScreen.buttons.forEach(({ bg, label }, i) => {
    const active = i === cursor;
    bg.setFillStyle(active ? COLORS.accent : COLORS.cell, active ? 1 : 0.95);
    bg.setStrokeStyle(2, active ? COLORS.white : COLORS.frame, active ? 1 : 0.9);
    label.setColor(active ? '#04110b' : '#f3f7ff');
  });
}

function handleStartMenu(scene, time) {
  const menu = scene.state.menu;
  const axisY = getVerticalMenuAxis(scene.controls);
  if (time >= menu.cooldownUntil && axisY !== 0 && menu.lastAxis !== axisY) {
    menu.cursor = Phaser.Math.Wrap(menu.cursor + axisY, 0, scene.startScreen.buttons.length);
    menu.cooldownUntil = time + 160;
    updateStartMenuHighlight(scene);
  }
  menu.lastAxis = axisY;
  if (consumeAnyPressedControl(scene, ['P1_1', 'P2_1', 'START1', 'START2'])) {
    if (menu.cursor === 0) startMatch(scene, 1);
    else if (menu.cursor === 1) startMatch(scene, 2);
    else if (menu.cursor === 2) showInfoScreen(scene, 'leaderboard');
    else showInfoScreen(scene, 'controls');
  }
}

function showInfoScreen(scene, kind) {
  if (!scene.infoScreen) {
    const c = scene.add.container(0, 0).setDepth(18).setVisible(false);
    scene.infoScreen = { container: c, body: null };
    c.add(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.98));
    scene.infoScreen.titleText = scene.add.text(GAME_WIDTH / 2, 80, '', { fontFamily: 'monospace', fontSize: '28px', color: '#7cf2ff', fontStyle: 'bold' }).setOrigin(0.5);
    scene.infoScreen.body = scene.add.text(GAME_WIDTH / 2, 150, '', { fontFamily: 'monospace', fontSize: '16px', color: '#f3f7ff', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0);
    c.add(scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 28, 'PRESS START TO GO BACK', { fontFamily: 'monospace', fontSize: '12px', color: '#5a628f' }).setOrigin(0.5));
    c.add([scene.infoScreen.titleText, scene.infoScreen.body]);
  }
  if (kind === 'leaderboard') {
    scene.infoScreen.titleText.setText('LEADERBOARD');
    const hs = scene.state.highScores;
    scene.infoScreen.body.setText(hs.length ? hs.map((e, i) => `${String(i + 1).padStart(2, '0')}  ${e.name.padEnd(3, ' ')}  ${String(e.score).padStart(6, ' ')}  ${e.time}s`).join('\n') : 'NO SCORES YET');
  } else {
    scene.infoScreen.titleText.setText('CONTROLS');
    scene.infoScreen.body.setText([
      'MOVE      JOYSTICK', '', 'B1 BASIC   B2 LASER   B3 FLAME',
      'B4 SHIELD  B5 BOMB    B6 CLOAK', '', 'UNLOCK B2-B6 BY LEVELING UP', '', 'START      PAUSE',
    ].join('\n'));
  }
  scene.startScreen.container.setVisible(false);
  scene.infoScreen.container.setVisible(true);
  scene.state.phase = 'info';
}

// ---- Match lifecycle (expanded in later tasks) ----
function startMatch(scene, numPlayers) {
  scene.startScreen.container.setVisible(false);
  scene.state.elapsed = 0;
  scene.state.intensity = 0;
  scene.state.score = 0;
  scene.state._bonusAcc = 0;
  scene.state.numPlayers = numPlayers === 1 ? 1 : 2;
  if (scene.sound && scene.sound.context && scene.sound.context.state === 'suspended') scene.sound.context.resume();
  createWorld(scene, scene.state.numPlayers);
  createHud(scene);
  scene.physics.resume();
  scene.state.phase = 'playing';
}

function createPauseScreen(scene) {
  scene.pauseScreen = {};
  const c = scene.add.container(0, 0).setDepth(25);
  scene.pauseScreen.container = c;
  c.add(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.82));
  c.add(scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, 'PAUSED', {
    fontFamily: 'monospace', fontSize: '50px', color: '#7cf2ff', fontStyle: 'bold',
  }).setOrigin(0.5));
  c.add(scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 34, 'PRESS START TO RESUME', {
    fontFamily: 'monospace', fontSize: '15px', color: '#8a93c8',
  }).setOrigin(0.5));
  c.setVisible(false);
}
function pauseMatch(scene) { scene.state.phase = 'paused'; scene.physics.pause(); scene.pauseScreen.container.setVisible(true); }
function resumeMatch(scene) { scene.pauseScreen.container.setVisible(false); scene.physics.resume(); scene.state.phase = 'playing'; }
