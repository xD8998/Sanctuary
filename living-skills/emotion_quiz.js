export function showEmotionQuizUI({ root, onCorrect, onWrong, timeLimitSec=null, level=1 }) {
  const EMO = [
    { name:'happy', color:'#ffd84a', why:'U-shaped smile and bright yellow tone suggest happiness.', mouth:'happy' },
    { name:'angry', color:'#ff4a4a', why:'Flat tense mouth and strong red tone indicate anger.', mouth:'flat' },
    { name:'sad', color:'#6bb7ff', why:'Downturned mouth and cool blue tone show sadness.', mouth:'sad' },
    { name:'mad', color:'#c12d2d', why:'Harsh straight mouth and deep red imply being mad.', mouth:'flat' },
    { name:'scared', color:'#b86bff', why:'Open round mouth and violet tone suggest fear.', mouth:'round' },
    { name:'distracted', color:'#9aa0a6', why:'Tilted mouth line and gray tone show distraction.', mouth:'tilt' },
    { name:'surprised', color:'#ffaaff', why:'Wide open round mouth and bright tone show surprise.', mouth:'round' },
    { name:'confused', color:'#a0ffa0', why:'Uneven mouth line and unsure look indicate confusion.', mouth:'tilt' },
    { name:'bored', color:'#cccccc', why:'Flat mouth and low energy color suggest boredom.', mouth:'flat' },
    { name:'disgusted', color:'#88cc66', why:'Curled flat mouth hints at disgust.', mouth:'flat' },
    { name:'excited', color:'#ffe066', why:'Upturned mouth and bright tone show excitement.', mouth:'happy' },
    { name:'calm', color:'#99e0ff', why:'Gentle flat mouth with cool tone shows calm.', mouth:'flat' },
    { name:'anxious', color:'#ff9966', why:'Tense flat mouth and warm tone suggest anxiety.', mouth:'flat' },
    { name:'tired', color:'#b0b0ff', why:'Droopy flat mouth and muted tone show tiredness.', mouth:'flat' },
    { name:'proud', color:'#ffd08a', why:'Slight smile and warm tone indicate pride.', mouth:'happy' },
  ];
  /* question pools */
  const PROBLEM = [
    {
      q: 'You have 3 tasks: homework, dishes, and exercise. What\'s the best first step?',
      choices: [
        'Do the shortest task to build momentum',
        'Do nothing and wait',
        'Scroll your phone for "motivation"',
        'Start all 3 at once'
      ],
      correct: 0,
      why: 'Starting with a small win builds momentum and makes the next task easier.'
    },
    {
      q: 'You missed a homework deadline. What\'s the best action now?',
      choices: [
        'Ignore it and hope it goes away',
        'Email your teacher and propose a new plan',
        'Blame a friend',
        'Lie about a technical issue'
      ],
      correct: 1,
      why: 'Taking responsibility and proposing a plan shows problem-solving and accountability.'
    },
    {
      q: 'You have a group project and teammates are unresponsive. What\'s the best step?',
      choices: [
        'Do nothing and hope they respond',
        'Message the group with clear tasks and a deadline',
        'Insult them in the chat',
        'Tell the teacher it\'s all their fault with no plan'
      ],
      correct: 1,
      why: 'Setting specific tasks and a deadline is proactive problem solving.'
    },
    {
      q: 'You failed a quiz. What\'s the best way to improve?',
      choices: [
        'Ask for feedback and schedule study time',
        'Forget about it',
        'Copy someone next time',
        'Complain to friends'
      ],
      correct: 0,
      why: 'Feedback plus a study plan turns a setback into learning.'
    },
    { q:'You\'re late to class and missed notes. Best step?', choices:['Ask a classmate or teacher for notes','Ignore it','Pretend you took them','Post online complaining'], correct:0, why:'Seeking notes proactively helps you catch up.' }
  ];
  const DECISION = [
    {
      q: 'Your friend wants to hang out, but you have an exam tomorrow. What should you do?',
      choices: [
        'Study first, then hang out briefly',
        'Hang out all night',
        'Cancel the exam',
        'Do neither and just worry'
      ],
      correct: 0,
      why: 'Prioritizing studying while balancing a short break is a healthy decision.'
    },
    {
      q: 'You feel overwhelmed during class. What\'s the best next step?',
      choices: [
        'Ask for a short break or help',
        'Keep it inside and struggle',
        'Leave without telling anyone',
        'Start an argument'
      ],
      correct: 0,
      why: 'Communicating and seeking support is effective decision-making.'
    },
    {
      q: 'You have limited time after school. Which plan is best?',
      choices: [
        'Prioritize the most urgent task, then the next',
        'Do random tasks as they come',
        'Only do fun tasks',
        'Procrastinate until late night'
      ],
      correct: 0,
      why: 'Prioritization helps you use limited time effectively.'
    },
    {
      q: 'A friend sends upsetting messages. What should you do?',
      choices: [
        'Set a boundary and talk when calm',
        'Respond with insults',
        'Share screenshots publicly',
        'Ignore your feelings entirely'
      ],
      correct: 0,
      why: 'Boundaries and calm communication support healthy decisions.'
    },
    { q:'You feel stressed before a test. What should you do?', choices:['Practice key topics and take a short break','Watch random videos','Cram all night without pause','Give up'], correct:0, why:'Balanced prep with brief rest improves focus.' }
  ];
  // new questions
  PROBLEM.push(
    { q:'You broke a household rule. What\'s the best action?', choices:['Own it and propose a fix','Hide it','Blame a sibling','Do nothing'], correct:0, why:'Owning mistakes and making a plan builds trust.' }
  );
  DECISION.push(
    { q:'You have limited money and need supplies. Best choice?', choices:['List essentials, buy only what\'s needed','Buy the most expensive items','Ignore the budget','Ask no one and guess'], correct:0, why:'Prioritizing essentials matches good decision-making.' }
  );
  const pickType = (() => {
    const pool = ['emotion', 'problem', 'decision'];
    return pool[Math.floor(Math.random()*pool.length)];
  })();

  const overlay = document.createElement('div');
  overlay.style.position='absolute'; overlay.style.inset='0'; overlay.style.background='rgba(255,255,255,0.92)';
  overlay.style.display='grid'; overlay.style.placeItems='center'; overlay.style.zIndex='9';
  const card = document.createElement('div');
  card.style.background='#fff'; card.style.color='#0a0a0a'; card.style.padding='22px';
  card.style.boxShadow='0 0 0 4px #000 inset, 0 6px 0 rgba(0,0,0,0.5)';
  card.style.fontFamily='\"Noto Sans\", system-ui, sans-serif'; card.style.width='min(92vw, 680px)';
  card.style.textAlign='center';
  /* header + timer */
  const title = document.createElement('div');
  title.style.fontWeight='800'; title.style.marginBottom='10px';
  const timerEl = document.createElement('div');
  timerEl.style.fontFamily='"Space Mono", monospace';
  timerEl.style.marginTop='6px'; timerEl.style.opacity='0.8';
  let timerInt = null, timerKill = null;

  const answers = document.createElement('div');
  answers.style.display='grid'; answers.style.gridTemplateColumns='repeat(auto-fit,minmax(140px,1fr))';
  answers.style.gap='8px'; answers.style.marginTop='8px';

  let correctAnswer = null, explanation = '';
  let cv = null;

  if (pickType === 'emotion') {
    const pick = EMO[Math.floor(Math.random()*EMO.length)];
    correctAnswer = pick.name;
    explanation = pick.why;
    title.textContent = 'Question: What is this face feeling?';
    cv = document.createElement('canvas'); cv.width=240; cv.height=240; cv.style.display='block'; cv.style.margin='8px auto 14px';
    drawFace(cv, pick);
    const count = Math.floor(Math.random()*4) + 3; // 3–6
    const others = EMO.filter(e=> e.name!==pick.name).map(e=> e.name);
    shuffle(others);
    const options = [pick.name, ...others.slice(0, Math.max(0, count-1))];
    shuffle(options);
    options.forEach(name=>{
      const b=mkBtn(name[0].toUpperCase()+name.slice(1), ()=> handleAnswer(name===pick.name));
      answers.appendChild(b);
    });
  } else {
    const pool = pickType==='problem' ? PROBLEM : DECISION;
    const q = pool[Math.floor(Math.random()*pool.length)];
    correctAnswer = String(q.correct);
    explanation = q.why;
    title.textContent = q.q;
    const arr = q.choices.map((txt,i)=>({ txt, i }));
    shuffle(arr);
    arr.forEach(({txt,i})=>{
      const b=mkBtn(txt, ()=> handleAnswer(String(i)===String(q.correct)));
      answers.appendChild(b);
    });
  }

  const msg = document.createElement('div'); msg.style.marginTop='12px'; msg.style.fontWeight='700';

  function mkBtn(label, onClick){
    const b=document.createElement('button'); b.textContent=label;
    b.style.fontFamily='\"Space Mono\", monospace'; b.style.background='transparent'; b.style.color='#0a0a0a';
    b.style.border='2px solid rgba(0,0,0,0.25)'; b.style.padding='10px 12px'; b.style.boxShadow='0 0 0 4px #000 inset';
    b.onclick=()=>{ disableAll(); onClick(); };
    return b;
  }
  function disableAll(){ answers.querySelectorAll('button').forEach(bb=> bb.disabled = true); }

  function handleAnswer(right){
    msg.textContent = right ? `Correct — ${explanation}` : `Wrong — ${explanation}`;
    card.appendChild(msg);
    clearTimers();
    if (right) {
      const cont = mkBtn('Continue', ()=>{ overlay.remove(); onCorrect?.(); });
      cont.style.marginTop='10px';
      card.appendChild(cont);
    } else {
      const row = document.createElement('div');
      row.style.display='flex'; row.style.gap='8px'; row.style.justifyContent='center'; row.style.marginTop='10px';
      const restart = mkBtn('Reset (Level 1)', ()=>{ overlay.remove(); onWrong?.('restart'); });
      const menu = mkBtn('Back to Menu', ()=>{ overlay.remove(); onWrong?.('menu'); });
      row.appendChild(restart); row.appendChild(menu); card.appendChild(row);
    }
  }

  function clearTimers(){
    if (timerInt) { clearInterval(timerInt); timerInt=null; }
    if (timerKill) { clearTimeout(timerKill); timerKill=null; }
  }

  if (timeLimitSec && timeLimitSec > 0) {
    let remain = timeLimitSec;
    timerEl.textContent = `Time: ${remain}s`;
    timerInt = setInterval(()=> { remain = Math.max(0, remain-1); timerEl.textContent = `Time: ${remain}s`; }, 1000);
    timerKill = setTimeout(()=> {
      disableAll(); clearTimers();
      msg.textContent = `Time's up — ${explanation}`;
      card.appendChild(msg);
      const row = document.createElement('div');
      row.style.display='flex'; row.style.gap='8px'; row.style.justifyContent='center'; row.style.marginTop='10px';
      const restart = mkBtn('Reset (Level 1)', ()=>{ overlay.remove(); onWrong?.('timeout'); onWrong?.('restart'); });
      const menu = mkBtn('Back to Menu', ()=>{ overlay.remove(); onWrong?.('timeout'); onWrong?.('menu'); });
      row.appendChild(restart); row.appendChild(menu); card.appendChild(row);
    }, timeLimitSec*1000);
  }

  card.appendChild(title);
  if (cv) card.appendChild(cv);
  card.appendChild(answers);
  if (timeLimitSec) card.appendChild(timerEl);
  overlay.appendChild(card); root.appendChild(overlay);
  return overlay;
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } }

function drawFace(canvas, emo) {
  const c = canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  c.clearRect(0,0,w,h);
  const r = Math.min(w,h)*0.35, x=w/2, y=h/2;
  c.save();
  c.globalAlpha=0.22; c.fillStyle=emo.color; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
  c.globalAlpha=0.95; c.fillStyle='#0a0a0a';
  const eyeR = Math.max(2, r*0.14), ex=r*0.38, ey=-r*0.18;
  c.beginPath(); c.arc(x-ex,y+ey,eyeR,0,Math.PI*2); c.arc(x+ex,y+ey,eyeR,0,Math.PI*2); c.fill();
  c.strokeStyle='#0a0a0a'; c.lineWidth=Math.max(2, r*0.12); c.beginPath();
  const mx=x, my=y+r*0.28, mw=r*0.6;
  switch(emo.mouth || emo.name){
    case 'happy': c.arc(mx,my,mw*0.6,0,Math.PI,false); break;
    case 'sad': c.arc(mx,my,mw*0.5,Math.PI,0,false); break;
    case 'flat':
    case 'angry':
    case 'mad': c.moveTo(mx-mw*0.5,my); c.lineTo(mx+mw*0.5,my); break;
    case 'round':
    case 'scared': c.arc(mx,my,mw*0.4,0,Math.PI*2,false); break;
    case 'tilt':
    case 'distracted':
      const sway = Math.sin(performance.now()*0.002)*mw*0.15;
      c.moveTo(mx-mw*0.5,my+sway); c.lineTo(mx+mw*0.5,my-sway); break;
    default: c.moveTo(mx-mw*0.5,my); c.lineTo(mx+mw*0.5,my); break;
  }
  c.stroke(); c.restore();
}