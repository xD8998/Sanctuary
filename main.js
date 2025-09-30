// canvases
const bg = document.getElementById('bg');
const viz = document.getElementById('viz');
const dpr = Math.min(window.devicePixelRatio || 1, 2);

// pixelated moving background: low-res plasma scaled up
const low = document.createElement('canvas');
const lowCtx = low.getContext('2d', { alpha: false });
const bgCtx = bg.getContext('2d', { alpha: false });

const hwThreads = navigator.hardwareConcurrency || 2;
const devMem = navigator.deviceMemory || 2;
let quality = {
  scale: (hwThreads <= 4 || devMem <= 4) ? 0.55 : 1.0,
  vizFPS: 30
};

const tipEl = document.getElementById('protip');
const tips = [
  'PRO TIP: Game I made for English class.',
  'CREDITS: Made by the developer. Thanks for playing!',
  'Listen to the main menu music — it\'s good, I promise.',
  'Press Play when you\'re ready.'
];
let tipI = 0; if (tipEl) { tipEl.textContent = tips[0]; setInterval(()=>{ tipEl.classList.add('hide'); setTimeout(()=>{ tipI=(tipI+1)%tips.length; tipEl.textContent=tips[tipI]; tipEl.classList.remove('hide'); }, 320); }, 16000); }

// crossfade snapshot for less-noticeable rescale
let snap = null, snapAlpha = 0;

function resize() {
  // take snapshot before changing sizes
  if (bg.width && bg.height) { const s = document.createElement('canvas'); s.width = bg.width; s.height = bg.height; s.getContext('2d').drawImage(bg,0,0); snap = s; snapAlpha = 1; }
  bg.width = innerWidth * dpr;
  bg.height = innerHeight * dpr;
  bgCtx.imageSmoothingEnabled = false;
  // low-res canvas scales for chunky 8-bit pixels
  const base = Math.max(140, Math.floor(Math.min(innerWidth, innerHeight) / 2));
  low.width = Math.max(80, Math.floor(base * quality.scale));
  low.height = Math.max(16, Math.floor((base * (innerHeight / innerWidth)) * quality.scale));
  viz.width = innerWidth * dpr;
  viz.height = innerHeight * dpr;
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // UI scale for small windows
  const ui = Math.min(1, Math.max(0.8, Math.min(innerWidth/900, innerHeight/700)));
  document.documentElement.style.setProperty('--ui-scale', ui.toFixed(2));
  vctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);

// plasma function
function renderPlasma(t) {
  const w = low.width, h = low.height;
  const img = lowCtx.getImageData(0, 0, w, h);
  const data = img.data;
  const tt = t * 0.0008;
  const pal = [12, 36, 72, 120, 180, 220]; // limited green palette
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v =
        Math.sin(x * 0.03 + tt * 1.6) +
        Math.sin((x + y) * 0.02 - tt * 1.2) +
        Math.sin(Math.hypot(x - w * 0.5, y - h * 0.5) * 0.025 - tt * 0.9);
      const c = Math.floor((v + 3) / 6 * 255);
      const level = pal[Math.min(pal.length - 1, Math.max(0, Math.round((c / 255) * (pal.length - 1))))];
      const blueMode = document.body.classList.contains('alt-theme');
      data[i++] = Math.floor(level * (blueMode ? 0.12 : 0.18));
      data[i++] = blueMode ? Math.floor(level * 0.35) : level;
      data[i++] = blueMode ? level : Math.floor(level * 0.15);
      data[i++] = 255;
    }
  }
  lowCtx.putImageData(img, 0, 0);
  bgCtx.save();
  bgCtx.imageSmoothingEnabled = false;
  bgCtx.clearRect(0, 0, bg.width, bg.height);
  bgCtx.drawImage(low, 0, 0, bg.width, bg.height);
  bgCtx.restore();
  // crossfade old buffer over new scale
  if (snap && snapAlpha > 0) {
    bgCtx.save(); bgCtx.globalAlpha = snapAlpha; bgCtx.imageSmoothingEnabled = false;
    bgCtx.drawImage(snap, 0, 0, bg.width, bg.height);
    bgCtx.restore(); snapAlpha = Math.max(0, snapAlpha - 0.08); if (!snapAlpha) snap = null;
  }
}

// Audio + Visualizer
const audioEl = document.getElementById('track');
/* set saved volume on load */
try {
  const sv = Math.max(0, Math.min(100, Number(localStorage.getItem('menu_volume')||'100')));
  audioEl.volume = sv/100;
} catch {}

let actx, source, analyser, dataArray, started = false, gainNode, pendingLoop = false, lowpass;

const vctx = viz.getContext('2d');

function setupAudio() {
  if (started) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = actx.createAnalyser();
  analyser.fftSize = (hwThreads <= 2 || devMem <= 2) ? 128 : ((hwThreads <= 4 || devMem <= 4) ? 256 : 512);
  analyser.smoothingTimeConstant = 0.7;
  const src = actx.createMediaElementSource(audioEl);
  gainNode = actx.createGain(); gainNode.gain.value = 0.0;
  const crush = createBitcrusher(actx, { bits: 12, reduction: 3 });
  lowpass = actx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 18000;
  src.connect(crush); crush.connect(lowpass); lowpass.connect(gainNode);
  gainNode.connect(analyser); analyser.connect(actx.destination);

  audioEl.loop = false;
  audioEl.currentTime = 46;
  audioEl.addEventListener('ended', () => {
    fadeOut(1.2).then(() => {
      audioEl.currentTime = 46;
      audioEl.play().catch(()=>{});
      fadeIn(1.6);
    });
  });
  audioEl.addEventListener('timeupdate', () => {
    if (audioEl.currentTime < 45) { audioEl.currentTime = 45; return; }
    const d = audioEl.duration || 0;
    if (!pendingLoop && d && d - audioEl.currentTime < 1.9) {
      pendingLoop = true;
      fadeOut(1.2).then(() => {
        audioEl.currentTime = 46;
        audioEl.play().catch(()=>{});
        fadeIn(1.6).then(()=> pendingLoop = false);
      });
    }
  });

  dataArray = new Uint8Array(analyser.frequencyBinCount);
  started = true;
}

function fadeTo(target, dur=0.6) {
  return new Promise(res => {
    const now = actx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(target, now + Math.max(0.01, dur));
    setTimeout(res, dur * 1000);
  });
}
const fadeIn = (d)=>fadeTo(1.0,d);
const fadeOut = (d)=>fadeTo(0.0,d);

function drawViz() {
  if (!analyser) {
    vctx.clearRect(0, 0, viz.width / dpr, viz.height / dpr);
    return;
  }
  /* throttle to save CPU */
  const now = performance.now();
  if (now - lastVizTime < (1000 / quality.vizFPS)) return;
  lastVizTime = now;
  const w = viz.width / dpr, h = viz.height / dpr;
  vctx.clearRect(0, 0, w, h);
  analyser.getByteFrequencyData(dataArray);

  // pixel-block visualizer across full bottom
  const bandH = Math.floor(h * 0.26);
  const cell = Math.max(8, Math.floor(w / 120));
  const cols = Math.floor(w / cell);
  const rows = Math.max(5, Math.floor(bandH / cell));
  const step = Math.max(1, Math.floor(dataArray.length / cols));

  const muted = audioEl.muted || audioEl.volume === 0 || audioEl.paused || (gainNode && gainNode.gain.value === 0);
  const amp = muted ? 0 : (audioEl.volume * (gainNode ? gainNode.gain.value : 1));
  const blueMode = document.body.classList.contains('alt-theme');
  const outer = blueMode ? '#0e2b6b' : '#145a1c';
  const inner = blueMode ? '#7fb6ff' : '#78ff8c';

  for (let x = 0; x < cols; x++) {
    const v = (dataArray[x * step] / 255) * amp;
    const filled = Math.min(rows, Math.max(0, Math.round(Math.pow(v, 1.5) * rows)));
    for (let r = 0; r < filled; r++) {
      const yy = h - (r + 1) * cell;
      // two-tone block for 8-bit feel
      vctx.fillStyle = outer;
      vctx.fillRect(x * cell, yy, cell, cell);
      vctx.fillStyle = inner;
      vctx.fillRect(x * cell + 1, yy + 1, cell - 2, cell - 2);
    }
  }
}

// Menu actions
function onNavClick(e) {
  const btn = e.currentTarget;
  const action = btn.getAttribute('data-action');
  if (action === 'play') {
    playSfx('playClickEcho');
    startGameFlow();
  } else if (action === 'options') {
    playSfx('click');
    openSettings();
  } else if (action === 'credits') {
    playSfx('click');
    openCredits();
  }
}

function pulse(el) {
  el.style.transition = 'transform 160ms ease';
  el.style.transform = 'scale(0.98)';
  setTimeout(()=>{ el.style.transform = 'scale(1)'; }, 160);
}

document.querySelectorAll('.nav-item, .start-btn, .close-btn').forEach(el=>{
  el.addEventListener('mouseenter', ()=> playSfx('hover'), { passive: true });
});
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', onNavClick));
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  playSfx('start');
  startBtn.disabled = true; startBtn.setAttribute('aria-disabled','true'); startBtn.style.pointerEvents = 'none';
  setupAudio();
  await actx.resume?.();
  audioEl.currentTime = 46;
  audioEl.play().catch(()=>{});
  await fadeIn(1.6);
  startScreen.classList.add('hidden');
  document.querySelector('.menu').classList.add('show');
});

function startGameFlow() {
  const fadeEl = document.getElementById('fade');
  fadeEl.classList.add('show');
  fadeEl.setAttribute('aria-hidden','false');
  const doStart = async () => {
    try {
      if (started) { await fadeOut(1.0); audioEl.pause(); }
    } catch(e){}
    const mod = await import('./game.js');
    await mod.initGame({ actx, masterGain: gainNode });
    document.body.classList.add('in-game');
    document.getElementById('game-root').hidden = false;
    requestAnimationFrame(() => {
      fadeEl.classList.remove('show');
      const onT = () => { fadeEl.removeEventListener('transitionend', onT); fadeEl.setAttribute('aria-hidden','true'); };
      fadeEl.addEventListener('transitionend', onT);
    });
  };
  const onT = () => { fadeEl.removeEventListener('transitionend', onT); doStart(); };
  fadeEl.addEventListener('transitionend', onT);
}

// Main loop
let last = 0;
let emaFPS = 60, lastVizTime = 0;
let rafId = 0, running = true;
function frame(t) {
  if (!running) return;
  const dt = t - last || 16;
  const fps = 1000 / dt;
  emaFPS = emaFPS * 0.9 + fps * 0.1;
  // adjust viz FPS for low-end devices
  if (emaFPS < 35) { quality.vizFPS = 20; } else if (emaFPS > 55) { quality.vizFPS = 30; }
  // adaptive background quality
  if (emaFPS < 45 && quality.scale > 0.4) { quality.scale = Math.max(0.4, quality.scale - 0.05); resize(); }
  else if (emaFPS > 58 && quality.scale < 1.0) { quality.scale = Math.min(1.0, quality.scale + 0.05); resize(); }
  renderPlasma(t);
  drawViz();
  last = t;
  rafId = requestAnimationFrame(frame);
}

// kick things off
resize();
// ensure menu hidden until start
document.querySelector('.menu').classList.remove('show');
rafId = requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    cancelAnimationFrame(rafId);
  } else {
    running = true;
    lastVizTime = 0;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
});

const creditsEl = document.getElementById('credits');
const closeCredits = document.getElementById('close-credits');
const logo = document.querySelector('.logo');
let clickCount = 0, clickTimer;
const gpt5El = document.getElementById('gpt5');
let gpt5Clicks = 0, gpt5Cooldown = false;
if (gpt5El) {
  gpt5El.addEventListener('click', () => {
    if (gpt5Cooldown || gpt5El.classList.contains('reveal')) return;
    gpt5Cooldown = true; gpt5El.classList.remove('shake'); void gpt5El.offsetWidth; gpt5El.classList.add('shake');
    if (++gpt5Clicks >= 5) gpt5El.classList.add('reveal');
    setTimeout(()=> { gpt5Cooldown = false; gpt5El.classList.remove('shake'); }, 320);
  });
}

function openCredits() {
  document.body.classList.add('alt-theme','credits-open');
  creditsEl.hidden = false; creditsEl.setAttribute('aria-hidden','false');
  requestAnimationFrame(()=> creditsEl.classList.add('show'));
  if (started) { lowpass.frequency.setTargetAtTime(800, actx.currentTime, 0.2); fadeTo(0.5, 0.9); }
}
function closeCreditsFn() {
  document.body.classList.remove('alt-theme','credits-open');
  creditsEl.classList.remove('show');
  creditsEl.addEventListener('transitionend', function onT(e){
    if (e.propertyName !== 'opacity') return;
    creditsEl.removeEventListener('transitionend', onT);
    creditsEl.hidden = true; creditsEl.setAttribute('aria-hidden','true');
  });
  if (started) { lowpass.frequency.setTargetAtTime(18000, actx.currentTime, 0.2); fadeTo(1.0, 0.9); }
}
logo.addEventListener('click', () => {
  clickCount++; clearTimeout(clickTimer);
  if (clickCount >= 5) { clickCount = 0; openCredits(); }
  clickTimer = setTimeout(()=> clickCount = 0, 800);
});
closeCredits.addEventListener('click', () => { playSfx('back'); closeCreditsFn(); });
creditsEl.addEventListener('click', (e)=> { if (e.target === creditsEl) { playSfx('back'); closeCreditsFn(); } });
addEventListener('keydown', (e)=> { if (e.key === 'Escape' && !creditsEl.hidden) closeCreditsFn(); });

const settingsEl = document.getElementById('settings');
const closeSettings = document.getElementById('close-settings');
const volSlider = document.getElementById('vol');
const volValue = document.getElementById('vol-value');
const skipHtpCb = document.getElementById('skip-htp');
const resetBtn = document.getElementById('reset-progress');

function openSettings() {
  document.body.classList.add('settings-open');
  settingsEl.hidden = false; settingsEl.setAttribute('aria-hidden','false');
  const sv = Math.max(0, Math.min(100, Number(localStorage.getItem('menu_volume')||Math.round((audioEl.volume??1)*100))));
  volSlider.value = String(sv); volValue.textContent = sv + '%';
  skipHtpCb.checked = localStorage.getItem('runner_skip_htp') === '1';
  requestAnimationFrame(()=> settingsEl.classList.add('show'));
  if (started) { lowpass.frequency.setTargetAtTime(900, actx.currentTime, 0.2); fadeTo(0.5, 0.9); }
}
function closeSettingsFn() {
  document.body.classList.remove('settings-open');
  settingsEl.classList.remove('show');
  settingsEl.addEventListener('transitionend', function onT(e){
    if (e.propertyName !== 'opacity') return;
    settingsEl.removeEventListener('transitionend', onT);
    settingsEl.hidden = true; settingsEl.setAttribute('aria-hidden','true');
  });
  if (started) { lowpass.frequency.setTargetAtTime(18000, actx.currentTime, 0.2); fadeTo(1.0, 0.9); }
}
closeSettings.addEventListener('click', () => { playSfx('back'); closeSettingsFn(); });
settingsEl.addEventListener('click', (e)=> { if (e.target === settingsEl) { playSfx('back'); closeSettingsFn(); } });
addEventListener('keydown', (e)=> { if (e.key === 'Escape' && !settingsEl.hidden) closeSettingsFn(); });
volSlider.addEventListener('input', () => {
  const v = Math.max(0, Math.min(100, Number(volSlider.value) || 0));
  volValue.textContent = v + '%';
  audioEl.volume = v / 100;
  try { localStorage.setItem('menu_volume', String(v)); } catch {}
});
skipHtpCb.addEventListener('change', () => {
  try {
    if (skipHtpCb.checked) localStorage.setItem('runner_skip_htp','1');
    else localStorage.removeItem('runner_skip_htp');
  } catch {}
});

resetBtn.addEventListener('click', () => {
  playSfx('click');
  showResetPrompt(settingsEl.querySelector('.settings-card'), () => {
    try { localStorage.removeItem('runner_highscore'); } catch {}
    playSfx('back');
  });
});

function showResetPrompt(parentCard, onConfirm){
  const wrap = document.createElement('div');
  wrap.style.position='absolute'; wrap.style.inset='0'; wrap.style.background='rgba(0,0,0,0.72)'; wrap.style.display='grid'; wrap.style.placeItems='center';
  const box = document.createElement('div');
  box.style.background='#0b0b0b'; box.style.color='#fff'; box.style.padding='18px'; box.style.boxShadow='0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.12) inset';
  box.style.fontFamily='"Space Mono", monospace'; box.innerHTML = '<div style="margin-bottom:6px;color:#ff5a5a;font-weight:800;">WARNING THIS WILL DELETE YOUR SAVED HIGH SCORE</div><div style="margin-bottom:8px;font-weight:700;">Type RESET MY HIGH to confirm</div>';
  const input = document.createElement('input'); input.type='text'; input.placeholder='RESET MY HIGH'; input.autocomplete='off'; input.autocapitalize='off'; input.spellcheck=false;
  input.className = 'pixel-input big';
  input.onpaste = (e)=> e.preventDefault(); input.oncontextmenu = (e)=> e.preventDefault();
  const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.marginTop='10px';
  const yes = document.createElement('button'); yes.textContent='Confirm'; const no = document.createElement('button'); no.textContent='Cancel';
  yes.classList.add('pixel-btn-lg');
  [yes,no].forEach(b=>{ b.style.background='transparent'; b.style.color='#fff'; b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='8px 12px'; b.style.boxShadow='0 0 0 4px #000 inset'; b.style.fontFamily='"Space Mono", monospace'; });
  yes.onclick=()=>{ if (input.value === 'RESET MY HIGH'){ onConfirm?.(); wrap.remove(); } };
  no.onclick=()=> wrap.remove();
  box.appendChild(input); row.appendChild(yes); row.appendChild(no); box.appendChild(row); wrap.appendChild(box); parentCard.appendChild(wrap); input.focus();
}

function createBitcrusher(ctx, { bits = 12, reduction = 3 } = {}) {
  const sp = ctx.createScriptProcessor(1024, 2, 2);
  const step = Math.pow(0.5, bits - 1);
  let phL = 0, holdL = 0, phR = 0, holdR = 0;
  sp.onaudioprocess = e => {
    const il = e.inputBuffer.getChannelData(0), ir = e.inputBuffer.numberOfChannels>1?e.inputBuffer.getChannelData(1):il;
    const ol = e.outputBuffer.getChannelData(0), or = e.outputBuffer.numberOfChannels>1?e.outputBuffer.getChannelData(1):ol;
    for (let i = 0; i < il.length; i++) {
      if ((phL += 1) >= reduction) { phL = 0; holdL = Math.round(il[i] / step) * step; }
      if ((phR += 1) >= reduction) { phR = 0; holdR = Math.round(ir[i] / step) * step; }
      ol[i] = holdL; or[i] = holdR;
    }
  };
  return sp;
}

/* SFX: tiny chiptune/bleeps with optional echo */
function playSfx(type='click') {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain(); g.gain.value = 0.0;
    const now = actx.currentTime;
    let freq = 440, dur = 0.12;
    switch(type){
      case 'hover': freq = 620; dur = 0.08; break;
      case 'start': freq = 520; dur = 0.14; break;
      case 'back': freq = 200; dur = 0.10; break;
      case 'click': freq = 420; dur = 0.10; break;
      case 'playClickEcho': freq = 500; dur = 0.16; break;
    }
    o.type = 'square'; o.frequency.value = freq;
    // envelope
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.4, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    // slight pitch drop for retro feel
    o.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.6), now + dur);
    let chainIn = o;
    // light bitcrush for 8-bit cohesion
    const bc = createBitcrusher(actx, { bits: 8, reduction: 2 });
    o.connect(bc);
    // optional echo on play
    let outNode = g;
    if (type === 'playClickEcho') {
      const d = actx.createDelay(0.5); d.delayTime.value = 0.22;
      const fb = actx.createGain(); fb.gain.value = 0.35;
      const tone = actx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800;
      bc.connect(g); g.connect(d); d.connect(fb); fb.connect(d); d.connect(tone); tone.connect(actx.destination);
      g.connect(actx.destination);
    } else {
      bc.connect(g); g.connect(actx.destination);
    }
    o.start(now); o.stop(now + Math.min(0.3, dur + 0.05));
  } catch(e) {}
}

window.addEventListener('sfx', (e)=> { try { playSfx(e.detail || 'click'); } catch {} });
window.addEventListener('exit-game', async () => {
  const fadeEl = document.getElementById('fade');
  fadeEl.classList.add('show'); fadeEl.setAttribute('aria-hidden','false');
  let ended = false;
  const endPromise = new Promise(r => fadeEl.addEventListener('transitionend', () => { ended = true; r(); }, { once: true }));
  const failSafe = new Promise(r => setTimeout(r, 700));
  await Promise.race([endPromise, failSafe]);
  const mod = await import('./game.js'); try { mod.destroyGame(); } catch {}
  document.body.classList.remove('in-game');
  const gameRoot = document.getElementById('game-root');
  gameRoot.innerHTML = ''; gameRoot.hidden = true;
  try {
    audioEl.currentTime = 46;
    audioEl.play().catch(()=>{});
    if (started) {
      lowpass?.frequency.setTargetAtTime(18000, actx.currentTime, 0.2);
      await fadeIn(1.8);
    }
  } catch {}
  document.querySelector('.menu')?.classList.add('show');
  fadeEl.classList.remove('show');
  if (ended) {
    fadeEl.addEventListener('transitionend', () => fadeEl.setAttribute('aria-hidden','true'), { once: true });
  } else {
    setTimeout(() => fadeEl.setAttribute('aria-hidden','true'), 520);
  }
});
