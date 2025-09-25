// Infinite sliding-cube puzzle with ghosts and doors
let root, canvas, ctx, hud, running=false, raf=0, actx, masterGain;
let gridW=14, gridH=10, cell=40, level=1, score=0;
let player, door, reds=[], blues=[], green=null, powerTime=0, moveLock=false, doorUnlocked=false;
// add particles
let particles=[]; 
// add UI/control and state helpers
let overlay=null, highScore=0, ro=null, fadeLayer=null;
// new progression + walls
let turnCount=0, redsSpawned=false, bluesSpawned=false, walls=[];
/* new rare ghosts and drift power */
let purples=[], oranges=[], orangeDrift=false, pendingTurn=null, orangeTint=0;
// tutorials
let tutOverlay=null, advancedShown=false;
// new advanced pickups (lvl > 13)
let bats=[], beacons=[], flyingBat=null, timeNow=0;
// DEV tools
let dev = { unlocked:false, show:false, enabled:false, antiRed:false, antiBlue:false, noclip:false, autoKey:false, antiOrange:false, antiPurple:false, antiCrimson:false, showHit:false, slowDrift:false };
let devPanel = null, devCountsEl = null;
let _regenTries = 0;
let _skipPopups = false, _resetArmed = false, _resetTimer = 0;
let versionElGame = null;

export async function initGame(args={}) {
  actx = args.actx || new (window.AudioContext || window.webkitAudioContext)();
  masterGain = args.masterGain || null;

  root = document.getElementById('game-root');
  root.innerHTML = '';

  canvas = document.createElement('canvas');
  canvas.style.position='absolute'; canvas.style.inset='0';
  canvas.style.width='100%'; canvas.style.height='100%'; canvas.style.imageRendering='pixelated';
  ctx = canvas.getContext('2d', { alpha:false });
  root.appendChild(canvas);

  hud = document.createElement('div');
  hud.style.position='absolute'; hud.style.left='12px'; hud.style.top='12px';
  hud.style.fontFamily='\"Space Mono\", monospace'; hud.style.fontSize='16px';
  hud.style.color='#fff'; hud.style.textShadow='0 2px 0 #000';
  hud.style.background='rgba(0,0,0,0.55)'; hud.style.padding='10px 12px'; hud.style.boxShadow='0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.10) inset';
  hud.style.borderRadius='6px'; hud.style.lineHeight='1.35';
  root.appendChild(hud);

  // observe root size so canvas updates after being unhidden
  try { ro = new ResizeObserver(()=> resize()); ro.observe(root); } catch {}
  highScore = Number(localStorage.getItem('runner_highscore')||0);
  createControls();
  // DEV hotkey
  window.addEventListener('keydown', (e)=> {
    if (e.altKey && e.key === 'F8') { toggleDevMenu(); }
  });
  // listen for movement keys
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  genLevel(1);
  resize();
  _skipPopups = (localStorage.getItem('runner_skip_htp') === '1');
  // show intro tutorial once
  requestAnimationFrame(()=> maybeShowIntroTutorialV2(!_skipPopups /* force if user-initiated only */));
  running = true;
  requestAnimationFrame(()=> resize());
  fadeInGame(); // visual fade-in
  loop(performance.now());
  // version badge (bottom-left, in-game)
  if (!versionElGame) { versionElGame = document.createElement('div'); versionElGame.className='version-badge version-game'; versionElGame.textContent='V1'; root.appendChild(versionElGame); }
}

export function destroyGame(){
  running = false;
  cancelAnimationFrame(raf);
  // clear transient state to avoid ghost trails on next start
  particles = [];
  if (fadeLayer) { try { fadeLayer.remove(); } catch{} fadeLayer=null; }
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', resize);
  if (ro) { try { ro.disconnect(); } catch {} ro = null; }
  if (root) root.innerHTML='';
  versionElGame = null;
}

/* Level generation */
function genLevel(n) {
  level = n;
  gridW = Math.min(18, 12 + Math.floor(n/3));
  gridH = Math.min(14, 9 + Math.floor(n/4));
  player = { x:0, y: Math.floor(gridH/2) };
  door = { x:gridW-1, y: Math.floor(gridH/2) };
  reds = []; blues = []; green = null;
  purples=[]; oranges=[]; orangeDrift=false; pendingTurn=null; orangeTint=0;
  doorUnlocked = true; powerTime = 0; walls=[]; particles = [];
  bats=[]; beacons=[]; flyingBat=null;
  const blockDoor = level>=4 && Math.random()<0.6; generateWallsAndKey(blockDoor);
  // generate walls from level 2+ ensuring path
  // if (level>1) generateWalls(); // removed: undefined function; walls handled by generateWallsAndKey
  // level-based spawning
  if (level >= 2) {
    const redCount = Math.min(6, Math.max(1, Math.floor(level*0.9)));
    placeMobs(reds, redCount, avoidSet([player, door, ...walls]));
  }
  if (level >= 4) {
    const blueCount = Math.min(6, Math.max(1, Math.floor(level*0.7)));
    placeMobs(blues, blueCount, avoidSet([player, door, ...(green?[green]:[]), ...walls]));
  }
  // spawn rare ghosts after level 10
  if (level > 10) {
    const avoid = avoidSet([player, door, ...(green?[green]:[]), ...walls, ...reds, ...blues]);
    const purpleCount = Math.min(3, Math.floor(Math.random()*3)+1);
    for (let i=0;i<purpleCount;i++){ const p = placeOne(avoid, true); purples.push(p); }
    if (Math.random() < 0.6) { const o = placeOne(avoid, true); oranges.push(o); }
  }
  if (level > 13) {
    const avoid = avoidSet([player, door, ...(green?[green]:[]), ...walls, ...reds, ...blues, ...purples, ...oranges]);
    const batCount = 2; for (let i=0;i<batCount;i++) bats.push(placeOne(avoid,true));
    if (Math.random()<0.7) beacons.push(placeOne(avoid,true));
  }
  // validity: must be solvable (key considered, blues ignored) and have a safe opening move (no forced red)
  const ok = slideSolvable(walls, !doorUnlocked, green) && hasSafeFirstMove();
  if (!ok) { if (++_regenTries < 80) return genLevel(n); else _regenTries = 0; } else { _regenTries = 0; }
  tip(level>=4 ? (doorUnlocked?'Blues appeared!':'Door locked! Find the key.')
               : (level>=2 ? 'Red ghosts prowl.' : 'Reach the door →'));
  draw();
  // advanced tutorial when purple/orange arrive
  maybeShowAdvancedTutorial();
}

function avoidSet(list){ return new Set(list.map(p=> p.x+','+p.y)); }
function placeMobs(arr, count, avoid) {
  while (arr.length<count) {
    const p = randCell();
    const k = p.x+','+p.y;
    if (avoid.has(k) || contains(arr, p) || (green && green.x===p.x && green.y===p.y)) continue;
    arr.push(p);
    avoid.add(k);
  }
}
function placeOne(avoid, notOnStartRow=false){
  while(true){
    const p = randCell();
    if (notOnStartRow && p.y===player.y) continue;
    const k = p.x+','+p.y;
    if (!avoid.has(k)) { avoid.add(k); return p; }
  }
}
function randCell(){ return { x: Math.floor(Math.random()*gridW), y: Math.floor(Math.random()*gridH) }; }
function contains(arr,p){ return arr.some(a=>a.x===p.x && a.y===p.y); }
function removeAt(arr,x,y){ const i = arr.findIndex(a=>a.x===x&&a.y===y); if(i>=0) arr.splice(i,1); }

/* Input */
function onKey(e){
  // instant reset: double R (second R confirms)
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    if (_resetArmed) { _resetArmed = false; clearTimeout(_resetTimer); if (overlay) { overlay.remove(); overlay=null; } restartRun(); return; }
    _resetArmed = true;
    showOverlay(`
      <div style="text-align:center; display:grid; gap:10px;">
        <div>Are you sure you want to restart from Level 1?</div>
        <div style="opacity:0.85;">Press R again to confirm, or click No to cancel.</div>
        <div style="display:flex; gap:8px; justify-content:center;">
          <button id="yes">Yes</button><button id="no">No</button>
        </div>
      </div>
    `);
    styleOverlayButtons();
    overlay.querySelector('#yes').onclick=()=>{ _resetArmed=false; if (overlay) { overlay.remove(); overlay=null; } restartRun(); };
    overlay.querySelector('#no').onclick=()=>{ _resetArmed=false; if (overlay) { overlay.remove(); overlay=null; } };
    _resetTimer = setTimeout(()=>{ _resetArmed=false; if (overlay) { overlay.remove(); overlay=null; } }, 3000);
    return;
  }
  // Block input when not running or when any overlay/tutorial is open
  if (!running || tutOverlay || overlay) return;
  if (moveLock) {
    // allow setting mid-slide turn when orange drift active
    if (orangeDrift || dev.slowDrift) {
      if (e.key==='ArrowRight' || e.key==='d' || e.key==='D') pendingTurn={x:1,y:0};
      else if (e.key==='ArrowLeft' || e.key==='a' || e.key==='A') pendingTurn={x:-1,y:0};
      else if (e.key==='ArrowUp' || e.key==='w' || e.key==='W') pendingTurn={x:0,y:-1};
      else if (e.key==='ArrowDown' || e.key==='s' || e.key==='S') pendingTurn={x:0,y:1};
    }
    return;
  }
  let dir=null;
  if (e.key==='ArrowRight' || e.key==='d' || e.key==='D') dir={x:1,y:0};
  else if (e.key==='ArrowLeft' || e.key==='a' || e.key==='A') dir={x:-1,y:0};
  else if (e.key==='ArrowUp' || e.key==='w' || e.key==='W') dir={x:0,y:-1};
  else if (e.key==='ArrowDown' || e.key==='s' || e.key==='S') dir={x:0,y:1};
  if (!dir) return;
  e.preventDefault();
  slide(dir);
}

/* Slide until blocked */
function slide(dir){
  moveLock = true;
  // move blues first so their hitboxes are up-to-date
  preShuffleBlues();
  let path=[]; let cx=player.x, cy=player.y;
  const isBlocked = (x,y)=>{
    if (x<0||y<0||x>=gridW||y>=gridH) return true;
    if (!dev.noclip && walls.some(w=> w.x===x && w.y===y)) return true;
    if (!doorUnlocked && x===door.x && y===door.y) return true;
    if (!powerTime && !dev.antiBlue && blues.some(b=> b.x===x && b.y===y)) return true;
    return false;
  };
  while(true){
    const nx=cx+dir.x, ny=cy+dir.y;
    if (isBlocked(nx,ny)) break;
    cx=nx; cy=ny; path.push({x:cx,y:cy});
    if (!dev.antiRed && reds.some(r=> r.x===cx && r.y===cy)) break; // was unconditional
    if (green && green.x===cx && green.y===cy) break; // stop to pick
    if (doorUnlocked && cx===door.x && cy===door.y) break;
  }
  if (path.length===0){ bumpSfx(); moveLock=false; return; }
  moveSfx();
  animateMove(path, async ()=>{
    // resolve landing tile
    if (!dev.antiRed && reds.some(r=> r.x===player.x && r.y===player.y)) { deathSfx(); await smallDelay(140); moveLock=false; gameOver(); return; }
    // orange ghost pickup
    const oi = oranges.findIndex(o=> o.x===player.x && o.y===player.y);
    if (oi>=0 && !dev.antiOrange) {
      oranges.splice(oi,1); orangeDrift=true; orangeTint=1.0; tip('Orange drift! Slow-mo + one mid-slide turn.');
      spawnBurst(player.x, player.y, '#ff9b42', 18);
    }
    // purple ghost effect
    const pi = purples.findIndex(p=> p.x===player.x && p.y===player.y);
    if (pi>=0 && !dev.antiPurple) { applyPurpleEffect(); purples.splice(pi,1); }
    if (green && player.x===green.x && player.y===green.y) {
      pickupSfx(); powerTime = Math.max(powerTime, 6); green=null; doorUnlocked=true; tip('Door unlocked! Blues fade for a while…');
      spawnBurst(player.x, player.y, '#82ff8a', 14);
    }
    if (doorUnlocked && player.x===door.x && player.y===door.y) {
      winSfx(); spawnBurst(player.x, player.y, '#ffd84a', 16); score++; genLevel(level+1); moveLock=false; return;
    }
    // after-move: blue may shuffle
    shuffleBlues();
    moveLock=false;
  }, dir);
}

function animateMove(path, done, initialDir){
  let i=0;
  let curDir = initialDir || null;
  const step = () => {
    player.x = path[i].x; player.y = path[i].y;
    spawnTrail(player.x, player.y);
    draw();
    // pickups during slide
    const bi = bats.findIndex(o=> o.x===player.x && o.y===player.y);
    if (bi>=0){ bats.splice(bi,1); triggerBatSpell(player.x, player.y); }
    const bci = beacons.findIndex(o=> o.x===player.x && o.y===player.y);
    if (bci>=0){ 
      if (dev.antiCrimson) { /* pass-through: no trigger, no removal */ }
      else { beacons.splice(bci,1); triggerBeacon(); }
    }
    // trigger pass-through pickups/effects
    const oi = oranges.findIndex(o=> o.x===player.x && o.y===player.y);
    if (oi>=0){ if (!dev.antiOrange){ oranges.splice(oi,1); orangeDrift=true; orangeTint=1.0; tip('Orange drift! Slow-mo + one mid-slide turn.'); spawnBurst(player.x, player.y, '#ff9b42', 18); } }
    const pi = purples.findIndex(p=> p.x===player.x && p.y===player.y);
    if (pi>=0){ if (!dev.antiPurple){ applyPurpleEffect(); purples.splice(pi,1); } }
    // mid-slide turn if orange drift pending
    if ((orangeDrift || dev.slowDrift) && pendingTurn) {
      const dir = pendingTurn; pendingTurn = null;
      if (!(curDir && dir.x===curDir.x && dir.y===curDir.y)) {
        const newSeg = computeSegmentFrom(player.x, player.y, dir);
        if (newSeg.length) { if (!dev.slowDrift) orangeDrift = false; path = newSeg; i = 0; curDir = dir; }
      }
    }
    i++;
    if (i<path.length) {
      if (orangeDrift || orangeTint>0 || dev.slowDrift) setTimeout(()=> raf = requestAnimationFrame(step), 90);
      else raf = requestAnimationFrame(step);
    } else done();
  };
  if (orangeDrift || orangeTint>0 || dev.slowDrift) setTimeout(()=> raf = requestAnimationFrame(step), 90);
  else raf = requestAnimationFrame(step);
}

function computeSegmentFrom(sx,sy,dir){
  const seg=[]; let cx=sx, cy=sy;
  const blocked = (x,y)=>{
    if (x<0||y<0||x>=gridW||y>=gridH) return true;
    if (!dev.noclip && walls.some(w=> w.x===x && w.y===y)) return true;
    if (!doorUnlocked && x===door.x && y===door.y) return true;
    if (!powerTime && !dev.antiBlue && blues.some(b=> b.x===x && b.y===y)) return true;
    return false;
  };
  while(true){
    const nx=cx+dir.x, ny=cy+dir.y;
    if (blocked(nx,ny)) break;
    cx=nx; cy=ny; seg.push({x:cx,y:cy});
    if (!dev.antiRed && reds.some(r=> r.x===cx && r.y===cy)) break;
    if (green && green.x===cx && green.y===cy) break;
    if (doorUnlocked && cx===door.x && cy===door.y) break;
  }
  return seg;
}

/* Blues random small moves */
function shuffleBlues(){
  if (!blues.length) return;
  const tries = Math.min(2, Math.ceil(level/5));
  for (let t=0;t<tries;t++){
    const b = blues[Math.floor(Math.random()*blues.length)];
    const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    const d = dirs[Math.floor(Math.random()*dirs.length)];
    const nx=b.x+d.x, ny=b.y+d.y;
    if (nx<0||ny<0||nx>=gridW||ny>=gridH) continue;
    if ((nx===door.x&&ny===door.y) || (nx===player.x&&ny===player.y)) continue;
    if (reds.some(r=> r.x===nx && r.y===ny)) continue;
    if (blues.some(o=> o!==b && o.x===nx && o.y===ny)) continue;
    b.x=nx; b.y=ny;
  }
}
function preShuffleBlues(){ shuffleBlues(); } // run before sliding

/* Loop and rendering */
function resize(){
  canvas.width = Math.floor(root.clientWidth);
  canvas.height = Math.floor(root.clientHeight);
  const cw = Math.floor(canvas.width / (gridW+2));
  const ch = Math.floor(canvas.height / (gridH+2));
  cell = Math.min(64, Math.min(cw, ch)); // ensure grid always fits on small screens
  draw();
}

function loop(t){
  if (!running) return;
  timeNow = t;
  if (powerTime>0){ powerTime = Math.max(0, powerTime - 1/60); }
  if (orangeTint>0) orangeTint = Math.max(0, orangeTint - 0.02);
  if (dev.autoKey && green){ collectKeyNow(); }
  // ambient dust
  if (Math.random()<0.08) spawnDust();
  updateParticles();
  draw();
  raf = requestAnimationFrame(loop);
}

function draw(){
  const w=canvas.width, h=canvas.height;
  ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,w,h);

  const offX = Math.floor((w - gridW*cell)/2);
  const offY = Math.floor((h - gridH*cell)/2);

  // grid
  ctx.strokeStyle='#111'; ctx.lineWidth=1;
  for (let y=0;y<gridH;y++){
    for (let x=0;x<gridW;x++){
      ctx.fillStyle = ((x+y)%2===0) ? '#0e0e0e' : '#101010';
      ctx.fillRect(offX+x*cell, offY+y*cell, cell, cell);
      ctx.strokeRect(offX+x*cell+0.5, offY+y*cell+0.5, cell-1, cell-1);
    }
  }

  // draw outer wall border so edges read as walls
  ctx.strokeStyle='#131313'; ctx.lineWidth=4;
  ctx.strokeRect(offX-2.5, offY-2.5, gridW*cell+5, gridH*cell+5);

  // static walls (blacked out)
  if (walls.length){
    drawWallsMerged();
  }

  // door
  ctx.save(); ctx.shadowColor=doorUnlocked?'#ffd84a':'#444'; ctx.shadowBlur=doorUnlocked?12:0;
  ctx.fillStyle = doorUnlocked ? '#ffd84a' : '#555';
  drawRect(door.x, door.y, 0.85);
  ctx.restore();
  if (!doorUnlocked){
    ctx.strokeStyle='#222'; ctx.lineWidth=3;
    ctx.beginPath();
    const cx = offX+door.x*cell+cell/2, cy=offY+door.y*cell+cell/2;
    ctx.arc(cx,cy,Math.min(8,cell*0.22),0,Math.PI*2); ctx.stroke();
  }

  // green
  if (green){
    const size=cell*0.78, x=offX+green.x*cell+(cell-size)/2, y=offY+green.y*cell+(cell-size)/2, r=Math.max(4,size*0.18);
    ctx.save(); ctx.shadowColor='#82ff8a'; ctx.shadowBlur=14;
    const g=ctx.createLinearGradient(0,y,0,y+size); g.addColorStop(0,'#aaffc4'); g.addColorStop(1,'#2fff6d');
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,size,size,r); ctx.fill();
    ctx.shadowBlur=0; ctx.lineWidth=2; ctx.strokeStyle='#1e6b34'; ctx.stroke();
    ctx.globalAlpha=0.35; ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.roundRect(x+4,y+4,size-8,(size-8)*0.42,r*0.6); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle='#0a0a0a'; ctx.font=`${Math.floor(size*0.32)}px "Space Mono"`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('KEY', x+size/2, y+size/2+2);
    ctx.restore();
  }
  // beacons (crimson)
  if (beacons.length){
    ctx.save(); ctx.shadowColor='#ff5a5a'; ctx.shadowBlur=12; if (dev.antiCrimson) ctx.globalAlpha=0.25;
    beacons.forEach(b=> drawBeacon(b.x,b.y)); ctx.restore();
  }
  // blues (fade if power active)
  if (blues.length){
    ctx.globalAlpha = (powerTime>0 || dev.antiBlue) ? 0.25 : 1.0;
    ctx.save(); ctx.shadowColor='#6bb7ff'; ctx.shadowBlur=8;
    blues.forEach(b=> drawGhost(b.x,b.y,'#6bb7ff',0.9)); ctx.restore(); ctx.globalAlpha = 1.0;
  }
  // reds
  ctx.save(); ctx.shadowColor='#ff7373'; ctx.shadowBlur=8; if (dev.antiRed) ctx.globalAlpha=0.25;
  reds.forEach(r=> drawGhost(r.x,r.y,'#ff7373',0.9)); ctx.restore();

  // purples
  if (purples.length){
    ctx.save(); ctx.shadowColor='#b86bff'; ctx.shadowBlur=10; if (dev.antiPurple) ctx.globalAlpha=0.25;
    purples.forEach(p=> drawGhost(p.x,p.y,'#b86bff',0.9)); ctx.restore();
  }
  // oranges
  if (oranges.length){
    ctx.save(); ctx.shadowColor='#ff9b42'; ctx.shadowBlur=12; if (dev.antiOrange) ctx.globalAlpha=0.25;
    oranges.forEach(o=> drawGhost(o.x,o.y,'#ff9b42',0.92)); ctx.restore();
  }
  // bats (visible pickup)
  if (bats.length){
    ctx.save(); ctx.shadowColor='#ffffff'; ctx.shadowBlur=8;
    bats.forEach(b=> drawBat(b.x,b.y)); ctx.restore();
  }

  // player
  ctx.save(); ctx.shadowColor='#ffffff'; ctx.shadowBlur=10; ctx.fillStyle='#ffffff';
  drawRect(player.x, player.y, 0.8); ctx.restore();

  // particles (additive glow)
  ctx.save(); ctx.globalCompositeOperation='lighter';
  particles.forEach(p=>{ ctx.globalAlpha = p.a; ctx.fillStyle = p.c; drawRect(p.x, p.y, p.s); });
  ctx.restore();
  // ensure composite/alpha reset after particle pass
  ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';

  // flying bat animation
  if (flyingBat){
    drawFlyingBat(); // draws and updates progress
  }
  // hitboxes (DEV)
  if (dev.showHit){ drawHitboxes(); }
  // HUD
  hud.innerHTML = `LVL ${level} | SCORE ${score} | HIGH ${highScore}` + (powerTime>0 ? ` | POWER ${powerTime.toFixed(1)}s` : '') + ((orangeDrift||dev.slowDrift)?` | DRIFT`:``) + (dev.enabled?` | DEV`:``);
  if (devCountsEl) devCountsEl.textContent = debugCountsText();
}

function drawRect(gx,gy,scale){
  const offX = Math.floor((canvas.width - gridW*cell)/2);
  const offY = Math.floor((canvas.height - gridH*cell)/2);
  const pad = Math.floor(cell*(1-scale)/2);
  ctx.fillRect(offX+gx*cell+pad, offY+gy*cell+pad, cell-2*pad, cell-2*pad);
}

function drawGhost(gx,gy,color,scale=0.9){
  const offX=Math.floor((canvas.width-gridW*cell)/2), offY=Math.floor((canvas.height-gridH*cell)/2);
  const size=cell*scale, x=offX+gx*cell+(cell-size)/2, y=offY+gy*cell+(cell-size)/2;
  const w=size, h=size;
  ctx.save(); ctx.translate(x+w/2,y+h*0.52); ctx.fillStyle=color;
  ctx.beginPath(); ctx.arc(0,-h*0.28,h*0.36,Math.PI,0); ctx.lineTo(w*0.5,h*0.12);
  ctx.quadraticCurveTo(w*0.25,h*0.28,0,h*0.18); ctx.quadraticCurveTo(-w*0.25,h*0.28,-w*0.5,h*0.12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(10,10,10,0.9)'; const er=h*0.06;
  ctx.beginPath(); ctx.arc(-w*0.16,-h*0.28,er,0,Math.PI*2); ctx.arc(w*0.16,-h*0.28,er,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function renderGhostPreview(canvas, color){
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0,0,w,h);
  const size = Math.min(w,h)*0.8, ww=size, hh=size;
  c.save(); c.translate(w/2, h/2 + hh*0.04); c.fillStyle=color;
  c.beginPath();
  c.arc(0,-hh*0.28,hh*0.36,Math.PI,0);
  c.lineTo(ww*0.5,hh*0.12);
  c.quadraticCurveTo(ww*0.25,hh*0.28,0,hh*0.18);
  c.quadraticCurveTo(-ww*0.25,hh*0.28,-ww*0.5,hh*0.12);
  c.closePath(); c.fill();
  c.fillStyle='rgba(10,10,10,0.9)'; const er=hh*0.06;
  c.beginPath(); c.arc(-ww*0.16,-hh*0.28,er,0,Math.PI*2); c.arc(ww*0.16,-hh*0.28,er,0,Math.PI*2); c.fill();
  c.restore();
}

function drawBat(gx,gy){
  const offX=Math.floor((canvas.width-gridW*cell)/2), offY=Math.floor((canvas.height-gridH*cell)/2);
  const flap = Math.sin(timeNow*0.012 + (gx*7+gy*3)) * 0.4; // wing flap
  const bob = Math.sin(timeNow*0.004 + (gx*2)) * (cell*0.05);
  const size=cell*0.76, x=offX+gx*cell+(cell-size)/2, y=offY+gy*cell+(cell-size)/2 + bob;
  const w=size, h=size*0.6;
  ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.fillStyle='#000'; ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1, cell*0.035);
  ctx.beginPath();
  ctx.moveTo(-w*0.5,0);
  ctx.quadraticCurveTo(-w*0.25, -h*(0.6+0.3*flap), 0, -h*0.2);
  ctx.quadraticCurveTo(w*0.25, -h*(0.6-0.3*flap), w*0.5, 0);
  ctx.lineTo(0, h*0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#fff'; const er=Math.max(2, h*0.08);
  ctx.beginPath(); ctx.arc(-w*0.12,-h*0.08,er,0,Math.PI*2); ctx.arc(w*0.12,-h*0.08,er,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawBeacon(gx,gy){
  const offX=Math.floor((canvas.width-gridW*cell)/2), offY=Math.floor((canvas.height-gridH*cell)/2);
  const s=cell*0.78, x=offX+gx*cell+(cell-s)/2, y=offY+gy*cell+(cell-s)/2, r=Math.max(4,s*0.18);
  ctx.save(); ctx.shadowColor='#ff5a5a'; ctx.shadowBlur=14; const g=ctx.createLinearGradient(0,y,0,y+s); g.addColorStop(0,'#ffb3b3'); g.addColorStop(1,'#ff3b3b');
  ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,s,s,r); ctx.fill(); ctx.shadowBlur=0; ctx.lineWidth=2; ctx.strokeStyle='#5a1e1e'; ctx.stroke();
  ctx.fillStyle='#0a0a0a'; ctx.font=`${Math.floor(s*0.26)}px "Space Mono"`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('BEACON', x+s/2, y+s/2+2); ctx.restore();
}

function renderBatPreview(canvas){
  const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  c.save(); c.translate(w/2,h/2); c.fillStyle='#000';
  const s=Math.min(w,h)*0.5;
  c.beginPath(); c.moveTo(-s*0.6,0); c.quadraticCurveTo(-s*0.3,-s*0.7,0,-s*0.15); c.quadraticCurveTo(s*0.3,-s*0.7,s*0.6,0); c.lineTo(0,s*0.2); c.closePath(); c.fill();
  // eyes
  c.fillStyle='#fff'; const er=Math.max(2, s*0.08);
  c.beginPath(); c.arc(-s*0.12,-s*0.06,er,0,Math.PI*2); c.arc(s*0.12,-s*0.06,er,0,Math.PI*2); c.fill();
  c.restore();
}

function renderBeaconPreview(canvas){
  const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height; c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  const s=Math.min(w*0.6,h*0.7), x=(w-s)/2, y=(h-s)/2, r=s*0.18;
  c.save(); c.shadowColor='#ff5a5a'; c.shadowBlur=16; const g=c.createLinearGradient(0,y,0,y+s); g.addColorStop(0,'#ffb3b3'); g.addColorStop(1,'#ff3b3b'); c.fillStyle=g;
  if (c.roundRect) c.roundRect(x,y,s,s,r); else { c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+s,y,x+s,y+s,r); c.arcTo(x+s,y+s,x,y+s,r); c.arcTo(x,y+s,x,y,r); c.arcTo(x,y,x+s,y,r); c.closePath(); }
  c.fill(); c.shadowBlur=0; c.lineWidth=3; c.strokeStyle='#5a1e1e'; c.stroke(); c.fillStyle='#0a0a0a'; c.font=`${Math.floor(s*0.26)}px "Space Mono"`; c.textAlign='center'; c.textBaseline='middle'; c.fillText('BEACON', x+s/2, y+s/2+2); c.restore();
}

function renderImportantNotePreview(canvas){
  const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  const s=Math.min(w*0.8,h*0.7), x=(w-s)/2, y=(h-s)/2, r=s*0.18;
  c.save(); c.shadowColor='#ff3b3b'; c.shadowBlur=18;
  const g=c.createLinearGradient(0,y,0,y+s); g.addColorStop(0,'#ff9b9b'); g.addColorStop(1,'#ff3b3b');
  c.fillStyle=g; c.roundRect ? c.roundRect(x,y,s,s,r) : (c.beginPath(), c.moveTo(x+r,y), c.arcTo(x+s,y,x+s,y+s,r), c.arcTo(x+s,y+s,x,y+s,r), c.arcTo(x,y+s,x,y,r), c.arcTo(x,y,x+s,y,r), c.closePath());
  c.fill(); c.shadowBlur=0; c.fillStyle='#0a0a0a'; c.font=`${Math.floor(s*0.6)}px "Space Mono"`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('!', x+s/2, y+s*0.52); c.restore();
}

function tip(text){
  hud.dataset.tip = text;
  hud.title = text;
}

/* Restart */
function restartLevel(){
  tip('You were caught! Restarting...');
  spawnBurst(player.x, player.y, '#ff7373', 10);
  genLevel(level);
  moveLock = false;
}

function createControls(){
  const btns = document.createElement('div');
  btns.style.position='absolute'; btns.style.right='12px'; btns.style.top='12px';
  btns.style.display='flex'; btns.style.gap='8px';
  const bRestart = document.createElement('button');
  bRestart.textContent='Restart';
  const bMenu = document.createElement('button');
  bMenu.textContent='Menu';
  const bHow = document.createElement('button'); bHow.textContent='How To Play';
  const bOpts = document.createElement('button'); bOpts.textContent='Options';
  [bRestart,bMenu,bHow,bOpts].forEach(b=>{ b.style.fontFamily='"Space Mono", monospace'; b.style.fontSize='14px'; b.style.background='transparent'; b.style.color='#fff'; b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='10px 14px'; b.style.boxShadow='0 0 0 4px #000 inset'; b.style.transition='transform 120ms ease, background-color 160ms ease'; b.onmouseenter=()=> blip(620,0.05,'square',0.18); b.onmouseover=()=>{ b.style.background='rgba(255,255,255,0.06)'; }; b.onmouseout=()=>{ b.style.background='transparent'; }; b.onmousedown=()=>{ b.style.transform='scale(0.98)'; }; b.onmouseup=()=>{ b.style.transform='scale(1)'; }; });
  bRestart.onclick = ()=> confirmRestart();
  bMenu.onclick = ()=> confirmMenu();
  bHow.onclick = ()=> maybeShowIntroTutorialV2(true);
  bOpts.onclick = ()=> openGameOptions();
  root.appendChild(btns); btns.appendChild(bRestart); btns.appendChild(bHow); btns.appendChild(bOpts); btns.appendChild(bMenu);
}

function showOverlay(html){
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.style.position='absolute'; overlay.style.inset='0'; overlay.style.background='rgba(0,0,0,0.72)';
  overlay.style.display='grid'; overlay.style.placeItems='center'; overlay.style.zIndex='5';
  const card = document.createElement('div');
  card.style.background='#0b0b0b'; card.style.color='#fff'; card.style.padding='24px';
  card.style.boxShadow='0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.12) inset, 0 6px 0 rgba(0,0,0,0.5)';
  card.style.fontFamily='"Space Mono", monospace'; card.style.fontSize='16px'; card.style.lineHeight='1.6';
  overlay.appendChild(card); root.appendChild(overlay); card.innerHTML = html;
}

function gameOver(){
  running = false;
  if (!dev.enabled && score>highScore){ highScore=score; try{ localStorage.setItem('runner_highscore', String(highScore)); }catch{} }
  showOverlay(`
    <div style="text-align:center; display:grid; gap:10px;">
      <div style="font-weight:700;">You were caught!</div>
      <div>Score ${score} — High ${highScore}${dev.enabled?' (DEV unsaved)':''}</div>
      <div style="display:flex; gap:8px; justify-content:center;">
        <button id="ovr-restart">Restart (Level 1)</button>
        <button id="ovr-menu">Back to Menu</button>
      </div>
    </div>
  `);
  styleOverlayButtons();
  overlay.querySelector('#ovr-restart').onclick = ()=> { overlay.remove(); overlay=null; restartRun(); };
  overlay.querySelector('#ovr-menu').onclick = ()=> { overlay.remove(); overlay=null; fadeOutAndExit(); };
}

function styleOverlayButtons(){
  overlay.querySelectorAll('button').forEach(b=>{
    b.style.fontFamily='"Space Mono", monospace';
    b.style.fontSize='14px'; b.style.background='transparent'; b.style.color='#fff';
    b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='10px 14px';
    b.style.boxShadow='0 0 0 4px #000 inset'; b.style.transition='transform 120ms ease, background-color 160ms ease';
    b.onmouseenter=()=>{ blip(620,0.05,'square',0.18); b.style.background='rgba(255,255,255,0.06)'; };
    b.onmouseleave=()=>{ b.style.background='transparent'; };
    b.onmousedown=()=>{ b.style.transform='scale(0.98)'; };
    b.onmouseup=()=>{ b.style.transform='scale(1)'; };
  });
}

function restartRun(){
  score = 0; level = 1; doorUnlocked = false; powerTime = 0; moveLock = false;
  particles = []; // clear any old trails
  genLevel(1);
  if (!running) { running = true; raf = requestAnimationFrame(loop); }
}

function confirmRestart(){
  const hsMsg = dev.enabled ? 'High score won\'t be saved anyway as you\'re in DEV mode.' : 'High score stays saved.';
  showOverlay(`
    <div style="text-align:center; display:grid; gap:10px;">
      <div>Restart from Level 1?</div>
      <div style="opacity:0.8;">${hsMsg}</div>
      <div style="display:flex; gap:8px; justify-content:center;">
        <button id="yes">Yes</button><button id="no">No</button>
      </div>
    </div>
  `);
  styleOverlayButtons();
  overlay.querySelector('#yes').onclick=()=>{ overlay.remove(); overlay=null; restartRun(); };
  overlay.querySelector('#no').onclick=()=>{ overlay.remove(); overlay=null; };
}

function confirmMenu(fromDeath=false){
  showOverlay(`
    <div style="text-align:center; display:grid; gap:10px;">
      <div>Return to main menu?</div>
      <div style="opacity:0.85;">Warning: current run progress will reset.</div>
      <div style="display:flex; gap:8px; justify-content:center;">
        <button id="yes">Go to Menu</button><button id="no">Stay</button>
      </div>
    </div>
  `);
  styleOverlayButtons();
  overlay.querySelector('#yes').onclick=()=>{ overlay.remove(); overlay=null; particles=[]; running=false; fadeOutAndExit(); };
  overlay.querySelector('#no').onclick=()=>{ overlay.remove(); overlay=null; moveLock=false; if (!fromDeath) running=true; };
}

/* SFX */
function outNode(){
  if (!masterGain){ const g=actx.createGain(); g.gain.value=0.8; g.connect(actx.destination); return g; }
  return masterGain;
}
function blip(freq=440, dur=0.08, type='square', vol=0.3){
  const now=actx.currentTime;
  const o=actx.createOscillator(); o.type=type; o.frequency.value=freq;
  const g=actx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
  o.connect(g); g.connect(outNode()); o.start(now); o.stop(now+dur+0.02);
}
function moveSfx(){ blip(520,0.05,'square',0.22); }
function bumpSfx(){ blip(180,0.08,'square',0.25); }
function pickupSfx(){ blip(700,0.08,'triangle',0.3); setTimeout(()=> blip(980,0.08,'triangle',0.3),60); }
function deathSfx(){ blip(200,0.12,'sawtooth',0.28); setTimeout(()=> blip(140,0.12,'sawtooth',0.28),70); }
function winSfx(){ blip(660,0.08,'square',0.26); setTimeout(()=> blip(880,0.08,'square',0.26),70); }

/* utils */
const smallDelay = (ms)=> new Promise(r=> setTimeout(r, ms));

/* add particle helpers */
function spawnTrail(x,y){ 
  const c = (orangeDrift || orangeTint>0 || dev.slowDrift) ? '#ffb773' : '#8bd3ff';
  if (Math.random()<0.7) particles.push({x,y,c,s:0.5,a:0.35,vx:0,vy:0,life:0.3});
}
function spawnBurst(x,y,color,count=12){ for(let i=0;i<count;i++){ particles.push({x,y,c:color,s:0.4+Math.random()*0.5,a:0.6,vx:(Math.random()*2-1)*0.2,vy:(Math.random()*2-1)*0.2,life:0.5+Math.random()*0.5}); } }
function spawnDust(){ const x=Math.floor(Math.random()*gridW), y=Math.floor(Math.random()*gridH); particles.push({x,y,c:'#446',s:0.3,a:0.12,vx:0,vy:-0.02,life:0.8}); }
function updateParticles(){
  const dt=1/60;
  for (let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.life-=dt; p.a=Math.max(0,p.a-dt*0.6);
    if (p.life<=0 || p.a<=0.01) particles.splice(i,1);
  }
}

// add a subtle in-game fade layer
function fadeInGame(){
  if (fadeLayer) { try { fadeLayer.remove(); } catch{} }
  fadeLayer = document.createElement('div');
  fadeLayer.style.position='absolute'; fadeLayer.style.inset='0';
  fadeLayer.style.background='#000'; fadeLayer.style.opacity='1';
  fadeLayer.style.transition='opacity 420ms ease';
  root.appendChild(fadeLayer);
  requestAnimationFrame(()=> {
    fadeLayer.style.opacity='0';
    fadeLayer.addEventListener('transitionend', ()=> { fadeLayer?.remove(); fadeLayer=null; }, { once:true });
  });
}

// walls generation and solvability using sliding BFS
function generateWallsAndKey(blockDoor){
  const targetMax=Math.min(Math.floor(level*1.5)+3, Math.floor((gridW*gridH)*0.18));
  for(let tries=0;tries<200;tries++){
    const temp=[]; while(temp.length<targetMax){ const p=randCell(); if((p.x===player.x&&p.y===player.y)||(p.x===door.x&&p.y===door.y)||temp.some(t=>t.x===p.x&&t.y===p.y)) continue; temp.push(p); }
    // reject layouts that fully block any row or column (minus start/door)
    if (blocksRowOrCol(temp)) continue;
    let key=null, locked=!!blockDoor; if(locked){ const avoid=new Set([player.x+','+player.y,door.x+','+door.y,...temp.map(w=>w.x+','+w.y)]); key=placeOne(avoid,true); }
    if(slideSolvable(temp, locked, key)){ walls=temp; green=key; doorUnlocked=!locked; return; }
  }
  walls=[]; green=null; doorUnlocked=true;
}
function blocksRowOrCol(blocks){
  const rowCount = Array(gridH).fill(0), colCount = Array(gridW).fill(0);
  blocks.forEach(b=>{ rowCount[b.y]++; colCount[b.x]++; });
  // if a row is fully blocked except possibly start/door cells, reject
  for (let y=0;y<gridH;y++){
    const maxWalls = gridW - 1; // leave at least 1 gap
    if (rowCount[y] >= maxWalls) return true;
  }
  for (let x=0;x<gridW;x++){
    const maxWalls = gridH - 1;
    if (colCount[x] >= maxWalls) return true;
  }
  return false;
}
function slideSolvable(blocks, locked, key){
  // Treat blue ghosts as waitable (non-blocking) for solvability; only walls and locked door block.
  const blocked=new Set(blocks.map(b=>b.x+','+b.y)), K=key?key.x+','+key.y:null, D=door.x+','+door.y, dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const enc=(x,y,k)=>x+','+y+','+(k?1:0), stop=(x,y,dx,dy,k)=>{ let cx=x,cy=y,has=k; while(true){ const nx=cx+dx, ny=cy+dy, nk=has||(K&&nx+','+ny===K); if(nx<0||ny<0||nx>=gridW||ny>=gridH) return {x:cx,y:cy,k:has}; const at=nx+','+ny, hitDoor=at===D, hitWall=blocked.has(at), hitKey=K&&at===K; if(hitWall || (locked&&!nk&&hitDoor)) return {x:cx,y:cy,k:has}; cx=nx; cy=ny; if(hitKey) return {x:cx,y:cy,k:true}; if((!locked||nk)&&hitDoor) return {x:cx,y:cy,k:nk}; } };
  const q=[{x:player.x,y:player.y,k:false}], seen=new Set([enc(player.x,player.y,false)]);
  while(q.length){ const n=q.shift(); if((!locked||n.k) && (n.x+','+n.y)===D) return true;
    for(const [dx,dy] of dirs){ const s=stop(n.x,n.y,dx,dy,n.k); const st=enc(s.x,s.y,s.k); if(!seen.has(st)){ seen.add(st); q.push(s); } } }
  return false;
}

// ensure at least one opening direction doesn't force landing on a red
function hasSafeFirstMove(){
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  return dirs.some(d => {
    const seg = computeSegmentFrom(player.x, player.y, d);
    if (!seg.length) return false;
    const last = seg[seg.length-1];
    return !reds.some(r => r.x===last.x && r.y===last.y);
  });
}

// fade-out helper when leaving game
function fadeOutAndExit(){
  // dispatch directly; main.js handles global fade & menu restore
  window.dispatchEvent(new CustomEvent('exit-game'));
}

// merged wall drawing with outer-only strokes
function drawWallsMerged(){
  const offX = Math.floor((canvas.width - gridW*cell)/2);
  const offY = Math.floor((canvas.height - gridH*cell)/2);
  const isW = (x,y)=> walls.some(w=>w.x===x&&w.y===y);
  ctx.save();
  if (dev.noclip) ctx.globalAlpha = 0.35;
  // fills
  ctx.fillStyle = '#151515';
  walls.forEach(w=>{
    ctx.fillRect(offX+w.x*cell, offY+w.y*cell, cell, cell);
  });
  // edges (only where neighbor is not wall)
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5a5a5a';
  walls.forEach(w=>{
    const x=offX+w.x*cell, y=offY+w.y*cell;
    if (!isW(w.x, w.y-1)) { ctx.beginPath(); ctx.moveTo(x, y+1); ctx.lineTo(x+cell, y+1); ctx.stroke(); }
    if (!isW(w.x+1, w.y)) { ctx.beginPath(); ctx.moveTo(x+cell-1, y); ctx.lineTo(x+cell-1, y+cell); ctx.stroke(); }
    if (!isW(w.x, w.y+1)) { ctx.beginPath(); ctx.moveTo(x, y+cell-1); ctx.lineTo(x+cell, y+cell-1); ctx.stroke(); }
    if (!isW(w.x-1, w.y)) { ctx.beginPath(); ctx.moveTo(x+1, y); ctx.lineTo(x+1, y+cell); ctx.stroke(); }
  });
  // subtle inner shadow to match outer border vibe
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
  walls.forEach(w=>{
    const x=offX+w.x*cell, y=offY+w.y*cell;
    if (!isW(w.x, w.y-1)) { ctx.beginPath(); ctx.moveTo(x+1, y+2); ctx.lineTo(x+cell-1, y+2); ctx.stroke(); }
    if (!isW(w.x, w.y+1)) { ctx.beginPath(); ctx.moveTo(x+1, y+cell-2); ctx.lineTo(x+cell-1, y+cell-2); ctx.stroke(); }
  });
  ctx.restore();
}

function applyPurpleEffect(){
  // 50% teleport, 50% flip (horiz or vert), only if solvable
  if (Math.random()<0.5){
    const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    const d = dirs[Math.floor(Math.random()*dirs.length)];
    const seg = computeSegmentFrom(player.x, player.y, d);
    if (seg.length){
      const dest = seg[Math.floor(Math.random()*seg.length)];
      player.x = dest.x; player.y = dest.y;
      spawnBurst(player.x, player.y, '#b86bff', 12);
      tip('Purple warp!');
    }
  } else {
    const horiz = Math.random()<0.5;
    const snapshot = JSON.stringify({player, door, walls, reds, blues, green, oranges, purples});
    const mirror = (p)=> horiz ? {x: gridW-1-p.x, y: p.y} : {x: p.x, y: gridH-1-p.y};
    const mapArr = (arr)=> arr.map(a=> mirror(a));
    const np = mirror(player), nd = mirror(door);
    const nw = mapArr(walls), nr = mapArr(reds), nb = mapArr(blues), ng = green?mirror(green):null, no = mapArr(oranges), npu = mapArr(purples);
    // apply
    player=np; door=nd; walls=nw; reds=nr; blues=nb; green=ng; oranges=no; purples=npu;
    // validate solvable (ignoring ghosts)
    if (!slideSolvable(walls, !doorUnlocked, green||null)) {
      // revert if not solvable
      const s = JSON.parse(snapshot);
      player=s.player; door=s.door; walls=s.walls; reds=s.reds; blues=s.blues; green=s.green; oranges=s.oranges; purples=s.purples;
    } else {
      tip('Reality flipped!');
      spawnBurst(player.x, player.y, '#b86bff', 14);
    }
  }
}

function triggerBatSpell(sx,sy){
  if (!reds.length){ tip('Bat found no red ghosts.'); spawnBurst(sx,sy,'#d8d8d8',10); return; }
  // nearest red by manhattan
  let best=null, bd=1e9, idx=-1; reds.forEach((r,i)=>{ const d=Math.abs(r.x-sx)+Math.abs(r.y-sy); if(d<bd){ bd=d; best=r; idx=i; } });
  flyingBat = { sx, sy, tx: best.x, ty: best.y, t: 0, idx };
  tip('Bat launched!');
}
function collectKeyNow(){
  if (!green) return;
  pickupSfx(); powerTime = Math.max(powerTime, 6); doorUnlocked=true; spawnBurst(green.x, green.y, '#82ff8a', 14); green=null; tip('DEV: Key auto-collected.');
}

function drawFlyingBat(){
  const fb = flyingBat; if (!fb) return;
  fb.t = Math.min(1, fb.t + 0.08);
  const x = fb.sx + (fb.tx - fb.sx)*fb.t, y = fb.sy + (fb.ty - fb.sy)*fb.t;
  const offX=Math.floor((canvas.width-gridW*cell)/2), offY=Math.floor((canvas.height-gridH*cell)/2);
  const size=cell*0.6, px=offX+x*cell+cell/2, py=offY+y*cell+cell/2;
  ctx.save(); ctx.translate(px,py); ctx.rotate(Math.atan2(fb.ty-fb.sy, fb.tx-fb.sx)); ctx.fillStyle='#000';
  ctx.beginPath(); ctx.moveTo(-size*0.5,0); ctx.lineTo(0,-size*0.25); ctx.lineTo(size*0.5,0); ctx.lineTo(0,size*0.25); ctx.closePath(); ctx.fill();
  // eyes
  ctx.fillStyle='#fff'; const er=Math.max(2, size*0.08);
  ctx.beginPath(); ctx.arc(-size*0.12,-size*0.04,er,0,Math.PI*2); ctx.arc(size*0.12,-size*0.04,er,0,Math.PI*2); ctx.fill();
  ctx.restore();
  spawnDust(); // cheap trail
  if (fb.t>=1){
    const target = reds[fb.idx];
    if (target){ spawnBurst(target.x,target.y,'#ff7373',18); removeAt(reds,target.x,target.y); tip('Bat destroyed a red ghost!'); }
    flyingBat=null;
  }
}

function triggerBeacon(){
  if (dev.antiCrimson){ tip('Crimson Beacon disabled (DEV).'); return; }
  if (!walls.length){ tip('Beacon fizzles... no walls to convert.'); return; }
  const count = Math.max(1, Math.floor(walls.length*0.25));
  const pool = walls.slice(); shuffleArray(pool);
  let converted=0;
  for (let i=0;i<pool.length && converted<count;i++){
    const w = pool[i];
    if ((w.x===player.x&&w.y===player.y) || (w.x===door.x&&w.y===door.y)) continue;
    if (reds.some(r=>r.x===w.x&&r.y===w.y)) continue;
    reds.push({x:w.x,y:w.y});
    removeAt(walls,w.x,w.y);
    spawnBurst(w.x,w.y,'#ff7373',8);
    converted++;
  }
  tip(`Crimson Beacon: ${converted} walls became red ghosts!`);
}

function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } }

function maybeShowAdvancedTutorial(force=false){
  if (_skipPopups && !force) return;
  if (level !== 10 || localStorage.getItem('runner_tut_adv')==='1' || tutOverlay || advancedShown) return;
  advancedShown = true; try { localStorage.setItem('runner_tut_adv','1'); } catch {}
  const basics = [
    ()=>{ const wrap=document.createElement('div'); wrap.innerHTML='<div><b>You</b> — the white cube. Slide with Arrow Keys/WASD. HUD (top‑left) shows Level / Score / High / Power.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=260; cv.style.display='block'; cv.style.margin='12px auto'; renderPlayerPreview(cv); wrap.appendChild(cv); return wrap; },
    ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Walls</b> — dark gray tiles with bright edges. They stop your slide.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=180; cv.style.display='block'; cv.style.margin='12px auto'; renderWallPreview(cv); w.appendChild(cv); return w; },
    ()=>{ const r=document.createElement('div'); r.innerHTML='<div><b>Red ghosts</b> — touching one ends your run instantly.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=260; cv.style.display='block'; cv.style.margin='12px auto'; renderGhostPreview(cv,'#ff7373'); r.appendChild(cv); return r; },
    ()=>{ const b=document.createElement('div'); b.innerHTML='<div><b>Blue ghosts</b> — SAFE: they won\'t kill you, but you <i>cannot</i> move through them. They wander and can pass through walls and other ghosts.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=260; cv.style.display='block'; cv.style.margin='12px auto'; renderGhostPreview(cv,'#6bb7ff'); b.appendChild(cv); return b; },
    ()=>{ const kd=document.createElement('div'); kd.innerHTML='<div><b>Key & Locked Door</b> — if the door glows dim/locked, grab the KEY to unlock it. Bonus: picking up the KEY stuns <b>Blue ghosts</b> so you can slide through them for <b>6.0 seconds</b>.</div>'; const cv=document.createElement('canvas'); cv.width=420; cv.height=200; cv.style.display='block'; cv.style.margin='12px auto'; renderKeyDoorPreview(cv); kd.appendChild(cv); return kd; }
  ];
  basics.push(importantNotePage);
  const adv = [
    ()=>{ const wrap=document.createElement('div'); wrap.innerHTML='<div><b>Purple ghost (rare)</b> — touching it causes a reality twist: either a short-range warp along a direction or a full horizontal/vertical flip. It only happens if the puzzle stays solvable.</div>'; const cv=document.createElement('canvas'); cv.width=240; cv.height=240; cv.style.display='block'; cv.style.margin='10px auto'; renderGhostPreview(cv,'#b86bff'); wrap.appendChild(cv); return wrap; },
    ()=>{ const wrap=document.createElement('div'); wrap.innerHTML='<div><b>Orange ghost (rare)</b> — triggers slow‑mo DRIFT: you may choose <b>one</b> mid‑slide turn; effect ends right after that turn.</div>'; const cv=document.createElement('canvas'); cv.width=240; cv.height=240; cv.style.display='block'; cv.style.margin='10px auto'; renderGhostPreview(cv,'#ff9b42'); wrap.appendChild(cv); return wrap; },
    ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Bat</b> — grabs a bat that immediately flies to the nearest <b>red ghost</b> and destroys it with a crash.</div>'; const cv=document.createElement('canvas'); cv.width=240; cv.height=160; cv.style.display='block'; cv.style.margin='10px auto'; renderBatPreview(cv); w.appendChild(cv); return w; },
    ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Crimson Beacon</b> — converts <b>25%</b> of walls into <b>red ghosts</b>. Use wisely!</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=160; cv.style.display='block'; cv.style.margin='10px auto'; renderBeaconPreview(cv); w.appendChild(cv); return w; }
  ];
  // unlock extra pages only after reaching L14/highscore 14
  const unlockedL14 = (level>=13 || highScore>=13);
  if (unlockedL14){
    adv.push(
      ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Bat</b> — flies to the nearest <b>red ghost</b> and destroys it.</div>'; const cv=document.createElement('canvas'); cv.width=220; cv.height=140; cv.style.display='block'; cv.style.margin='8px auto'; renderBatPreview(cv); w.appendChild(cv); return w; },
      ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Crimson Beacon</b> — transforms <b>25%</b> of walls into <b>red ghosts</b>.</div>'; const cv=document.createElement('canvas'); cv.width=220; cv.height=140; cv.style.display='block'; cv.style.margin='8px auto'; renderBeaconPreview(cv); w.appendChild(cv); return w; }
    );
  }
  showPager({ basics, advanced: adv }, 'runner_tut_adv', 'Got it', true, 'advanced');
}

function maybeShowIntroTutorialV2(force=false){
  if (_skipPopups && !force) { running = true; moveLock=false; raf=requestAnimationFrame(loop); return; }
  const pages = [
    ()=>{ const wrap=document.createElement('div'); wrap.innerHTML='<div><b>You</b> — the white cube. Slide with Arrow Keys/WASD. HUD (top‑left) shows Level / Score / High / Power.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=260; cv.style.display='block'; cv.style.margin='12px auto'; renderPlayerPreview(cv); wrap.appendChild(cv); return wrap; },
    ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Walls</b> — dark gray tiles with bright edges. They stop your slide.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=180; cv.style.display='block'; cv.style.margin='12px auto'; renderWallPreview(cv); w.appendChild(cv); return w; },
    ()=>{ const r=document.createElement('div'); r.innerHTML='<div><b>Red ghosts</b> — touching one ends your run instantly.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=260; cv.style.display='block'; cv.style.margin='12px auto'; renderGhostPreview(cv,'#ff7373'); r.appendChild(cv); return r; },
    ()=>{ const b=document.createElement('div'); b.innerHTML='<div><b>Blue ghosts</b> — SAFE: they won\'t kill you, but you <i>cannot</i> move through them. They wander and can pass through walls and other ghosts.</div>'; const cv=document.createElement('canvas'); cv.width=260; cv.height=260; cv.style.display='block'; cv.style.margin='12px auto'; renderGhostPreview(cv,'#6bb7ff'); b.appendChild(cv); return b; },
    ()=>{ const kd=document.createElement('div'); kd.innerHTML='<div><b>Key & Locked Door</b> — if the door glows dim/locked, grab the KEY to unlock it. Bonus: picking up the KEY stuns <b>Blue ghosts</b> so you can slide through them for <b>6.0 seconds</b>.</div>'; const cv=document.createElement('canvas'); cv.width=420; cv.height=200; cv.style.display='block'; cv.style.margin='12px auto'; renderKeyDoorPreview(cv); kd.appendChild(cv); return kd; }
  ];
  pages.push(importantNotePage);
  const adv = [
    ()=>{ const wrap=document.createElement('div'); wrap.innerHTML='<div><b>Purple ghost (rare)</b> — touching it causes a reality twist: either a short-range warp along a direction or a full horizontal/vertical flip. It only happens if the puzzle stays solvable.</div>'; const cv=document.createElement('canvas'); cv.width=240; cv.height=240; cv.style.display='block'; cv.style.margin='10px auto'; renderGhostPreview(cv,'#b86bff'); wrap.appendChild(cv); return wrap; },
    ()=>{ const wrap=document.createElement('div'); wrap.innerHTML='<div><b>Orange ghost (rare)</b> — triggers slow‑mo DRIFT: you may choose <b>one</b> mid‑slide turn; effect ends right after that turn.</div>'; const cv=document.createElement('canvas'); cv.width=240; cv.height=240; cv.style.display='block'; cv.style.margin='10px auto'; renderGhostPreview(cv,'#ff9b42'); wrap.appendChild(cv); return wrap; }
  ];
  const unlockedL14 = (level>=13 || highScore>=13);
  if (unlockedL14){
    adv.push(
      ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Bat</b> — flies to the nearest <b>red ghost</b> and destroys it.</div>'; const cv=document.createElement('canvas'); cv.width=220; cv.height=140; cv.style.display='block'; cv.style.margin='8px auto'; renderBatPreview(cv); w.appendChild(cv); return w; },
      ()=>{ const w=document.createElement('div'); w.innerHTML='<div><b>Crimson Beacon</b> — transforms <b>25%</b> of walls into <b>red ghosts</b>.</div>'; const cv=document.createElement('canvas'); cv.width=220; cv.height=140; cv.style.display='block'; cv.style.margin='8px auto'; renderBeaconPreview(cv); w.appendChild(cv); return w; }
    );
  }
  showPager({ basics: pages, advanced: adv }, null, 'Start Run', true, 'basics');
}

function renderPlayerPreview(canvas){
  const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  c.save(); c.shadowColor='#ffffff'; c.shadowBlur=18; c.fillStyle='#fff';
  const s=Math.min(w,h)*0.6, x=(w-s)/2, y=(h-s)/2; c.fillRect(x,y,s,s); c.restore();
}

function renderWallPreview(canvas){
  const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height, s=Math.min(w*0.8,h*0.7);
  c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  const x=(w-s)/2, y=(h-s)/2;
  c.fillStyle='#151515'; c.fillRect(x,y,s,s);
  c.strokeStyle='#5a5a5a'; c.lineWidth=3; c.strokeRect(x+1.5,y+1.5,s-3,s-3);
  c.strokeStyle='#2a2a2a'; c.lineWidth=2; c.beginPath(); c.moveTo(x+4,y+6); c.lineTo(x+s-4,y+6); c.moveTo(x+4,y+s-6); c.lineTo(x+s-4,y+s-6); c.stroke();
}

function renderKeyDoorPreview(canvas){
  const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height; c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  const ks=h*0.7, kx=w*0.18-ks/2, ky=(h-ks)/2, r=ks*0.18;
  // key
  c.save(); c.shadowColor='#82ff8a'; c.shadowBlur=18; const g=c.createLinearGradient(0,ky,0,ky+ks); g.addColorStop(0,'#aaffc4'); g.addColorStop(1,'#2fff6d'); c.fillStyle=g;
  c.beginPath(); if(c.roundRect) c.roundRect(kx,ky,ks,ks,r); else { c.moveTo(kx+r,ky); c.arcTo(kx+ks,ky,kx+ks,ky+ks,r); c.arcTo(kx+ks,ky+ks,kx,ky+ks,r); c.arcTo(kx,ky+ks,kx,ky,r); c.arcTo(kx,ky,kx+ks,ky,r); }
  c.fill(); c.shadowBlur=0; c.lineWidth=3; c.strokeStyle='#1e6b34'; c.stroke(); c.fillStyle='#0a0a0a'; c.font=`${Math.floor(ks*0.28)}px "Space Mono"`; c.textAlign='center'; c.textBaseline='middle'; c.fillText('KEY', kx+ks/2, ky+ks/2+2); c.restore();
  // door (locked vs unlocked)
  const ds=ks, dx=w*0.62-ds/2, dy=ky;
  c.save(); c.shadowColor='#ffd84a'; c.shadowBlur=18; c.fillStyle='#ffd84a'; c.fillRect(dx,dy,ds,ds); c.restore();
  c.strokeStyle='#222'; c.lineWidth=4; c.beginPath(); c.arc(dx+ds*0.5,dy+ds*0.5,Math.min(12,ds*0.16),0,Math.PI*2); c.stroke();
}

const importantNotePage = ()=> {
  const w=document.createElement('div');
  w.innerHTML='<div><b>Note on Generation & Soft‑locks</b> — Levels are procedurally generated. Despite multiple safeguards, rare layouts can be unsolvable or lead to a soft‑lock (you can still slide, but no sequence can reach the key or door). If this occurs, restart the run: press R, then press R again to instantly reset to Level 1.</div>';
  const cv=document.createElement('canvas'); cv.width=420; cv.height=200; cv.style.display='block'; cv.style.margin='12px auto'; renderImportantNotePreview(cv); w.appendChild(cv); return w;
};

function showPager(sections, storageKey, finalLabel='Close', addSkip=false, startSection='basics'){
  running = false;
  tutOverlay = document.createElement('div');
  try { blip(520,0.10,'triangle',0.24); } catch {}
  tutOverlay.style.position='absolute'; tutOverlay.style.inset='0';
  tutOverlay.style.background='rgba(0,0,0,0.72)';
  tutOverlay.style.display='grid'; tutOverlay.style.placeItems='center'; tutOverlay.style.zIndex='7';
  const card = document.createElement('div');
  card.style.background='#0b0b0b'; card.style.color='#fff'; card.style.padding='24px';
  card.style.boxShadow='0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.12) inset, 0 6px 0 rgba(0,0,0,0.5)';
  card.style.fontFamily='"Space Mono", monospace'; card.style.maxWidth='820px'; card.style.width='min(92vw,820px)';
  card.style.position='relative';
  // tabs
  const tabs = document.createElement('div'); tabs.style.display='flex'; tabs.style.gap='8px'; tabs.style.marginBottom='12px';
  const tb = document.createElement('button'); tb.textContent='Basics (1–9)';
  const ta = document.createElement('button'); ta.textContent='Advanced (10–19)';
  [tb,ta].forEach(b=>{ b.style.fontFamily='"Space Mono", monospace'; b.style.background='transparent'; b.style.color='#fff'; b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='8px 12px'; b.style.boxShadow='0 0 0 4px #000 inset'; b.style.fontSize='14px'; b.onmouseenter=()=>{ b.style.background='rgba(255,255,255,0.06)'; blip(620,0.05,'square',0.18); }; b.onmouseleave=()=>{ b.style.background='transparent'; }; });
  const basics = sections.basics||[], advanced = sections.advanced||[]; const advUnlocked = (level>=10 || highScore>=10) && advanced.length>0;
  const baseStart=0, advStart=basics.length; let pages = basics.concat(advUnlocked?advanced:[]);
  const text = document.createElement('div'); text.style.minHeight='120px'; text.style.fontSize='16px'; text.style.lineHeight='1.6'; text.style.marginBottom='16px';
  let i = (startSection==='advanced' && advUnlocked) ? advStart : 0;
  ta.disabled = !advUnlocked; ta.style.opacity = advUnlocked?1:0.5; ta.title = advUnlocked?'':'Reach Level 10 to unlock';
  if (!advUnlocked) { tabs.style.display = 'none'; }
  tb.onclick=()=>{ i=baseStart; update(); }; ta.onclick=()=>{ if(advUnlocked){ i=advStart; update(); } };
  card.appendChild(tabs); tabs.appendChild(tb); tabs.appendChild(ta);
  const nav = document.createElement('div'); nav.style.display='flex'; nav.style.justifyContent='space-between';
  const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';
  const skip = addSkip ? document.createElement('button') : null; const next = document.createElement('button');
  if (skip){ skip.textContent='Skip How To Play'; skip.onclick=()=>{ if(storageKey){ try{ localStorage.setItem(storageKey,'1'); }catch{} } tutOverlay.remove(); tutOverlay=null; moveLock=false; running=true; raf=requestAnimationFrame(loop); }; }
  const back = document.createElement('button'); back.textContent='Back'; back.onclick=()=>{ if(i>0){ i--; update(); } };
  [next, skip].forEach(b=>{ if(!b) return; b.style.fontFamily='"Space Mono", monospace'; b.style.background='transparent'; b.style.color='#fff'; b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='10px 14px'; b.style.boxShadow='0 0 0 4px #000 inset'; b.style.fontSize='14px'; b.style.transition='transform 120ms ease, background-color 160ms ease'; b.onmouseenter=()=>{ b.style.background='rgba(255,255,255,0.06)'; blip(620,0.05,'square',0.18); }; b.onmouseleave=()=>{ b.style.background='transparent'; }; b.onmousedown=()=>{ b.style.transform='scale(0.98)'; }; b.onmouseup=()=>{ b.style.transform='scale(1)'; }; });
  [back].forEach(b=>{ b.style.fontFamily='"Space Mono", monospace'; b.style.background='transparent'; b.style.color='#fff'; b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='10px 14px'; b.style.boxShadow='0 0 0 4px #000 inset'; b.style.fontSize='14px'; b.style.transition='transform 120ms ease, background-color 160ms ease'; b.onmouseenter=()=>{ b.style.background='rgba(255,255,255,0.06)'; blip(620,0.05,'square',0.18); }; b.onmouseleave=()=>{ b.style.background='transparent'; }; b.onmousedown=()=>{ b.style.transform='scale(0.98)'; }; b.onmouseup=()=>{ b.style.transform='scale(1)'; }; });
  let update=()=>{ const p = pages[i]; text.innerHTML=''; const node = (typeof p==='function') ? p() : null; if(node) text.appendChild(node); else text.innerHTML = p; next.textContent=(i===pages.length-1)?finalLabel:'Next'; /* back.disabled = (i===0); */ const tabStart = (i < advStart) ? baseStart : advStart; back.style.display = (i > tabStart) ? 'inline-block' : 'none'; };
  next.onclick=()=>{ if(i<pages.length-1){ i++; update(); } else { if(storageKey){ localStorage.setItem(storageKey,'1'); } tutOverlay.remove(); tutOverlay=null; moveLock=false; running=true; raf=requestAnimationFrame(loop); } };
  if (skip) nav.appendChild(skip); right.appendChild(back); right.appendChild(next); nav.appendChild(right);
  card.appendChild(text); card.appendChild(nav); tutOverlay.appendChild(card); root.appendChild(tutOverlay); update();
}

function toggleDevMenu(){
  dev.unlocked = true;
  if (!devPanel) buildDevPanel();
  dev.show = !dev.show;
  devPanel.style.display = dev.show ? 'block' : 'none';
  if (dev.show){
    tip('DEV mode opened. High score will not be saved.');
  }
}
function buildDevPanel(){
  devPanel = document.createElement('div');
  devPanel.style.position='absolute'; devPanel.style.right='12px'; devPanel.style.top='64px';
  devPanel.style.zIndex='8'; devPanel.style.background='rgba(0,0,0,0.78)';
  devPanel.style.color='#fff'; devPanel.style.padding='12px'; devPanel.style.width='min(92vw, 320px)';
  devPanel.style.boxShadow='0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.12) inset';
  const mkToggle = (label, key)=> {
    const row = document.createElement('label'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.margin='4px 0';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = !!dev[key];
    cb.onchange=()=>{ dev[key]=cb.checked; dev.enabled = true; if (key==='autoKey' && dev.autoKey && green) collectKeyNow(); };
    const sp = document.createElement('span'); sp.textContent = label;
    row.appendChild(cb); row.appendChild(sp); return row;
  };
  const title = document.createElement('div'); title.textContent='DEV MENU (Alt+F8)'; title.style.fontWeight='700'; title.style.marginBottom='6px';
  const warn = document.createElement('div'); warn.style.color='#ffd84a'; warn.style.fontSize='12px'; warn.style.margin='4px 0 10px'; warn.textContent='Warning: DEV mode disables high score saving for this session.';
  const row1 = mkToggle('Anti RED (pass-through)', 'antiRed');
  const row2 = mkToggle('Anti BLUE (infinite pass)', 'antiBlue');
  const row3 = mkToggle('Noclip walls', 'noclip');
  const row4 = mkToggle('Auto-collect Key', 'autoKey');
  const row5 = mkToggle('Anti ORANGE', 'antiOrange');
  const row6 = mkToggle('Anti PURPLE', 'antiPurple');
  const row7 = mkToggle('Anti CRIMSON (beacon)', 'antiCrimson');
  const row8 = mkToggle('Show hitboxes', 'showHit');
  const row9 = mkToggle('Slow‑mo DRIFT (infinite)', 'slowDrift');
  const btns = document.createElement('div'); btns.style.display='flex'; btns.style.gap='8px'; btns.style.marginTop='8px';
  const bKey = document.createElement('button'); bKey.textContent='Collect Key'; bKey.onclick=()=>{ dev.enabled=true; collectKeyNow(); };
  const bNext = document.createElement('button'); bNext.textContent='Next Level'; bNext.onclick=()=>{ dev.enabled=true; genLevel(level+1); };
  [bKey,bNext].forEach(b=>{ b.style.fontFamily='"Space Mono", monospace'; b.style.background='transparent'; b.style.color='#fff'; b.style.border='2px solid rgba(255,255,255,0.25)'; b.style.padding='8px 10px'; b.style.boxShadow='0 0 0 4px #000 inset'; b.onmouseenter=()=>{ b.style.background='rgba(255,255,255,0.06)'; blip(620,0.05,'square',0.18); }; b.onmouseleave=()=>{ b.style.background='transparent'; }; });
  devCountsEl = document.createElement('pre'); devCountsEl.style.margin='8px 0 0'; devCountsEl.style.opacity='0.9'; devCountsEl.style.fontSize='12px';
  devCountsEl.textContent = debugCountsText();
  devPanel.appendChild(title); devPanel.appendChild(warn);
  [row1,row2,row3,row4,row5,row6,row7,row8,row9].forEach(r=> devPanel.appendChild(r));
  btns.appendChild(bKey); btns.appendChild(bNext); devPanel.appendChild(btns); devPanel.appendChild(devCountsEl);
  root.appendChild(devPanel);
}
function debugCountsText(){
  return `Debug:
walls ${walls.length}
blue ${blues.length}, red ${reds.length}
orange ${oranges.length}, purple ${purples.length}
bat ${bats.length}, beacon ${beacons.length}
key ${green?1:0}, doorLocked ${doorUnlocked?0:1}`;
}

function drawHitboxes(){
  const offX = Math.floor((canvas.width - gridW*cell)/2);
  const offY = Math.floor((canvas.height - gridH*cell)/2);
  const box = (x,y,c)=>{ ctx.strokeStyle=c; ctx.lineWidth=1; ctx.strokeRect(offX+x*cell+2, offY+y*cell+2, cell-4, cell-4); };
  walls.forEach(w=> box(w.x,w.y,'#555'));
  blues.forEach(b=> box(b.x,b.y,'#6bb7ff'));
  reds.forEach(r=> box(r.x,r.y,'#ff7373'));
  purples.forEach(p=> box(p.x,p.y,'#b86bff'));
  oranges.forEach(o=> box(o.x,o.y,'#ff9b42'));
  bats.forEach(b=> box(b.x,b.y,'#ddd'));
  beacons.forEach(b=> box(b.x,b.y,'#ff5a5a'));
  box(player.x, player.y, '#fff');
}

function openGameOptions(){
  showOverlay(`
    <div style="display:grid;gap:12px;min-width:260px;">
      <div style="font-weight:700;">Options</div>
      <label class="vol-row" style="color:#fff;">Main Menu Volume <span id="volv">...</span></label>
      <input id="gm-vol" type="range" min="0" max="100" step="1" />
      <label class="vol-row" style="display:flex;align-items:center;gap:8px;color:#fff;">
        <input id="gm-skip" type="checkbox" class="pixel-check" />
        <span>Auto-skip How To Play popups</span>
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="opt-reset">Reset Progress</button>
        <button id="opt-close">Back</button>
      </div>
    </div>
  `);
  styleOverlayButtons();
  const vol = overlay.querySelector('#gm-vol'), vv = overlay.querySelector('#volv'), sk = overlay.querySelector('#gm-skip');
  const sv = Math.max(0, Math.min(100, Number(localStorage.getItem('menu_volume')||'100')));
  vol.value = String(sv); vv.textContent = sv + '%';
  sk.checked = localStorage.getItem('runner_skip_htp') === '1';
  vol.oninput = ()=> { const v = Math.max(0, Math.min(100, Number(vol.value)||0)); vv.textContent = v+'%'; try{ localStorage.setItem('menu_volume', String(v)); }catch{} };
  sk.onchange = ()=> { try{ sk.checked ? localStorage.setItem('runner_skip_htp','1') : localStorage.removeItem('runner_skip_htp'); }catch{} };
  overlay.querySelector('#opt-close').onclick = ()=> { overlay.remove(); overlay=null; };
  overlay.querySelector('#opt-reset').onclick = ()=> confirmResetProgress();
}

function confirmResetProgress(){
  showOverlay(`
    <div style="display:grid;gap:10px;min-width:280px;">
      <div style="font-weight:700;">Type RESET MY HIGH to confirm</div>
      <input id="rst-in" type="text" placeholder="RESET MY HIGH" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="rst-ok">Confirm</button>
        <button id="rst-cancel">Cancel</button>
      </div>
    </div>
  `);
  styleOverlayButtons();
  const inp = overlay.querySelector('#rst-in');
  inp.className = 'pixel-input big';
  overlay.querySelector('#rst-ok').classList.add('pixel-btn-lg');
  inp.onpaste = (e)=> e.preventDefault(); inp.oncontextmenu = (e)=> e.preventDefault();
  overlay.querySelector('#rst-ok').onclick = ()=> {
    if (inp.value === 'RESET MY HIGH'){
      try { localStorage.removeItem('runner_highscore'); } catch {}
      highScore = 0; tip('Progress reset.'); draw();
      overlay.remove(); overlay=null;
    }
  };
  overlay.querySelector('#rst-cancel').onclick = ()=> { overlay.remove(); overlay=null; };
  inp.focus();
}
