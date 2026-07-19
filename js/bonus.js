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
    const statToday = document.getElementById('statToday');
    const statOnline = document.getElementById('statOnline');
    fetch('/api/stats')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        statusDot.classList.add('up');
        statusText.textContent = 'online';
        // numbers can be null when kv quota runs dry — keep the dashes then
        if (d.visits != null) statVisits.textContent = d.visits;
        if (d.today != null && statToday) statToday.textContent = d.today;
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

  let lbToken = null;  // signed token from the server; required to submit a score

  function drawBoard(top) {
    lbList.textContent = '';
    if (!top || !top.length) {
      const li = document.createElement('li');
      li.className = 'lb-empty';
      li.textContent = 'no scores yet — be the first';
      lbList.appendChild(li);
      return;
    }
    for (const r of top) {
      const li = document.createElement('li');
      const n = document.createElement('span');
      n.className = 'lb-name';
      n.textContent = String(r.name);          // textContent, so a name can never be html
      const s = document.createElement('span');
      s.className = 'lb-score';
      s.textContent = Number(r.score) || 0;
      li.append(n, s);
      lbList.appendChild(li);
    }
  }

  fetch('/api/scores').then(r => r.json()).then(d => { lbToken = d.token; drawBoard(d.top); }).catch(() => {
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
      body: JSON.stringify({ name, score: best, token: lbToken })
    })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { drawBoard(d.top); lbSubmit.textContent = 'saved ✓'; })
      .catch(() => { lbSubmit.textContent = 'failed, retry'; })
      .finally(() => { setTimeout(() => { lbSubmit.disabled = false; lbSubmit.textContent = 'submit best'; }, 1400); });
  });
})();

/* ---------- bubble bay weather ----------
   used to be a made-up 21°C forever. now it's the real ljubljana numbers
   off open-meteo (no key needed). if the api is shy the static copy stays
   and nobody notices — the forecast part was never real anyway. */
(() => {
  const line = document.getElementById('wxLine');
  if (!line) return;
  const WMO = {
    0: 'clear skies', 1: 'mostly clear', 2: 'a few clouds', 3: 'cloudy',
    45: 'foggy', 48: 'foggy', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
    61: 'light rain', 63: 'rain', 65: 'proper rain', 71: 'snow', 73: 'snow',
    75: 'lots of snow', 80: 'showers', 81: 'showers', 82: 'showers',
    95: 'a thunderstorm', 96: 'a thunderstorm', 99: 'a thunderstorm'
  };
  fetch('https://api.open-meteo.com/v1/forecast?latitude=46.05&longitude=14.51&current=temperature_2m,weather_code,wind_speed_10m')
    .then((r) => r.json())
    .then((d) => {
      const c = d && d.current;
      if (!c || typeof c.temperature_2m !== 'number') return;
      const wind = c.wind_speed_10m > 20 ? 'actually windy' : c.wind_speed_10m > 8 ? 'light breeze' : 'barely a breeze';
      line.textContent = `${Math.round(c.temperature_2m)}°C in ljubljana, ${WMO[c.weather_code] || 'weather happening'}, ${wind}`;
    })
    .catch(() => {});
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

/* ---------- github card ----------
   live numbers straight off the public github api (no key, it's all public).
   one repos?per_page=100 call buys everything: total stars, what languages i
   actually write, and the 4 most recently pushed repos with real metadata.
   only fires once the card scrolls into view so we're not poking the api on
   every single page load. everything lands via textContent = no injection. */
(() => {
  const card = document.getElementById('ghCard');
  if (!card) return;
  const USER = 'BiksY01';
  let done = false;

  // github's own language colors, just the ones likely to show up
  const LANG_DOT = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5',
    Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', C: '#555555',
    'C++': '#f34b7d', Rust: '#dea584', Go: '#00add8', Lua: '#000080', Java: '#b07219'
  };

  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'min ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return Math.floor(s / 2592000) + 'mo ago';
  };

  const load = async () => {
    if (done) return; done = true;
    const list = document.getElementById('ghList');
    try {
      const [u, repos] = await Promise.all([
        fetch(`https://api.github.com/users/${USER}`).then((r) => r.json()),
        fetch(`https://api.github.com/users/${USER}/repos?per_page=100`).then((r) => r.json()),
      ]);

      if (u && typeof u.public_repos === 'number') {
        document.getElementById('ghRepos').textContent = u.public_repos;
        document.getElementById('ghFollowers').textContent = u.followers;
        const since = document.getElementById('ghSince');
        if (since && u.created_at) since.textContent = 'since ' + new Date(u.created_at).getFullYear();
        const av = document.getElementById('ghAvatar');
        if (av && u.avatar_url) av.src = u.avatar_url;
      }

      if (Array.isArray(repos) && repos.length) {
        const starsEl = document.getElementById('ghStars');
        if (starsEl) starsEl.textContent = repos.reduce((n, r) => n + (r.stargazers_count || 0), 0);

        const langCount = {};
        for (const r of repos) if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
        const top = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const langEl = document.getElementById('ghLangs');
        if (langEl && top.length) langEl.textContent = 'mostly ' + top.map(([l]) => l.toLowerCase()).join(' + ');

        // own repos first, freshest push wins; forks only if there's nothing else
        let recent = repos.filter((r) => !r.fork);
        if (!recent.length) recent = repos;
        recent = recent.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 4);

        list.textContent = '';
        for (const r of recent) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = r.html_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = r.name;                 // textContent = no injection
          li.appendChild(a);
          const meta = document.createElement('span');
          meta.className = 'gh-meta';
          if (r.language) {
            const dot = document.createElement('span');
            dot.className = 'gh-dot';
            dot.style.backgroundColor = LANG_DOT[r.language] || '#9aa7c7';
            meta.appendChild(dot);
            meta.appendChild(document.createTextNode(r.language.toLowerCase() + ' · '));
          }
          if (r.stargazers_count) meta.appendChild(document.createTextNode(r.stargazers_count + ' stars · '));
          meta.appendChild(document.createTextNode('pushed ' + ago(r.pushed_at)));
          li.appendChild(meta);
          if (r.description) {
            const d = document.createElement('span');
            d.className = 'gh-desc';
            d.textContent = r.description;
            li.appendChild(d);
          }
          list.appendChild(li);
        }
      } else {
        list.innerHTML = '<li class="muted">repos live over on github →</li>';
      }
    } catch (e) {
      if (list) list.innerHTML = '<li class="muted">github’s being shy, hit “see all”.</li>';
    }
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { load(); io.disconnect(); } });
    }, { rootMargin: '0px 0px 120px 0px' });
    io.observe(card);
  } else {
    load();
  }
})();
