(() => {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const INITIALS_KEY = "flappy-akme-initials";
  const BEST_KEY = "flappy-akme-best";
  const MUTE_KEY = "flappy-akme-muted";
  const SCORES_KEY = "flappy-akme-scores";
  const SEED = [
    { initials: "TST", score: 50 },
    { initials: "AKM", score: 42 },
    { initials: "CRT", score: 31 },
    { initials: "DUK", score: 24 },
    { initials: "CLH", score: 18 },
    { initials: "PIP", score: 12 },
    { initials: "MOO", score: 9 },
    { initials: "ZZZ", score: 6 },
  ];

  const WORLD_W = 400;
  const GROUND = 88;
  const STEP = 1 / 60;
  const GRAVITY = 1650;
  const FLAP_V = -390;
  const MAX_FALL = 560;
  const PLAYER_X = 108;
  const PLAYER_W = 58;
  const PLAYER_H = 62;
  const HIT_INSET = { l: 10, r: 10, t: 14, b: 10 };
  const PIPE_W = 62;
  const PIPE_CAP_H = 24;
  const PIPE_CAP_EXTRA = 10;
  const PIPE_COUNT = 6;
  const BASE_SPEED = 128;
  const BASE_GAP = 168;
  const BASE_SPACING = 210;
  const FLASH_MAX = 0.35;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function pad4(n) {
    return String(Math.max(0, Math.floor(n))).padStart(4, "0");
  }
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  let actx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  let musicOn = false;
  let noiseBuf = null;
  const BPM = 140;
  const SIXTEENTH = 60 / BPM / 4;
  const LOOKAHEAD = 0.12;
  const BASS = [48, 48, 43, 46, 48, 48, 50, 43];
  const LEAD = [72, 0, 76, 0, 79, 76, 72, 0, 71, 0, 72, 74, 76, 0, 74, 72];
  const HAT = [1, 0, 1, 0, 1, 0, 1, 1];

  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }
  function makeNoise(ac) {
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  function ensure() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC({ latencyHint: "interactive" });
      master = actx.createGain();
      musicBus = actx.createGain();
      sfxBus = actx.createGain();
      musicBus.gain.value = 0.22;
      sfxBus.gain.value = 0.55;
      master.gain.value = muted ? 0 : 0.9;
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(actx.destination);
      noiseBuf = makeNoise(actx);
    }
    return actx;
  }
  function bus(name) {
    return name === "music" ? musicBus : sfxBus;
  }
  function tone(opts) {
    if (!actx || !bus(opts.dest || "sfx")) return;
    const t0 = opts.when != null ? opts.when : actx.currentTime;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + opts.dur);
    const amp = opts.gain != null ? opts.gain : 0.18;
    g.gain.setValueAtTime(amp, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(bus(opts.dest || "sfx"));
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }
  function noise(opts) {
    if (!actx || !noiseBuf || !bus(opts.dest || "sfx")) return;
    const t0 = opts.when != null ? opts.when : actx.currentTime;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const g = actx.createGain();
    const f = actx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    g.gain.setValueAtTime(opts.gain != null ? opts.gain : 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus(opts.dest || "sfx"));
    src.start(t0);
    src.stop(t0 + opts.dur + 0.02);
  }
  function unlockAudio() {
    const ac = ensure();
    if (ac && ac.state === "suspended") ac.resume();
  }
  function resumeAudio() {
    if (actx && actx.state === "suspended") actx.resume();
  }
  function setMuted(next) {
    muted = next;
    if (master) master.gain.value = next ? 0 : 0.9;
  }
  function playLogoSting() {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime + 0.02;
    [64, 67, 71, 76, 83].forEach((n, i) => {
      tone({ freq: midi(n), dur: 0.18, type: "square", gain: 0.22, when: t + i * 0.09 });
      tone({ freq: midi(n - 12), dur: 0.22, type: "triangle", gain: 0.08, when: t + i * 0.09 });
    });
    tone({ freq: midi(88), dur: 0.55, type: "square", gain: 0.2, when: t + 0.48, slide: midi(76) });
    tone({ freq: midi(52), dur: 0.7, type: "triangle", gain: 0.16, when: t + 0.48 });
  }
  function playStart() {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    [72, 76, 79, 84].forEach((n, i) => {
      tone({ freq: midi(n), dur: 0.08, type: "square", gain: 0.16, when: t + i * 0.045 });
    });
  }
  function playFlap() {
    if (!ensure()) return;
    tone({ freq: 620, dur: 0.07, type: "square", gain: 0.12, slide: 420 });
    tone({ freq: 180, dur: 0.05, type: "triangle", gain: 0.06 });
  }
  function playScore() {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    tone({ freq: midi(76), dur: 0.08, type: "square", gain: 0.14, when: t });
    tone({ freq: midi(83), dur: 0.14, type: "square", gain: 0.14, when: t + 0.07 });
  }
  function playDie() {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    noise({ dur: 0.18, gain: 0.22, when: t });
    tone({ freq: 220, dur: 0.45, type: "square", gain: 0.16, slide: 60, when: t });
    tone({ freq: 110, dur: 0.5, type: "triangle", gain: 0.12, slide: 40, when: t + 0.05 });
  }
  function playSelect() {
    if (!ensure()) return;
    tone({ freq: midi(79), dur: 0.05, type: "square", gain: 0.1 });
  }
  function playSubmit() {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    tone({ freq: midi(67), dur: 0.1, type: "square", gain: 0.14, when: t });
    tone({ freq: midi(74), dur: 0.16, type: "square", gain: 0.14, when: t + 0.08 });
  }
  function scheduleNote(step, when) {
    const i = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const bass = BASS[(i >> 1) % BASS.length];
    if (i % 2 === 0) {
      tone({ freq: midi(bass), dur: 0.18, type: "triangle", gain: 0.12, when, dest: "music" });
    }
    const lead = LEAD[i];
    if (lead) {
      const n = lead + (bar === 2 ? 2 : 0);
      tone({ freq: midi(n), dur: 0.12, type: "square", gain: 0.09, when, dest: "music" });
    }
    if (HAT[i % HAT.length]) noise({ dur: 0.03, gain: 0.04, when, dest: "music" });
  }
  function scheduler() {
    if (!actx || !musicOn) return;
    const horizon = actx.currentTime + LOOKAHEAD;
    while (nextNoteTime < horizon) {
      scheduleNote(musicStep, nextNoteTime);
      nextNoteTime += SIXTEENTH;
      musicStep += 1;
    }
    musicTimer = window.setTimeout(scheduler, 25);
  }
  function startMusic() {
    const ac = ensure();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    if (musicOn) return;
    musicOn = true;
    musicStep = 0;
    nextNoteTime = ac.currentTime + 0.05;
    scheduler();
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer != null) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
  }
  function duckMusic(on) {
    if (!musicBus || !actx) return;
    musicBus.gain.cancelScheduledValues(actx.currentTime);
    musicBus.gain.linearRampToValueAtTime(on ? 0.08 : 0.22, actx.currentTime + 0.08);
  }

  function readSavedInitials() {
    try {
      const v = window.localStorage.getItem(INITIALS_KEY);
      if (v && /^[A-Z0-9]{3}$/.test(v)) return v;
    } catch (e) {}
    return "AKM";
  }
  function loadScores() {
    try {
      const raw = window.localStorage.getItem(SCORES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 10);
      }
    } catch (e) {}
    try {
      window.localStorage.setItem(SCORES_KEY, JSON.stringify(SEED));
    } catch (e) {}
    return SEED.slice();
  }
  function saveScores(rows) {
    try {
      window.localStorage.setItem(SCORES_KEY, JSON.stringify(rows.slice(0, 10)));
    } catch (e) {}
  }
  function postScore(initials, score) {
    const name = String(initials || "").trim().toUpperCase();
    const n = Math.floor(score);
    if (!/^[A-Z0-9]{3}$/.test(name)) throw new Error("Initials must be 3 letters or numbers");
    const list = loadScores();
    if (Number.isFinite(n) && n > 0) {
      list.push({ initials: name, score: n });
      list.sort((a, b) => b.score - a.score || 0);
      saveScores(list.slice(0, 10));
    }
    try {
      window.localStorage.setItem(INITIALS_KEY, name);
    } catch (e) {}
    return loadScores();
  }

  const $ = (id) => document.getElementById(id);
  const ui = {
    phase: "power",
    score: 0,
    best: 0,
    muted: false,
    lastScore: 0,
    scores: [],
    savedInitials: "AKM",
    submitted: false,
    letters: ["A", "K", "M"],
    slot: 0,
    busy: false,
  };
  let gameHandle = null;

  function setPhase(next) {
    if (ui.phase === next) return;
    ui.phase = next;
    if (next === "gameover") ui.submitted = false;
    renderOverlays();
  }
  function renderBoard(el, highlight) {
    const rows = ui.scores.slice(0, 10);
    if (!rows.length) {
      el.innerHTML = '<div class="hint">NO SCORES YET</div>';
      return;
    }
    el.innerHTML = rows
      .map((row, i) => {
        const me = row.initials === highlight ? " me" : "";
        return `<div class="board-row${me}"><span class="rank">${String(i + 1).padStart(2, "0")}</span><span>${row.initials}</span><span>${pad4(row.score)}</span></div>`;
      })
      .join("");
  }
  function paintGlyphs() {
    for (let i = 0; i < 3; i++) {
      const g = $("glyph-" + i);
      g.textContent = ui.letters[i] || "A";
      g.classList.toggle("is-on", ui.slot === i);
    }
  }
  function renderOverlays() {
    const p = ui.phase;
    $("led").classList.toggle("on", p !== "power");
    $("overlay-power").classList.toggle("hidden", p !== "power");
    $("overlay-boot").classList.toggle("hidden", p !== "boot");
    $("overlay-title").classList.toggle("hidden", p !== "title");
    $("overlay-gameover").classList.toggle("hidden", p !== "gameover");
    $("mute-btn").textContent = ui.muted ? "MUTE" : "VOL";
    $("mute-btn").setAttribute("aria-label", ui.muted ? "Unmute" : "Mute");
    if (p === "title") renderBoard($("board-title"), ui.savedInitials);
    if (p === "gameover") {
      $("score-val").textContent = pad4(ui.lastScore || ui.score);
      $("best-val").textContent = pad4(ui.best);
      $("initials-wrap").classList.toggle("hidden", ui.submitted);
      $("again-wrap").classList.toggle("hidden", !ui.submitted);
      paintGlyphs();
      if (ui.submitted) renderBoard($("board-over"), ui.savedInitials);
    }
  }
  function nudge(index, dir) {
    const cur = ui.letters[index] || "A";
    const i = LETTERS.indexOf(cur);
    const j = (i + dir + LETTERS.length) % LETTERS.length;
    ui.letters[index] = LETTERS[j];
    playSelect();
    paintGlyphs();
  }
  function submitInitials() {
    if (ui.busy) return;
    const initials = ui.letters.join("").toUpperCase().padEnd(3, "A").slice(0, 3);
    ui.busy = true;
    $("submit-btn").disabled = true;
    $("save-err").classList.add("hidden");
    try {
      playSubmit();
      ui.scores = postScore(initials, ui.lastScore);
      ui.savedInitials = initials;
      ui.submitted = true;
      ui.busy = false;
      $("submit-btn").disabled = false;
      renderOverlays();
    } catch (e) {
      $("save-err").textContent = e.message || "SAVE FAILED";
      $("save-err").classList.remove("hidden");
      ui.busy = false;
      $("submit-btn").disabled = false;
    }
  }

  function createGame(canvas) {
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) throw new Error("Canvas 2D is not available");
    const ctx = maybeCtx;

    let W = WORLD_W;
    let H = 640;
    let PLAY_H = H - GROUND;

    const charImg = loadImage("./assets/character.png");
    const bgImg = loadImage("./assets/background.png");

    const pipes = Array.from({ length: PIPE_COUNT }, () => ({
      x: 0, gapY: PLAY_H / 2, gapH: BASE_GAP, scored: false, alive: false,
    }));
    const particles = Array.from({ length: 64 }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: "#fff", alive: false,
    }));

    let phase = "power";
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let score = 0;
    let playerY = PLAY_H * 0.42;
    let playerVy = 0;
    let playerRot = 0;
    let squash = 1;
    let stretch = 1;
    let bgX = 0;
    let groundX = 0;
    let speed = BASE_SPEED;
    let time = 0;
    let bootT = 0;
    let dieT = 0;
    let trauma = 0;
    let flash = 0;
    let hitstop = 0;
    let flapBuffer = 0;
    let reducedMotion = false;
    let running = true;
    let cssW = 0;
    let cssH = 0;
    let padHeld = false;
    const keys = new Set();
    const GAME_KEYS = new Set(["Space", "ArrowUp", "KeyW", "KeyA"]);

    function engineSetPhase(next) {
      if (phase === next) return;
      phase = next;
      setPhase(next);
    }
    function currentSpeed() {
      return BASE_SPEED + Math.min(score * 4.2, 92);
    }
    function currentGap() {
      return BASE_GAP - Math.min(score * 1.6, 36);
    }
    function currentSpacing() {
      return BASE_SPACING + Math.min(score * 1.2, 24);
    }
    function randomGapY(gapH) {
      const margin = 36;
      const min = gapH / 2 + margin;
      const max = PLAY_H - gapH / 2 - margin;
      return min + Math.random() * Math.max(8, max - min);
    }
    function resetPipes(offscreen) {
      const spacing = currentSpacing();
      const gapH = currentGap();
      const startX = offscreen ? W + 40 : W + 70;
      for (let i = 0; i < pipes.length; i++) {
        const p = pipes[i];
        if (i < 3) {
          p.alive = true;
          p.x = startX + i * spacing;
          p.gapH = gapH;
          p.gapY = randomGapY(gapH);
          p.scored = false;
        } else p.alive = false;
      }
    }
    function resetRun(keepPhase) {
      score = 0;
      playerY = PLAY_H * 0.42;
      playerVy = 0;
      playerRot = 0;
      squash = 1;
      stretch = 1;
      speed = BASE_SPEED;
      dieT = 0;
      trauma = 0;
      flash = 0;
      hitstop = 0;
      flapBuffer = 0;
      resetPipes(true);
      ui.score = 0;
      engineSetPhase(keepPhase);
    }
    function emit(x, y, n, colors, burst) {
      let spawned = 0;
      for (const p of particles) {
        if (p.alive) continue;
        p.alive = true;
        p.x = x + (Math.random() - 0.5) * 12;
        p.y = y + (Math.random() - 0.5) * 12;
        const a = Math.random() * Math.PI * 2;
        const s = burst * (0.4 + Math.random());
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s - burst * 0.25;
        p.max = 0.3 + Math.random() * 0.45;
        p.life = p.max;
        p.size = 2 + Math.floor(Math.random() * 3);
        p.color = colors[spawned % colors.length] || "#fff";
        spawned += 1;
        if (spawned >= n) break;
      }
    }
    function flap() {
      playerVy = FLAP_V;
      squash = 1.18;
      stretch = 0.82;
      playFlap();
      emit(PLAYER_X + 8, playerY + PLAYER_H * 0.6, 7, ["#f4f4f5", "#3ddc3d", "#c41e3a"], 90);
    }
    function kill() {
      if (phase !== "playing") return;
      playDie();
      stopMusic();
      duckMusic(false);
      trauma = reducedMotion ? 0.15 : 0.85;
      flash = FLASH_MAX;
      hitstop = reducedMotion ? 0.04 : 0.09;
      dieT = 0;
      playerVy = Math.min(playerVy, 80);
      emit(PLAYER_X + PLAYER_W / 2, playerY + PLAYER_H / 2, 22, ["#c41e3a", "#f4f4f5", "#3ddc3d", "#f5c14a"], 220);
      ui.best = Math.max(ui.best, score);
      try { window.localStorage.setItem(BEST_KEY, String(ui.best)); } catch (e) {}
      ui.lastScore = score;
      engineSetPhase("dying");
    }
    function rightmostPipeX() {
      let m = -Infinity;
      for (const p of pipes) if (p.alive) m = Math.max(m, p.x);
      return Number.isFinite(m) ? m : W;
    }
    function recyclePipe(p) {
      p.x = rightmostPipeX() + currentSpacing();
      p.gapH = currentGap();
      p.gapY = randomGapY(p.gapH);
      p.scored = false;
      p.alive = true;
    }
    function playerBox() {
      return {
        x: PLAYER_X + HIT_INSET.l,
        y: playerY + HIT_INSET.t,
        w: PLAYER_W - HIT_INSET.l - HIT_INSET.r,
        h: PLAYER_H - HIT_INSET.t - HIT_INSET.b,
      };
    }
    function collides() {
      const b = playerBox();
      if (b.y + b.h >= PLAY_H) return true;
      for (const p of pipes) {
        if (!p.alive) continue;
        const topH = p.gapY - p.gapH / 2;
        const botY = p.gapY + p.gapH / 2;
        const bodyX = p.x;
        const capX = p.x - PIPE_CAP_EXTRA / 2;
        const capW = PIPE_W + PIPE_CAP_EXTRA;
        if (aabb(b.x, b.y, b.w, b.h, bodyX, 0, PIPE_W, Math.max(0, topH - PIPE_CAP_H))) return true;
        if (aabb(b.x, b.y, b.w, b.h, capX, topH - PIPE_CAP_H, capW, PIPE_CAP_H)) return true;
        if (aabb(b.x, b.y, b.w, b.h, capX, botY, capW, PIPE_CAP_H)) return true;
        if (aabb(b.x, b.y, b.w, b.h, bodyX, botY + PIPE_CAP_H, PIPE_W, PLAY_H - (botY + PIPE_CAP_H))) return true;
      }
      return false;
    }
    function update(dt) {
      time += dt;
      if (flapBuffer > 0) flapBuffer -= dt;
      trauma = Math.max(0, trauma - dt * 2.2);
      flash = Math.max(0, flash - dt * 1.4);
      const scroll = phase === "playing" || phase === "title" || phase === "boot";
      if (scroll) {
        const sp = phase === "playing" ? speed : 28;
        bgX = (bgX + sp * 0.32 * dt) % 1024;
        groundX = (groundX + sp * dt) % 64;
      }
      for (const p of particles) {
        if (!p.alive) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 420 * dt;
        if (p.life <= 0) p.alive = false;
      }
      if (phase === "boot") {
        bootT += dt;
        playerY = PLAY_H * 0.42 + Math.sin(time * 2.4) * 7;
        if (bootT >= 1.75) {
          engineSetPhase("title");
          startMusic();
        }
        return;
      }
      if (phase === "power") {
        playerY = PLAY_H * 0.42;
        return;
      }
      if (phase === "title") {
        playerY = PLAY_H * 0.42 + Math.sin(time * 2.6) * 8;
        playerRot = Math.sin(time * 2.6) * 0.12;
        squash += (1 - squash) * (1 - Math.exp(-12 * dt));
        stretch += (1 - stretch) * (1 - Math.exp(-12 * dt));
        if (flapBuffer > 0) {
          flapBuffer = 0;
          beginPlay();
        }
        return;
      }
      if (phase === "gameover") return;
      if (phase === "dying") {
        playerVy += GRAVITY * dt;
        playerVy = Math.min(playerVy, MAX_FALL);
        playerY += playerVy * dt;
        playerRot = clamp(playerRot + dt * 4.5, -0.5, 1.35);
        if (playerY > PLAY_H - PLAYER_H * 0.3) {
          playerY = PLAY_H - PLAYER_H * 0.3;
          playerVy = 0;
        }
        dieT += dt;
        if (dieT > 0.85) engineSetPhase("gameover");
        return;
      }
      speed = currentSpeed();
      if (flapBuffer > 0) {
        flapBuffer = 0;
        flap();
      }
      playerVy += GRAVITY * dt;
      playerVy = Math.min(playerVy, MAX_FALL);
      playerY += playerVy * dt;
      if (playerY < -PLAYER_H * 0.55) {
        playerY = -PLAYER_H * 0.55;
        if (playerVy < 0) playerVy = 0;
      }
      const targetRot = clamp(playerVy / 520, -0.45, 1.15);
      playerRot += (targetRot - playerRot) * (1 - Math.exp(-10 * dt));
      squash += (1 - squash) * (1 - Math.exp(-14 * dt));
      stretch += (1 - stretch) * (1 - Math.exp(-14 * dt));
      for (const p of pipes) {
        if (!p.alive) continue;
        p.x -= speed * dt;
        if (!p.scored && p.x + PIPE_W < PLAYER_X) {
          p.scored = true;
          score += 1;
          ui.score = score;
          playScore();
          emit(PLAYER_X + PLAYER_W, playerY + PLAYER_H / 2, 8, ["#f5c14a", "#fff"], 70);
        }
        if (p.x + PIPE_W + PIPE_CAP_EXTRA < -20) recyclePipe(p);
      }
      if (collides()) kill();
    }
    function beginPlay() {
      stopMusic();
      playStart();
      duckMusic(false);
      resetRun("playing");
      flap();
    }
    function powerOn() {
      if (phase !== "power") return;
      unlockAudio();
      setMuted(ui.muted);
      playLogoSting();
      bootT = 0;
      engineSetPhase("boot");
    }
    function requestFlap() {
      if (phase === "power") {
        powerOn();
        return;
      }
      if (phase === "boot") return;
      if (phase === "title") {
        flapBuffer = 0.12;
        return;
      }
      if (phase === "playing") flapBuffer = 0.12;
    }
    function drawPipe(p) {
      const topH = p.gapY - p.gapH / 2;
      const botY = p.gapY + p.gapH / 2;
      const x = Math.round(p.x);
      const capX = x - PIPE_CAP_EXTRA / 2;
      const capW = PIPE_W + PIPE_CAP_EXTRA;
      const paint = (px, py, pw, ph) => {
        if (ph <= 0 || pw <= 0) return;
        ctx.fillStyle = "#0b3d10";
        ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = "#2fcf3a";
        ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        ctx.fillStyle = "#7dff6e";
        ctx.fillRect(px + 4, py + 2, 6, ph - 4);
        ctx.fillStyle = "#14821c";
        ctx.fillRect(px + pw - 10, py + 2, 6, ph - 4);
        ctx.fillStyle = "#1e9a28";
        ctx.fillRect(px + 12, py + 2, 3, ph - 4);
      };
      paint(x, 0, PIPE_W, Math.max(0, topH - PIPE_CAP_H));
      paint(capX, topH - PIPE_CAP_H, capW, PIPE_CAP_H);
      paint(capX, botY, capW, PIPE_CAP_H);
      paint(x, botY + PIPE_CAP_H, PIPE_W, Math.max(0, PLAY_H - (botY + PIPE_CAP_H)));
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(x + 2, topH - 4, PIPE_W - 4, 4);
      ctx.fillRect(x + 2, botY, PIPE_W - 4, 4);
    }
    function drawGround() {
      const y = PLAY_H;
      ctx.fillStyle = "#5a2e14";
      ctx.fillRect(0, y, W, GROUND);
      ctx.fillStyle = "#8b4518";
      ctx.fillRect(0, y + 16, W, GROUND);
      ctx.fillStyle = "#3cb43c";
      ctx.fillRect(0, y, W, 16);
      ctx.fillStyle = "#2a8a2a";
      ctx.fillRect(0, y + 12, W, 4);
      const offset = Math.floor(groundX);
      ctx.fillStyle = "#54d454";
      for (let x = -offset; x < W + 16; x += 16) ctx.fillRect(x, y - 4, 10, 6);
      ctx.fillStyle = "#c47a3a";
      for (let x = -offset * 0.5; x < W; x += 22) ctx.fillRect(Math.floor(x + 8), y + 28, 5, 4);
      ctx.fillStyle = "#0b3d10";
      ctx.fillRect(0, y - 2, W, 2);
    }
    function drawPlayer() {
      const px = PLAYER_X + PLAYER_W / 2;
      const py = playerY + PLAYER_H / 2;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(playerRot);
      ctx.scale(squash, stretch);
      if (charImg.complete && charImg.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(charImg, -PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
      } else {
        ctx.fillStyle = "#2fcf3a";
        ctx.beginPath();
        ctx.ellipse(0, 8, 24, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(-8, -18, 20, 22);
        ctx.fillStyle = "#c41e3a";
        ctx.fillRect(-12, -24, 28, 10);
      }
      ctx.restore();
    }
    function drawHud() {
      if (phase !== "playing" && phase !== "dying") return;
      ctx.save();
      ctx.font = '16px "Press Start 2P", ui-monospace, monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      const text = pad4(score);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#071018";
      ctx.strokeText(text, W - 14, 14);
      ctx.fillStyle = "#c41e3a";
      ctx.fillText(text, W - 16, 14);
      ctx.fillStyle = "#3d7cff";
      ctx.fillText(text, W - 12, 14);
      ctx.fillStyle = "#f8f8f8";
      ctx.fillText(text, W - 14, 14);
      ctx.restore();
    }
    function resize() {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const nextH = Math.max(520, Math.round(WORLD_W * (cssH / cssW)));
      if (nextH !== H) {
        const oldPlay = PLAY_H;
        H = nextH;
        PLAY_H = H - GROUND;
        if (oldPlay > 0) playerY = clamp(playerY * (PLAY_H / oldPlay), -PLAYER_H, PLAY_H - 8);
      }
    }
    function render() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(cssW / W, cssH / H);
      const ox = (cssW - W * scale) / 2;
      const oy = (cssH - H * scale) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#071433";
      ctx.fillRect(0, 0, cssW, cssH);
      const shake = trauma * trauma;
      const sx = reducedMotion ? 0 : (Math.random() * 2 - 1) * 10 * shake;
      const sy = reducedMotion ? 0 : (Math.random() * 2 - 1) * 8 * shake;
      ctx.save();
      ctx.translate(ox + sx, oy + sy);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      if (bgImg.complete && bgImg.naturalWidth > 0) {
        const bw = bgImg.naturalWidth;
        const bh = bgImg.naturalHeight;
        const destH = PLAY_H + 8;
        const destW = destH * (bw / bh);
        let x = -((bgX * destW) / bw) % destW;
        if (x > 0) x -= destW;
        for (let i = 0; i < 4; i++) ctx.drawImage(bgImg, x + i * destW, 0, destW, destH);
      } else {
        ctx.fillStyle = "#0a2460";
        ctx.fillRect(0, 0, W, PLAY_H);
      }
      if (phase === "playing" || phase === "dying" || phase === "gameover") {
        for (const p of pipes) if (p.alive) drawPipe(p);
      }
      drawGround();
      if (phase !== "power") drawPlayer();
      for (const p of particles) {
        if (!p.alive) continue;
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      drawHud();
      if (flash > 0) {
        ctx.fillStyle = "rgba(255,255,255," + flash + ")";
        ctx.fillRect(0, 0, W, H);
      }
      if (phase === "power") {
        ctx.fillStyle = "#020308";
        ctx.fillRect(0, 0, W, H);
      }
      if (phase === "boot") {
        const k = clamp(bootT / 0.35, 0, 1);
        ctx.fillStyle = "rgba(0,0,0," + (1 - k) + ")";
        ctx.fillRect(0, 0, W, H);
        if (bootT < 0.12) {
          ctx.fillStyle = "#dbe7ff";
          ctx.fillRect(0, 0, W, H);
        }
      }
      ctx.restore();
    }
    function pollGamepad() {
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      let pressed = false;
      for (const pad of pads) {
        if (!pad) continue;
        if ((pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[9] && pad.buttons[9].pressed)) pressed = true;
      }
      if (pressed && !padHeld) requestFlap();
      padHeld = pressed;
    }
    function frame(now) {
      if (!running) return;
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.1);
      pollGamepad();
      if (hitstop > 0) {
        hitstop -= dt;
        render();
        raf = requestAnimationFrame(frame);
        return;
      }
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        update(STEP);
        acc -= STEP;
        steps += 1;
      }
      render();
      raf = requestAnimationFrame(frame);
    }
    function onKeyDown(e) {
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        if (!keys.has(e.code)) requestFlap();
        keys.add(e.code);
      }
    }
    function onKeyUp(e) {
      keys.delete(e.code);
    }
    function onBlur() {
      keys.clear();
    }
    function onPointer(e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      requestFlap();
    }
    function onVis() {
      resumeAudio();
      if (document.visibilityState === "visible") last = performance.now();
    }

    reducedMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || false;
    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement || canvas);
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", resize);
    last = performance.now();
    raf = requestAnimationFrame(frame);

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(raf);
        stopMusic();
        ro.disconnect();
        canvas.removeEventListener("pointerdown", onPointer);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("resize", resize);
      },
      setMuted(next) {
        setMuted(next);
      },
      powerOn,
      startRun() {
        if (phase === "title") beginPlay();
      },
      restart() {
        startMusic();
        resetRun("title");
      },
    };
  }

  function hydratePrefs() {
    try {
      const best = Number(window.localStorage.getItem(BEST_KEY) || "0");
      if (Number.isFinite(best) && best > 0) ui.best = best;
      ui.muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch (e) {}
    ui.savedInitials = readSavedInitials();
    ui.letters = ui.savedInitials.split("");
    ui.scores = loadScores();
  }

  hydratePrefs();
  gameHandle = createGame($("game"));
  gameHandle.setMuted(ui.muted);
  renderOverlays();

  $("mute-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    unlockAudio();
    ui.muted = !ui.muted;
    try { window.localStorage.setItem(MUTE_KEY, ui.muted ? "1" : "0"); } catch (err) {}
    gameHandle.setMuted(ui.muted);
    renderOverlays();
  });

  document.querySelectorAll("[data-nudge]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parts = btn.getAttribute("data-nudge").split(",");
      nudge(Number(parts[0]), Number(parts[1]));
    });
  });
  document.querySelectorAll("[data-slot]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      ui.slot = Number(btn.getAttribute("data-slot"));
      paintGlyphs();
    });
  });
  $("submit-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    submitInitials();
  });
  $("skip-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    ui.submitted = true;
    renderOverlays();
  });
  $("again-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    gameHandle.restart();
  });

  window.addEventListener("keydown", (e) => {
    if (ui.phase !== "gameover" || ui.submitted || ui.busy) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      ui.slot = (ui.slot + 2) % 3;
      paintGlyphs();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      ui.slot = (ui.slot + 1) % 3;
      paintGlyphs();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nudge(ui.slot, 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nudge(ui.slot, -1);
    } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
      e.preventDefault();
      ui.letters[ui.slot] = e.key.toUpperCase();
      ui.slot = (ui.slot + 1) % 3;
      playSelect();
      paintGlyphs();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submitInitials();
    }
  });
})();
