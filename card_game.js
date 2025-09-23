// Simple, performant card duel with smooth fade-in and ghost progression
let root, overlay, ui, fxLayer, state, running = false, currentGhost = 0, tutorialSeen = false, bubbleTimer;
const ghosts = [
  { id: 'slime', name: 'Slime Ghost', hp: 18, color: '#9fffb1',
    curse: (s) => { // discard random card
      if (s.player.hand.length) {
        const i = Math.floor(Math.random() * s.player.hand.length);
        s.player.hand.splice(i,1);
        toast('Slime curse: You lose a card!', 'warn');
      }
    }
  },
  { id: 'whisper', name: 'Whispering Ghost', hp: 22, color: '#b1f0ff',
    curse: (s) => { s.flags.revealNext = true; toast('Whispers expose your next card...', 'info'); }
  },
  { id: 'shadow', name: 'Shadow Ghost', hp: 26, color: '#bda9ff',
    curse: (s) => { s.flags.nullifyHighest = true; toast('Shadow steals your strongest card...', 'warn'); }
  },
];

export async function initGame() {
  root = document.getElementById('game-root');
  root.innerHTML = '';
  root.hidden = false;

  // Fade-in overlay
  overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.background = '#000';
  overlay.style.opacity = '1';
  overlay.style.transition = 'opacity 420ms ease';
  root.appendChild(overlay);

  // UI container
  ui = document.createElement('div');
  ui.style.position = 'absolute';
  ui.style.inset = '0';
  ui.style.display = 'grid';
  ui.style.gridTemplateRows = 'auto 1fr auto';
  ui.style.padding = '16px';
  ui.style.color = '#9fffb1';
  ui.style.fontFamily = '"Press Start 2P", monospace';
  ui.style.imageRendering = 'pixelated';
  root.appendChild(ui);

  // create FX layer
  fxLayer = document.createElement('div');
  fxLayer.className = 'fx';
  root.appendChild(fxLayer);
  startBubbles();

  ui.appendChild(header());
  const board = document.createElement('div');
  board.style.display = 'grid';
  board.style.placeItems = 'center';
  board.style.gap = '10px';
  ui.appendChild(board);
  ui.appendChild(handBar());

  setupState();
  render(board);
  running = true;
  tutorialSeen = localStorage.getItem('tutorialSeen') === '1';
  if (!tutorialSeen) startTutorial();

  // smooth fade-in
  requestAnimationFrame(()=> overlay.style.opacity = '0');
  overlay.addEventListener('transitionend', () => { overlay.remove(); }, { once: true });
}

export function destroyGame() {
  running = false;
  clearInterval(bubbleTimer);
  if (root) root.innerHTML = '';
}

/* UI helpers */
function header() {
  const h = document.createElement('div');
  h.style.display = 'flex';
  h.style.justifyContent = 'space-between';
  h.style.alignItems = 'center';
  h.style.gap = '8px';

  const title = document.createElement('div');
  title.textContent = 'Abandoned School — Card Duel';
  title.style.fontSize = '12px';

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';

  const back = btn('Back', ()=> { dispatchSfx('back'); window.dispatchEvent(new CustomEvent('exit-game')); });
  const tip = document.createElement('div');
  tip.id = 'toast';
  tip.style.fontSize = '10px';
  tip.style.opacity = '0.9';

  const guide = btn('Guide', ()=> { dispatchSfx('hover'); openGuide(true); });
  right.appendChild(tip);
  right.appendChild(back);
  right.appendChild(guide);
  h.appendChild(title);
  h.appendChild(right);
  return h;
}

function handBar() {
  const bar = document.createElement('div');
  bar.id = 'hand';
  bar.style.display = 'flex';
  bar.style.justifyContent = 'center';
  bar.style.gap = '8px';
  bar.style.padding = '12px 0';
  const legend = document.createElement('div'); legend.className='legend';
  legend.innerHTML = '<span style="color:#ffb1b1">Attack</span><span style="color:#b1ffcf">Defense</span><span style="color:#9fffb1">Bless</span><span style="color:#bda9ff">Curse</span>';
  bar.appendChild(legend);
  return bar;
}

function btn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.fontFamily = '"Space Mono", monospace';
  b.style.padding = '10px 14px';
  b.style.background = 'transparent';
  b.style.border = '2px solid rgba(255,255,255,0.22)';
  b.style.color = '#9fffb1';
  b.style.boxShadow = '0 0 0 4px #000 inset';
  b.onmouseenter = ()=> dispatchSfx('hover');
  b.onclick = ()=> { dispatchSfx('click'); onClick?.(); };
  return b;
}

function toast(msg, kind='info') {
  const el = ui.querySelector('#toast');
  if (!el) return;
  el.textContent = msg;
  el.style.color = kind === 'warn' ? '#ffdca8' : '#9fffb1';
}

/* Game state */
function setupState() {
  currentGhost = Math.min(currentGhost, ghosts.length - 1);
  const g = ghosts[currentGhost];
  state = {
    round: 1,
    flags: { revealNext: false, nullifyHighest: false, nextWeak: 0 },
    busy: false,
    player: { hp: 30, block: 0, hand: [], deck: makeDeck(), discard: [] },
    ghost:  { hp: g.hp, block: 0, name: g.name, color: g.color, id: g.id },
    log: []
  };
  drawUpTo(state.player, 4);
  toast(`A ${g.name} appears...`, 'info');
}

function makeDeck() {
  const deck = [];
  // Attacks
  for (let i=0;i<6;i++) deck.push({ t:'ATK', v: 4 + (i%3)*2 });
  // Defense
  for (let i=0;i<4;i++) deck.push({ t:'DEF', v: 3 + (i%2)*2 });
  // Curse
  for (let i=0;i<3;i++) deck.push({ t:'CURSE', v: 1 });
  // Bless
  for (let i=0;i<3;i++) deck.push({ t:'BLESS', v: 4 });
  shuffle(deck);
  return deck;
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

function drawUpTo(p, n) {
  while (p.hand.length < n) {
    if (!p.deck.length) { p.deck = p.discard; p.discard = []; shuffle(p.deck); }
    if (!p.deck.length) break;
    p.hand.push(p.deck.pop());
  }
}

/* Rendering and turn flow */
function render(board) {
  board.innerHTML = '';
  const gCard = cardGhost();
  const logEl = document.createElement('div');
  logEl.style.fontSize = '10px';
  logEl.style.opacity = '0.9';
  logEl.textContent = `Round ${state.round} — You ${state.player.hp} | Block ${state.player.block}  —  ${state.ghost.name} ${state.ghost.hp} | Block ${state.ghost.block}`;
  board.appendChild(gCard);
  board.appendChild(logEl);

  const hand = ui.querySelector('#hand');
  hand.innerHTML = '';
  state.player.hand.forEach((c, idx) => {
    const b = cardButton(c, ()=> chooseCard(idx));
    if (state.flags.revealNext) { b.style.borderColor = 'rgba(255,255,255,0.45)'; }
    hand.appendChild(b);
  });
}

function labelCard(c) {
  switch(c.t) {
    case 'ATK': return `Attack ${c.v}`;
    case 'DEF': return `Defense ${c.v}`;
    case 'CURSE': return 'Curse';
    case 'BLESS': return `Bless +${c.v}`;
  }
  return 'Card';
}

function cardButton(c, onClick){
  const b = btn(labelCard(c), onClick);
  b.classList.add('card-btn');
  if (c.t==='ATK') b.classList.add('is-atk');
  if (c.t==='DEF') b.classList.add('is-def');
  if (c.t==='BLESS') b.classList.add('is-bless');
  if (c.t==='CURSE') b.classList.add('is-curse');
  return b;
}

function cardGhost() {
  const box = document.createElement('div');
  box.style.display = 'grid';
  box.style.placeItems = 'center';
  box.style.width = 'min(92vw, 560px)';
  box.style.height = '180px';
  box.style.boxShadow = '0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.08) inset';
  box.style.background = '#0a0f0a';

  const name = document.createElement('div');
  name.textContent = state.ghost.name;
  name.style.color = state.ghost.color;
  name.style.marginBottom = '8px';

  const hp = document.createElement('div');
  hp.textContent = `Spirit: ${state.ghost.hp}`;
  hp.style.fontSize = '12px';

  const tip = document.createElement('div');
  tip.style.fontSize = '10px';
  tip.style.opacity = '0.8';
  tip.textContent = 'Choose a card to play.';

  box.appendChild(name);
  box.appendChild(hp);
  box.appendChild(tip);
  return box;
}

function chooseCard(idx) {
  if (!running || state.busy) return;
  state.busy = true;
  dispatchSfx('playClickEcho');
  const c = state.player.hand.splice(idx,1)[0];
  animateCardPlay(c).then(()=> resolveTurn(c).then(()=> state.busy = false));
}

async function resolveTurn(pCard) {
  const gCard = pickGhostCard();
  // pre-reveal hint
  if (state.flags.revealNext) toast(`You revealed: ${labelCard(pCard)}`, 'info');
  // special flags
  if (state.flags.nullifyHighest && pCard.t === 'ATK' && pCard.v >= 6) {
    pCard = { t:'ATK', v: 0 }; toast('Shadow nullifies your strong attack!', 'warn');
  }
  let pAtk = 0, gAtk = 0;
  if (pCard.t === 'ATK') pAtk = pCard.v;
  if (pCard.t === 'DEF') state.player.block += pCard.v;
  if (pCard.t === 'BLESS') { state.player.hp = Math.min(30, state.player.hp + pCard.v); floatText(ui.children[1], `+${pCard.v}`, '#9fffb1'); flash('#1a3'); }
  if (pCard.t === 'CURSE') ghosts[curGhostIndex()].curse(state);
  state.player.discard.push(pCard);
  await delay(140);
  if (gCard.t === 'ATK') gAtk = gCard.v;
  if (gCard.t === 'DEF') state.ghost.block += gCard.v;
  if (gCard.t === 'HEX') { state.flags.nextWeak = 2; toast('A chilling hex weakens you...', 'warn'); flash('#531'); }
  await delay(120);
  if (state.flags.nextWeak && pAtk > 0) { const w = Math.min(state.flags.nextWeak, pAtk); pAtk -= w; state.flags.nextWeak -= w; }
  const dmgToGhost = Math.max(0, pAtk - state.ghost.block);
  state.ghost.block = Math.max(0, state.ghost.block - pAtk);
  const dmgToPlayer = Math.max(0, gAtk - state.player.block);
  state.player.block = Math.max(0, state.player.block - gAtk);
  state.ghost.hp -= dmgToGhost; state.player.hp -= dmgToPlayer;
  if (dmgToGhost > 0) { ghostHit(); floatText(ui.children[1], `-${dmgToGhost}`, '#ffb1b1'); flash('#611'); }
  if (dmgToPlayer > 0) { floatText(ui.children[1], `-${dmgToPlayer}`, '#ffb1b1'); }
  state.flags.revealNext = false;
  drawUpTo(state.player, 4);
  if (state.player.hp <= 0) return endBattle(false);
  if (state.ghost.hp <= 0) return endBattle(true);
  state.round++; render(ui.children[1]);
}

function pickGhostCard() {
  const g = state.ghost.hp;
  if (g < 8 && Math.random() < 0.5) return { t:'DEF', v: 4 };
  if (Math.random() < 0.6) return { t:'ATK', v: 3 + Math.floor(Math.random()*4) };
  if (Math.random() < 0.2) return { t:'HEX', v: 0 };
  return { t:'DEF', v: 3 };
}

function endBattle(win) {
  const board = ui.children[1];
  board.innerHTML = '';
  const msg = document.createElement('div');
  msg.style.textAlign = 'center';
  msg.style.display = 'grid';
  msg.style.gap = '12px';
  msg.innerHTML = win
    ? `<div style="color:#9fffb1">Ghost cleansed!</div>`
    : `<div style="color:#ffb1b1">You were overwhelmed...</div>`;
  const next = btn(win ? 'Continue' : 'Try Again', () => {
    if (win && currentGhost < ghosts.length - 1) {
      currentGhost++; setupState(); render(ui.children[1]);
    } else if (win) {
      msg.innerHTML = `<div style="color:#b6ff00">All spirits calmed. Thanks for playing!</div>`;
      const back = btn('Back to Menu', ()=> window.dispatchEvent(new CustomEvent('exit-game')));
      msg.appendChild(back);
    } else {
      setupState(); render(ui.children[1]);
    }
  });
  board.appendChild(msg);
  board.appendChild(next);
  if (win && !tutorialSeen) { tutorialSeen = true; try { localStorage.setItem('tutorialSeen','1'); } catch {} }
}

/* utils */
function dispatchSfx(type){ try { window.dispatchEvent(new CustomEvent('sfx', { detail: type })); } catch {} }
function curGhostIndex(){ return Math.max(0, Math.min(currentGhost, ghosts.length-1)); }

function animateCardPlay(card) {
  return new Promise(res => {
    const center = ui.children[1];
    const chip = document.createElement('div');
    chip.textContent = labelCard(card);
    chip.style.position = 'absolute';
    chip.style.left = '50%'; chip.style.top = '60%'; chip.style.transform = 'translate(-50%,-50%) scale(0.9)';
    chip.style.padding = '8px 12px';
    chip.style.fontFamily = '"Space Mono", monospace';
    chip.style.boxShadow = '0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.08) inset';
    chip.style.background = '#0d0d0d';
    chip.style.color = card.t==='ATK' ? '#ffb1b1' : card.t==='DEF' ? '#b1ffcf' : card.t==='BLESS' ? '#9fffb1' : '#bda9ff';
    fxLayer.appendChild(chip);
    chip.style.transition = 'transform 200ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease';
    requestAnimationFrame(()=> {
      chip.style.transform = 'translate(-50%,-62%) scale(1.0)';
      setTimeout(()=> { chip.style.opacity = '0'; setTimeout(()=> { chip.remove(); res(); }, 180); }, 180);
    });
  });
}

function ghostHit() {
  const board = ui.children[1].firstChild;
  if (!board) return;
  board.classList.add('ghost-hit');
  setTimeout(()=> board.classList.remove('ghost-hit'), 260);
}

function floatText(parent, txt, color='#fff') {
  const el = document.createElement('div');
  el.textContent = txt;
  el.style.position = 'absolute';
  el.style.left = '50%'; el.style.top = '40%';
  el.style.transform = 'translate(-50%,0)';
  el.style.color = color; el.style.fontFamily = '"Press Start 2P", monospace'; el.style.fontSize = '12px';
  el.style.animation = 'floatUp 520ms ease forwards';
  fxLayer.appendChild(el);
  setTimeout(()=> el.remove(), 560);
}

function flash(color='#fff') {
  const f = document.createElement('div');
  f.className = 'screen-flash show';
  f.style.color = color;
  fxLayer.appendChild(f);
  setTimeout(()=> f.remove(), 280);
}

const delay = (ms)=> new Promise(r=> setTimeout(r, ms));

function startTutorial() { openGuide(false); }

function startBubbles(){
  let count=0;
  bubbleTimer = setInterval(()=> {
    if (!running) return;
    if (fxLayer.childElementCount>80) return;
    const b = document.createElement('div');
    b.className='bubble';
    b.style.left = Math.random()*100 + '%';
    b.style.width = b.style.height = (4 + Math.floor(Math.random()*4)) + 'px';
    fxLayer.appendChild(b);
    b.addEventListener('animationend', ()=> b.remove(), { once:true });
    if (++count%7===0) { const b2=b.cloneNode(); b2.style.left = (Math.random()*100)+'%'; fxLayer.appendChild(b2); b2.addEventListener('animationend', ()=> b2.remove(), { once:true }); }
  }, 260);
}

function openGuide(full=true){
  const t = document.createElement('div');
  t.style.position='absolute'; t.style.inset='0'; t.style.zIndex='3';
  t.style.background='rgba(0,0,0,0.72)'; t.style.display='grid'; t.style.placeItems='center';
  const card = document.createElement('div');
  card.style.maxWidth='820px'; card.style.width='min(94vw, 820px)'; card.style.padding='16px';
  card.style.boxShadow='0 0 0 4px #000 inset, 0 0 0 8px rgba(255,255,255,0.12) inset';
  card.style.background='#0b0b0b'; card.style.fontFamily='"Press Start 2P", monospace'; card.style.color='#9fffb1';
  const steps = [
    'Goal: reduce the Ghost\'s Spirit to 0 before your HP hits 0.',
    'Turns: you play 1 card, ghost plays 1 card. Damage = Attack - Block.',
    'Cards: ' +
      '%ATK% deals damage. %DEF% adds Block. %BLESS% heals you. %CURSE% triggers ghost-specific effects.',
    'Ghosts: Slime forces a random discard. Whisper reveals your next play. Shadow nullifies strong Attacks.',
    'Advanced: some ghosts apply Hex (weakens next attack) or build Block—mix ATK and DEF to break through.',
    'Tips: keep a DEF for safety, use BLESS when low, CURSE to disrupt. Win to face tougher ghosts.'
  ];
  let i = 0;
  const text = document.createElement('div'); text.style.marginBottom='12px'; text.style.fontSize='12px';
  const fmt = s=> s.replace('%ATK%','<span style="color:#ffb1b1">Attack</span>')
                   .replace('%DEF%','<span style="color:#b1ffcf">Defense</span>')
                   .replace('%BLESS%','<span style="color:#9fffb1">Bless</span>')
                   .replace('%CURSE%','<span style="color:#bda9ff">Curse</span>');
  text.innerHTML = fmt(steps[i]);
  const legend = document.createElement('div'); legend.className='legend'; legend.style.margin='6px 0 10px';
  legend.innerHTML = '<span style="color:#ffb1b1">■ Attack</span><span style="color:#b1ffcf">■ Defense</span><span style="color:#9fffb1">■ Bless</span><span style="color:#bda9ff">■ Curse</span>';
  const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.justifyContent='flex-end';
  const skip = btn(full?'Close':'Skip', ()=> { try{localStorage.setItem('tutorialSeen','1')}catch{}; tutorialSeen=true; t.remove(); toast('Good luck!', 'info'); });
  const next = btn('Next', ()=> { i++; if (i>=steps.length){ try{localStorage.setItem('tutorialSeen','1')}catch{}; tutorialSeen=true; t.remove(); toast('Choose a card to begin.', 'info'); } else { text.innerHTML = fmt(steps[i]); } });
  row.appendChild(skip); row.appendChild(next);
  card.appendChild(text); card.appendChild(legend); card.appendChild(row); t.appendChild(card); root.appendChild(t);
}
