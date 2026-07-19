/* bonus channel desk toys — clock, server status, vibes, bubble pop */
(() => {
  // ---------- wii clock ----------
  const clockTime = document.getElementById('clockTime');
  const clockDate = document.getElementById('clockDate');
  if (clockTime) {
    const tick = () => {
      const d = new Date();
      clockTime.textContent = d.toLocaleTimeString([], { hour12: false });
      clockDate.textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- server status ----------
  // asks the stats api how things are going. if it doesn't answer,
  // the dot just goes red — no drama.
  const statusDot = document.getElementById('statusDot');
  if (statusDot) {
    const statusText = document.getElementById('statusText');
    const statVisits = document.getElementById('statVisits');
    const statOnline = document.getElementById('statOnline');
    fetch('/api/stats')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        statusDot.classList.add('up');
        statusText.textContent = 'online';
        // numbers can be null when kv quota runs dry — keep the dashes then
        if (d.visits != null) statVisits.textContent = d.visits;
        if (d.online != null) statOnline.textContent = d.online;
      })
      .catch(() => {
        statusDot.classList.add('down');
        statusText.textContent = 'offline';
      });
  }

  // ---------- vibe dispenser ----------
  const quoteBox = document.getElementById('quoteBox');
  const quoteBtn = document.getElementById('quoteBtn');
  const QUOTES = [
    'the water is digital and thats okay',
    'somewhere a wii is still humming',
    'hydrate your kernel',
    'compiling clouds... 42%',
    'bliss.jpg was real to me',
    '404: sadness not found',
    'aero never died it just went swimming',
    'the globe spins for you specifically'
  ];
  if (quoteBtn) {
    let last = -1;
    quoteBtn.addEventListener('click', () => {
      let i;
      do { i = Math.floor(Math.random() * QUOTES.length); } while (i === last);
      last = i;
      quoteBox.style.opacity = '0';
      setTimeout(() => {
        quoteBox.textContent = QUOTES[i];
        quoteBox.style.opacity = '1';
      }, 220);
    });
  }

  // ---------- bubble pop ----------
  const field = document.getElementById('popField');
  const scoreEl = document.getElementById('popScore');
  const bestEl = document.getElementById('popBest');
  const popBtn = document.getElementById('popBtn');
  if (!field) return;

  let running = false;
  let score = 0;
  let alive = 0;
  let spawner = null;
  let best = 0;
  try { best = Number(localStorage.getItem('popBest')) || 0; } catch (e) {}
  bestEl.textContent = best;

  function spawn() {
    // harder than it used to be: up to 8 on screen instead of 6, and they
    // rise quicker (see dur below) — a warmed-up player works ~2x for the score
    if (!running || document.hidden || alive >= 8) return;
    const size = 40 + Math.random() * 34;
    const bubble = document.createElement('button');
    bubble.className = 'pop-bubble';
    bubble.setAttribute('aria-label', 'bubble');
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${5 + Math.random() * 82}%`;
    const skin = document.createElement('span');
    skin.className = 'skin';
    bubble.appendChild(skin);
    field.appendChild(bubble);
    alive++;

    // float up on a css transition; the double raf makes sure the
    // browser paints the start position first
    const rise = field.clientHeight + 160;
    const dur = 2600 + Math.random() * 1600;   // was 4500–7000ms; ~40% of the old dwell
    bubble.style.transition = `transform ${dur}ms linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bubble.style.transform = `translateY(-${rise}px)`;
    }));

    const escape = setTimeout(gone, dur + 100);
    let popped = false;

    function gone() {
      if (!bubble.isConnected) return;
      bubble.remove();
      alive--;
    }

    // pointerdown for speed, click for keyboards (they're real <button>s —
    // enter/space fires click, never pointerdown). `popped` eats the dupe
    // when a pointer tap produces both.
    function popIt(e) {
      e.preventDefault();
      if (popped) return;
      popped = true;
      clearTimeout(escape);
      score++;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        try { localStorage.setItem('popBest', String(best)); } catch (err) {}
      }
      skin.classList.add('pop');
      setTimeout(gone, 180);
    }
    bubble.addEventListener('pointerdown', popIt, { passive: false });
    bubble.addEventListener('click', popIt);
  }

  popBtn.addEventListener('click', () => {
    running = !running;
    if (running) {
      score = 0;
      scoreEl.textContent = '0';
      popBtn.textContent = 'stop';
      spawner = setInterval(spawn, 450);   // was 850ms — bubbles arrive twice as fast
      spawn();
    } else {
      popBtn.textContent = 'start';
      clearInterval(spawner);
      field.querySelectorAll('.pop-bubble').forEach(b => b.remove());
      alive = 0;
    }
  });

  // ---------- leaderboard ----------
  // your name is kept in localStorage so you don't retype it; the server dedupes
  // by a hash of your ip, so resubmitting just updates your row.
  const lbList = document.getElementById('lbList');
  const lbForm = document.getElementById('lbForm');
  const lbName = document.getElementById('lbName');
  const lbSubmit = document.getElementById('lbSubmit');
  if (!lbForm) return;

  try { lbName.value = localStorage.getItem('popName') || ''; } catch (e) {}

  function drawBoard(top) {
    if (!top || !top.length) { lbList.innerHTML = '<li class="lb-empty">no scores yet — be the first</li>'; return; }
    lbList.innerHTML = top.map(r =>
      '<li><span class="lb-name">' + String(r.name).replace(/[<>&]/g, '') + '</span>' +
      '<span class="lb-score">' + (Number(r.score) || 0) + '</span></li>'
    ).join('');
  }

  fetch('/api/scores').then(r => r.json()).then(d => drawBoard(d.top)).catch(() => {
    lbList.innerHTML = '<li class="lb-empty">leaderboard offline</li>';
  });

  lbForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = lbName.value.trim();
    if (!name) { lbName.focus(); return; }
    try { localStorage.setItem('popName', name); } catch (err) {}
    lbSubmit.disabled = true;
    lbSubmit.textContent = 'saving…';
    fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, score: best })
    })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { drawBoard(d.top); lbSubmit.textContent = 'saved ✓'; })
      .catch(() => { lbSubmit.textContent = 'failed, retry'; })
      .finally(() => { setTimeout(() => { lbSubmit.disabled = false; lbSubmit.textContent = 'submit best'; }, 1400); });
  });
})();

/* ---------- days since last reboot ----------
   not live telemetry, just counting from the date i actually rebooted.
   update REBOOT_AT by hand whenever that happens (rarely, obviously) */
(() => {
  const uptimeNum = document.getElementById('uptimeNum');
  if (!uptimeNum) return;
  const REBOOT_AT = new Date('2026-07-18T12:35:20');
  const tick = () => {
    const days = Math.floor((Date.now() - REBOOT_AT) / 86400000);
    uptimeNum.textContent = days;
    const since = document.getElementById('uptimeSince');
    if (since) since.textContent = 'since ' + REBOOT_AT.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };
  tick();
  setInterval(tick, 60000);
})();
