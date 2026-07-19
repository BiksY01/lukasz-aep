// minecraft server status widget — polls /api/mc/status (same-origin pages
// function), draws the ram history graph, lists who's on and their country.
// no ips anywhere in this data, the pusher strips them before they leave home.
//
// the numbers arrive every couple seconds but a rAF loop eases the ram figure
// and the graph's leading edge between samples, so it glides instead of
// snapping — the server feels alive even though we're barely polling it.
(function () {
  const orb = document.getElementById('mcOrb');
  const state = document.getElementById('mcState');
  const count = document.getElementById('mcCount');
  const ramNow = document.getElementById('mcRamNow');
  const tpsEl = document.getElementById('mcTps');
  const msptEl = document.getElementById('mcMspt');
  const uptimeEl = document.getElementById('mcUptime');
  const playersEl = document.getElementById('mcPlayers');
  const canvas = document.getElementById('mcGraph');
  if (!canvas) return;

  const STALE_MS = 90 * 1000;
  const POLL_MS = 2000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let history = [];        // [{t, ram}] straight from the durable object
  let maxMb = 12288;
  let targetRam = null;    // newest heap reading
  let shownRam = null;     // the eased value the graph tip + number actually show
  let online = false;
  let needsDraw = false;   // repaint only while easing or on new data, not every idle frame

  function flagEmoji(cc) {
    if (!cc || cc.length !== 2) return '';
    return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  function fmtUptime(s) {
    if (s == null) return '–';
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function drawGraph() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pts = history.filter(p => p.ram != null);
    if (pts.length < 2) return;

    const pad = 8;
    const top = maxMb * 1.05;
    const x = i => pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = v => h - pad - (v / top) * (h - pad * 2);
    // the last point rides the eased value so the tip glides toward each sample
    const ram = i => (i === pts.length - 1 && shownRam != null ? shownRam : pts[i].ram);

    const blue = getComputedStyle(document.documentElement).getPropertyValue('--aero-blue').trim() || '#2ba8e0';

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(x(i), y(ram(i))) : ctx.lineTo(x(i), y(ram(i)))));
    const fill = ctx.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, 'rgba(43, 168, 224, 0.35)');
    fill.addColorStop(1, 'rgba(43, 168, 224, 0.02)');
    ctx.lineTo(x(pts.length - 1), h - pad);
    ctx.lineTo(x(0), h - pad);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(x(i), y(ram(i))) : ctx.lineTo(x(i), y(ram(i)))));
    ctx.strokeStyle = blue;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // ease shownRam toward the latest sample + repaint; runs only while the
  // panel's on screen (started/stopped alongside polling)
  let animId = null;
  function animate() {
    if (targetRam != null) {
      if (shownRam == null || reducedMotion) shownRam = targetRam;
      else if (Math.abs(targetRam - shownRam) >= 1) { shownRam += (targetRam - shownRam) * 0.12; needsDraw = true; }
      else shownRam = targetRam;
      if (online) ramNow.textContent = (shownRam / 1024).toFixed(1) + ' / ' + (maxMb / 1024) + ' gb';
    }
    if (needsDraw) { drawGraph(); needsDraw = false; }   // idle frames cost nothing
    animId = requestAnimationFrame(animate);
  }

  // player chips get added/removed with a little pop instead of the whole row
  // being rebuilt every poll (which also killed the flag glyphs mid-render)
  const chips = new Map();
  function syncPlayers(players) {
    const incoming = new Map((players || []).map(p => [String(p.name || '?'), p]));

    for (const [name, el] of chips) {
      if (!incoming.has(name)) {
        el.classList.add('leave');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        chips.delete(name);
      }
    }
    for (const [name, p] of incoming) {
      if (chips.has(name)) continue;
      const chip = document.createElement('span');
      chip.className = 'mc-player enter';
      const flag = flagEmoji(p.country_code);
      const safe = s => String(s || '').replace(/[<>&]/g, '');
      chip.innerHTML =
        (flag ? '<span class="mc-flag">' + flag + '</span>' : '') +
        '<span>' + safe(name) + '</span>' +
        (p.country ? '<span class="mc-country">' + safe(p.country) + '</span>' : '');
      playersEl.appendChild(chip);
      chips.set(name, chip);
    }

    const empty = playersEl.querySelector('.mc-empty');
    if (online && chips.size === 0 && !empty) {
      playersEl.insertAdjacentHTML('beforeend', '<span class="mc-empty">nobody on right now</span>');
    } else if ((!online || chips.size) && empty) {
      empty.remove();
    }
  }

  function render(data) {
    const cur = data.current;
    const fresh = cur && Date.now() - cur.received_at < STALE_MS;

    if (!cur || !fresh) {
      orb.className = 'mc-orb';
      state.textContent = "can't reach it right now";
      count.textContent = '';
      ramNow.textContent = '–';
      tpsEl.textContent = msptEl.textContent = uptimeEl.textContent = '–';
      tpsEl.className = 'mc-stat-val';
      online = false;
      targetRam = null;
      syncPlayers([]);
      return;
    }

    online = cur.online;
    maxMb = cur.ram_max_mb || 12288;
    history = data.history || [];
    targetRam = cur.online ? cur.ram_used_mb : null;
    needsDraw = true;   // fresh history -> repaint the curve

    if (cur.online) {
      orb.className = 'mc-orb on';
      state.textContent = 'online';
      count.textContent = cur.player_count + ' / ' + cur.max_players + ' on right now';
      // these three only show once the pusher is sending them; '–' until then
      tpsEl.textContent = cur.tps != null ? cur.tps.toFixed(1) : '–';
      tpsEl.className = 'mc-stat-val' + (cur.tps == null ? '' : cur.tps >= 19 ? ' good' : cur.tps >= 15 ? ' ok' : ' bad');
      msptEl.textContent = cur.mspt != null ? cur.mspt.toFixed(1) + ' ms' : '–';
      uptimeEl.textContent = fmtUptime(cur.uptime_s);
    } else {
      orb.className = 'mc-orb off';
      state.textContent = 'offline';
      count.textContent = '';
      ramNow.textContent = '–';
      tpsEl.textContent = msptEl.textContent = uptimeEl.textContent = '–';
      tpsEl.className = 'mc-stat-val';
    }

    syncPlayers(cur.online ? cur.players : []);
  }

  async function poll() {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/mc/status');
      if (!res.ok) throw new Error(res.status);
      render(await res.json());
    } catch (e) {
      orb.className = 'mc-orb';
      state.textContent = "can't reach it right now";
      count.textContent = '';
      ramNow.textContent = '–';
      tpsEl.textContent = msptEl.textContent = uptimeEl.textContent = '–';
      tpsEl.className = 'mc-stat-val';
      online = false;
      targetRam = null;
    }
  }

  // only run while the section is on (or near) screen and the tab's focused —
  // no point polling or animating ram nobody's looking at
  let timer = null;
  let sectionVisible = false;
  const section = document.getElementById('server') || canvas.closest('.channel');

  function start() {
    if (!timer) { poll(); timer = setInterval(poll, POLL_MS); }
    if (!animId) animId = requestAnimationFrame(animate);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    cancelAnimationFrame(animId);
    animId = null;
  }

  // live window-drag: the canvas box changes size, so flag a repaint through
  // the same rAF loop — never redraw synchronously inside the resize event
  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (!resizeQueued) {
      resizeQueued = true;
      requestAnimationFrame(() => { resizeQueued = false; needsDraw = true; });
    }
  }, { passive: true });

  if ('IntersectionObserver' in window && section) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        sectionVisible = e.isIntersecting;
        if (sectionVisible && !document.hidden) start(); else stop();
      });
    }, { rootMargin: '250px 0px' }).observe(section);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (sectionVisible) start();
  });
})();
