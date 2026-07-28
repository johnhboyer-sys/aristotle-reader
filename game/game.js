const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const RENDER_W = canvas.width;
const RENDER_H = canvas.height;
const W = 960;
const H = 540;
const GROUND_Y = 444;

const keys = new Set();
const touch = new Set();
const ui = {
  heroName: document.getElementById("heroName"),
  stageName: document.getElementById("stageName"),
  start: document.getElementById("startGame"),
  pause: document.getElementById("pauseGame"),
  reset: document.getElementById("resetGame"),
  aristotle: document.getElementById("chooseAristotle"),
  aquinas: document.getElementById("chooseAquinas"),
  socrates: document.getElementById("chooseSocrates"),
  showKeys: document.getElementById("showKeys"),
  hideKeys: document.getElementById("hideKeys"),
  keysGuide: document.getElementById("keysGuide"),
};

let helpPausedGame = false;

function setKeysGuide(open) {
  ui.keysGuide.hidden = !open;
  ui.showKeys.setAttribute("aria-expanded", String(open));
  if (open && state?.mode === "playing") {
    helpPausedGame = true;
    state.mode = "paused";
    state.message = "PAUSED";
    keys.clear();
    touch.clear();
    state.player.jumpHeld = false;
  } else if (!open && helpPausedGame) {
    if (state?.mode === "paused") {
      state.mode = "playing";
      state.message = "";
    }
    helpPausedGame = false;
  }
  if (open) ui.hideKeys.focus();
  else ui.showKeys.focus();
}

const heroes = {
  Aristotle: {
    name: "Aristotle",
    tunic: "#efe0b0",
    trim: "#a64f58",
    hair: "#d7c48b",
    speed: 2.45,
    jump: 10.2,
    attackName: "Syllogism",
    specialName: "Golden Mean",
    projectile: "#f0c15b",
    attackQuips: [
      "Major premise: ouch.",
      "Observe the form!",
      "Category mistake!",
      "Cause this!",
      "Peripatetic uppercut.",
      "Your logic limps.",
      "Substance beats spin.",
      "I distinguish and strike.",
    ],
    specialQuips: [
      "Mean between cowardice and combo.",
      "Virtue, but make it kinetic.",
      "Extremes are cancelled.",
      "Golden mean, iron consequences.",
      "Excess and defect: begone.",
      "Habituate this.",
    ],
    blockQuips: [
      "Your objection lacks penetration.",
      "Shielded by the excluded middle.",
      "A sound defense is still sound.",
      "That blow was merely accidental.",
      "Potential damage: not actualized.",
    ],
  },
  Aquinas: {
    name: "Aquinas",
    tunic: "#f4f0ce",
    trim: "#1d2030",
    hair: "#6a4b35",
    speed: 2.1,
    jump: 9.8,
    attackName: "Article",
    specialName: "Five Ways",
    projectile: "#6dd6c4",
    attackQuips: [
      "On the contrary: bonk.",
      "I answer that: no.",
      "Sed contra, incoming.",
      "Reply to objection: whack.",
      "Article one: duck.",
      "Your premise lacks grace.",
      "This requires distinction.",
      "Behold scholastic velocity.",
    ],
    specialQuips: [
      "Five Ways, one problem.",
      "Motion has entered the chat.",
      "Contingency check!",
      "Efficient cause cascade.",
      "Degrees of perfection: maxed.",
      "Final cause, final warning.",
    ],
    blockQuips: [
      "I answer that: blocked.",
      "This shield admits no objection.",
      "Sed contra: clang.",
      "Your force requires distinction.",
      "Reply to objection: no damage.",
    ],
  },
  Socrates: {
    name: "Socrates",
    tunic: "#d6e0dc",
    trim: "#607e91",
    hair: "#b9b1a6",
    speed: 2.3,
    jump: 10.5,
    attackName: "Elenchus",
    specialName: "Socratic Method",
    projectile: "#9bd6ff",
    attackQuips: [
      "But what do you mean by 'ouch'?",
      "I know only that you should duck.",
      "An unexamined combo is not worth taking.",
      "Please define 'getting wrecked.'",
      "Let us examine your hitbox.",
      "Your confidence is doing all the work.",
      "I brought questions. And knuckles.",
      "Is that armor, or merely belief?",
      "Interesting premise. Terrible footing.",
      "I ask because I care. Also: bonk.",
      "Do you know that you know that hurt?",
      "Wisdom begins in evasive maneuvers.",
      "No shoes. No shirt. No false certainty.",
      "My feet are bare; your logic is barer.",
      "Hair is just an unexamined accessory.",
      "Baldness: the original thinking cap.",
    ],
    specialQuips: [
      "EVERYONE EXPLAIN YOURSELVES!",
      "Welcome to the group oral exam.",
      "I have several follow-up questions.",
      "The agora is now office hours.",
      "Let the confusion become productive.",
      "Nobody leaves until 'virtue' is defined.",
      "Your contradictions have contradictions.",
      "Pop quiz: why are you like this?",
      "Socratic Method: participation mandatory.",
      "Knowledge unlocked: nobody knows anything.",
      "I am not trapped here with you. Why?",
      "Class dismissed when certainty collapses.",
    ],
    blockQuips: [
      "Are you sure you struck me?",
      "Define 'successful attack.'",
      "The shield knows what I do not.",
      "That blow raised more questions.",
      "My defense rests. Barefoot.",
      "An examined shield holds up.",
      "You hit the argument, not the man.",
      "Bald, barefoot, and still unbothered.",
    ],
  },
};

const enemyTypes = {
  sophist: {
    label: "Sophist",
    quips: [
      "Words mean whatever wins!",
      "Define define. I dare you.",
      "Truth polls poorly.",
      "A fee first, then wisdom.",
      "My premise has charisma.",
      "Technically, I said maybe.",
      "Behold: weaponized ambiguity.",
      "I refute you with volume!",
    ],
    hp: 2,
    speed: 1.0,
    color: "#d85c7f",
    points: 120,
  },
  heretic: {
    label: "Heretic",
    quips: [
      "I have a very private council.",
      "Tradition? I skimmed it.",
      "My footnote outranks Nicaea.",
      "Arius was just workshopping.",
      "One nature, two loopholes.",
      "Please ignore canon 1.",
      "Orthodoxy is so mainstream.",
      "My creed has patch notes.",
    ],
    hp: 3,
    speed: 0.72,
    color: "#8a6ee8",
    flying: true,
    points: 170,
  },
  materialist: {
    label: "Materialist",
    quips: [
      "Only atoms. Also vibes.",
      "Soul? Check the microscope.",
      "Love is wet chemistry.",
      "Your form needs funding.",
      "I reduced lunch to particles.",
      "Meaning is just crunchy matter.",
      "Final cause? Never heard of her.",
      "Consciousness is spicy dust.",
    ],
    hp: 4,
    speed: 0.55,
    color: "#8c7d62",
    heavy: true,
    points: 210,
  },
  nominalist: {
    label: "Nominalist",
    quips: [
      "Universal? Never met one.",
      "That is just a nickname.",
      "Horse is a social construct.",
      "Essence? Sounds expensive.",
      "I deleted the category.",
      "Common nature? Common rumor.",
      "Names all the way down.",
      "Genus is office gossip.",
    ],
    hp: 2,
    speed: 1.22,
    color: "#58a7d6",
    points: 150,
  },
  consequentialist: {
    label: "Consequentialist",
    quips: [
      "Trust me, the math excuses it.",
      "Bad act, great spreadsheet.",
      "The trolley loves nuance.",
      "Intentions are inefficient.",
      "I optimized the monastery.",
      "Ends justify my invoice.",
      "Virtue has poor metrics.",
      "Collateral syllogisms happen.",
    ],
    hp: 3,
    speed: 0.95,
    color: "#e18d3c",
    points: 190,
  },
  relativism: {
    label: "Relativism Engine",
    quips: [
      "Final boss, depending on context.",
      "Truth is locally hosted.",
      "Your victory is your truth.",
      "Objective? In this economy?",
      "I am defeated, for you.",
      "My health bar is interpretive.",
      "Contradiction is a lifestyle.",
      "Reality lacks permissions.",
    ],
    hp: 18,
    speed: 0.4,
    color: "#c84d4d",
    boss: true,
    points: 1000,
  },
  skeptic: {
    label: "Radical Skeptic",
    quips: [
      "Are you sure that hit me?",
      "I doubt, therefore... wait.",
      "Evidence is just confident gossip.",
      "That health bar is anecdotal.",
      "I question your question mark.",
      "Maybe I dodged in another framework.",
      "Certainty has terrible reviews.",
      "Source: vibes, critically examined.",
    ],
    hp: 3,
    speed: 1.15,
    color: "#73c9c5",
    points: 185,
  },
  bureaucrat: {
    label: "Being Bureaucrat",
    quips: [
      "Form 4B proves you exist.",
      "Your essence is pending approval.",
      "Take a number, prime mover.",
      "Substance closes at five.",
      "Wrong queue for final causes.",
      "Being requires two witnesses.",
      "I stamped your potentiality.",
      "Actualization takes six weeks.",
    ],
    hp: 5,
    speed: 0.62,
    color: "#d0a65a",
    heavy: true,
    points: 240,
  },
  regress: {
    label: "Infinite Regress",
    quips: [
      "But what caused THAT cause?",
      "My origin story has no beginning.",
      "One more why. Just one more.",
      "Boss phase? Before this was another.",
      "I filed an appeal of my first cause.",
      "The buck stops nowhere.",
      "Loading previous explanation...",
      "My backstory needs a backstory.",
    ],
    hp: 20,
    speed: 0.46,
    color: "#9175e8",
    boss: true,
    points: 1200,
  },
  algorithm: {
    label: "The Algorithm",
    quips: [
      "You engaged, therefore I am.",
      "I optimized truth for retention.",
      "Virtue is not trending.",
      "Your telos violates my terms.",
      "I recommend twelve worse opinions.",
      "Free will skipped the ad.",
      "Reality is now personalized.",
      "Like, subscribe, and lose the good.",
    ],
    hp: 24,
    speed: 0.52,
    color: "#ef5f72",
    boss: true,
    points: 1500,
  },
};

const levels = [
  {
    name: "The Lyceum Road",
    banner: "I · THE LYCEUM ROAD",
    worldW: 4200,
    theme: "lyceum",
    clearLine: "Relativism was absolutely defeated. It disagrees, relatively.",
    platforms: [
      [420, 354, 230], [820, 302, 190], [1250, 368, 260], [1740, 318, 220],
      [2220, 374, 280], [2720, 306, 230], [3200, 350, 300],
    ],
    spawns: [
      ["sophist", 560], ["nominalist", 940], ["materialist", 1320], ["heretic", 1660],
      ["consequentialist", 2040], ["sophist", 2360], ["materialist", 2650],
      ["nominalist", 3000], ["heretic", 3300], ["relativism", 3740],
    ],
    pickups: [[720, 264], [1470, 330], [1940, 282], [2480, 336], [2930, 268], [3420, 312]],
  },
  {
    name: "The Scriptorium Siege",
    banner: "II · THE SCRIPTORIUM SIEGE",
    worldW: 4480,
    theme: "scriptorium",
    clearLine: "Infinite Regress finally stopped. Please do not ask what stopped it.",
    platforms: [
      [360, 370, 210], [710, 320, 180], [1080, 260, 210], [1490, 346, 250],
      [1930, 294, 190], [2290, 376, 270], [2750, 324, 230], [3180, 268, 190], [3580, 350, 300],
    ],
    spawns: [
      ["skeptic", 510], ["heretic", 820], ["nominalist", 1190], ["bureaucrat", 1540],
      ["skeptic", 1900], ["materialist", 2260], ["heretic", 2680], ["bureaucrat", 3080],
      ["consequentialist", 3460], ["regress", 4020],
    ],
    pickups: [[510, 330], [850, 278], [1240, 218], [1680, 304], [2390, 334], [2940, 282], [3650, 308]],
  },
  {
    name: "The Agora After Dark",
    banner: "III · THE AGORA AFTER DARK",
    worldW: 4760,
    theme: "agora",
    clearLine: "The Algorithm has been taught the one metric it feared: the good.",
    platforms: [
      [430, 330, 210], [790, 382, 230], [1190, 306, 190], [1530, 248, 220],
      [1940, 354, 260], [2390, 286, 190], [2780, 370, 250], [3200, 316, 220],
      [3600, 258, 180], [3930, 350, 300],
    ],
    spawns: [
      ["consequentialist", 550], ["skeptic", 900], ["bureaucrat", 1260], ["sophist", 1630],
      ["materialist", 2020], ["nominalist", 2400], ["skeptic", 2820], ["bureaucrat", 3250],
      ["heretic", 3620], ["consequentialist", 3970], ["algorithm", 4320],
    ],
    pickups: [[570, 288], [960, 340], [1320, 264], [1640, 206], [2110, 312], [2890, 328], [3350, 274], [3710, 216]],
  },
];

const pickupQuips = [
  "VIRTUE SCROLL: NOW WITH MARGINS",
  "WISDOM ACQUIRED, RECEIPT LOST",
  "RARE DROP: A PRIMARY SOURCE",
  "FOOTNOTE OF UNUSUAL POWER",
  "READING COMPLETED. MIRACULOUS.",
  "NEW SCROLL, OLD ARGUMENT",
  "KNOWLEDGE +1, HUBRIS UNCHANGED",
  "A VERY SMALL GREAT BOOK",
];

function buildPlatforms(level) {
  return [
    { x: 0, y: GROUND_Y, w: level.worldW, h: 96, kind: "ground" },
    ...level.platforms.map(([x, y, w]) => ({ x, y, w, h: 28 })),
  ];
}

let state;
let last = 0;
let messageTimer = 0;
let audioCtx;
let audioEnabled = true;
let musicEnabled = true;
let musicBus;
let musicStep = 0;
let musicClock = 0;

function ensureAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
      musicBus = audioCtx.createGain();
      const distortion = audioCtx.createWaveShaper();
      const compressor = audioCtx.createDynamicsCompressor();
      const curve = new Float32Array(512);
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / curve.length - 1;
        curve[i] = ((3 + 28) * x * 20 * Math.PI / 180) / (Math.PI + 28 * Math.abs(x));
      }
      distortion.curve = curve;
      distortion.oversample = "2x";
      musicBus.gain.value = 0.72;
      musicBus.connect(distortion);
      distortion.connect(compressor);
      compressor.connect(audioCtx.destination);
    }
  }
  if (audioCtx?.state === "suspended") audioCtx.resume();
}

function sfx(kind) {
  if (!audioCtx || !audioEnabled) return;
  const presets = {
    attack: [260, 410, 0.045, "square", 0.035],
    hit: [150, 72, 0.07, "sawtooth", 0.05],
    block: [520, 220, 0.06, "square", 0.035],
    parry: [420, 980, 0.13, "triangle", 0.06],
    dash: [180, 640, 0.09, "sawtooth", 0.035],
    pickup: [520, 1040, 0.14, "triangle", 0.05],
    special: [180, 780, 0.28, "square", 0.055],
    hurt: [120, 55, 0.16, "sawtooth", 0.055],
    win: [330, 1320, 0.5, "triangle", 0.06],
  };
  const [from, to, duration, type, volume] = presets[kind] || presets.hit;
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

const musicThemes = [
  {
    tempo: 132,
    lead: [52, null, 52, 55, 51, null, 58, 55, 52, null, 48, 51, 47, null, 46, 51],
    bass: [28, 28, null, 28, 27, null, 34, 31, 28, 28, null, 27, 23, null, 22, 27],
    kicks: [0, 3, 6, 8, 11, 14],
    snares: [4, 12],
  },
  {
    tempo: 144,
    lead: [50, 50, null, 56, 55, null, 49, 50, 46, null, 53, 52, 46, 47, null, 43],
    bass: [26, null, 26, 32, 31, 25, null, 26, 22, 22, 29, 28, 22, null, 23, 19],
    kicks: [0, 2, 5, 8, 10, 13, 15],
    snares: [4, 7, 12],
  },
  {
    tempo: 152,
    lead: [48, null, 49, 55, 48, 54, 47, null, 43, 49, 48, 42, 43, null, 54, 53],
    bass: [24, 24, 25, 31, 24, 30, 23, 23, 19, 25, 24, 18, 19, 19, 30, 29],
    kicks: [0, 3, 5, 8, 9, 11, 14],
    snares: [4, 12, 15],
  },
];

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function playMusicTone(note, duration, type, volume, detune = 0) {
  if (!audioCtx || !musicBus || note == null) return;
  const oscillator = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  oscillator.type = type;
  oscillator.frequency.value = midiToHz(note);
  oscillator.detune.value = detune;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "sawtooth" ? 1050 : 1750, now);
  filter.frequency.exponentialRampToValueAtTime(260, now + duration);
  filter.Q.value = 3.5;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(musicBus);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playIndustrialDrum(kind) {
  if (!audioCtx || !musicBus) return;
  const now = audioCtx.currentTime;
  if (kind === "kick") {
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(115, now);
    oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    oscillator.connect(gain);
    gain.connect(musicBus);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
    return;
  }
  const duration = kind === "snare" ? 0.11 : 0.035;
  const buffer = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * duration), audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const decay = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  const source = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  source.buffer = buffer;
  filter.type = kind === "snare" ? "bandpass" : "highpass";
  filter.frequency.value = kind === "snare" ? 1700 : 5200;
  filter.Q.value = kind === "snare" ? 0.8 : 2.5;
  gain.gain.setValueAtTime(kind === "snare" ? 0.055 : 0.021, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(musicBus);
  source.start(now);
}

function resetMusic() {
  musicStep = 0;
  musicClock = 0;
}

function updateMusic(dt) {
  if (!audioCtx || !audioEnabled || !musicEnabled || state.mode !== "playing") return;
  const theme = musicThemes[state.levelIndex];
  musicClock -= dt;
  if (musicClock > 0) return;
  const step = musicStep % 16;
  const beatSeconds = 15 / theme.tempo;
  musicClock += 900 / theme.tempo;

  if (theme.kicks.includes(step)) playIndustrialDrum("kick");
  if (theme.snares.includes(step)) playIndustrialDrum("snare");
  if (step % 2 === 1 || state.combo >= 6) playIndustrialDrum("hat");

  const bassNote = theme.bass[step];
  playMusicTone(bassNote, beatSeconds * 1.7, "sawtooth", 0.038);
  if (step % 4 === 0 && bassNote != null) {
    playMusicTone(bassNote + 12, beatSeconds * 3.2, "triangle", 0.014, -9);
  }

  const leadNote = theme.lead[step];
  playMusicTone(leadNote, beatSeconds * 0.8, "square", 0.023);
  if (leadNote != null && (step % 4 === 3 || state.combo >= 10)) {
    playMusicTone(leadNote + 12, beatSeconds * 0.45, "sawtooth", 0.008, 7);
  }
  musicStep += 1;
}

function freshState(heroName = "Aristotle") {
  const level = levels[0];
  return {
    mode: "title",
    cameraX: 0,
    time: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    screenShake: 0,
    scrolls: 0,
    levelIndex: 0,
    message: level.banner,
    hero: heroName,
    player: {
      x: 82,
      y: 360,
      w: 34,
      h: 58,
      vx: 0,
      vy: 0,
      dir: 1,
      hp: 6,
      maxHp: 6,
      virtue: 0,
      guard: 100,
      maxGuard: 100,
      blocking: false,
      guardCd: 0,
      blockHeld: false,
      parryTimer: 0,
      dashCd: 0,
      dashTimer: 0,
      dashHeld: false,
      grounded: false,
      jumpsUsed: 0,
      maxJumps: 2,
      jumpHeld: false,
      attackCd: 0,
      hurtCd: 0,
      specialCd: 0,
      attackAnim: 0,
      specialAnim: 0,
      talk: 0,
      quip: "",
    },
    platforms: buildPlatforms(level),
    enemies: level.spawns.map(([type, x], i) => makeEnemy(type, x, i)),
    projectiles: [],
    enemyShots: [],
    specialBursts: [],
    sparks: [],
    floaters: [],
    afterimages: [],
    pickups: level.pickups.map(([x, y]) => ({ x, y, taken: false })),
  };
}

function loadLevel(index) {
  const level = levels[index];
  state.levelIndex = index;
  state.cameraX = 0;
  state.platforms = buildPlatforms(level);
  state.enemies = level.spawns.map(([type, x], i) => makeEnemy(type, x, i));
  state.pickups = level.pickups.map(([x, y]) => ({ x, y, taken: false }));
  state.projectiles = [];
  state.enemyShots = [];
  state.specialBursts = [];
  state.floaters = [];
  state.afterimages = [];
  state.player.x = 82;
  state.player.y = 360;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
  state.player.guard = state.player.maxGuard;
  state.player.blocking = false;
  state.player.guardCd = 0;
  state.player.dashCd = 0;
  state.player.dashTimer = 0;
  state.player.parryTimer = 0;
  state.message = level.banner;
  messageTimer = 120;
  resetMusic();
  ui.stageName.textContent = level.name;
}

function makeEnemy(type, x, i) {
  const cfg = enemyTypes[type];
  return {
    id: `${type}-${i}`,
    type,
    x,
    y: cfg.flying ? 292 : GROUND_Y - (cfg.boss ? 104 : 46),
    w: cfg.boss ? 84 : cfg.heavy ? 48 : 38,
    h: cfg.boss ? 104 : cfg.heavy ? 58 : 46,
    vx: -cfg.speed,
    hp: cfg.hp,
    maxHp: cfg.hp,
    dir: -1,
    alive: true,
    talk: 0,
    quip: pickQuip(cfg),
    shotCd: 80 + i * 17,
  };
}

function pickQuip(cfg, previous = "") {
  const quips = cfg.quips || [];
  if (quips.length === 0) return "";
  if (quips.length === 1) return quips[0];
  let next = previous;
  while (next === previous) {
    next = quips[Math.floor(Math.random() * quips.length)];
  }
  return next;
}

function setHero(heroName) {
  state.hero = heroName;
  ui.heroName.textContent = heroName;
  ui.aristotle.classList.toggle("active", heroName === "Aristotle");
  ui.aquinas.classList.toggle("active", heroName === "Aquinas");
  ui.socrates.classList.toggle("active", heroName === "Socrates");
}

function rects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pressed(...names) {
  return names.some((name) => keys.has(name) || touch.has(name));
}

function start() {
  ensureAudio();
  const previousMode = state.mode;
  if (previousMode === "won" || previousMode === "lost") state = freshState(state.hero);
  if (previousMode === "levelComplete") loadLevel(state.levelIndex + 1);
  state.mode = "playing";
  if (previousMode === "title" || previousMode === "won" || previousMode === "lost") {
    state.message = levels[state.levelIndex].banner;
    messageTimer = 120;
    resetMusic();
  }
  ui.stageName.textContent = levels[state.levelIndex].name;
}

function pause() {
  if (state.mode === "playing") {
    state.mode = "paused";
    state.message = "PAUSED";
  } else if (state.mode === "paused") {
    state.mode = "playing";
    state.message = "";
  }
}

function reset() {
  state = freshState(state.hero);
  setHero(state.hero);
  ui.stageName.textContent = levels[0].name;
}

function attack() {
  const p = state.player;
  const hero = heroes[state.hero];
  if (p.attackCd > 0 || p.blocking) return;
  const profiles = {
    Aristotle: { cooldown: 24, speed: 8.2, size: 16, life: 42, label: "IF", damage: 1 },
    Aquinas: { cooldown: 32, speed: 6.4, size: 20, life: 62, label: "Q", damage: 2 },
    Socrates: { cooldown: 27, speed: 7.4, size: 30, life: 52, label: "WHY?", damage: 1 },
  };
  const profile = profiles[state.hero];
  p.attackCd = profile.cooldown;
  p.attackAnim = 16;
  p.talk = 48;
  p.quip = pickQuip({ quips: hero.attackQuips }, p.quip);
  state.projectiles.push({
    x: p.x + (p.dir > 0 ? p.w - 4 : -profile.size + 4),
    y: p.y + 20,
    w: profile.size,
    h: 12,
    vx: profile.speed * p.dir,
    life: profile.life,
    color: hero.projectile,
    label: profile.label,
    dmg: profile.damage,
  });
  addSpark(p.x + p.w / 2, p.y + 26, hero.projectile, 8);
  sfx("attack");
}

function special() {
  const p = state.player;
  const hero = heroes[state.hero];
  if (p.virtue < 100 || p.specialCd > 0 || p.blocking) return;
  p.virtue = 0;
  p.specialCd = 90;
  p.specialAnim = 42;
  p.talk = 96;
  p.quip = pickQuip({ quips: hero.specialQuips }, p.quip);
  state.message = hero.specialName.toUpperCase();
  messageTimer = 90;
  state.screenShake = 10;
  sfx("special");
  triggerSpecialBurst(state.hero, p.x + p.w / 2, p.y + p.h / 2, p.dir);
  if (state.hero === "Aristotle") {
    for (const e of state.enemies) {
      if (e.alive && Math.abs(e.x - p.x) < 250) damageEnemy(e, 4);
    }
    for (let i = 0; i < 36; i++) addSpark(p.x + p.w / 2, p.y + p.h / 2, "#f0c15b", 26);
  } else if (state.hero === "Aquinas") {
    for (let i = -2; i <= 2; i++) {
      state.projectiles.push({
        x: p.x + p.w / 2,
        y: p.y + 18 + i * 9,
        w: 28,
        h: 8,
        vx: (8 + Math.abs(i)) * p.dir,
        vy: i * 0.35,
        life: 85,
        color: "#f4f0ce",
        label: "V",
        dmg: 3,
      });
    }
  } else {
    for (const e of state.enemies) {
      if (!e.alive || Math.abs(e.x - p.x) >= 360) continue;
      damageEnemy(e, 3);
      e.confused = 150;
      e.shotCd += 90;
      e.vx *= -1;
    }
    for (let i = 0; i < 42; i++) {
      addSpark(
        p.x + p.w / 2 + (Math.random() - 0.5) * 260,
        p.y + p.h / 2 + (Math.random() - 0.5) * 150,
        i % 2 ? "#9bd6ff" : "#f7e9b6",
        14,
      );
    }
  }
}

function triggerSpecialBurst(heroName, x, y, dir) {
  state.specialBursts.push({
    hero: heroName,
    x,
    y,
    dir,
    life: heroName === "Aristotle" ? 58 : heroName === "Socrates" ? 74 : 68,
    maxLife: heroName === "Aristotle" ? 58 : heroName === "Socrates" ? 74 : 68,
  });
}

function damageEnemy(enemy, amount) {
  const cfg = enemyTypes[enemy.type];
  enemy.hp -= amount;
  enemy.hitFlash = 8;
  enemy.talk = 90;
  enemy.quip = pickQuip(cfg, enemy.quip);
  state.combo = Math.min(99, state.combo + 1);
  state.comboTimer = 150;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const hitPoints = 10 * state.combo;
  state.score += hitPoints;
  state.screenShake = Math.max(state.screenShake, cfg.boss ? 8 : 4);
  addFloater(enemy.x + enemy.w / 2, enemy.y - 8, `+${hitPoints}`, "#f0c15b");
  addSpark(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, cfg.color, 12);
  sfx("hit");
  if (enemy.hp <= 0) {
    enemy.alive = false;
    const comboMultiplier = 1 + Math.min(2, Math.floor(state.combo / 4) * 0.25);
    const defeatPoints = Math.round(cfg.points * comboMultiplier);
    state.score += defeatPoints;
    addFloater(enemy.x + enemy.w / 2, enemy.y - 30, `REFUTED +${defeatPoints}`, "#f7e9b6", 62);
    state.player.virtue = Math.min(100, state.player.virtue + (cfg.boss ? 100 : 18));
    state.message = cfg.boss ? "TRUTH RESTORED" : `${cfg.label.toUpperCase()} REFUTED`;
    messageTimer = 80;
    for (let i = 0; i < 18; i++) addSpark(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#f7e9b6", 20);
    if (cfg.boss) {
      if (state.levelIndex === levels.length - 1) {
        state.mode = "won";
        state.message = "ACTUS PURUS!";
        sfx("win");
      } else {
        state.mode = "levelComplete";
        state.message = `LEVEL ${state.levelIndex + 1} COMPLETE`;
      }
    }
  }
}

function hurtPlayer(amount, sourceX, blockable = true) {
  const p = state.player;
  if (p.hurtCd > 0) return "ignored";
  if (p.dashTimer > 0) {
    p.hurtCd = 4;
    addFloater(p.x + p.w / 2, p.y - 8, "EVASION!", "#6dd6c4");
    return "dodged";
  }
  const sourceIsInFront = p.dir > 0
    ? sourceX >= p.x + p.w / 2
    : sourceX <= p.x + p.w / 2;
  if (blockable && p.blocking && p.guard > 0 && sourceIsInFront) {
    if (p.parryTimer > 0) {
      p.parryTimer = 0;
      p.hurtCd = 12;
      p.virtue = Math.min(100, p.virtue + 16);
      state.combo = Math.min(99, state.combo + 1);
      state.comboTimer = 150;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.score += 75 * state.combo;
      state.screenShake = 9;
      state.message = "PERFECT DISTINCTION!";
      messageTimer = 52;
      addFloater(p.x + p.w / 2 + p.dir * 22, p.y - 12, "PARRY!", "#fff8dc", 58);
      const parryX = p.x + p.w / 2 + p.dir * 24;
      for (let i = 0; i < 24; i++) addSpark(parryX, p.y + 28, "#fff8dc", 19);
      sfx("parry");
      return "parry";
    }
    p.guard = Math.max(0, p.guard - amount * 28);
    p.guardCd = 55;
    p.hurtCd = 10;
    p.vx = sourceX < p.x ? 1.6 : -1.6;
    p.talk = 55;
    p.quip = pickQuip({ quips: heroes[state.hero].blockQuips }, p.quip);
    state.message = p.guard > 0 ? "OBJECTION BLOCKED" : "GUARD BROKEN!";
    messageTimer = 38;
    const shieldX = p.x + p.w / 2 + p.dir * 24;
    for (let i = 0; i < 12; i++) addSpark(shieldX, p.y + 28, heroes[state.hero].projectile, 12);
    state.screenShake = Math.max(state.screenShake, 3);
    sfx("block");
    return "blocked";
  }
  p.hp -= amount;
  state.combo = 0;
  state.comboTimer = 0;
  state.screenShake = 11;
  p.hurtCd = 80;
  p.vx = sourceX < p.x ? 5 : -5;
  p.vy = -5;
  state.message = "OBJECTION!";
  messageTimer = 45;
  addSpark(p.x + p.w / 2, p.y + p.h / 2, "#d85c7f", 16);
  sfx("hurt");
  if (p.hp <= 0) {
    state.mode = "lost";
    state.message = "THE ARGUMENT COLLAPSED";
  }
  return "hurt";
}

function addFloater(x, y, text, color, life = 44) {
  state.floaters.push({ x, y, text, color, life, maxLife: life });
}

function dash() {
  const p = state.player;
  if (p.dashCd > 0 || p.blocking || p.attackAnim > 0 || p.specialAnim > 0) return;
  p.dashCd = 68;
  p.dashTimer = 13;
  p.vx = p.dir * 11.5;
  p.vy *= 0.25;
  state.screenShake = 4;
  const dashCallout = state.hero === "Aristotle"
    ? "PERIPATETIC!"
    : state.hero === "Socrates"
      ? "BAREFOOT BLITZ!"
      : "SCHOLASTIC!";
  addFloater(p.x + p.w / 2, p.y - 8, dashCallout, heroes[state.hero].projectile);
  for (let i = 0; i < 12; i++) addSpark(p.x + p.w / 2, p.y + p.h / 2, heroes[state.hero].projectile, 11);
  sfx("dash");
}

function addSpark(x, y, color, power) {
  state.sparks.push({
    x,
    y,
    vx: (Math.random() - 0.5) * power,
    vy: (Math.random() - 0.7) * power,
    life: 24 + Math.random() * 18,
    color,
  });
}

function update(dt) {
  if (state.mode !== "playing") return;
  const p = state.player;
  const hero = heroes[state.hero];
  state.time += dt;
  updateMusic(dt);
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) state.message = "";
  }

  const left = pressed("ArrowLeft", "a", "A", "left");
  const right = pressed("ArrowRight", "d", "D", "right");
  const jump = pressed("ArrowUp", "w", "W", " ", "jump");
  const jumpPressed = jump && !p.jumpHeld;
  const strike = pressed("j", "J", "x", "X", "attack");
  const cast = pressed("k", "K", "z", "Z", "special");
  const guardHeld = pressed("c", "C", "l", "L", "Shift", "block");
  const dashHeld = pressed("q", "Q", "e", "E", "Control", "dash");
  const dashPressed = dashHeld && !p.dashHeld;
  const guardPressed = guardHeld && !p.blockHeld;
  p.dashHeld = dashHeld;
  p.blockHeld = guardHeld;
  if (guardPressed) p.parryTimer = 11;
  if (dashPressed) dash();
  p.blocking = guardHeld && p.guard > 0 && p.attackAnim <= 0 && p.specialAnim <= 0 && p.dashTimer <= 0;

  if (p.dashTimer > 0) {
    p.vx = p.dir * 11.5;
    if (Math.floor(p.dashTimer) % 2 === 0) {
      state.afterimages.push({ x: p.x, y: p.y, dir: p.dir, life: 18, maxLife: 18 });
      addSpark(p.x + p.w / 2 - p.dir * 12, p.y + 34, hero.projectile, 5);
    }
  } else {
    if (left) {
      p.vx -= 0.65;
      p.dir = -1;
    }
    if (right) {
      p.vx += 0.65;
      p.dir = 1;
    }
    p.vx *= p.grounded ? 0.78 : 0.91;
    const speedLimit = hero.speed * (p.blocking ? 0.7 : 2);
    p.vx = Math.max(-speedLimit, Math.min(speedLimit, p.vx));
  }
  if (jumpPressed) {
    const jumpsUsed = p.grounded ? 0 : Math.max(p.jumpsUsed, 1);
    if (jumpsUsed < p.maxJumps) {
      p.vy = -hero.jump * (jumpsUsed === 0 ? 1 : 0.88);
      p.grounded = false;
      p.jumpsUsed = jumpsUsed + 1;
      addSpark(p.x + p.w / 2, p.y + p.h, hero.projectile, jumpsUsed === 0 ? 7 : 13);
    }
  }
  p.jumpHeld = jump;
  if (strike) attack();
  if (cast) special();

  p.vy += p.dashTimer > 0 ? 0.13 : 0.52;
  p.x += p.vx;
  p.y += p.vy;
  const worldW = levels[state.levelIndex].worldW;
  p.x = Math.max(18, Math.min(worldW - 80, p.x));
  resolvePlatforms(p);

  p.attackCd = Math.max(0, p.attackCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  p.specialCd = Math.max(0, p.specialCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.dashTimer = Math.max(0, p.dashTimer - dt);
  p.parryTimer = Math.max(0, p.parryTimer - dt);
  p.guardCd = Math.max(0, p.guardCd - dt);
  p.attackAnim = Math.max(0, p.attackAnim - dt);
  p.specialAnim = Math.max(0, p.specialAnim - dt);
  p.talk = Math.max(0, p.talk - dt);
  p.virtue = Math.min(100, p.virtue + 0.025 * dt);
  if (!p.blocking && p.guardCd <= 0) {
    p.guard = Math.min(p.maxGuard, p.guard + 0.32 * dt);
  }
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.screenShake = Math.max(0, state.screenShake - 0.65 * dt);

  updateEnemies(dt);
  updateProjectiles(dt);
  updatePickups();
  updateSpecialBursts(dt);
  updateSparks(dt);
  updateFloaters(dt);

  state.cameraX += (Math.max(0, Math.min(worldW - W, p.x - 320)) - state.cameraX) * 0.08;
}

function resolvePlatforms(obj) {
  obj.grounded = false;
  for (const platform of state.platforms) {
    const wasAbove = obj.y + obj.h - obj.vy <= platform.y + 4;
    if (rects(obj, platform) && obj.vy >= 0 && wasAbove) {
      obj.y = platform.y - obj.h;
      obj.vy = 0;
      obj.grounded = true;
      if (obj.jumpsUsed != null) obj.jumpsUsed = 0;
    }
  }
  if (obj.y > H + 160) hurtPlayer(2, obj.x - 100, false);
}

function updateEnemies(dt) {
  const p = state.player;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const cfg = enemyTypes[e.type];
    const dist = p.x - e.x;
    if (Math.abs(dist) < 420) {
      e.dir = dist > 0 ? 1 : -1;
      e.vx = cfg.speed * e.dir;
    }
    e.confused = Math.max(0, (e.confused || 0) - dt);
    if (e.confused > 0) {
      e.dir = Math.floor((state.time + e.x) / 18) % 2 ? 1 : -1;
      e.vx = cfg.speed * e.dir * 1.35;
      e.shotCd += dt * 0.7;
    }
    if (cfg.flying) {
      e.y += Math.sin((state.time + e.x) * 0.035) * 0.55;
    } else {
      e.x += e.vx;
      if (e.x < 80) e.x = 80;
    }
    if (cfg.boss) {
      e.x += Math.sin(state.time * 0.018) * 0.8;
    }
    if (e.talk > 0) e.talk -= dt;
    e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
    if (rects(p, e)) {
      const impact = hurtPlayer(cfg.boss ? 2 : 1, e.x);
      if (impact === "parry") {
        damageEnemy(e, cfg.boss ? 2 : 3);
        e.vx = p.dir * 5;
      }
    }
    e.shotCd -= dt;
    if (e.shotCd <= 0 && Math.abs(dist) < 430) {
      e.shotCd = cfg.boss ? 58 : 130 + Math.random() * 70;
      state.enemyShots.push({
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        w: cfg.boss ? 18 : 13,
        h: cfg.boss ? 18 : 13,
        vx: (dist > 0 ? 1 : -1) * (cfg.boss ? 4.4 : 3.2),
        vy: cfg.boss ? Math.sin(state.time * 0.08) * 1.2 : 0,
        life: 150,
        color: cfg.color,
        word: e.type === "consequentialist" ? "≈" : "?",
      });
    }
  }
}

function updateProjectiles(dt) {
  for (const shot of state.projectiles) {
    shot.x += shot.vx;
    shot.y += shot.vy || 0;
    shot.life -= dt;
    for (const e of state.enemies) {
      if (e.alive && rects(shot, e)) {
        shot.life = 0;
        damageEnemy(e, shot.dmg);
        break;
      }
    }
  }
  state.projectiles = state.projectiles.filter((shot) => shot.life > 0);

  for (const shot of state.enemyShots) {
    shot.x += shot.vx;
    shot.y += shot.vy;
    shot.life -= dt;
    if (rects(shot, state.player)) {
      const impact = hurtPlayer(1, shot.x);
      shot.life = 0;
      if (impact === "parry") {
        state.projectiles.push({
          x: shot.x,
          y: shot.y,
          w: 22,
          h: 12,
          vx: -shot.vx * 1.55,
          vy: -(shot.vy || 0) * 0.4,
          life: 95,
          color: heroes[state.hero].projectile,
          label: "NO",
          dmg: 3,
        });
      }
    }
  }
  state.enemyShots = state.enemyShots.filter((shot) => shot.life > 0);
}

function updateSpecialBursts(dt) {
  for (const burst of state.specialBursts) burst.life -= dt;
  state.specialBursts = state.specialBursts.filter((burst) => burst.life > 0);
}

function updatePickups() {
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    const box = { x: pickup.x, y: pickup.y, w: 28, h: 30 };
    if (rects(state.player, box)) {
      pickup.taken = true;
      state.scrolls += 1;
      state.score += 80;
      state.player.virtue = Math.min(100, state.player.virtue + 30);
      state.message = pickupQuips[Math.floor(Math.random() * pickupQuips.length)];
      messageTimer = 55;
      addSpark(pickup.x + 14, pickup.y + 14, "#87bc4c", 18);
      addFloater(pickup.x + 14, pickup.y - 8, "+SCROLL +80", "#87bc4c");
      sfx("pickup");
    }
  }
}

function updateSparks(dt) {
  for (const s of state.sparks) {
    s.x += s.vx * 0.2;
    s.y += s.vy * 0.2;
    s.vy += 0.32;
    s.life -= dt;
  }
  state.sparks = state.sparks.filter((s) => s.life > 0);
  for (const ghost of state.afterimages) ghost.life -= dt;
  state.afterimages = state.afterimages.filter((ghost) => ghost.life > 0);
}

function updateFloaters(dt) {
  for (const floater of state.floaters) {
    floater.y -= 0.42 * dt;
    floater.life -= dt;
  }
  state.floaters = state.floaters.filter((floater) => floater.life > 0);
}

function draw() {
  ctx.setTransform(RENDER_W / W, 0, 0, RENDER_H / H, 0, 0);
  pixelBackground();
  ctx.save();
  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 0.65 : 0;
  ctx.translate(-Math.floor(state.cameraX) + shakeX, shakeY);
  drawWorld();
  drawPickups();
  drawEnemies();
  drawAfterimages();
  drawPlayer();
  drawSpecialBursts();
  drawProjectiles();
  drawSparks();
  drawFloaters();
  ctx.restore();
  drawHud();
  if (state.mode === "title" || state.mode === "paused" || state.mode === "levelComplete" || state.mode === "won" || state.mode === "lost") {
    drawOverlay();
  } else if (state.message) {
    drawBanner(state.message, 90);
  }
}

function pixelBackground() {
  const cam = state.cameraX;
  const theme = levels[state.levelIndex].theme;
  ctx.fillStyle = theme === "agora" ? "#18264f" : theme === "scriptorium" ? "#4d3156" : "#4b6ca8";
  ctx.fillRect(0, 0, W, H);
  drawGradientBands(theme);
  drawParallaxLayer(cam * 0.16, 116, "#3f557d", "hills");
  drawParallaxLayer(cam * 0.28, 178, theme === "scriptorium" ? "#76536d" : "#5d4d74", "script");
  drawParallaxLayer(cam * 0.48, 244, theme === "agora" ? "#3b4268" : "#766a80", "arches");
  drawAtmosphere(theme, cam);
  ctx.fillStyle = "#2a1c32";
  ctx.fillRect(0, GROUND_Y + 30, W, H - GROUND_Y);
}

function drawGradientBands(theme) {
  const bands = theme === "agora"
    ? ["#172044", "#243361", "#394b76", "#695776", "#a36a68"]
    : theme === "scriptorium"
      ? ["#493252", "#65435e", "#865c68", "#aa796b", "#ca9a70"]
      : ["#5f86bf", "#6d9abe", "#8fb5b0", "#c3b481", "#d6aa68"];
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * 42, W, 42);
  });
}

function drawAtmosphere(theme, cam) {
  const night = theme === "agora";
  ctx.fillStyle = night ? "#f7e9b6" : "rgba(247, 233, 182, 0.4)";
  for (let i = 0; i < 34; i++) {
    const x = (i * 173 - cam * (0.08 + (i % 3) * 0.03)) % (W + 40);
    const y = 30 + ((i * 67) % 250);
    const size = night ? (i % 5 === 0 ? 3 : 2) : 1;
    ctx.fillRect((x + W + 40) % (W + 40) - 20, y, size, size);
  }
  if (night) {
    ctx.fillStyle = "#f2d58a";
    ctx.beginPath();
    ctx.arc(790, 92, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d9b76f";
    ctx.beginPath();
    ctx.arc(806, 82, 36, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParallaxLayer(offset, baseY, color, kind) {
  ctx.fillStyle = color;
  for (let x = -240 - (offset % 240); x < W + 260; x += 240) {
    if (kind === "hills") {
      blockTriangle(x, baseY + 82, 150, 90, color);
      blockTriangle(x + 92, baseY + 92, 190, 110, color);
    } else if (kind === "script") {
      ctx.fillRect(x, baseY, 150, 76);
      ctx.fillStyle = "#d7c786";
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 18, baseY + 14 + i * 11, 96 - i * 9, 4);
      ctx.fillStyle = color;
    } else {
      ctx.fillRect(x + 8, baseY + 66, 32, 122);
      ctx.fillRect(x + 116, baseY + 66, 32, 122);
      ctx.fillRect(x + 8, baseY + 66, 140, 22);
      ctx.fillRect(x + 42, baseY + 34, 72, 32);
    }
  }
}

function blockTriangle(x, y, w, h, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < h; i += 8) {
    const inset = Math.floor((i / h) * (w / 2));
    ctx.fillRect(x + inset, y - i, w - inset * 2, 8);
  }
}

function drawWorld() {
  const level = levels[state.levelIndex];
  for (const p of state.platforms) {
    ctx.fillStyle = p.kind === "ground" ? "#4a3748" : "#6e5d6f";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = p.kind === "ground" ? "#8b7d61" : "#b69b67";
    ctx.fillRect(p.x, p.y, p.w, 8);
    ctx.fillStyle = "#2d2130";
    for (let x = p.x; x < p.x + p.w; x += 48) ctx.fillRect(x + 8, p.y + 15, 26, 5);
  }
  for (let x = 120; x < level.worldW; x += 360) drawColumn(x, GROUND_Y - 120);
  ctx.fillStyle = "#87bc4c";
  for (let x = 260; x < level.worldW; x += 520) {
    ctx.fillRect(x, GROUND_Y - 18, 46, 18);
    ctx.fillRect(x + 8, GROUND_Y - 30, 28, 12);
  }
}

function drawColumn(x, y) {
  ctx.fillStyle = "#65586b";
  ctx.fillRect(x, y, 46, 120);
  ctx.fillStyle = "#938590";
  ctx.fillRect(x - 8, y, 62, 10);
  ctx.fillRect(x - 12, y + 110, 70, 10);
  ctx.fillStyle = "#3a2a40";
  for (let i = 16; i < 100; i += 22) ctx.fillRect(x + 8, y + i, 30, 5);
}

function drawPickups() {
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    const bob = Math.sin(state.time * 0.06 + pickup.x) * 4;
    ctx.fillStyle = "#1f1228";
    ctx.fillRect(pickup.x - 2, pickup.y + bob + 4, 30, 28);
    ctx.fillStyle = "#f7e9b6";
    ctx.fillRect(pickup.x, pickup.y + bob, 24, 28);
    ctx.fillStyle = "#87bc4c";
    ctx.fillRect(pickup.x + 4, pickup.y + bob + 6, 16, 4);
    ctx.fillRect(pickup.x + 4, pickup.y + bob + 15, 12, 4);
  }
}

function drawPlayer() {
  const p = state.player;
  const hero = heroes[state.hero];
  const flicker = p.hurtCd > 0 && Math.floor(state.time / 4) % 2 === 0;
  if (flicker) return;
  drawHeroSprite(p.x, p.y, p.dir, hero, Math.abs(p.vx) > 0.4, !p.grounded, p.attackAnim, p.specialAnim);
  if (p.blocking) drawShield(p, hero);
  if (p.talk > 0 && p.quip) drawTalk(p, p.quip);
}

function drawAfterimages() {
  const hero = heroes[state.hero];
  for (const ghost of state.afterimages) {
    ctx.save();
    ctx.globalAlpha = (ghost.life / ghost.maxLife) * 0.24;
    ctx.globalCompositeOperation = "screen";
    drawHeroSprite(ghost.x, ghost.y, ghost.dir, hero, false, true, 0, 0);
    ctx.restore();
  }
}

function drawShield(p, hero) {
  const x = Math.floor(p.dir > 0 ? p.x + p.w + 4 : p.x - 20);
  const y = Math.floor(p.y + 9);
  const primary = hero.projectile;
  const secondary = state.hero === "Aristotle"
    ? "#a64f58"
    : state.hero === "Socrates"
      ? "#607e91"
      : "#f4f0ce";
  const pulse = Math.floor(state.time / 5) % 2;

  ctx.save();
  ctx.shadowColor = primary;
  ctx.shadowBlur = 7 + pulse * 3;
  ctx.fillStyle = "#120b18";
  ctx.fillRect(x - 3, y + 3, 22, 36);
  ctx.fillStyle = primary;
  ctx.fillRect(x, y, 16, 34);
  ctx.fillRect(x + 3, y + 34, 10, 5);
  ctx.fillStyle = secondary;
  ctx.fillRect(x + 3, y + 4, 10, 4);
  ctx.fillRect(x + 5, y + 11, 6, 17);
  ctx.fillStyle = "#fff8dc";
  ctx.fillRect(x + 6, y + 6, 4, 3);
  ctx.restore();
}

function spriteRect(x, y, w, h, color, scale = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
}

function spriteText(text, x, y, color, size = 8) {
  ctx.fillStyle = color;
  ctx.font = `${size}px Monaco, monospace`;
  ctx.fillText(text, x, y);
}

function drawHeroSprite(x, y, dir, hero, walking, airborne, attackAnim, specialAnim) {
  const sx = dir > 0 ? 1 : -1;
  const step = walking ? Math.floor(state.time / 5) % 4 : 0;
  const bobCycle = [0, 2, 0, 1][step];
  const bob = airborne ? -3 : walking ? bobCycle : Math.sin(state.time * 0.045) > 0 ? 1 : 0;

  ctx.save();
  ctx.translate(Math.floor(x + 17), Math.floor(y + bob - 36));
  ctx.scale(sx, 1);

  ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
  ctx.fillRect(-24, 92 - bob, 53, 8);

  if (hero.name === "Aquinas") {
    drawAquinasSprite(step, airborne, attackAnim, specialAnim);
  } else if (hero.name === "Socrates") {
    drawSocratesSprite(step, airborne, attackAnim, specialAnim);
  } else {
    drawAristotleSprite(step, airborne, attackAnim, specialAnim);
  }

  ctx.restore();
}

function drawAristotleSprite(step, airborne, attackAnim, specialAnim) {
  const skin = "#f1c99a";
  const skinShadow = "#bf7a54";
  const outline = "#120b18";
  const hair = "#d7c48b";
  const hairDark = "#8d7650";
  const beard = "#c4aa71";
  const beardDark = "#6f5b3e";
  const toga = "#fff0c7";
  const togaMid = "#e8cf95";
  const togaShadow = "#b99b66";
  const stripe = "#a64f58";
  const stripeDark = "#6f2e3f";
  const sandal = "#7a4f34";
  const attack = attackAnim > 0;
  const special = specialAnim > 0;
  const gait = [
    { l1: 8, l2: 13, foot1: 1, foot2: -1, robe: 0 },
    { l1: 12, l2: 9, foot1: 3, foot2: -2, robe: 1 },
    { l1: 9, l2: 12, foot1: -1, foot2: 2, robe: 0 },
    { l1: 13, l2: 8, foot1: -3, foot2: 3, robe: 1 },
  ][airborne ? 0 : step];
  const armReach = attack ? 8 : special ? 3 : 0;
  const armLift = attack ? -4 : special ? -8 : 0;
  const offArmLift = special ? -6 : attack ? 2 : 0;

  spriteRect(-7, 0, 14, 2, outline);
  spriteRect(-10, 2, 20, 3, outline);
  spriteRect(-11, 5, 22, 9, outline);
  spriteRect(-10, 13, 20, 8, outline);
  spriteRect(-7, 4, 14, 10, skin);
  spriteRect(-5, 13, 10, 3, skinShadow);
  spriteRect(-9, 2, 18, 4, hair);
  spriteRect(-11, 5, 4, 8, hair);
  spriteRect(7, 5, 4, 8, hairDark);
  spriteRect(-8, 13, 16, 4, beard);
  spriteRect(-7, 17, 14, 5, beard);
  spriteRect(-5, 22, 10, 4, beardDark);
  spriteRect(-3, 26, 6, 2, beardDark);
  spriteRect(-7, 18, 3, 2, "#e0c588");
  spriteRect(3, 18, 3, 2, "#8c724d");
  spriteRect(-4, 8, 2, 2, outline);
  spriteRect(4, 8, 2, 2, outline);
  spriteRect(2, 12, 4, 1, outline);

  spriteRect(-14, 14, 28, 22, outline);
  spriteRect(-13, 14, 26, 21, toga);
  spriteRect(-11, 17, 24, 2, "#fff8dc");
  spriteRect(-12, 21 + gait.robe, 24, 2, togaMid);
  spriteRect(-10, 25, 22, 2, togaMid);
  spriteRect(-8, 29 + gait.robe, 19, 2, togaShadow);
  spriteRect(-13, 33, 11, 3, togaShadow);
  spriteRect(2, 33, 11, 3, togaShadow);
  spriteRect(-13, 36, 4, 2, outline);
  spriteRect(8, 36, 4, 2, outline);

  spriteRect(-14, 14, 5, 3, stripe);
  spriteRect(-12, 17, 5, 3, stripe);
  spriteRect(-9, 20, 5, 3, stripe);
  spriteRect(-6, 23, 5, 3, stripe);
  spriteRect(-3, 26, 5, 3, stripe);
  spriteRect(0, 29, 6, 3, stripe);
  spriteRect(4, 32, 6, 2, stripeDark);
  spriteRect(8, 35, 4, 2, stripeDark);

  spriteRect(9, 15 + armLift, 10 + armReach, 5, skin);
  spriteRect(18 + armReach, 17 + armLift, 5, 4, skinShadow);
  spriteRect(19 + armReach, 15 + armLift, 10, 8, "#f7e9b6");
  spriteRect(28 + armReach, 16 + armLift, 2, 6, "#d2b26d");
  spriteRect(21 + armReach, 17 + armLift, 6, 1, stripeDark);
  spriteRect(21 + armReach, 20 + armLift, 5, 1, stripeDark);
  if (attack) {
    spriteRect(30 + armReach, 17 + armLift, 5, 2, "#f0c15b");
    spriteRect(34 + armReach, 16 + armLift, 2, 4, "#fff8dc");
  }

  spriteRect(-19, 18 + offArmLift, 9, 4, skin);
  spriteRect(-23, 17 + offArmLift, 7, 6, stripe);
  spriteRect(-25, 19 + offArmLift, 3, 2, stripeDark);
  if (special) {
    spriteRect(-29, 14, 4, 4, "#f0c15b");
    spriteRect(-31, 16, 2, 2, "#fff8dc");
  }

  spriteRect(-10, 36, 5, gait.l1, skin);
  spriteRect(5, 36, 5, gait.l2, skin);
  spriteRect(-10, 40 + gait.l1 - 8, 5, 1, skinShadow);
  spriteRect(5, 40 + gait.l2 - 8, 5, 1, skinShadow);
  spriteRect(-13 + gait.foot1, 45, 10, 2, sandal);
  spriteRect(4 + gait.foot2, 45, 11, 2, sandal);
  spriteRect(-10 + Math.max(0, gait.foot1), 41, 5, 1, sandal);
  spriteRect(6 + Math.min(0, gait.foot2), 41, 5, 1, sandal);

  spriteRect(-9, 16, 2, 14, "rgba(255,255,255,0.36)");
  spriteRect(-5, 5, 3, 1, "rgba(255,255,255,0.32)");
  if (special) {
    spriteRect(-16, 11, 3, 2, "#f0c15b");
    spriteRect(13, 10, 3, 2, "#f0c15b");
    spriteRect(-2, -3, 4, 2, "#f0c15b");
  }
}

function drawAquinasSprite(step, airborne, attackAnim, specialAnim) {
  const skin = "#f1c99a";
  const skinShadow = "#bd7a55";
  const outline = "#120b18";
  const cloak = "#151827";
  const cloakMid = "#272a39";
  const habit = "#f4f0ce";
  const habitHi = "#fff9dc";
  const habitShadow = "#c9c19c";
  const hair = "#6a4b35";
  const halo = "#f0c15b";
  const attack = attackAnim > 0;
  const special = specialAnim > 0;
  const gait = [
    { l1: 8, l2: 12, foot1: 0, foot2: 0, sway: 0 },
    { l1: 12, l2: 8, foot1: 3, foot2: -2, sway: 1 },
    { l1: 9, l2: 11, foot1: -1, foot2: 2, sway: 0 },
    { l1: 13, l2: 8, foot1: -3, foot2: 3, sway: 1 },
  ][airborne ? 0 : step];
  const bookReach = attack ? 8 : special ? 2 : 0;
  const bookLift = attack ? -5 : special ? -8 : 0;
  const leftLift = special ? -8 : attack ? 2 : 0;

  spriteRect(-12, -5, 24, 2, halo);
  spriteRect(-15, -3, 3, 3, halo);
  spriteRect(12, -3, 3, 3, halo);
  spriteRect(-9, -1, 18, 1, "#fff1a8");

  spriteRect(-8, 0, 16, 2, outline);
  spriteRect(-10, 2, 20, 3, outline);
  spriteRect(-10, 5, 20, 8, outline);
  spriteRect(-8, 4, 16, 10, skin);
  spriteRect(-10, 3, 6, 3, hair);
  spriteRect(4, 3, 6, 3, hair);
  spriteRect(-7, 2, 14, 3, skin);
  spriteRect(-3, 1, 6, 3, skin);
  spriteRect(-8, 11, 16, 3, skinShadow);
  spriteRect(-4, 8, 2, 2, outline);
  spriteRect(4, 8, 2, 2, outline);
  spriteRect(-3, 12, 6, 1, outline);

  spriteRect(-15, 14, 30, 24, outline);
  spriteRect(-14, 14, 28, 23, cloak);
  spriteRect(-10, 14, 20, 23, habit);
  spriteRect(-7, 16, 14, 21, habitHi);
  spriteRect(-3, 19 + gait.sway, 6, 17, habitShadow);
  spriteRect(-13, 33 + gait.sway, 26, 3, cloak);
  spriteRect(-15, 17, 6, 19, cloakMid);
  spriteRect(9, 17, 6, 19, "#0d101a");
  spriteRect(-5, 15, 10, 3, habitHi);
  spriteRect(-2, 18, 4, 18, "#ebe3bd");
  spriteRect(-12, 25, 3, 2, "#393d4d");
  spriteRect(9, 27, 3, 2, "#080a11");

  spriteRect(12, 17 + bookLift, 9 + bookReach, 4, skin);
  spriteRect(19 + bookReach, 14 + bookLift, 9, 10, "#efe7be");
  spriteRect(18 + bookReach, 13 + bookLift, 11, 2, outline);
  spriteRect(18 + bookReach, 24 + bookLift, 11, 2, outline);
  spriteRect(21 + bookReach, 17 + bookLift, 6, 1, "#6dd6c4");
  spriteRect(21 + bookReach, 20 + bookLift, 5, 1, "#6dd6c4");
  if (attack) {
    spriteRect(29 + bookReach, 16 + bookLift, 4, 2, "#6dd6c4");
    spriteRect(32 + bookReach, 15 + bookLift, 2, 4, "#f4f0ce");
  }

  spriteRect(-21, 18 + leftLift, 8, 4, cloakMid);
  spriteRect(-25, 17 + leftLift, 5, 6, "#6dd6c4");
  spriteRect(-27, 19 + leftLift, 2, 2, "#f4f0ce");
  if (special) {
    spriteRect(-30, 12, 3, 3, "#f4f0ce");
    spriteRect(-32, 14, 2, 2, "#6dd6c4");
    spriteRect(-17, 10, 3, 2, "#f4f0ce");
    spriteRect(13, 9, 3, 2, "#f4f0ce");
  }

  spriteRect(-10, 37, 5, gait.l1, habitShadow);
  spriteRect(5, 37, 5, gait.l2, habit);
  spriteRect(-14, 37, 4, gait.l1 - 1, cloak);
  spriteRect(10, 37, 4, gait.l2 - 1, cloak);
  spriteRect(-13 + gait.foot1, 45, 9, 2, outline);
  spriteRect(4 + gait.foot2, 45, 10, 2, outline);
  spriteRect(-8, 17, 2, 18, "rgba(255,255,255,0.3)");
}

function drawSocratesSprite(step, airborne, attackAnim, specialAnim) {
  const skin = "#f2c69b";
  const skinShadow = "#bd7957";
  const outline = "#120b18";
  const beard = "#b9b1a6";
  const beardDark = "#716d6a";
  const tunic = "#d6e0dc";
  const tunicHi = "#f3eee0";
  const tunicShadow = "#8ba0a5";
  const border = "#607e91";
  const attack = attackAnim > 0;
  const special = specialAnim > 0;
  const gait = [
    { l1: 8, l2: 13, foot1: 0, foot2: 0, hem: 0 },
    { l1: 12, l2: 9, foot1: 4, foot2: -2, hem: 1 },
    { l1: 9, l2: 12, foot1: -1, foot2: 3, hem: 0 },
    { l1: 13, l2: 8, foot1: -3, foot2: 4, hem: 1 },
  ][airborne ? 0 : step];
  const askReach = attack ? 11 : special ? 4 : 0;
  const askLift = attack ? -5 : special ? -10 : 0;
  const otherLift = special ? -10 : attack ? 3 : 0;

  // Bald head: uninterrupted skin and a bright crown highlight.
  spriteRect(-8, 0, 16, 2, outline);
  spriteRect(-10, 2, 20, 11, outline);
  spriteRect(-8, 1, 16, 13, skin);
  spriteRect(-5, 1, 10, 2, "#f8d9b5");
  spriteRect(-7, 3, 4, 2, "rgba(255,255,255,0.32)");
  spriteRect(-9, 11, 18, 4, skinShadow);
  spriteRect(-4, 7, 2, 2, outline);
  spriteRect(4, 7, 2, 2, outline);
  spriteRect(2, 11, 5, 1, outline);

  // Full gray beard, because the questions have tenure.
  spriteRect(-9, 13, 18, 4, beard);
  spriteRect(-8, 17, 16, 5, beard);
  spriteRect(-6, 22, 12, 4, beardDark);
  spriteRect(-3, 26, 6, 3, beardDark);
  spriteRect(-7, 16, 3, 2, "#d8d2c8");
  spriteRect(3, 17, 3, 2, "#8d8881");

  // Short, practical Athenian tunic.
  spriteRect(-14, 15, 28, 22, outline);
  spriteRect(-13, 15, 26, 21, tunic);
  spriteRect(-11, 17, 22, 3, tunicHi);
  spriteRect(-12, 21 + gait.hem, 24, 3, tunicShadow);
  spriteRect(-10, 25, 20, 2, border);
  spriteRect(-8, 29 + gait.hem, 17, 3, tunicShadow);
  spriteRect(-13, 33, 11, 4, border);
  spriteRect(2, 33, 11, 4, "#465f70");
  spriteRect(-8, 16, 2, 15, "rgba(255,255,255,0.3)");

  // Pointing hand launches the Elenchus.
  spriteRect(10, 16 + askLift, 10 + askReach, 5, skin);
  spriteRect(19 + askReach, 16 + askLift, 6, 4, skinShadow);
  spriteRect(24 + askReach, 15 + askLift, attack ? 8 : 3, 2, skin);
  if (attack) {
    spriteRect(31 + askReach, 14 + askLift, 3, 4, "#9bd6ff");
    spriteText("?", 68 + askReach * 2, 31 + askLift * 2, "#f7e9b6", 12);
  }

  spriteRect(-19, 18 + otherLift, 8, 4, skin);
  spriteRect(-24, 17 + otherLift, 6, 6, skinShadow);
  spriteRect(-27, 19 + otherLift, 4, 2, skin);
  if (special) {
    spriteText("?", -42, 13, "#9bd6ff", 16);
    spriteText("?", 28, 9, "#f7e9b6", 14);
    spriteText("?", -4, -8, "#9bd6ff", 18);
  }

  // Bare legs and unmistakably bare feet—no sandal pixels.
  spriteRect(-10, 37, 5, gait.l1, skin);
  spriteRect(5, 37, 5, gait.l2, skin);
  spriteRect(-10, 41 + gait.l1 - 8, 5, 1, skinShadow);
  spriteRect(5, 41 + gait.l2 - 8, 5, 1, skinShadow);
  spriteRect(-14 + gait.foot1, 45, 11, 3, skin);
  spriteRect(3 + gait.foot2, 45, 12, 3, skin);
  spriteRect(-14 + gait.foot1, 47, 2, 1, "#f5d2ad");
  spriteRect(-11 + gait.foot1, 47, 2, 1, "#f5d2ad");
  spriteRect(11 + gait.foot2, 47, 2, 1, "#f5d2ad");
  spriteRect(14 + gait.foot2, 47, 2, 1, "#f5d2ad");
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const cfg = enemyTypes[e.type];
    if (cfg.boss) {
      drawBoss(e, cfg);
    } else {
      drawEnemy(e, cfg);
    }
    if (e.hitFlash > 0 && Math.floor(e.hitFlash) % 2 === 0) {
      ctx.fillStyle = "rgba(255, 248, 220, 0.55)";
      ctx.fillRect(e.x - 3, e.y - 4, e.w + 6, e.h + 8);
    }
    if (e.talk > 0) drawTalk(e, e.quip || pickQuip(cfg));
  }
}

function drawEnemy(e, cfg) {
  const wobble = Math.sin(state.time * 0.08 + e.x) * 2;
  const x = Math.floor(e.x);
  const y = Math.floor(e.y + wobble);
  const cx = x + Math.floor(e.w / 2);
  const outline = "#120b18";
  const face = "#f2c79f";
  const faceShadow = "#b9795b";
  const flying = enemyTypes[e.type].flying;

  ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
  ctx.fillRect(x + 2, e.y + e.h - 1, e.w + 4, 7);

  ctx.save();
  ctx.translate(cx, y - 34);
  ctx.scale(e.dir > 0 ? 1 : -1, 1);

  spriteRect(-8, 0, 16, 2, outline);
  spriteRect(-10, 2, 20, 9, outline);
  spriteRect(-7, 3, 14, 8, face);
  spriteRect(-6, 10, 12, 2, faceShadow);
  spriteRect(-3, 6, 2, 2, outline);
  spriteRect(4, 6, 2, 2, outline);
  spriteRect(1, 10, 4, 1, outline);

  spriteRect(-12, 12, 24, 19, outline);
  spriteRect(-10, 13, 20, 17, cfg.color);
  spriteRect(-8, 15, 16, 3, "rgba(255,255,255,0.18)");
  spriteRect(-10, 27, 20, 3, "rgba(0,0,0,0.28)");

  if (e.type === "sophist") {
    spriteRect(-9, 17, 18, 4, "#f7e9b6");
    spriteRect(9, 7, 7, 17, "#e9d99a");
    spriteRect(10, 8, 5, 2, outline);
    spriteRect(10, 13, 4, 1, outline);
    spriteRect(10, 18, 5, 1, outline);
    spriteRect(-6, 19, 2, 1, outline);
    spriteRect(-2, 19, 2, 1, outline);
    spriteRect(2, 19, 2, 1, outline);
  } else if (e.type === "heretic") {
    spriteRect(-10, 2, 20, 5, "#241333");
    spriteRect(-13, 18, 6, 5, "#8a6ee8");
    spriteRect(7, 18, 6, 5, "#8a6ee8");
    spriteRect(-2, 16, 4, 11, "#f0c15b");
    spriteRect(0, 13, 2, 5, "#d85c7f");
    spriteRect(-3, 25, 6, 3, "#d85c7f");
  } else if (e.type === "materialist") {
    spriteRect(-12, 16, 24, 13, "#5f5749");
    spriteRect(-8, 19, 7, 4, "#b5a47a");
    spriteRect(3, 23, 7, 4, "#b5a47a");
    spriteRect(-9, 22, 18, 2, outline);
    spriteRect(-1, 17, 2, 11, outline);
    spriteRect(-15, 14, 5, 8, "#8c7d62");
    spriteRect(10, 14, 5, 8, "#8c7d62");
  } else if (e.type === "nominalist") {
    spriteRect(-8, 17, 16, 11, "#f7e9b6");
    spriteRect(-6, 19, 2, 7, outline);
    spriteRect(-4, 19, 5, 2, outline);
    spriteRect(0, 21, 2, 5, outline);
    spriteRect(2, 24, 4, 2, outline);
    spriteRect(-10, 2, 4, 4, "#58a7d6");
    spriteRect(6, 2, 4, 4, "#58a7d6");
  } else if (e.type === "consequentialist") {
    spriteRect(-1, 15, 2, 16, "#f0c15b");
    spriteRect(-12, 17, 24, 2, "#f0c15b");
    spriteRect(-15, 22, 8, 4, outline);
    spriteRect(7, 22, 8, 4, outline);
    spriteRect(-14, 21, 6, 2, "#e18d3c");
    spriteRect(8, 21, 6, 2, "#e18d3c");
  } else if (e.type === "skeptic") {
    spriteRect(-8, 16, 16, 11, "#d6f3eb");
    spriteRect(-5, 18, 10, 2, outline);
    spriteRect(-5, 23, 7, 2, outline);
    spriteRect(9, 5, 3, 16, "#73c9c5");
    spriteRect(7, 3, 7, 3, "#d6f3eb");
    spriteText("?", 19, 18, "#f7e9b6", 13);
  } else if (e.type === "bureaucrat") {
    spriteRect(-12, 14, 24, 4, "#5d3e2f");
    spriteRect(-9, 18, 18, 11, "#ead8aa");
    spriteRect(-7, 20, 12, 1, outline);
    spriteRect(-7, 23, 14, 1, outline);
    spriteRect(-7, 26, 8, 1, outline);
    spriteRect(10, 17, 6, 8, "#c44343");
    spriteRect(11, 18, 4, 2, "#f0c15b");
  }

  if (!flying) {
    spriteRect(-8, 31, 5, 8, outline);
    spriteRect(3, 31, 5, 8, outline);
    spriteRect(-10, 38, 8, 2, outline);
    spriteRect(2, 38, 9, 2, outline);
  } else {
    spriteRect(-14, 24, 5, 3, "rgba(255,255,255,0.3)");
    spriteRect(9, 24, 5, 3, "rgba(255,255,255,0.3)");
  }

  ctx.restore();

  drawEnemyNameplate(e, cfg, 96, 12);
}

function drawBoss(e, cfg) {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const pulse = Math.floor(Math.sin(state.time * 0.08) * 3);

  ctx.fillStyle = "#160b18";
  ctx.fillRect(x + 7, y + 93, 76, 13);

  ctx.fillStyle = "#33233c";
  ctx.fillRect(x + 8, y + 29, 68, 66);
  ctx.fillStyle = "#20142b";
  ctx.fillRect(x + 18, y + 36, 48, 52);

  ctx.fillStyle = cfg.color;
  ctx.fillRect(x + 18, y + 4 + pulse, 50, 33);
  ctx.fillStyle = "#ff8c6a";
  ctx.fillRect(x + 23, y + 9 + pulse, 40, 6);
  ctx.fillRect(x + 27, y + 27 + pulse, 32, 4);

  ctx.fillStyle = "#f0c15b";
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 27 + i * 12, y + 16 + pulse, 6, 8);
  ctx.fillStyle = "#120b18";
  ctx.fillRect(x + 20, y + 34, 46, 5);
  ctx.fillRect(x + 39, y + 34, 6, 44);

  if (e.type === "regress") {
    ctx.strokeStyle = "#d8cdf8";
    ctx.lineWidth = 4;
    for (let r = 12; r <= 31; r += 9) {
      ctx.strokeRect(x + 42 - r, y + 57 - r, r * 2, r * 2);
    }
    ctx.fillStyle = "#9175e8";
    ctx.fillRect(x - 2, y + 48, 13, 6);
    ctx.fillRect(x + 73, y + 48, 13, 6);
    ctx.fillStyle = "#f7e9b6";
    ctx.font = "16px Monaco, monospace";
    ctx.fillText("…", x + 31, y + 66);
  } else if (e.type === "algorithm") {
    ctx.fillStyle = "#6dd6c4";
    ctx.fillRect(x + 15, y + 49, 8, 29);
    ctx.fillStyle = "#f0c15b";
    ctx.fillRect(x + 29, y + 43, 8, 35);
    ctx.fillStyle = "#ef5f72";
    ctx.fillRect(x + 43, y + 57, 8, 21);
    ctx.fillStyle = "#f7e9b6";
    ctx.fillRect(x + 57, y + 38, 8, 40);
    ctx.fillStyle = "#120b18";
    ctx.fillRect(x + 39, y - 8, 5, 13);
    ctx.fillRect(x + 33, y - 11, 17, 5);
    ctx.fillStyle = "#ef5f72";
    ctx.fillRect(x + 38, y - 14, 7, 5);
  }

  ctx.fillStyle = "#6dd6c4";
  ctx.fillRect(x + 3, y + 43, 78, 10);
  ctx.fillStyle = "#f7e9b6";
  ctx.fillRect(x - 9, y + 47, 18, 8);
  ctx.fillRect(x + 75, y + 47, 18, 8);
  ctx.fillStyle = "#c84d4d";
  ctx.fillRect(x - 16, y + 44, 9, 15);
  ctx.fillRect(x + 91, y + 44, 9, 15);

  ctx.fillStyle = "#8a6ee8";
  ctx.fillRect(x + 23, y + 60, 12, 22);
  ctx.fillRect(x + 50, y + 60, 12, 22);
  ctx.fillStyle = "#120b18";
  ctx.fillRect(x + 19, y + 81, 19, 6);
  ctx.fillRect(x + 48, y + 81, 20, 6);
  ctx.fillStyle = "#f0c15b";
  ctx.font = "10px Monaco, monospace";
  ctx.fillText("?", x + 14, y + 60);
  ctx.fillText("≈", x + 64, y + 60);

  drawEnemyNameplate(e, cfg, 132, 13);
}

function drawEnemyNameplate(e, cfg, topOffset, fontSize) {
  ctx.font = `${fontSize}px Monaco, monospace`;
  const labelWidth = Math.ceil(ctx.measureText(cfg.label).width);
  const width = Math.max(e.w + 36, labelWidth + 20);
  const x = Math.floor(e.x + e.w / 2 - width / 2);
  const y = Math.floor(e.y - topOffset);
  const hpPct = Math.max(0, e.hp / e.maxHp);

  ctx.fillStyle = "rgba(8, 4, 13, 0.9)";
  ctx.fillRect(x - 3, y - 3, width + 6, 31);
  ctx.fillStyle = "#f7e9b6";
  ctx.fillRect(x, y, width, 16);
  ctx.fillStyle = "#120b18";
  ctx.fillText(cfg.label, x + 6, y + 12);
  ctx.fillStyle = "#08040d";
  ctx.fillRect(x, y + 20, width, 7);
  ctx.fillStyle = "#d85c7f";
  ctx.fillRect(x + 1, y + 21, Math.max(0, (width - 2) * hpPct), 5);
}

function drawTalk(e, text) {
  const lines = wrapBubbleText(text, 31);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.min(330, Math.max(126, 28 + longest * 7.7));
  const height = 24 + lines.length * 16;
  const centeredX = e.x + e.w / 2 - width / 2;
  const x = Math.max(state.cameraX + 10, Math.min(state.cameraX + W - width - 10, centeredX));
  const y = Math.max(82, e.y - 48 - height);
  const tailX = Math.max(x + 16, Math.min(x + width - 16, e.x + e.w / 2));
  ctx.fillStyle = "#120b18";
  ctx.fillRect(x - 4, y - 4, width + 8, height + 8);
  ctx.fillStyle = "#f7e9b6";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#120b18";
  ctx.fillRect(tailX - 7, y + height - 1, 14, 9);
  ctx.fillStyle = "#f7e9b6";
  ctx.fillRect(tailX - 4, y + height - 1, 8, 4);
  ctx.fillStyle = "#120b18";
  ctx.font = "bold 13px Monaco, monospace";
  lines.forEach((line, index) => ctx.fillText(line, x + 12, y + 19 + index * 16));
}

function wrapBubbleText(text, maxChars) {
  const words = text.split(" ");
  const lines = [""];
  for (const word of words) {
    const current = lines[lines.length - 1];
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      lines[lines.length - 1] = next;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

function drawSpecialBursts() {
  for (const burst of state.specialBursts) {
    if (burst.hero === "Aristotle") {
      drawAristotleBurst(burst);
    } else if (burst.hero === "Socrates") {
      drawSocratesBurst(burst);
    } else {
      drawAquinasBurst(burst);
    }
  }
}

function drawAristotleBurst(burst) {
  const t = 1 - burst.life / burst.maxLife;
  const alpha = Math.max(0, 1 - t);
  const cx = burst.x;
  const cy = burst.y - 6;
  ctx.save();
  ctx.globalAlpha = alpha;

  drawPixelRing(cx, cy, 26 + t * 230, "#f0c15b", 10, 20);
  drawPixelRing(cx, cy, 12 + t * 148, "#fff0c7", 6, 30);
  drawPixelRing(cx, cy, 46 + t * 92, "#a64f58", 5, 45);

  const balance = Math.sin(t * Math.PI) * 44;
  ctx.fillStyle = "#120b18";
  ctx.fillRect(cx - 88, cy - 7, 176, 14);
  ctx.fillStyle = "#f7e9b6";
  ctx.fillRect(cx - 84, cy - 4, 168, 6);
  ctx.fillStyle = "#f0c15b";
  ctx.fillRect(cx - 5, cy - 30 - balance * 0.12, 10, 60);
  drawPixelDiamond(cx - 84 + balance, cy, 16, "#6dd6c4");
  drawPixelDiamond(cx + 84 - balance, cy, 16, "#d85c7f");
  drawPixelDiamond(cx, cy - 52 + Math.sin(t * Math.PI * 2) * 8, 13, "#fff0c7");

  ctx.fillStyle = "#120b18";
  ctx.fillRect(cx - 27, cy + 32, 54, 19);
  ctx.fillStyle = "#f0c15b";
  ctx.font = "16px Monaco, monospace";
  ctx.fillText("MEAN", cx - 22, cy + 47);
  ctx.restore();
}

function drawAquinasBurst(burst) {
  const t = 1 - burst.life / burst.maxLife;
  const alpha = Math.max(0, 1 - t * 0.92);
  const cx = burst.x + burst.dir * 10;
  const cy = burst.y - 8;
  const reach = 84 + t * 210;
  ctx.save();
  ctx.globalAlpha = alpha;

  drawPixelRing(cx, cy, 22 + t * 72, "#6dd6c4", 7, 24);
  drawPixelRing(cx, cy, 36 + t * 112, "#f4f0ce", 5, 40);
  for (let i = -2; i <= 2; i++) {
    const angle = i * 0.18 - 0.06;
    const endX = cx + burst.dir * reach;
    const endY = cy + Math.sin(angle) * reach;
    drawPixelBeam(cx, cy, endX, endY, i === 0 ? "#f4f0ce" : "#6dd6c4");
    drawPixelDiamond(endX, endY, 11 - Math.abs(i), i === 0 ? "#f0c15b" : "#f4f0ce");
    ctx.fillStyle = "#120b18";
    ctx.fillRect(endX - 9, endY - 21, 18, 16);
    ctx.fillStyle = "#6dd6c4";
    ctx.font = "13px Monaco, monospace";
    ctx.fillText("V", endX - 4, endY - 9);
  }

  ctx.fillStyle = "#120b18";
  ctx.fillRect(cx - 24, cy - 34, 48, 17);
  ctx.fillStyle = "#f4f0ce";
  ctx.font = "14px Monaco, monospace";
  ctx.fillText("5 WAYS", cx - 22, cy - 21);
  ctx.restore();
}

function drawSocratesBurst(burst) {
  const t = 1 - burst.life / burst.maxLife;
  const alpha = Math.max(0, 1 - t * 0.9);
  const cx = burst.x;
  const cy = burst.y - 10;
  ctx.save();
  ctx.globalAlpha = alpha;

  drawPixelRing(cx, cy, 22 + t * 250, "#9bd6ff", 8, 24);
  drawPixelRing(cx, cy, 50 + t * 170, "#f7e9b6", 5, 36);
  drawPixelRing(cx, cy, 84 + t * 90, "#607e91", 4, 48);

  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "center";
  const questions = ["WHY?", "WHAT?", "HOW?", "SURE?"];
  questions.forEach((question, index) => {
    const angle = t * 2.5 + (index * Math.PI * 2) / questions.length;
    const radius = 48 + t * 190;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.55;
    ctx.fillStyle = "#120b18";
    ctx.fillText(question, x + 3, y + 3);
    ctx.fillStyle = index % 2 ? "#f7e9b6" : "#9bd6ff";
    ctx.fillText(question, x, y);
  });

  ctx.fillStyle = "#120b18";
  ctx.fillRect(cx - 54, cy - 24, 108, 42);
  ctx.fillStyle = "#d6e0dc";
  ctx.font = "bold 16px Monaco, monospace";
  ctx.fillText("DEFINE THAT", cx, cy + 2);
  ctx.textAlign = "start";
  ctx.restore();
}

function drawPixelRing(cx, cy, radius, color, size, step) {
  ctx.fillStyle = color;
  for (let a = 0; a < 360; a += step) {
    const rad = (a * Math.PI) / 180;
    const x = Math.floor(cx + Math.cos(rad) * radius);
    const y = Math.floor(cy + Math.sin(rad) * radius * 0.58);
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawPixelBeam(x1, y1, x2, y2, color) {
  ctx.fillStyle = "#120b18";
  drawSteppedLine(x1, y1 + 4, x2, y2 + 4, 10, 8);
  ctx.fillStyle = color;
  drawSteppedLine(x1, y1, x2, y2, 8, 5);
  ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
  drawSteppedLine(x1, y1 - 4, x2, y2 - 4, 5, 3);
}

function drawSteppedLine(x1, y1, x2, y2, steps, size) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.floor(x1 + (x2 - x1) * t);
    const y = Math.floor(y1 + (y2 - y1) * t);
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawPixelDiamond(cx, cy, radius, color) {
  ctx.fillStyle = "#120b18";
  for (let y = -radius - 3; y <= radius + 3; y += 4) {
    const width = (radius + 3 - Math.abs(y)) * 2;
    ctx.fillRect(cx - width / 2, cy + y, width, 4);
  }
  ctx.fillStyle = color;
  for (let y = -radius; y <= radius; y += 4) {
    const width = (radius - Math.abs(y)) * 2;
    ctx.fillRect(cx - width / 2, cy + y, width, 4);
  }
}

function drawProjectiles() {
  for (const shot of state.projectiles) {
    ctx.fillStyle = "#120b18";
    ctx.fillRect(shot.x - 3, shot.y + 2, shot.w + 6, shot.h);
    ctx.fillStyle = shot.color;
    ctx.fillRect(shot.x, shot.y, shot.w, shot.h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillRect(shot.x + 3, shot.y + 2, Math.max(4, shot.w - 7), 3);
    ctx.fillStyle = "#120b18";
    ctx.fillRect(shot.x - 5, shot.y + 4, 5, 4);
    ctx.fillRect(shot.x + shot.w, shot.y + 4, 5, 4);
    ctx.fillStyle = "#120b18";
    ctx.font = "10px Monaco, monospace";
    ctx.fillText(shot.label, shot.x + 4, shot.y + 10);
  }
  for (const shot of state.enemyShots) {
    ctx.fillStyle = "#120b18";
    ctx.fillRect(shot.x - 3, shot.y - 3, shot.w + 6, shot.h + 6);
    ctx.fillStyle = shot.color;
    ctx.fillRect(shot.x, shot.y, shot.w, shot.h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(shot.x + 2, shot.y + 2, shot.w - 4, 3);
    ctx.fillStyle = "#f7e9b6";
    ctx.font = "13px Monaco, monospace";
    ctx.fillText(shot.word, shot.x + 3, shot.y + 13);
  }
}

function drawSparks() {
  for (const s of state.sparks) {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 4, 4);
  }
}

function drawFloaters() {
  ctx.textAlign = "center";
  ctx.font = "bold 12px Monaco, monospace";
  for (const floater of state.floaters) {
    const alpha = Math.min(1, floater.life / 12);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#120b18";
    ctx.fillText(floater.text, floater.x + 2, floater.y + 2);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
}

function drawHud() {
  const p = state.player;
  ctx.fillStyle = "rgba(18, 11, 24, 0.88)";
  ctx.fillRect(16, 14, 444, 62);
  ctx.fillStyle = "#f7e9b6";
  ctx.font = "16px Monaco, monospace";
  ctx.fillText(`${state.hero}  ${heroes[state.hero].attackName}`, 30, 37);
  ctx.font = "9px Monaco, monospace";
  ctx.fillStyle = p.dashCd <= 0 ? "#6dd6c4" : "#766a80";
  ctx.fillText(p.dashCd <= 0 ? "DASH READY" : `DASH ${Math.ceil(p.dashCd / 10)}`, 347, 36);
  drawMeter(30, 48, 116, 12, p.hp / p.maxHp, "#d85c7f", "HP");
  drawMeter(158, 48, 116, 12, p.virtue / 100, "#87bc4c", "VIRTUE");
  drawMeter(286, 48, 116, 12, p.guard / p.maxGuard, "#6dd6c4", "GUARD");
  ctx.fillStyle = "#f0c15b";
  ctx.fillText(String(state.score).padStart(6, "0"), W - 116, 38);
  ctx.fillStyle = "#f7e9b6";
  const totalScrolls = levels.reduce((sum, level) => sum + level.pickups.length, 0);
  ctx.fillText(`LV ${state.levelIndex + 1}/3  SCROLLS ${state.scrolls}/${totalScrolls}`, W - 250, 64);
  if (state.combo > 1) {
    const pulse = 1 + Math.sin(state.time * 0.2) * 0.04;
    ctx.save();
    ctx.translate(W - 105, 102);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "rgba(18, 11, 24, 0.88)";
    ctx.fillRect(-68, -20, 136, 42);
    ctx.fillStyle = state.combo >= 10 ? "#fff8dc" : "#f0c15b";
    ctx.font = `bold ${state.combo >= 10 ? 25 : 21}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${state.combo}× COMBO`, 0, 7);
    ctx.fillStyle = "#6dd6c4";
    ctx.fillRect(-65, 15, 130 * (state.comboTimer / 150), 3);
    ctx.restore();
    ctx.textAlign = "start";
  }
}

function drawMeter(x, y, w, h, pct, color, label) {
  ctx.fillStyle = "#08040d";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * pct), h - 4);
  ctx.fillStyle = "#f7e9b6";
  ctx.font = "9px Monaco, monospace";
  ctx.fillText(label, x + 4, y + 10);
}

function drawOverlay() {
  ctx.fillStyle = "rgba(18, 11, 24, 0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f0c15b";
  ctx.font = "42px Georgia, serif";
  ctx.textAlign = "center";
  const title = state.message || "SUMMA CONTRA MUNDUM";
  ctx.fillText(title, W / 2, 218);
  ctx.fillStyle = "#f7e9b6";
  ctx.font = "17px Monaco, monospace";
  const line =
    state.mode === "won"
      ? "Three levels. Twenty-one scrolls. One admirably overworked intellect."
      : state.mode === "levelComplete"
        ? `${levels[state.levelIndex].clearLine} Press Start to continue.`
      : state.mode === "lost"
        ? "Reset, distinguish, and try again."
        : "Dash through danger. Tap block just before impact to parry and reflect.";
  drawCenteredWrappedText(line, W / 2, 260, 820, 23);
  ctx.textAlign = "start";
}

function drawCenteredWrappedText(text, centerX, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((textLine, index) => {
    ctx.fillText(textLine, centerX, y + index * lineHeight);
  });
}

function drawBanner(text, y) {
  const width = Math.min(620, 80 + text.length * 18);
  const x = W / 2 - width / 2;
  ctx.fillStyle = "#120b18";
  ctx.fillRect(x - 4, y - 4, width + 8, 42);
  ctx.fillStyle = "#f0c15b";
  ctx.fillRect(x, y, width, 34);
  ctx.fillStyle = "#120b18";
  ctx.font = "22px Monaco, monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, y + 24);
  ctx.textAlign = "start";
}

function loop(now) {
  const dt = Math.min(2, (now - last) / 16.67 || 1);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) event.preventDefault();
  if (event.key === "Escape" && !ui.keysGuide.hidden) {
    event.preventDefault();
    setKeysGuide(false);
    return;
  }
  if (!ui.keysGuide.hidden) return;
  if ((event.key === "m" || event.key === "M") && !event.repeat) {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      ensureAudio();
      resetMusic();
    }
    state.message = audioEnabled ? "SOUND ON" : "SOUND MUTED";
    messageTimer = 55;
    return;
  }
  if ((event.key === "n" || event.key === "N") && !event.repeat) {
    musicEnabled = !musicEnabled;
    if (musicEnabled) {
      ensureAudio();
      resetMusic();
    }
    state.message = musicEnabled ? "INDUSTRIAL MODE: ON" : "MUSIC OFF";
    messageTimer = 55;
    return;
  }
  keys.add(event.key);
  if (event.key === "Enter") start();
  if (event.key === "p" || event.key === "P") pause();
  if (event.key === "1") setHero("Aristotle");
  if (event.key === "2") setHero("Aquinas");
  if (event.key === "3") setHero("Socrates");
});

window.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("blur", () => {
  keys.clear();
  if (state?.player) state.player.jumpHeld = false;
});

for (const button of document.querySelectorAll("[data-touch]")) {
  const name = button.dataset.touch;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touch.add(name);
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", () => touch.delete(name));
  button.addEventListener("pointercancel", () => touch.delete(name));
  button.addEventListener("pointerleave", () => touch.delete(name));
}

ui.start.addEventListener("click", start);
ui.pause.addEventListener("click", pause);
ui.reset.addEventListener("click", reset);
ui.aristotle.addEventListener("click", () => setHero("Aristotle"));
ui.aquinas.addEventListener("click", () => setHero("Aquinas"));
ui.socrates.addEventListener("click", () => setHero("Socrates"));
ui.showKeys.addEventListener("click", () => setKeysGuide(ui.keysGuide.hidden));
ui.hideKeys.addEventListener("click", () => setKeysGuide(false));

state = freshState();
setHero("Aristotle");
window.summaContraMundum = {
  snapshot: () => ({
    mode: state.mode,
    hero: state.hero,
    x: Math.round(state.player.x),
    hp: state.player.hp,
    virtue: Math.round(state.player.virtue),
    guard: Math.round(state.player.guard),
    blocking: state.player.blocking,
    dashReady: state.player.dashCd <= 0,
    combo: state.combo,
    bestCombo: state.bestCombo,
    sound: audioEnabled,
    music: musicEnabled,
    score: state.score,
    level: state.levelIndex + 1,
    stage: levels[state.levelIndex].name,
    enemies: state.enemies.filter((enemy) => enemy.alive).length,
  }),
};

const previewHero = new URLSearchParams(window.location.search).get("previewSpecial");
if (previewHero && heroes[previewHero]) {
  setHero(previewHero);
  state.mode = "playing";
  state.cameraX = 0;
  state.player.x = 320;
  state.player.y = GROUND_Y - state.player.h;
  state.player.grounded = true;
  state.player.virtue = 100;
  special();
}

requestAnimationFrame(loop);
