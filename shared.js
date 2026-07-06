/* Shared helpers for all Letter Pops playground pages.
   Exposes a single global: LP */
'use strict';

const LP = (function () {

  const PARTY = ['🎉','🎊','🌟','✨','🎈','🥳','🌈','💫','🎵','🎶','🍭','🧁','🎠','🪅','😄','🐣','🦄','💖','🍬','🎪'];

  const PRAISES = [
    'Great job, {name}! 🌟',
    'Wow, {name}! 🎉',
    'Amazing, {name}! 🥳',
    'Super star, {name}! ⭐',
    'You did it, {name}! 🌈',
    'Fantastic, {name}! 🎊'
  ];

  const playerName = localStorage.getItem('lp_name') || 'Superstar';
  let soundOn = localStorage.getItem('lp_sound') !== 'off';
  let lastSpeakTime = 0;
  let lastKeyTime = 0;
  let count = 0;
  let praiseIndex = 0;
  let hue = 200;
  let milestoneEvery = 25;

  const MAX_FLYS = 80;
  const KEY_THROTTLE_MS = 90;
  const SPEAK_THROTTLE_MS = 500;

  let fxLayer = null;
  let counterEl = null;

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Top bar + fx layer ---------- */
  function initPage(opts) {
    opts = opts || {};
    milestoneEvery = opts.milestone || 25;
    const counterEmoji = opts.counterEmoji || '🎯';

    const bar = document.createElement('header');
    bar.id = 'topBar';
    bar.innerHTML =
      '<a id="homeBtn" href="index.html" aria-label="Back to game menu">🏠</a>' +
      '<span id="playerName">⭐ ' + escapeHtml(playerName) + '</span>' +
      (opts.showCounter === false ? '<span></span>'
        : '<span id="counter">' + counterEmoji + ' 0</span>') +
      '<button id="themeBtn" type="button" aria-label="Day or night mode">🌙</button>' +
      '<button id="soundBtn" type="button" aria-label="Sound on or off">🔊</button>';
    document.body.prepend(bar);

    const themeBtn = document.getElementById('themeBtn');
    function paintThemeBtn() {
      themeBtn.textContent =
        document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
    }
    paintThemeBtn();
    themeBtn.addEventListener('click', function () {
      const dark = document.documentElement.dataset.theme === 'dark';
      if (dark) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = 'dark';
      localStorage.setItem('lp_theme', dark ? 'light' : 'dark');
      paintThemeBtn();
      themeBtn.blur();
    });

    fxLayer = document.createElement('div');
    fxLayer.id = 'fxLayer';
    document.body.appendChild(fxLayer);

    counterEl = document.getElementById('counter');
    const soundBtn = document.getElementById('soundBtn');
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      localStorage.setItem('lp_sound', soundOn ? 'on' : 'off');
      if (!soundOn && 'speechSynthesis' in globalThis) speechSynthesis.cancel();
      soundBtn.textContent = soundOn ? '🔊' : '🔇';
      soundBtn.blur();
    });
  }

  /* ---------- Speech ---------- */
  // iOS quirks handled here:
  // 1. speech must first run inside a real user gesture ("unlock")
  // 2. speak() immediately after cancel() fails silently — defer one tick
  // 3. the utterance object must stay referenced or GC eats it mid-speech
  let speechUnlocked = false;
  let lastUtterance = null;
  let pendingSpeech = null; // greeting spoken on load waits for the first gesture

  function unlockSpeech() {
    if (speechUnlocked || !('speechSynthesis' in globalThis)) return;
    speechUnlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch (e) { /* speech just stays off */ }
    if (pendingSpeech) {
      const t = pendingSpeech;
      pendingSpeech = null;
      speak(t, true);
    }
  }
  document.addEventListener('pointerdown', unlockSpeech, true);
  document.addEventListener('keydown', unlockSpeech, true);

  function speak(text, force) {
    if (!soundOn || !('speechSynthesis' in globalThis)) return;
    if (!speechUnlocked) { pendingSpeech = text; return; }
    const now = Date.now();
    if (!force && now - lastSpeakTime < SPEAK_THROTTLE_MS) return;
    lastSpeakTime = now;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85;
    u.pitch = 1.2;
    u.volume = 1;
    lastUtterance = u;
    setTimeout(function () {
      if (!soundOn || lastUtterance !== u) return;
      speechSynthesis.resume(); // iOS sometimes leaves the queue paused
      speechSynthesis.speak(u);
    }, 60);
  }

  /* ---------- Floating emoji effects ---------- */
  const ANIMS = ['floatUp', 'driftSpin', 'wobbleFloat'];

  function spawnFly(char, x, y, sizeRem) {
    while (fxLayer.children.length >= MAX_FLYS) fxLayer.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = 'fly';
    el.textContent = char;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--size', (sizeRem || rand(3, 5.5)) + 'rem');
    el.style.setProperty('--dx', rand(-160, 160) + 'px');
    el.style.setProperty('--dy', rand(-innerHeight * 0.5, -60) + 'px');
    el.style.animation = pick(ANIMS) + ' ' + rand(3, 4.5) + 's ease forwards';
    el.addEventListener('pointerdown', function () {
      if (el.classList.contains('popped')) return;
      el.classList.add('popped');
      setTimeout(function () { el.remove(); }, 380);
    });
    el.addEventListener('animationend', function () { el.remove(); });
    fxLayer.appendChild(el);
    return el;
  }

  function burstAt(x, y, chars, big) {
    chars.forEach(function (c, i) {
      setTimeout(function () {
        spawnFly(c, x + rand(-70, 70), y + rand(-50, 50), big ? rand(4, 6.5) : undefined);
      }, i * 70);
    });
  }

  function randomSpot() {
    return {
      x: rand(innerWidth * 0.15, innerWidth * 0.85),
      y: rand(innerHeight * 0.3, innerHeight * 0.75)
    };
  }

  function partyBurst(times) {
    for (let i = 0; i < (times || 3); i++) {
      const spot = randomSpot();
      burstAt(spot.x, spot.y, [pick(PARTY), pick(PARTY), pick(PARTY), pick(PARTY), pick(PARTY)]);
    }
  }

  /* ---------- Big letter / word label ---------- */
  function showBigLetter(letter) {
    const old = document.querySelector('.big-letter');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'big-letter';
    el.style.color = 'hsl(' + Math.floor(rand(0, 360)) + ', 85%, 45%)';
    el.innerHTML = escapeHtml(letter) + '<small>' + escapeHtml(letter.toLowerCase()) + '</small>';
    document.body.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  function showWordLabel(word) {
    const old = document.querySelector('.word-label');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'word-label';
    el.textContent = word;
    el.style.background = 'hsl(' + Math.floor(rand(0, 360)) + ', 70%, 40%)';
    document.body.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  /* ---------- Counter + celebration ---------- */
  function bumpCounter() {
    count++;
    if (counterEl) {
      counterEl.textContent = counterEl.textContent.split(' ')[0] + ' ' + count;
      counterEl.classList.add('bump');
      setTimeout(function () { counterEl.classList.remove('bump'); }, 120);
    }
    hue = (hue + 14) % 360;
    document.body.style.setProperty('--h', hue);
    document.body.style.setProperty('--h2', (hue + 80) % 360);
    if (count % milestoneEvery === 0) celebrate();
    return count;
  }

  function celebrate(customText) {
    const praise = customText ||
      PRAISES[praiseIndex++ % PRAISES.length].replace('{name}', playerName);
    const el = document.createElement('div');
    el.className = 'praise';
    el.textContent = praise;
    document.body.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
    partyBurst(4);
    speak(praise.replace(/[^\w\s,!']/g, ''), true);
  }

  /* ---------- Keyboard guard (mash-proofing) ---------- */
  function guardKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (e.key === 'F11') return null;
    e.preventDefault();
    const now = Date.now();
    if (now - lastKeyTime < KEY_THROTTLE_MS) return null;
    lastKeyTime = now;
    return e.key;
  }

  return {
    playerName: playerName,
    PARTY: PARTY,
    rand: rand,
    pick: pick,
    escapeHtml: escapeHtml,
    initPage: initPage,
    speak: speak,
    spawnFly: spawnFly,
    burstAt: burstAt,
    randomSpot: randomSpot,
    partyBurst: partyBurst,
    showBigLetter: showBigLetter,
    showWordLabel: showWordLabel,
    bumpCounter: bumpCounter,
    celebrate: celebrate,
    guardKey: guardKey,
    isSoundOn: function () { return soundOn; }
  };
})();
