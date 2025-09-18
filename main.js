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

function resize() {
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
}

// Audio + Visualizer
const audioEl = document.getElementById('track');
let actx, source, analyser, dataArray, started = false, gainNode, pendingLoop = false, lowpass;

const vctx = viz.getContext('2d');

function setupAudio() {
  if (started) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = actx.createAnalyser();
  analyser.fftSize = (hwThreads <= 4 || devMem <= 4) ? 256 : 512;
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
    setupAudio();
    actx.resume?.();
    audioEl.currentTime = 46;
    audioEl.play().catch(()=>{});
  } else if (action === 'options') {
    pulse(btn);
  } else if (action === 'credits') {
    openCredits();
  }
}

function pulse(el) {
  el.style.transition = 'transform 160ms ease';
  el.style.transform = 'scale(0.98)';
  setTimeout(()=>{ el.style.transform = 'scale(1)'; }, 160);
}

document.querySelectorAll('.nav-item').forEach(b=>{
  b.addEventListener('click', onNavClick);
});
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  startBtn.disabled = true; startBtn.setAttribute('aria-disabled','true'); startBtn.style.pointerEvents = 'none';
  setupAudio();
  await actx.resume?.();
  audioEl.currentTime = 46;
  audioEl.play().catch(()=>{});
  await fadeIn(1.6);
  startScreen.classList.add('hidden');
  document.querySelector('.menu').classList.add('show');
});

// Main loop
let last = 0;
let emaFPS = 60, lastVizTime = 0;
let rafId = 0, running = true;
function frame(t) {
  if (!running) return;
  const dt = t - last || 16;
  const fps = 1000 / dt;
  emaFPS = emaFPS * 0.9 + fps * 0.1;
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
closeCredits.addEventListener('click', closeCreditsFn);
creditsEl.addEventListener('click', (e)=> { if (e.target === creditsEl) closeCreditsFn(); });
addEventListener('keydown', (e)=> { if (e.key === 'Escape' && !creditsEl.hidden) closeCreditsFn(); });

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

/* GPT-5 redaction click-to-reveal */
const redactEl = document.getElementById('gpt5');
let redactClicks = 0;
if (redactEl) {
  redactEl.addEventListener('click', () => {
    if (redactEl.classList.contains('reveal')) return;
    redactClicks++;
    redactEl.classList.add('shake');
    setTimeout(()=> redactEl.classList.remove('shake'), 280);
    if (redactClicks >= 5) {
      redactEl.classList.add('reveal');
    }
  });
}