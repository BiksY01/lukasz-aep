/* lukasz.aep — page behaviour.
   the globe spin lives in css now (compositor thread = no jank),
   so this file only handles: lite mode for weak devices, the wii
   pointer + panel tilt on desktops, scroll reveals, the nav
   highlighter, and the visitor beacon. */

const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- lite mode ----------
   weak devices get the same look minus the expensive parts.
   obvious signals apply right away; a one-time fps probe after
   load catches the rest, and the verdict is cached for repeat
   visits so it applies from the first frame. */
const conn = navigator.connection || {};
const weakSignals =
  reducedMotion ||
  conn.saveData === true ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

let stored = null;
try { stored = localStorage.getItem('aeroLite'); } catch (e) {}

let lite = weakSignals || stored === '1';
if (lite) document.body.classList.add('lite');

if (!lite && stored === null) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const dts = [];
      let prev = performance.now();
      function probe(now) {
        dts.push(now - prev);
        prev = now;
        if (dts.length < 50) { requestAnimationFrame(probe); return; }
        dts.sort((a, b) => a - b);
        const verdict = dts[25] > 22 ? '1' : '0'; // under ~45fps -> lite
        if (verdict === '1') {
          lite = true;
          document.body.classList.add('lite');
        }
        try { localStorage.setItem('aeroLite', verdict); } catch (e) {}
      }
      requestAnimationFrame(probe);
    }, 1500);
  });
}

/* ---------- wii pointer + panel tilt (desktops only) ----------
   one shared raf loop that goes back to sleep when the mouse
   rests, so a still page costs nothing. phones never run this. */
if (isFinePointer) {
  const cursor = document.getElementById('wiiCursor');
  let mouseX = -100, mouseY = -100, lastMove = 0;
  let tiltEl = null, tiltRect = null;
  let rafId = null;

  function frame(now) {
    if (cursor) cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    if (tiltEl && tiltRect) {
      const px = (mouseX - tiltRect.left) / tiltRect.width;
      const py = (mouseY - tiltRect.top) / tiltRect.height;
      // 8deg + a whisper of scale: enough depth to feel held, not seasick
      tiltEl.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 8}deg) rotateY(${(px - 0.5) * 8}deg) translateY(-2px) scale(1.012)`;
      tiltEl.style.setProperty('--mx', `${px * 100}%`);
      tiltEl.style.setProperty('--my', `${py * 100}%`);
    }
    if (now - lastMove > 200) { rafId = null; return; }
    rafId = requestAnimationFrame(frame);
  }

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMove = performance.now();
    if (cursor) cursor.classList.add('active');
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }, { passive: true });
  if (cursor) {
    window.addEventListener('mousedown', () => cursor.classList.add('pressed'));
    window.addEventListener('mouseup', () => cursor.classList.remove('pressed'));
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('active'));
  }

  // glass panels lean toward the pointer. the rect is cached on
  // enter so mousemove never forces layout — but it's viewport-relative,
  // so wheel-scrolling or resizing mid-hover moves the real box out from
  // under it. refresh through one rAF gate, one layout read per frame max.
  let rectFix = null;
  function queueRectFix() {
    if (tiltEl && rectFix === null) {
      rectFix = requestAnimationFrame(() => {
        rectFix = null;
        if (tiltEl) tiltRect = tiltEl.getBoundingClientRect();
      });
    }
  }
  window.addEventListener('resize', queueRectFix, { passive: true });
  window.addEventListener('scroll', queueRectFix, { passive: true });

  document.querySelectorAll('.glass-panel').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (lite) return;
      tiltRect = el.getBoundingClientRect();
      tiltEl = el;
      el.style.willChange = 'transform';
    });
    el.addEventListener('mouseleave', () => {
      el.style.willChange = 'auto';
      el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '15%');
      if (tiltEl === el) { tiltEl = null; tiltRect = null; }
    });
  });
}

/* ---------- globe scroll fallback ----------
   chromium drives the globe's scroll rotation on the compositor via
   animation-timeline (see the @supports block in css). safari and the
   rest don't have that, so those visitors only ever saw the slow idle
   spin and never the scroll reaction. here we detect the gap and feed
   rotation in through --globe-rotate ourselves — cached scrollY, one
   rAF, no per-tick layout reads. reduced-motion and lite skip it, same
   as the css path never runs the scroll animation for them. */
if (!reducedMotion && !lite && !CSS.supports('animation-timeline: scroll()')) {
  document.body.classList.add('globe-js');
  const docEl = document.documentElement;
  let scrollY = window.scrollY;
  let queued = false;

  function paint() {
    queued = false;
    // the fps probe can flip the page to lite well after load — from then
    // on this whole path goes dormant (lite is the shared flag above)
    if (lite) return;
    // 0..1 over the first ~two screens, then rotation caps out — matches
    // the css keyframe's 0..160deg feel without running forever. --para is
    // the same progress, reused by the css depth layers (monitor/glow).
    const reach = window.innerHeight * 2;
    const p = Math.min(scrollY / reach, 1);
    docEl.style.setProperty('--globe-rotate', (p * 160).toFixed(2) + 'deg');
    docEl.style.setProperty('--hero-shift', (p * -46).toFixed(1) + 'px');
    docEl.style.setProperty('--para', p.toFixed(3));
  }

  window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
  // window height changes the scroll math, so repaint on resize too —
  // through the same single-rAF gate, never directly in the event
  window.addEventListener('resize', () => {
    scrollY = window.scrollY;
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
  paint();
}

/* ---------- nav highlighter ---------- */
const sections = document.querySelectorAll('.channel[id]');
const tabs = document.querySelectorAll('.tab[data-tab]');
if (tabs.length) {
  // the glider pill slides under whichever tab is active — offsetLeft reads
  // only fire on section changes / resize, never per frame
  const glider = document.querySelector('.tab-glider');
  const moveGlider = () => {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab || !glider) return;
    glider.style.transform = `translate(${activeTab.offsetLeft}px, ${activeTab.offsetTop}px)`;
    glider.style.width = `${activeTab.offsetWidth}px`;
    glider.style.height = `${activeTab.offsetHeight}px`;
    glider.classList.add('ready');
  };
  const spy = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === id));
        moveGlider();
      }
    });
  }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
  sections.forEach(s => spy.observe(s));
  moveGlider();
  window.addEventListener('resize', moveGlider, { passive: true });
}

/* ---------- scroll reveals ----------
   the .reveal class is added here, not in the html, so browsers
   without js simply show everything. */
if (!reducedMotion && 'IntersectionObserver' in window) {
  const els = document.querySelectorAll(
    '.channel:not(.hero) .glass-panel, .channel .section-title, .channel .section-sub, .channel .monitor, .channel .player-wrap'
  );
  const counts = new Map();
  els.forEach(el => {
    el.classList.add('reveal');
    const sec = el.closest('.channel') || document.body;
    const i = counts.get(sec) || 0;
    counts.set(sec, i + 1);
    el.style.transitionDelay = `${Math.min(i * 110, 440)}ms`;
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  els.forEach(el => io.observe(el));
}

/* ---------- footer year ---------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- visitor beacon ----------
   counts one visit per session, then quietly pings so the bonus
   page can show how many people are around right now. fails
   silently when the api isn't there (local preview). */
(() => {
  let sid;
  try {
    sid = sessionStorage.getItem('aeroSid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem('aeroSid', sid);
    }
  } catch (e) { return; }
  const firstTime = !sessionStorage.getItem('aeroSeen');
  try { sessionStorage.setItem('aeroSeen', '1'); } catch (e) {}
  const ping = (visit) =>
    fetch(`/api/stats?id=${sid}${visit ? '&visit=1' : ''}`).catch(() => {});
  ping(firstTime);
  // presence ttl is 10 min server-side; pinging every 4 keeps it alive
  // while writing to kv less than half as often (free tier arithmetic)
  setInterval(() => { if (!document.hidden) ping(false); }, 240000);
})();
