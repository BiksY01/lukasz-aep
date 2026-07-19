/* ============================================================
   Frutiger Aero FM — the site radio.
   Three real aero tracks stream from assets/audio/, and the
   last station is a bonus tune synthesized live with the
   Web Audio API. The EQ bars run off a real analyser node.
   ============================================================ */
(() => {
  const playBtn = document.getElementById('playBtn');
  if (!playBtn) return;

  const stationsBox = document.getElementById('stations');
  const trackName = document.getElementById('trackName');
  const stationName = document.getElementById('stationName');
  const playTime = document.getElementById('playTime');
  const eqBars = document.getElementById('eqBars');
  const eqSpans = eqBars ? Array.from(eqBars.children) : [];
  const volSlider = document.getElementById('vol');
  const playerWrap = document.querySelector('.player-wrap');

  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

  const STATIONS = [
    {
      name: 'NATURE FM 100.3',
      track: 'more frutiger aero (2000s nostalgia)',
      file: 'assets/audio/aero-nature.m4a'
    },
    {
      name: 'KOLEKTOR 96.2',
      track: 'frutiger aero (k_o_l_e_k_t_o_r)',
      file: 'assets/audio/aero-kolektor.m4a'
    },
    {
      name: 'WII PARTY FM',
      track: 'wii party — main menu (trilharetro)',
      file: 'assets/audio/wii-party.m4a'
    },
    {
      name: 'SYNTH FM 104.7',
      track: 'the frutiger aero song (synth mix)',
      bpm: 126,
      prog: [[57,60,64],[53,57,60],[60,64,67],[55,59,62]],           // Am F C G
      pad: { type: 'sawtooth', vol: 0.05, cut: 1300 },
      bass: { steps: [0,2,4,6,8,10,12,14], vol: 0.11, type: 'triangle' },
      arp: {
        type: 'square', vol: 0.13, sus: 0.14, send: 0.6, oct: 12,
        pattern: [0,1,2,3,2,1,0,1,2,3,2,1,0,2,1,3]
      },
      drums: {
        kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
        hat:  [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,1]
      },
      blipEvery: 4
    }
  ];

  let ctx = null, master = null, analyser = null, delayBus = null, noiseBuf = null;
  let audioEl = null;
  let playing = false;
  let station = 0;
  let barCount = 0;
  let nextBar = 0;
  let schedTimer = null;
  let clockTimer = null;
  let startStamp = 0;
  let vizId = null;
  let vizSkip = 0;
  let freqData = null;

  function ensureCtx(){
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = targetVol();
    const comp = ctx.createDynamicsCompressor();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);

    // sparkle delay bus for the synth station
    delayBus = ctx.createDelay(1);
    delayBus.delayTime.value = 0.29;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    delayBus.connect(damp); damp.connect(fb); fb.connect(delayBus);
    delayBus.connect(wet); wet.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function ensureAudioEl(){
    if (audioEl) return;
    audioEl = new Audio();
    audioEl.loop = true;
    audioEl.preload = 'none';
    const src = ctx.createMediaElementSource(audioEl);
    src.connect(master);
    audioEl.addEventListener('error', () => {
      trackName.textContent = 'track failed to load · track failed to load · ';
    });
  }

  function targetVol(){
    return volSlider ? (volSlider.value / 100) * 0.9 : 0.6;
  }

  // ---------- synth voices ----------
  function tone({ f, type, t, dur, vol, att = 0.01, rel = 0.08, cut = 0, send = 0, detune = 0 }){
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, Math.max(t + att, t + dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let head = osc;
    if (cut){
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = cut; flt.Q.value = 0.6;
      osc.connect(flt); head = flt;
    }
    head.connect(g);
    g.connect(master);
    if (send){
      const sg = ctx.createGain(); sg.gain.value = send;
      g.connect(sg); sg.connect(delayBus);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function kick(t){
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.3);
  }

  function hat(t, vol){
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.08);
  }

  function blip(t){
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500 + Math.random() * 300, t);
    osc.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 600, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.03);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g); g.connect(master);
    const sg = ctx.createGain(); sg.gain.value = 0.9;
    g.connect(sg); sg.connect(delayBus);
    osc.start(t); osc.stop(t + 0.33);
  }

  function scheduleBar(t){
    const S = STATIONS[station];
    const spb = 60 / S.bpm;
    const bar = spb * 4;
    const step = bar / 16;
    const chord = S.prog[barCount % S.prog.length];

    chord.forEach((n, i) => tone({
      f: NOTE(n), type: S.pad.type, t, dur: bar * 0.98, vol: S.pad.vol,
      att: bar * 0.22, rel: bar * 0.35, cut: S.pad.cut, detune: i % 2 ? 5 : -5
    }));

    const root = chord[0] - 12;
    S.bass.steps.forEach(i => tone({
      f: NOTE(root), type: S.bass.type, t: t + i * step,
      dur: step * (S.bass.steps.length > 2 ? 1.6 : 14), vol: S.bass.vol, rel: 0.1
    }));

    if (S.arp){
      S.arp.pattern.forEach((ci, i) => {
        if (ci === null) return;
        const n = ci < chord.length ? chord[ci] : chord[0] + 12;
        tone({
          f: NOTE(n + S.arp.oct), type: S.arp.type, t: t + i * step,
          dur: S.arp.sus, vol: S.arp.vol, cut: 3400, send: S.arp.send
        });
      });
    }

    if (S.drums){
      S.drums.kick.forEach((v, i) => { if (v) kick(t + i * step); });
      S.drums.hat.forEach((v, i) => { if (v) hat(t + i * step, i % 4 === 3 ? 0.09 : 0.06); });
    }

    if (S.blipEvery && barCount % S.blipEvery === S.blipEvery - 1){
      blip(t + bar * (0.25 + Math.random() * 0.5));
    }

    barCount++;
  }

  function tick(){
    while (nextBar < ctx.currentTime + 0.35){
      scheduleBar(nextBar);
      nextBar += 4 * (60 / STATIONS[station].bpm);
    }
    schedTimer = setTimeout(tick, 110);
  }

  // ---------- transport / UI ----------
  function marquee(S){
    const part = `${S.track} · ${S.name} · `;
    trackName.textContent = part + part;
  }

  function startClock(){
    startStamp = Date.now();
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const s = Math.floor((Date.now() - startStamp) / 1000);
      const m = String(Math.floor(s / 60)).padStart(2, '0');
      playTime.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
  }

  function viz(){
    const lite = document.body.classList.contains('lite');
    vizSkip = (vizSkip + 1) % (lite ? 3 : 1);
    if (vizSkip === 0 && analyser){
      analyser.getByteFrequencyData(freqData);
      const bins = [1, 2, 3, 5, 7, 10, 14, 20];
      for (let i = 0; i < eqSpans.length; i++){
        const v = freqData[bins[i]] / 255;
        eqSpans[i].style.transform = `scaleY(${(0.2 + v * 1.1).toFixed(2)})`;
      }
    }
    vizId = requestAnimationFrame(viz);
  }

  function updateMediaSession(S){
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: S.track,
        artist: S.name,
        album: 'Lukasz.aep — Frutiger Aero FM',
        artwork: [{ src: 'assets/img/mp3-player.webp', sizes: '1200x900', type: 'image/webp' }]
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch (e) {}
  }

  function setUI(on){
    playBtn.textContent = on ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', on ? 'pause' : 'play');
    playBtn.setAttribute('aria-pressed', String(on));
    playerWrap.classList.toggle('playing', on);
    eqBars.classList.toggle('live', on);
    if (!on){
      cancelAnimationFrame(vizId); vizId = null;
      clearInterval(clockTimer);
      eqSpans.forEach(s => { s.style.transform = ''; });
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  }

  function play(){
    ensureCtx();
    ctx.resume();
    master.gain.setTargetAtTime(targetVol(), ctx.currentTime, 0.05);
    const S = STATIONS[station];
    if (S.file){
      ensureAudioEl();
      const abs = new URL(S.file, location.href).href;
      if (audioEl.src !== abs){
        audioEl.src = S.file;
        audioEl.load();
      }
      audioEl.play().catch(() => {});
    } else {
      barCount = 0;
      nextBar = ctx.currentTime + 0.08;
      tick();
    }
    playing = true;
    marquee(S);
    stationName.textContent = S.name;
    startClock();
    setUI(true);
    updateMediaSession(S);
    if (!vizId) vizId = requestAnimationFrame(viz);
  }

  function stop(){
    if (ctx) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    clearTimeout(schedTimer);
    if (audioEl) audioEl.pause();
    playing = false;
    setUI(false);
  }

  playBtn.addEventListener('click', () => (playing ? stop() : play()));

  function setStation(next){
    if (next === station) return;
    stationsBox.querySelectorAll('.station-pill').forEach(p => {
      const on = Number(p.dataset.station) === next;
      p.classList.toggle('active', on);
      p.setAttribute('aria-pressed', String(on));
    });
    const wasPlaying = playing;
    station = next;
    const S = STATIONS[station];
    stationName.textContent = S.name;
    if (wasPlaying){
      clearTimeout(schedTimer);
      if (audioEl) audioEl.pause();
      play();
    } else {
      marquee(S);
    }
  }

  stationsBox.addEventListener('click', (e) => {
    const pill = e.target.closest('.station-pill');
    if (pill) setStation(Number(pill.dataset.station));
  });

  if (volSlider){
    volSlider.addEventListener('input', () => {
      if (ctx && playing) master.gain.setTargetAtTime(targetVol(), ctx.currentTime, 0.05);
    });
  }

  // phone lock-screen / headset controls — prev/next surf the stations
  if ('mediaSession' in navigator){
    try {
      navigator.mediaSession.setActionHandler('play', () => { if (!playing) play(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (playing) stop(); });
      navigator.mediaSession.setActionHandler('previoustrack', () => setStation((station + STATIONS.length - 1) % STATIONS.length));
      navigator.mediaSession.setActionHandler('nexttrack', () => setStation((station + 1) % STATIONS.length));
    } catch (e) {}
  }

  // the synth can't run in a hidden tab (timers throttle), so pause it;
  // real tracks keep playing in the background like proper music
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing && !STATIONS[station].file) stop();
  });

  window.aeroRadio = {
    get playing(){ return playing; },
    get station(){ return STATIONS[station].name; },
    ctxState: () => (ctx ? ctx.state : 'none'),
    audioState: () => (audioEl ? {
      paused: audioEl.paused,
      time: audioEl.currentTime,
      readyState: audioEl.readyState,
      error: audioEl.error ? audioEl.error.code : null
    } : null)
  };
})();
