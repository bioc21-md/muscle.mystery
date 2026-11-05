/* Muscle Mystery · investigation lab
 * This file deliberately stays dependency-free. Sections: pure models, interface,
 * experiment clocks, evidence, narration, then the inline SVG art library.
 * Numerical pull values are classroom model units, NOT clinical measurements.
 */
const MuscleModel = Object.freeze({
  trial(supported, phase) {
    const p = Math.max(0, Math.min(6, Math.floor(Number(phase) || 0)));
    return { supported: Boolean(supported), phase: p,
      contracting: p >= 1 && (supported || p < 5),
      membrane: !supported && p >= 2 ? 'torn' : 'intact',
      calcium: !supported && p >= 3 ? 'excess' : 'balanced',
      mitochondria: !supported && p >= 4 ? 'injured' : 'working',
      replacement: !supported && p >= 6 };
  },
  tissue(working) {
    const n = Math.max(0, Math.min(12, Math.round(Number(working) || 0)));
    return { working: n, replacement: 12 - n, pull: n, total: 12 };
  },
  canOpen(view, evidence) {
    return view === 'support' ? Boolean(evidence.cell) : view === 'tissue' ? Boolean(evidence.support)
      : view === 'report' ? Boolean(evidence.tissue) : true;
  }
});
globalThis.MuscleModel = MuscleModel;

(() => {
  if (typeof document === 'undefined') return;
  // Kept in memory only: refreshing starts a new investigation, with no storage.
  const state = {
    view: 'intro', started: false, sound: false, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    cell: { tool: 'energy', running: false, contracted: false, gene: false, boundary: false },
    support: { supported: false, lens: 'membrane', phase: 0, maxPhase: 0, elapsed: 0, running: false, runId: 0, results: { present: null, missing: null }, flagged: null },
    tissue: { working: 6, running: false, result: null, saved: null },
    zoom: { context: 'intro', index: 0, furthest: 0 },
    evidence: { cell: null, support: null, tissue: null }, revealed: false
  };
  let main, audio, announcer, raf = 0, clockKind = '', clockOrigin = 0, lastPhase = -1;
  let audioToken = 0, currentClip = 'intro', activeClip = null, audioStatus = '', audioFailed = false;
  const phases = ['Ready to test', 'Both fibres contract', 'Membrane damage', 'Calcium overload', 'Mitochondrial injury', 'Fibre loss over time', 'Fat and scar tissue'];
  const supportedPhases = ['Ready to test', 'Both fibres contract', 'Membranes intact', 'Calcium balanced', 'Mitochondria working', 'Fibres recover', 'Both fibres remain intact'];
  const phaseCopy = [
    'Use the same contraction test. Change only the test fibre’s dystrophin support.',
    'Both fibres can contract. Dystrophin helps support the membrane during movement.',
    'Without working dystrophin, the membrane is more easily damaged. Small tears can form.',
    'Calcium is useful in the right amount. A damaged membrane can let too much enter.',
    'Too much calcium can injure the cell, including its mitochondria.',
    'Damage and repair repeat over time. Some fibres die when repair cannot keep up.',
    'Over time, lost fibres may be replaced by fat and scar tissue. These cannot pull like muscle.'
  ];
  const scaleNames = {person:'Adam',system:'Body system',organ:'Muscle organ',tissue:'Muscle tissue',cell:'Muscle cell'};
  const scaleCopy = {
    person: ['Meet Adam.', 'I’m 12. I love soccer. I have Duchenne muscular dystrophy, or DMD. Why are stairs getting harder, even when I try my best?'],
    system: ['Muscles and bones work together.', 'Muscles pull on bones through tendons. Together, muscles, bones and joints form the musculoskeletal system.'],
    organ: ['One skeletal muscle is an organ.', 'This thigh muscle contains muscle tissue, connective tissue, blood vessels and nerves. They work together to help move the leg.'],
    tissue: ['A tissue is a team of cells.', 'Many muscle fibres work together in muscle tissue. Each fibre contributes some of the pulling force.'],
    cell: ['One muscle fibre is one long cell.', 'Inside it, tiny protein filaments slide past each other. This makes the cell shorten — or contract.']
  };
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => LabArt.icon(name).replace('class="lab-icon"','class="lab-icon icon"');
  const button = (id,label,action,cls='',disabled=false,extra='') => `<button id="${id}" type="button" class="button ${cls}" data-action="${action}" ${disabled?'disabled':''} ${extra}>${label}</button>`;
  const chip = (id,label,action,active,extra='') => `<button id="${id}" type="button" class="chip" data-action="${action}" aria-pressed="${Boolean(active)}" ${extra}>${label}</button>`;
  const checked = yes => yes ? icon('check') : '<span aria-hidden="true">○</span>';
  function say(text) { announcer.textContent = text; }
  function clipForView() { return state.view==='intro'?'intro':state.view==='zoom'?(state.zoom.context==='tissue'?'tissue':'intro'):state.view==='cell'?(state.cell.tool==='gene'?'gene':state.cell.tool==='boundary'?'cell-parts':'cell-energy'):state.view==='support'?(state.support.maxPhase>=4&&!state.support.supported?'support-result':'support-intro'):state.view==='tissue'?'tissue':'closing'; }
  function narration() { return LAB_NARRATION[currentClip] || LAB_NARRATION.intro; }
  function setDialogue(text) { const node=document.querySelector('#adam-dialogue');if(node)node.textContent=text; }
  function evidenceList() {
    const entries=[];
    if(state.evidence.cell)entries.push('Cells use energy and DNA instructions to do their jobs.');
    if(state.evidence.support)entries.push('Same test. Missing support led to membrane damage.');
    if(state.tissue.saved)entries.push(`${state.tissue.saved.working} working fibres pulled less than 12 in our model.`);
    return entries.length ? `<ol>${entries.map(t=>`<li>${icon('check')}<span>${esc(t)}</span></li>`).join('')}</ol>` : '<p class="empty">Your discoveries will appear here. Start by exploring a cell.</p>';
  }
  function voicePanel() {
    return `<div class="voice-controls"><button type="button" id="voice-replay" class="text-button" data-action="voice-replay">${icon('sound')}<span>Replay voice</span></button><button type="button" id="voice-pause" class="text-button" data-action="voice-pause" hidden>Pause</button></div><p id="voice-status" class="voice-status" aria-live="polite">${esc(audioStatus)}</p><details class="transcript"><summary>Read the voice transcript</summary><p id="voice-transcript">${esc(narration().script)}</p></details>`;
  }
  function aside(dialogue) {
    return `<aside class="adam-panel" aria-label="Adam and your evidence"><div class="portrait">${LabArt.adam()}</div><h2 class="adam-label">Adam</h2><p id="adam-dialogue" class="speech">${dialogue}</p>${voicePanel()}<section class="evidence"><h2>Your evidence</h2><div id="evidence-list">${evidenceList()}</div><p class="evidence-count">${Object.values(state.evidence).filter(Boolean).length} of 3 investigations completed</p></section></aside>`;
  }
  function heading(title,description) { return `<div class="page-heading"><h1 id="view-title" tabindex="-1">${title}</h1><p>${description}</p></div>`; }
  function renderNav() {
    document.querySelector('#lab-nav').innerHTML = [['cell','Explore a cell'],['support','Test the support'],['tissue','Test a tissue']].map(([view,label],i)=>{
      const complete=Boolean(state.evidence[view]);const locked=!state.started||!MuscleModel.canOpen(view,state.evidence);
      return `<button id="nav-${view}" class="nav-stop ${complete?'done':''}" type="button" data-nav="${view}" ${locked?'disabled':''} ${state.view===view?'aria-current="step"':''} ${locked?`title="${i===0?'Start Adam’s investigation first':`Complete ${i===1?'Explore a cell':'Test the support'} to open this investigation`}"`:''}><span class="nav-number" aria-hidden="true">${complete?'✓':i+1}</span><span>${label}</span></button>`;
    }).join('');
    updateSoundControls();
    document.querySelector('#motion-toggle').setAttribute('aria-pressed',String(state.reduced));
    document.body.classList.toggle('reduce-motion',state.reduced);
  }
  function introView() {
    return `<section class="intro"><div class="intro-copy"><h1 id="view-title" tabindex="-1">A small change.<br><em>A muscle mystery.</em></h1><p class="lead">“I’m Adam. I’m 12, and I love soccer. But stairs are getting harder. Can you help me find out why?”</p><p class="subtext">Adam has Duchenne muscular dystrophy. Step inside a muscle, run your own experiments, and follow the evidence.</p><div class="intro-actions">${button('start-sound',icon('sound')+' Start with sound','start-sound','primary')}${button('start-quiet','Start quietly '+icon('arrow'),'start-quiet')}</div><p class="intro-footnote">Three investigations · About 15 minutes · No timer<br>Adam is fictional. Your progress stays here until you refresh.</p></div><div class="intro-art">${LabArt.adam({portrait:false})}</div></section>`;
  }
  function zoomOrder(){return state.zoom.context==='intro'?['person','system','organ','tissue','cell']:['cell','tissue','organ','system','person'];}
  function zoomView() {
    const order=zoomOrder(),level=order[state.zoom.index],copy=scaleCopy[level],last=state.zoom.index===4;
    const reverse=state.zoom.context==='tissue';
    const caption=reverse&&level==='person'?'When many fibres are lost, a muscle can produce less force. Lifting the body up a stair becomes harder — not because Adam isn’t trying.':copy[1];
    return heading(reverse?'From a cell back to Adam.':'Follow the mystery inside.',reverse?'Follow your tissue result through the body.':'Choose the next scale to take a closer look.')+`<div class="zoom-layout"><section><div class="zoom-path" aria-label="Scale of the investigation">${order.map((l,i)=>`<button id="scale-${l}" class="chip" data-action="scale" data-index="${i}" ${i>state.zoom.furthest?'disabled':''} ${i===state.zoom.index?'aria-current="step"':''}>${scaleNames[l]}</button>`).join('')}</div><div class="zoom-display">${LabArt.scale(level)}</div><div class="zoom-caption"><strong>${copy[0]}</strong><p>${caption}</p></div><div class="toolbar">${state.zoom.index>0?button('zoom-back',icon('back')+' Previous scale','zoom-back'):''}${button('zoom-forward',last?(reverse?'Review my evidence':'Open the cell lab')+' '+icon('arrow'):(reverse?'Zoom out':'Look closer')+' '+icon('zoom'),'zoom-forward','primary push')}</div></section>${aside(reverse?'One cell is small. Together, lots of cells help a whole muscle pull.':'Let’s start with my leg, then look closer and closer.')}</div>`;
  }
  // Investigation 1: observe a contraction, then compare gene instructions.
  function cellDone(){return state.cell.contracted&&state.cell.gene;}
  function cellView() {
    const c=state.cell;
    return heading('What makes a muscle move?','Explore a working muscle cell. Follow its energy, then read its instructions.')+`<div class="workspace"><section class="workbench"><div class="cell-tabs" role="group" aria-label="Cell investigation tools">${chip('tool-energy',icon('energy')+' Trace energy','cell-tool',c.tool==='energy','data-tool="energy"')}${chip('tool-boundary',icon('membrane')+' Explore the cell','cell-tool',c.tool==='boundary','data-tool="boundary"')}${chip('tool-gene',icon('search')+' Read instructions','cell-tool',c.tool==='gene','data-tool="gene"')}</div><div class="panel" style="margin-top:12px"><div id="cell-content">${cellContent()}</div></div><div class="toolbar">${button('run-cell',icon('play')+' Make the cell contract','run-cell','primary',c.running)}${c.tool!=='gene'?button('open-gene','Compare the instructions '+icon('arrow'),'cell-gene'):''}</div><div class="cell-badges"><span class="${c.contracted?'done':''}">${checked(c.contracted)}Contraction observed</span><span class="${c.gene?'done':''}">${checked(c.gene)}Instructions compared</span></div><p id="cell-help" class="help-line">${cellDone()?'Evidence collected. Now test what dystrophin does.':c.contracted?'Now compare the instructions inside the nucleus.':'Run a contraction to see how the cell’s parts work together.'}</p>${cellDone()?button('open-support','Investigate the missing support '+icon('arrow'),'open-support','accent investigation-link'):''}</section>${aside(c.tool==='gene'?'The instructions help explain why my cells have so little working dystrophin.':'A muscle is a team of cells. What does one cell need to do its job?')}</div>`;
  }
  function cellContent() {
    const c=state.cell;
    if(c.tool==='gene')return `<div class="gene-compare"><section class="gene-path"><h3>Working DMD instructions</h3><p>DNA inside the nucleus</p><div class="dna-strip" aria-hidden="true">${'<i></i>'.repeat(7)}</div><p class="instruction-arrow">The cell uses these instructions ↓</p><p class="protein-result">Working dystrophin</p></section><section class="gene-path"><h3>Changed DMD instructions</h3><p>A mutation is a change in DNA.</p><div class="dna-strip changed" aria-hidden="true">${'<i></i>'.repeat(7)}</div><p class="instruction-arrow">The change affects the protein ↓</p><p class="protein-result">Little or no working dystrophin</p></section></div><p class="gene-note">Dystrophin is a support protein just inside the membrane. The nucleus holds its instructions; the cell’s protein-making machinery uses them.</p><div class="cell-caption"><h2>Small instructions. Big effects.</h2><p>DMD begins with a change in a gene, not with a lack of effort. Next, investigate what happens without this support protein.</p></div>`;
    return `<div class="cell-display ${c.tool==='energy'?'energy-active':''}"><div class="cell-label-strip"><span class="nucleus-label">Nuclei: DNA instructions</span><span class="mito-label">Mitochondria: usable energy</span></div><div class="specimen ${c.running?'cell-contracting':''}">${LabArt.fibre({id:'cell',supported:true,phase:c.running?1:0,lens:c.tool==='energy'?'energy':'membrane'})}</div><div class="cell-label-strip"><span>Cytoplasm: reactions happen here</span><span>Membrane: controls entry and exit</span></div></div>${c.tool==='energy'?`<div class="energy-track"><b>Food</b>${icon('arrow')}<b>Mitochondria</b>${icon('arrow')}<b>Usable energy</b>${icon('arrow')}<b>Contraction</b></div>`:''}<div class="cell-caption"><h2>${c.tool==='energy'?'Energy makes work possible.':'One long cell, many working parts.'}</h2><p>${c.tool==='energy'?'Mitochondria release usable energy from food. Inside the cytoplasm, protein filaments slide past each other and the muscle cell shortens.':'The membrane controls what enters and leaves. Cytoplasm fills the cell around its organelles. The nuclei hold DNA instructions. A muscle fibre has many nuclei.'}</p></div>`;
  }
  // Investigation 2: receipts retain the conditions and run that produced them.
  function supportCanSave(){const s=state.support;return Boolean(s.results.present&&s.results.missing&&s.flagged&&s.flagged.runId===s.results.missing.runId);}
  function supportView() {
    const s=state.support;
    return heading('What protects a muscle cell?','Keep the test the same. Change the support.')+`<div class="workspace"><section class="workbench"><div class="panel"><div id="specimen-pair" class="specimen-pair"><section class="fibre-row"><h2 class="specimen-title"><b>Reference fibre · Support present</b><span>Same contraction test</span></h2><div id="reference-fibre" class="specimen"></div></section><section class="fibre-row"><h2 class="specimen-title"><b id="test-title">Test fibre · Support ${s.supported?'present':'missing'}</b><span>Simplified lab model</span></h2><div id="test-fibre" class="specimen"></div></section><div id="support-annotation" class="support-annotation" aria-live="off"></div></div><p class="model-note support-note">Simplified model. Damage builds over time, not after six real contractions. Changing support resets this model; it is not a treatment.</p><div class="control-row"><span class="control-label">View</span><div class="segmented" role="group" aria-label="Observation lens">${['membrane','calcium','energy'].map(l=>chip('lens-'+l,icon(l)+(l[0].toUpperCase()+l.slice(1)),'lens',s.lens===l,`data-lens="${l}"`)).join('')}</div><span class="divider" aria-hidden="true"></span><span class="control-label">Test support</span><div class="segmented" role="group" aria-label="Test fibre support">${chip('support-present','Present','condition',s.supported,`data-supported="true" ${s.running?'disabled':''}`)}${chip('support-missing','Missing','condition',!s.supported,`data-supported="false" ${s.running?'disabled':''}`)}</div></div></div><div class="toolbar">${button('run-support',icon('play')+' Run matched test','run-support','primary')}${button('reset-support',icon('replay')+' Reset trial','reset-support')}${button('save-support',icon('save')+(state.evidence.support?' Evidence saved':' Save comparison'),'save-support','accent push',!supportCanSave()||Boolean(state.evidence.support))}</div><div class="timeline"><label for="trial-time">Inspect the timeline</label><input type="range" id="trial-time" min="0" max="6" step="1" value="${s.phase}" aria-label="Inspect an observed phase" ${s.maxPhase===0?'disabled':''}><output id="phase-label" class="phase-label">${phases[s.phase]}</output></div><div id="trial-receipts" class="trial-receipts"></div><div id="tear-action"></div><p id="support-help" class="help-line"></p>${state.evidence.support?button('open-tissue','Test what happens to a whole tissue '+icon('arrow'),'open-tissue','accent investigation-link'):''}</section>${aside(s.maxPhase>=2?'Both fibres moved. Why did only one become damaged?':'Let’s give both fibres the same test. What changes when support is missing?')}</div>`;
  }
  function refreshSupport() {
    if(state.view!=='support')return;
    const s=state.support;
    document.querySelector('#reference-fibre').innerHTML=LabArt.fibre({id:'reference',supported:true,phase:s.phase,lens:s.lens});
    document.querySelector('#test-fibre').innerHTML=LabArt.fibre({id:'test',supported:s.supported,phase:s.phase,lens:s.lens});
    const canFlag=!s.supported&&s.phase>=2&&s.phase<=4&&s.results.missing?.runId===s.runId;
    if(canFlag)document.querySelector('#test-fibre').insertAdjacentHTML('beforeend',`<button type="button" id="tear-marker" class="tear-marker ${s.flagged?.runId===s.runId?'flagged':''}" data-action="flag-tear" aria-label="Flag the tear in the test fibre membrane">${s.flagged?.runId===s.runId?'✓':'+'}</button>`);
    document.querySelector('#specimen-pair').classList.toggle('is-running',s.running&&!state.reduced);
    const message=s.supported&&s.phase>0?'Both supported fibres contract and recover in this model. Their membranes stay intact.':phaseCopy[s.phase];
    document.querySelector('#support-annotation').innerHTML=icon(s.lens)+`<span>${message}</span>`;
    document.querySelector('#test-title').textContent=`Test fibre · Support ${s.supported?'present':'missing'}`;
    const run=document.querySelector('#run-support');run.innerHTML=icon(s.running?'pause':'play')+(s.running?' Pause test':s.elapsed>0&&s.elapsed<12000?' Resume test':s.maxPhase===6?' Run again':' Run matched test');
    for(const id of ['support-present','support-missing'])document.getElementById(id).disabled=s.running;
    const phaseLabel=(s.supported?supportedPhases:phases)[s.phase];
    const range=document.querySelector('#trial-time');range.value=s.phase;range.disabled=s.maxPhase===0;range.setAttribute('aria-valuetext',phaseLabel);
    document.querySelector('#phase-label').textContent=phaseLabel;
    document.querySelector('#trial-receipts').innerHTML=`<span class="${s.results.present?'done':''}">${checked(s.results.present)}Support present tested</span><span class="${s.results.missing?'done':''}">${checked(s.results.missing)}Support missing tested</span>`;
    const save=document.querySelector('#save-support');save.disabled=!supportCanSave()||Boolean(state.evidence.support);
    document.querySelector('#tear-action').innerHTML=canFlag?`<button id="flag-tear-button" class="text-button" data-action="flag-tear">${icon('search')}${s.flagged?.runId===s.runId?'Membrane tear flagged':'Flag the membrane tear'} (keyboard option)</button>`:!s.supported&&s.results.missing?.runId===s.runId?`<button id="inspect-tear" class="text-button" data-action="inspect-tear">${icon('search')}Look back at the membrane tear</button>`:'';
    document.querySelector('#support-help').textContent=state.evidence.support?'Comparison saved. Your evidence stays here when you reset or revisit.':!s.results.present||!s.results.missing?'Run a complete test with each support setting. Then look back and flag a tear.':!s.flagged?'Look back at the test without support. Flag the tear you observed.':'Save your comparison to take this evidence to the tissue lab.';
  }
  // Investigation 3: 12 fixed positions, equal load, arbitrary active-pull units.
  function tissueView() {
    const t=state.tissue, n=MuscleModel.tissue(t.working);
    return heading('How strong is a team of cells?','Build an equal-size tissue sample. Change how much of it can still contract.')+`<div class="workspace"><section class="workbench"><div class="panel"><div class="tissue-controls"><label for="working-fibres">Working fibres in your sample</label><input id="working-fibres" type="range" min="0" max="12" step="1" value="${t.working}" ${t.running?'disabled':''}><output id="working-count" for="working-fibres">${t.working} / 12</output></div><div class="tissue-pair"><section class="tissue-sample"><h3>Reference tissue</h3><p>12 working muscle fibres</p><div id="reference-tissue">${LabArt.tissue({working:12,id:'reference-tissue'})}</div><div id="reference-pull" class="pull-visual">${LabArt.pull({working:12,run:Boolean(t.result),id:'reference-pull'})}</div><div class="pull-value"><span>Model pull</span><strong id="reference-value">${t.result?'12':'—'} units</strong></div><div class="pull-track" aria-hidden="true"><span id="reference-bar" style="width:${t.result?100:0}%"></span></div></section><section class="tissue-sample"><h3>Your tissue</h3><p id="test-tissue-description">${n.working} working · ${n.replacement} replacement</p><div id="test-tissue">${LabArt.tissue({working:t.working,id:'test-tissue'})}</div><div id="test-pull" class="pull-visual">${LabArt.pull({working:t.working,run:Boolean(t.result),id:'test-pull'})}</div><div class="pull-value"><span>Model pull</span><strong id="test-value">${t.result?t.result.pull:'—'} units</strong></div><div class="pull-track" aria-hidden="true"><span id="test-bar" style="width:${t.result?t.result.pull/12*100:0}%"></span></div></section></div><div class="tissue-legend"><span><i class="legend-dot muscle"></i>Muscle fibre</span><span><i class="legend-dot fat"></i>Fat</span><span><i class="legend-dot scar"></i>Scar tissue</span></div><p class="model-note support-note">Same size. Same load. One working fibre = one model pull unit. Fat and scar tissue add no active muscle pull. These are not patient measurements.</p></div><div class="toolbar">${button('run-tissue',icon('play')+(t.running?' Testing…':' Compare their pull'),'run-tissue','primary',t.running)}${button('reset-tissue',icon('replay')+' Reset test','reset-tissue','',t.running)}</div><p id="tissue-result" class="notice" aria-live="polite">${t.result?(t.result.working===12?'Both samples contain 12 working fibres, so they pull equally. Try replacing some muscle.':`Your sample produced ${t.result.pull} model units; the reference produced 12. Fewer working fibres means less active pull.`):'Move the slider, then test both samples against the same load.'}</p>${t.saved?button('zoom-out','Follow this result back to Adam '+icon('zoom'),'zoom-out','accent investigation-link'):''}<p class="help-line">${t.saved?'You can test another mixture before zooming out.':'Compare the reference with a sample containing fewer than 12 working fibres.'}</p></section>${aside('One damaged cell doesn’t tell the whole story. What happens when many fibres are lost?')}</div>`;
  }
  function reportView() {
    const t=state.evidence.tissue;
    return `<section class="report-header"><h1 id="view-title" tabindex="-1">You followed the evidence.</h1><p>A change in one protein can affect a cell, a tissue, and the person using that muscle.</p></section><div class="report-evidence"><section class="report-piece">${LabArt.fibre({id:'report-cell',supported:true,phase:0})}<p class="small-label">Your cell observation</p><h2>Cells have working parts.</h2><p>You watched a muscle cell contract and compared its instructions for making dystrophin.</p></section><section class="report-piece">${LabArt.fibre({id:'report-support',supported:false,phase:3,lens:'calcium'})}<p class="small-label">Your matched support tests</p><h2>Missing support mattered.</h2><p>You tested both settings under the same conditions and flagged a tear in the unsupported membrane.</p></section><section class="report-piece">${LabArt.tissue({working:t.working,id:'report-tissue'})}<p class="small-label">Your tissue comparison</p><h2>${t.working} working fibres. Less pull.</h2><p>Your mixture produced ${t.pull} model units, compared with 12 from the reference. Replacement tissue could not make up that active pull.</p></section></div><section class="explain-box"><h2>Explain it to Adam.</h2><p>In one sentence, tell Adam or a partner why a missing support protein can make stairs harder. Use something you observed.</p>${button('reveal-explanation',state.revealed?'Explanation revealed':'Compare with our explanation','reveal-explanation','primary',state.revealed)}<div id="model-explanation" tabindex="-1" ${state.revealed?'':'hidden'}><div class="cause-chain">${['A change in DNA','Little or no working dystrophin','More muscle-fibre injury','Weaker muscle tissue','Movement becomes harder'].map(s=>`<span>${s}</span>`).join(icon('arrow'))}</div><p style="margin-top:16px">Without enough working dystrophin, muscle fibres are more easily injured. Over time, losing many fibres reduces a muscle’s pulling force. That can make stairs harder, even when Adam tries his best.</p></div></section>${state.revealed?`<div class="care-note"><section><h2>Adam is still Adam.</h2><p>He has interests, friendships and plans. DMD changes how his muscles work. It does not define everything about him.</p></section><section><h2>The research continues.</h2><p>There is no cure yet. Medicines, physiotherapy and care for the heart and breathing can help. Scientists are studying ways to protect muscle and restore working dystrophin.</p></section></div>`:''}<section class="report-voice" aria-label="Closing narration">${voicePanel()}</section><div class="toolbar">${button('return-lab','Keep exploring '+icon('arrow'),'return-lab')}${button('report-notes','Sources, models & credits','teacher')}</div><p class="help-line">The explanation is for you to compare with your own — your spoken answer is not recorded or automatically graded.</p>`;
  }
  function render(focusTitle=true) {
    const focusId=document.activeElement?.id;
    // Repainting an experiment must not change the transcript of the active voice.
    currentClip=activeClip||clipForView(); main.dataset.view=state.view;
    main.innerHTML=state.view==='intro'?introView():state.view==='zoom'?zoomView():state.view==='cell'?cellView():state.view==='support'?supportView():state.view==='tissue'?tissueView():reportView();
    renderNav();if(state.view==='support')refreshSupport();updateAudioUI();
    if(focusTitle){document.querySelector('#view-title')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
    else if(focusId){const el=document.getElementById(focusId);if(el&&!el.disabled)el.focus({preventScroll:true});}
  }
  // A single cancellable animation clock owns all timed experiments.
  function stopClock() { cancelAnimationFrame(raf);raf=0;clockKind='';state.support.running=false;state.cell.running=false;state.tissue.running=false; }
  function stopNarration() { audioToken++;audio.pause();audio.currentTime=0;activeClip=null;audioStatus='';audioFailed=false;updateAudioUI(); }
  function navigate(view) {
    if(!state.started&&view!=='intro')return;
    if(!MuscleModel.canOpen(view,state.evidence)){say('Finish the current investigation to unlock this lab.');return;}
    stopClock();stopNarration();state.view=view;render();
    if(state.sound&&view!=='intro')playNarration(currentClip);
  }
  function markCellEvidence() {
    if(cellDone())state.evidence.cell={contraction:true,instructions:true};
  }
  function runCell() {
    if(state.cell.running)return;
    stopClock();stopNarration();state.cell.tool='energy';state.cell.running=true;render(false);if(state.sound)playNarration('cell-energy');
    const finish=()=>{state.cell.running=false;state.cell.contracted=true;markCellEvidence();render(false);say('The cell shortened. Mitochondria supplied usable energy; filaments in the cytoplasm slid past each other.');document.querySelector('#run-cell')?.focus({preventScroll:true});};
    if(state.reduced){finish();return;}
    clockKind='cell';clockOrigin=performance.now();
    function tick(now){if(clockKind!=='cell')return;if(now-clockOrigin>=2400){raf=0;clockKind='';finish();}else raf=requestAnimationFrame(tick);}
    raf=requestAnimationFrame(tick);
  }
  function finishSupport() {
    const s=state.support;s.running=false;s.elapsed=12000;s.phase=6;s.maxPhase=6;
    s.results[s.supported?'present':'missing']={runId:s.runId,supported:s.supported,phase:6,model:MuscleModel.trial(s.supported,6)};
    clockKind='';raf=0;refreshSupport();
    setDialogue(s.supported?'With support present, both fibres handled this test. Now compare the missing-support setting.':'Damage builds over time. Look back through the timeline to inspect the membrane tear.');
    say(s.supported?'Supported trial complete. Both membranes stayed intact.':'Unsupported trial complete. Inspect the timeline to find and flag a membrane tear.');
    if(state.sound&&!s.supported)playNarration('support-result');
  }
  function runSupport() {
    const s=state.support;
    if(s.running){cancelAnimationFrame(raf);raf=0;clockKind='';s.running=false;refreshSupport();say('Test paused. Inspect the changes or resume.');return;}
    if(s.elapsed===0||s.elapsed>=12000){s.elapsed=0;s.phase=0;s.maxPhase=0;s.runId++;}
    if(state.reduced){finishSupport();return;}
    s.running=true;clockKind='support';clockOrigin=performance.now()-s.elapsed;lastPhase=-1;refreshSupport();
    function tick(now){if(clockKind!=='support')return;s.elapsed=Math.min(12000,now-clockOrigin);s.phase=Math.min(6,Math.floor(s.elapsed/2000));s.maxPhase=Math.max(s.maxPhase,s.phase);if(s.elapsed>=12000){finishSupport();return;}if(lastPhase!==s.phase){lastPhase=s.phase;refreshSupport();}raf=requestAnimationFrame(tick);}
    raf=requestAnimationFrame(tick);
  }
  function resetSupport(supported=state.support.supported) {
    stopClock();stopNarration();Object.assign(state.support,{supported,phase:0,maxPhase:0,elapsed:0});render(false);say('Fresh trial ready. Previously collected evidence is kept.');
  }
  function flagTear() {
    const s=state.support;
    if(s.supported||s.phase<2||s.phase>4||s.results.missing?.runId!==s.runId){say('Inspect a tear in a completed trial with support missing.');return;}
    s.flagged={runId:s.runId,supported:false,phase:s.phase};refreshSupport();say('Membrane tear flagged. This observation belongs to your trial with support missing.');
    document.querySelector('#flag-tear-button')?.focus({preventScroll:true});
  }
  function runTissue() {
    const t=state.tissue;if(t.running)return;stopClock();t.running=true;t.result=null;render(false);const tested=t.working;
    const finish=()=>{t.running=false;t.result=MuscleModel.tissue(tested);if(tested<12)t.saved={...t.result};render(false);say(`Comparison complete. Reference: 12 model units. Your tissue: ${tested} model units.`);document.querySelector('#run-tissue')?.focus({preventScroll:true});};
    if(state.reduced){finish();return;}clockKind='tissue';clockOrigin=performance.now();
    function tick(now){if(clockKind!=='tissue')return;if(now-clockOrigin>=1000){raf=0;clockKind='';finish();}else raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);
  }
  // Audio is optional and always local. No provider credential or API belongs here.
  function updateSoundControls(){const b=document.querySelector('#sound-toggle');b.innerHTML=icon(state.sound?'sound':'mute')+(state.sound?'Sound on':'Sound off');b.setAttribute('aria-pressed',String(state.sound));}
  function updateAudioUI() {
    const status=document.querySelector('#voice-status');if(status)status.textContent=audioStatus;
    const pause=document.querySelector('#voice-pause');if(pause){pause.hidden=!state.sound||!audio.src||audio.ended||audioFailed;pause.textContent=audio.paused?'Resume voice':'Pause voice';}
    const transcript=document.querySelector('#voice-transcript');if(transcript)transcript.textContent=narration().script;
  }
  async function playNarration(id,restart=true) {
    if(!state.sound)return;const clip=LAB_NARRATION[id];if(!clip)return;
    const token=++audioToken;audio.pause();currentClip=id;activeClip=id;audioFailed=false;
    if(restart||!audio.src.endsWith('/'+clip.filename)){audio.src='./assets/audio/'+clip.filename;audio.currentTime=0;}
    audioStatus='Loading voice…';updateAudioUI();
    try {await audio.play();if(token!==audioToken)return;audioStatus='Voice playing';updateAudioUI();}
    catch(e){if(token!==audioToken)return;audioFailed=true;audioStatus='Voice is unavailable. Keep exploring with the captions.';updateAudioUI();}
  }
  function showTeacher(){stopClock();stopNarration();if(state.view==='support')refreshSupport();else if(state.view==='cell'||state.view==='tissue')render(false);const d=document.querySelector('#teacher-dialog');if(!d.open)d.showModal();}
  function teacherNotes(){return `<section class="teacher-section"><p>A roughly 15-minute, guided investigation for Grade 7–8. Students change model conditions, compare results and use their evidence to explain Adam’s experience. Adam is a fictional 12-year-old with an established DMD diagnosis.</p></section><section class="teacher-section"><h3>Curriculum and evidence of learning</h3><table class="teacher-table"><thead><tr><th>Connection</th><th>Where the student demonstrates it</th></tr></thead><tbody><tr><th>Cell components</th><td>Explore a cell: nucleus and DNA instructions, membrane entry/exit, mitochondria and usable energy, cytoplasm and reactions. Addresses the assignment’s selected animal-cell components within Grade 8 B2.2, not the entire plant-and-animal-cell expectation.</td></tr><tr><th>Levels of organization</th><td>The zoom journey connects one muscle cell with tissue, a skeletal muscle organ containing several tissues, and the musculoskeletal system. Grade 8 B2.6.</td></tr><tr><th>Scientific investigation</th><td>Run matched support tests, vary working fibres in an equal-size tissue sample, inspect outcomes, and explain a claim using evidence.</td></tr></tbody></table></section><section class="teacher-section"><h3>What the models simplify</h3><ul><li>Muscular dystrophy is a group of conditions. This experience focuses on Duchenne: a DMD gene variant leads to little or no functional dystrophin.</li><li>Dystrophin is inside the membrane, linking the internal cytoskeleton to a membrane protein complex. It helps stabilize the fibre; it does not power contraction.</li><li>Calcium is normally useful for contraction and other cell functions. Membrane tears illustrate one route to excessive calcium; DMD has other interacting injury mechanisms.</li><li>Animation phases compress a complex process over time. Six phases do not mean six real contractions cause cell death. Supported fibres remaining intact here does not mean healthy cells cannot be injured.</li><li>The support switch changes a fresh classroom model. It does not repair Adam or represent a treatment. This is not exercise advice.</li><li>The 12-position tissue comparison uses one arbitrary pull unit per working fibre. Fat and scar tissue contribute no active muscle contraction. Real muscles have more complex mechanics and repair; these are not patient measurements or predictions.</li><li>The DNA strips are symbolic, not real sequences. The nucleus stores instructions; protein-making machinery elsewhere in the cell uses them.</li></ul></section><section class="teacher-section"><h3>Sources</h3><ul><li><a href="https://medlineplus.gov/genetics/condition/duchenne-and-becker-muscular-dystrophy/" target="_blank" rel="noopener noreferrer">MedlinePlus Genetics: Duchenne and Becker muscular dystrophy</a></li><li><a href="https://medlineplus.gov/genetics/gene/dmd/" target="_blank" rel="noopener noreferrer">MedlinePlus Genetics: the DMD gene and dystrophin</a></li><li><a href="https://doi.org/10.3390/ijms222011040" target="_blank" rel="noopener noreferrer">Zabłocka and colleagues (2021): disrupted calcium homeostasis in DMD</a></li><li><a href="https://www.nhs.uk/conditions/muscular-dystrophy/treatment/" target="_blank" rel="noopener noreferrer">NHS: muscular dystrophy treatment and care</a></li><li><a href="https://assets-us-01.kc-usercontent.com/fbd574c4-da36-0066-a0c5-849ffb2de96e/8ab9d77d-19ee-48b7-bc28-c3caa93c28eb/SciTech_G8_AODA.pdf" target="_blank" rel="noopener noreferrer">Ontario Science and Technology (2022): Grade 8 expectations</a></li></ul></section><section class="teacher-section"><h3>Credits and classroom use</h3><p>Created for BIOC21 by Mishal, Aman, Usman and Uzair, with AI-assisted development. Activities, scripts and SVG diagrams were prepared for this project; scientific explanations draw on the sources above. Adam’s prerecorded synthetic narration uses Fish Audio S2.1 Pro, based on a reference recording supplied with confirmed permission. Adam is fictional; this is generated dialogue, not a chatbot.</p><p>All activities and audio use local files. No account, tracking, cookies or saved personal data. Refreshing restarts progress. Only optional source links need the wider internet. Use quiet mode if students do not have headphones.</p><p>Suggested learning check: ask students to explain why missing dystrophin can affect climbing stairs, using one observation from each experiment. Completing the activity is not itself proof of understanding. Target-age classroom engagement has not yet been validated.</p></section>`;}
  // One delegated event router keeps native controls keyboard/touch accessible.
  function action(event) {
    const el=event.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action;
    if(a==='start-sound'||a==='start-quiet'){state.started=true;state.sound=a==='start-sound';state.zoom={context:'intro',index:0,furthest:0};state.view='zoom';render();if(state.sound)playNarration('intro');return;}
    if(a==='scale'){const n=Number(el.dataset.index);if(n<=state.zoom.furthest){state.zoom.index=n;render();}return;}
    if(a==='zoom-back'){state.zoom.index=Math.max(0,state.zoom.index-1);render();return;}
    if(a==='zoom-forward'){if(state.zoom.index<4){state.zoom.index++;state.zoom.furthest=Math.max(state.zoom.index,state.zoom.furthest);render();}else if(state.zoom.context==='intro')navigate('cell');else{state.evidence.tissue={...state.tissue.saved};navigate('report');}return;}
    if(a==='cell-tool'||a==='cell-gene'){stopClock();state.cell.tool=a==='cell-gene'?'gene':el.dataset.tool;if(state.cell.tool==='gene')state.cell.gene=true;if(state.cell.tool==='boundary')state.cell.boundary=true;markCellEvidence();stopNarration();render(false);if(state.sound)playNarration(clipForView());return;}
    if(a==='run-cell'){runCell();return;}
    if(a==='open-support'){navigate('support');return;}
    if(a==='lens'){state.support.lens=el.dataset.lens;for(const l of ['membrane','calcium','energy'])document.getElementById('lens-'+l).setAttribute('aria-pressed',String(l===state.support.lens));refreshSupport();return;}
    if(a==='condition'){resetSupport(el.dataset.supported==='true');return;}
    if(a==='run-support'){runSupport();return;}
    if(a==='reset-support'){resetSupport();return;}
    if(a==='inspect-tear'){state.support.phase=3;refreshSupport();document.querySelector('#tear-marker')?.focus();return;}
    if(a==='flag-tear'){flagTear();return;}
    if(a==='save-support'){if(!supportCanSave())return;state.evidence.support={present:{...state.support.results.present},missing:{...state.support.results.missing},tear:{...state.support.flagged}};render(false);say('Your comparison is saved. The tissue investigation is now open.');document.querySelector('#open-tissue')?.focus({preventScroll:true});return;}
    if(a==='open-tissue'){navigate('tissue');return;}
    if(a==='run-tissue'){runTissue();return;}
    if(a==='reset-tissue'){state.tissue.result=null;render(false);return;}
    if(a==='zoom-out'){stopClock();stopNarration();state.zoom={context:'tissue',index:0,furthest:0};state.view='zoom';render();return;}
    if(a==='reveal-explanation'){state.revealed=true;render(false);say('Compare your explanation with the model explanation.');document.querySelector('#model-explanation')?.focus({preventScroll:true});document.querySelector('#model-explanation')?.scrollIntoView({block:'nearest',behavior:state.reduced?'instant':'smooth'});return;}
    if(a==='return-lab'){navigate('support');return;}
    if(a==='teacher'){showTeacher();return;}
    if(a==='voice-replay'){if(!state.sound){state.sound=true;updateSoundControls();}playNarration(clipForView());return;}
    if(a==='voice-pause'){if(audio.paused)playNarration(currentClip,false);else{audioToken++;audio.pause();audioStatus='Voice paused';updateAudioUI();}return;}
  }
  function boot() {
    main=document.querySelector('#main');audio=document.querySelector('#narrator');announcer=document.querySelector('#announcer');
    document.querySelector('#teacher-content').innerHTML=teacherNotes();
    main.addEventListener('click',action);
    main.addEventListener('input',event=>{
      if(event.target.id==='trial-time'){const s=state.support;cancelAnimationFrame(raf);clockKind='';s.running=false;s.phase=Math.min(s.maxPhase,Number(event.target.value));refreshSupport();}
      if(event.target.id==='working-fibres'){
        state.tissue.working=MuscleModel.tissue(event.target.value).working;state.tissue.result=null;
        // Keep the native slider mounted while dragging or using its arrow keys.
        const n=MuscleModel.tissue(state.tissue.working);document.querySelector('#working-count').textContent=`${n.working} / 12`;
        document.querySelector('#test-tissue-description').textContent=`${n.working} working · ${n.replacement} replacement`;
        document.querySelector('#test-tissue').innerHTML=LabArt.tissue({working:n.working,id:'test-tissue'});
        document.querySelector('#test-pull').innerHTML=LabArt.pull({working:n.working,run:false,id:'test-pull'});
        document.querySelector('#reference-pull').innerHTML=LabArt.pull({working:12,run:false,id:'reference-pull'});
        for(const id of ['reference-value','test-value'])document.getElementById(id).textContent='— units';
        for(const id of ['reference-bar','test-bar'])document.getElementById(id).style.width='0%';
        document.querySelector('#tissue-result').textContent='New mixture ready. Test both samples against the same load.';
      }
    });
    document.querySelector('#lab-nav').addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b&&!b.disabled)navigate(b.dataset.nav);});
    document.querySelector('#home-button').addEventListener('click',()=>navigate('intro'));
    document.querySelector('#sound-toggle').addEventListener('click',()=>{state.sound=!state.sound;if(!state.sound)stopNarration();else playNarration(clipForView());updateSoundControls();});
    document.querySelector('#motion-toggle').addEventListener('click',()=>{state.reduced=!state.reduced;stopClock();render(false);say(state.reduced?'Reduced motion on. Experiments show static results you can inspect.':'Animations on.');});
    document.querySelector('#teacher-button').addEventListener('click',showTeacher);
    document.querySelector('#close-teacher').addEventListener('click',()=>document.querySelector('#teacher-dialog').close());
    audio.addEventListener('ended',()=>{audioStatus='Voice finished';updateAudioUI();});
    audio.addEventListener('error',()=>{audioFailed=true;audioStatus='Voice is unavailable. Keep exploring with the captions.';updateAudioUI();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){stopClock();audioToken++;if(!audio.paused)audioStatus='Voice paused';audio.pause();if(state.view==='support')refreshSupport();else if(state.view==='cell'||state.view==='tissue')render(false);updateAudioUI();}});
    render(false);
  }
  // Defer until the manifest and art declarations below have been evaluated too.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else queueMicrotask(boot);
})();

/* AUDIO_MANIFEST — fixed local narration, not a live AI connection. */
const LAB_NARRATION = {
  "intro": {
    "filename": "intro.mp3",
    "title": "Meet Adam",
    "caption": "Adam is curious about the science inside his muscles.",
    "script": "Hi, I'm Adam. I'm twelve, and I love soccer. I already know I have Duchenne muscular dystrophy, or DMD. I'm curious about what happens inside my muscles. Will you explore the clues with me?"
  },
  "cell-energy": {
    "filename": "cell-energy.mp3",
    "title": "Energy for a muscle pull",
    "caption": "Mitochondria help release usable energy from food.",
    "script": "Muscles need usable energy to contract. Inside a muscle cell, mitochondria help release that energy from food. Watch what happens when energy is available. In this model, the muscle cell pulls and becomes shorter when it contracts."
  },
  "cell-parts": {
    "filename": "cell-parts.mp3",
    "title": "A cell team",
    "caption": "Cell parts do different jobs and work together.",
    "script": "Each cell part has a job. The nucleus holds DNA instructions. The membrane controls what enters and leaves. Cytoplasm is the space where many reactions happen. Together, these parts help a muscle cell work."
  },
  "gene": {
    "filename": "gene.mp3",
    "title": "Instructions for support",
    "caption": "A change in the DMD gene affects dystrophin production.",
    "script": "My cells use DNA instructions to make proteins. A change in the DMD gene means they make little or no working dystrophin. Dystrophin normally helps support the muscle cell from inside, close to its membrane."
  },
  "support-intro": {
    "filename": "support-intro.mp3",
    "title": "Make a fair comparison",
    "caption": "Keep energy and contractions the same. Compare dystrophin support.",
    "script": "Let's compare two muscle cells. Both get the same energy and the same number of contractions. We change only their dystrophin support. Predict which membrane will be more likely to stay protected as the cells pull."
  },
  "support-result": {
    "filename": "support-result.mp3",
    "title": "Why damage can build up",
    "caption": "Missing support makes membrane damage more likely over time.",
    "script": "Both cells can contract at first. Without dystrophin's internal support, membrane damage is more likely. Too much calcium can enter and injure mitochondria. Over time, damaged muscle fibres can be lost. Our quick model speeds up that process."
  },
  "tissue": {
    "filename": "tissue.mp3",
    "title": "From cells to stairs",
    "caption": "Loss of working muscle fibres can weaken a whole muscle.",
    "script": "Muscle cells form tissue. Tissues make a muscle organ, which works in the musculoskeletal system. Fat and scar tissue cannot make an active muscle pull. When working fibres are lost, muscles weaken. That can make climbing stairs harder."
  },
  "closing": {
    "filename": "closing.mp3",
    "title": "Keep asking questions",
    "caption": "DMD is not a lack of effort. Care and research matter.",
    "script": "Now I understand how a change inside cells can affect movement. DMD isn't caused by a lack of effort. There isn't a cure yet, but care helps people live well, and research keeps moving forward. Thanks for investigating with me!"
  }
};

/* Muscle Mystery lab art. All functions return self-contained inline SVG strings.
 * API: adam({portrait,mood}), fibre({id,supported,phase,lens}),
 * tissue({working,id}), pull({working,run,id}), scale(level), icon(name).
 * Supply distinct `id` values when multiple fibre/tissue/pull views share a page.
 * Geometry is a simplified teaching model, not to scale. Only muscle fibres
 * generate active force. Dystrophin is INSIDE the membrane, linking the internal
 * cytoskeleton to a membrane protein complex. It does not cause contraction.
 * Tear targets, before the slight phase-1 contraction transform:
 * top = (0.641, 0.226), bottom = (0.781, 0.768), normalized to 800 × 190.
 * Phases 2–4 expose these targets with data-action="flag-tear". Parent supplies
 * keyboard equivalents, captions, labels, reduced-motion behavior and controls.
 */
const LabArt = (() => {
  const C = {
    ink: '#293817', olive: '#4B6129', lime: '#C0EC4E', limeDark: '#657E2E',
    coral: '#F28579', coralDeep: '#C85650', coralLight: '#FFB4A0',
    pink: '#F4B3C4', membrane: '#B64B71', purple: '#A06BC1', purpleDeep: '#744594',
    teal: '#38B7A6', tealLight: '#8DDED0', tealDeep: '#167A75',
    gold: '#FFC642', goldDeep: '#DD9213', cream: '#FFFDF6', scar: '#AA8CB9',
    skin: '#DDA079', skinShade: '#C88861', skinLine: '#714D39', hair: '#3E322C'
  };
  const esc = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const safeId = (id, fallback) => String(id).replace(/[^a-zA-Z0-9_-]/g, '') || fallback;
  const svg = (box, label, art, classes = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${esc(label)}" class="lab-art ${classes}" focusable="false">${art}</svg>`;
  const nucleus = (x, y, s = 1, angle = 0) => `<g class="nucleus" transform="translate(${x} ${y}) rotate(${angle}) scale(${s})"><ellipse rx="21" ry="7" fill="#D4A7E4" stroke="${C.membrane}" stroke-width="1.6"/><ellipse rx="15.5" ry="4.9" fill="${C.purple}"/><ellipse cx="1" cy=".4" rx="9" ry="3.2" fill="${C.purpleDeep}"/><path d="M-14-2 Q-3-6 9-3" fill="none" stroke="#E9C8F3" stroke-width="1.2" stroke-linecap="round"/></g>`;
  const mito = (x, y, s = 1, damaged = false, emphasis = false) => `<g class="mitochondrion${damaged ? ' is-injured' : ''}" transform="translate(${x} ${y}) rotate(-14) scale(${s})">${emphasis ? `<ellipse rx="36" ry="20" fill="none" stroke="${C.tealDeep}" stroke-width="1.2" stroke-dasharray="3 4" opacity=".5"/>` : ''}<ellipse rx="30" ry="15" fill="${damaged ? '#A8D3BE' : C.tealLight}" stroke="${C.tealDeep}" stroke-width="2.5"/><ellipse rx="25" ry="11" fill="${damaged ? '#72B5A6' : C.teal}"/><path d="${damaged ? 'M-20 0 Q-20-9-14-7 L-11 4 Q-9 10-4 4 L-5-5 Q-4-10 1-7 M7-5 L6 4 Q7 11 13 6 L14-3 Q15-8 20-3' : 'M-20 0 Q-21-8-15-7 Q-10-6-12 2 Q-13 9-7 7 Q-2 5-5-3 Q-7-10 0-7 Q6-5 3 3 Q2 10 8 7 Q13 5 10-3 Q9-9 16-6 Q22-3 19 3'}" fill="none" stroke="${C.tealDeep}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${damaged ? `<path d="M-12-14 L-7-8 M16 10 L21 5" stroke="#F9E4B1" stroke-width="2.6" stroke-linecap="round"/>` : ''}</g>`;
  const calcium = (x, y, r = 3.7, emphasis = false) => `<g class="calcium-dot" style="--calcium-entry-y:${y < 95 ? -24 : 24}px"><circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}" stroke="${C.goldDeep}" stroke-width="${emphasis ? 1.8 : 1.2}"/><circle cx="${x - r * .23}" cy="${y - r * .28}" r="${r * .38}" fill="#FFF1A3"/></g>`;
  const support = (x, y, lower = false) => `<g class="support-link" transform="translate(${x} ${y}) scale(1 ${lower ? -1 : 1})"><path d="M-5 0 H5" fill="none" stroke="${C.olive}" stroke-width="4.5" stroke-linecap="round"/><path d="M0 2 L-1 7 L1 11 L0 15 M-6 16 H6" fill="none" stroke="${C.limeDark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 2 L-1 7 L1 11 L0 15 M-6 16 H6" fill="none" stroke="${C.lime}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;

  function face(mood = 'curious') {
    const smile = mood === 'happy' || mood === 'confident';
    return `<g stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="-42" cy="8" rx="10" ry="13" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
      <ellipse cx="43" cy="7" rx="8" ry="12" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
      <path d="M-40-25 Q-34-52 4-50 Q41-48 44-18 L43 13 Q43 38 12 49 Q-15 52-33 32 Q-42 22-40-25Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2.3"/>
      <path d="M-40-2 Q-49-18-42-32 L-47-37 L-32-40 Q-43-47-28-50 L-17-58 L-5-56 L-1-63 Q10-63 17-54 Q35-59 43-42 Q52-36 48-19 L41-9 L35-31 Q24-17 10-20 L18-35 Q4-16-14-16 L-9-30 Q-24-17-33-8 L-33 12 L-42 7Z" fill="${C.hair}" stroke="#292722" stroke-width="2.5"/>
      <path d="M-33-39 Q-18-47-7-47 M-24-29 Q-9-35 0-45 M12-46 Q27-45 36-35" fill="none" stroke="#6B5343" stroke-width="3"/>
      <path d="M-24-6 Q-17-13-8-9 M15-11 Q23-17 31-12" fill="none" stroke="#4B3528" stroke-width="3"/>
      <ellipse cx="-15" cy="5" rx="8" ry="10" fill="#FFFDF0"/><ellipse cx="24" cy="1" rx="7.6" ry="10" fill="#FFFDF0"/>
      <ellipse cx="-12" cy="5" rx="4.8" ry="6.8" fill="#302B23"/><ellipse cx="27" cy="1" rx="4.7" ry="6.8" fill="#302B23"/>
      <circle cx="-10.5" cy="2.5" r="1.8" fill="white"/><circle cx="28.5" cy="-1.5" r="1.8" fill="white"/>
      <path d="M7 6 L5 16 Q9 20 14 16" fill="none" stroke="#B77750" stroke-width="2"/>
      <path d="M-35 9 Q-43 3-42 13" fill="none" stroke="#AD704E" stroke-width="2"/>
      <ellipse cx="-23" cy="23" rx="8" ry="3.5" fill="#D78E6B" opacity=".6"/>
      <path d="${smile ? 'M-6 29 Q9 35 28 25 Q24 43 10 42 Q0 41-6 29Z' : 'M-2 29 Q10 31 25 24 Q25 36 14 39 Q5 39-2 29Z'}" fill="#382D26" stroke="${C.skinLine}" stroke-width="1.6"/>
      <path d="M2 30 Q12 31 22 27 L21 31 Q12 35 5 33Z" fill="#FFF8E7"/>
    </g>`;
  }
  const ball = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="20" fill="#FFFDF3" stroke="#2C3829" stroke-width="2"/><path d="M-4-9 L7-7 L11 2 L3 10 L-7 5Z M-17-9 L-12-16 L-7-17 L-4-9 L-12-5Z M15-13 L19-5 L17 1 L11 2 L7-7Z M-16 11 L-9 17 L-1 20 L3 10 L-7 5 L-15 5Z M10 15 L8 18 L17 10 L18 5 L13 7Z" fill="#2C3829"/><path d="M-12-16 L0-20 L15-13 M-12-5 L-15 5 M17 1 L18 5 M3 10 L8 18" fill="none" stroke="#7E897A" stroke-width="1"/></g>`;

  function adam({ portrait = true, mood = 'curious' } = {}) {
    if (!portrait) return svg('0 0 360 400', 'Adam, a fictional 12-year-old with warm brown skin, dark hair and a green soccer shirt, standing beside a soccer ball.', `
      <ellipse cx="177" cy="376" rx="93" ry="11" fill="#E5EAD9"/>
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="M145 137 Q122 139 114 160 L98 211 L118 218 L144 171 M217 138 Q236 141 244 167 L257 216 L237 222 L215 171" fill="#53853C" stroke="#2F4B27" stroke-width="2.5"/>
        <path d="M100 207 L118 214 L113 244 L125 270 Q127 279 121 281 Q115 283 111 275 L97 248 Q92 240 95 225Z M239 216 L256 211 L265 250 L259 279 Q257 287 251 285 Q246 283 248 274 L248 254Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
        <path d="M142 137 L164 128 H197 L218 139 L231 239 Q187 256 132 239Z" fill="#447D38" stroke="#2F4B27" stroke-width="2.5"/>
        <path d="M143 140 Q182 165 216 140 M124 171 L110 208 M232 170 L246 210" fill="none" stroke="#F6F3DD" stroke-width="5"/>
        <path d="M162 118 V137 Q181 152 197 135 V116Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
        <path d="M143 161 Q148 204 136 234 M176 233 L212 230" fill="none" stroke="#64984B" stroke-width="3"/>
        <path d="M133 238 Q182 252 230 237 L229 284 L191 286 L181 264 L171 287 L131 282Z" fill="#374132" stroke="#283426" stroke-width="2.5"/>
        <path d="M137 282 L166 286 L157 347 L135 345Z M195 286 L223 284 L218 347 L196 347Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
        <path d="M135 334 L159 336 L157 356 L132 353Z M195 334 H220 L220 357 H195Z" fill="#FCF8EA" stroke="#AAB49A" stroke-width="1.5"/>
        <path d="M132 350 L157 354 L157 367 Q142 373 119 367 Q112 361 132 350Z M196 352 L218 352 L226 368 Q222 377 190 373 Q184 367 196 352Z" fill="#35402E" stroke="#263321" stroke-width="2"/>
        <path d="M120 369 L156 370 M190 373 H222 M138 356 L151 359 M201 358 L216 360" stroke="#F7F3DF" stroke-width="2.5"/>
        <g transform="translate(181 78) scale(.94)">${face(mood)}</g>
        ${ball(207, 177, .42)}
      </g>${ball(269, 355, 1.05)}`);
    return svg('0 0 360 220', 'Adam, a curious 12-year-old with dark hair and a green soccer shirt, thinking in a bright school science lab.', `
      <path d="M15 0 H345 Q360 0 360 15 V205 Q360 220 345 220 H15 Q0 220 0 205 V15 Q0 0 15 0Z" fill="#DCEEE7"/>
      <path d="M0 0 H132 V153 H0Z" fill="#C6E9EF"/>
      <path d="M0 78 L106 0 H132 V17 L0 115Z M0 126 L132 32 V47 L0 141Z" fill="#EAF9F5" opacity=".6"/>
      <path d="M0 140 Q8 110 21 133 Q25 105 42 125 Q56 105 68 136 Q77 123 91 136 Q102 116 119 141 L132 153 H0Z" fill="#9FBF91"/>
      <path d="M42 0 V154 M0 59 H132 M0 152 H134" fill="none" stroke="#ACB9AA" stroke-width="7"/>
      <path d="M279 14 H342 V86 H279Z" fill="#FFFEF6" stroke="#BCC5B6" stroke-width="2"/>
      <path d="M279 20 H342" stroke="#D5DACE" stroke-width="5"/>
      <g transform="translate(286 37) rotate(-20 22 17)"><path d="M0 24 Q10 0 28 7 Q39 12 49 7 L51 14 Q36 15 27 27 Q14 36 0 29Z" fill="#F3918B" stroke="#C45965" stroke-width="1.5"/><path d="M4 25 Q21 10 41 15 M7 28 Q24 21 37 18" fill="none" stroke="#FFD4BF" stroke-width="2"/></g>
      <path d="M289 72 H331 M289 78 H320" stroke="#D1D6C9" stroke-width="2"/>
      <path d="M0 174 H360 V188 H0Z" fill="#C3B195"/><path d="M0 187 H360 V220 H0Z" fill="#BECBC6"/>
      <path d="M26 205 H67 M293 205 H333" stroke="#96A9A3" stroke-width="5" stroke-linecap="round"/>
      <g stroke-linecap="round" stroke-linejoin="round"><path d="M305 167 H344 M318 164 V157 Q343 146 334 128 L324 114" fill="none" stroke="#6D8885" stroke-width="9"/><path d="M321 109 L335 117 L327 131 L313 124Z" fill="#648582"/><path d="M326 100 L336 106 L331 116 L321 110Z" fill="#496966"/><path d="M299 143 H324" stroke="#496966" stroke-width="5"/></g>
      <g stroke="#8A9E8B" stroke-width="1.7"><path d="M20 137 V166 Q20 172 26 172 Q32 172 32 166 V137Z M40 137 V166 Q40 172 46 172 Q52 172 52 166 V137Z M60 137 V166 Q60 172 66 172 Q72 172 72 166 V137Z" fill="#F7F9E8"/><path d="M21 156 H31 V167 Q26 173 21 167Z" fill="#9DC66A" stroke="none"/><path d="M41 151 H51 V167 Q46 173 41 167Z" fill="#84C5B1" stroke="none"/><path d="M61 158 H71 V167 Q66 173 61 167Z" fill="#E6A164" stroke="none"/><path d="M18 137 H34 M38 137 H54 M58 137 H74" stroke-width="3" stroke-linecap="round"/></g>
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="M126 120 Q109 119 99 140 L83 183 L104 193 L126 160 M228 119 Q244 122 254 146 L274 188 L252 199 L230 166" fill="#427F3B" stroke="#29472C" stroke-width="2.8"/>
        <path d="M126 118 L152 111 H198 L226 119 Q244 145 250 220 H106 Q109 148 126 118Z" fill="#388044" stroke="#29472C" stroke-width="2.8"/>
        <path d="M124 126 Q108 126 102 145 L91 177 M129 132 Q114 133 109 148 L99 181 M225 126 Q239 128 248 151 L262 183 M223 132 Q234 135 242 154 L254 186" fill="none" stroke="#F5F5E6" stroke-width="3"/>
        <path d="M150 100 L150 119 Q171 140 198 117 V97Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
        <path d="M143 119 Q171 148 205 119" fill="none" stroke="#F3F3DD" stroke-width="5"/>
        <path d="M123 152 Q133 168 125 204 M229 157 L236 202" stroke="#2C6838" stroke-width="2" fill="none"/>
        ${ball(221, 170, .51)}
        <g transform="translate(177 63) rotate(-7) scale(.99)">${face(mood)}</g>
        <path d="M91 181 L108 188 L122 215 L147 220 H103 Q90 214 88 202Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2"/>
        <path d="M254 189 L274 182 Q288 202 278 216 Q274 221 261 220 H169 Q155 217 159 209 Q163 204 177 206 L246 205Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2.2"/>
        <path d="M102 214 Q106 197 120 179 L150 138 L154 122 Q153 113 158 109 Q162 107 166 115 L169 122 L182 119 Q189 118 193 125 Q196 130 190 137 Q191 143 185 147 Q184 152 177 153 L164 150 L145 185 L124 220Z" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="2.2"/>
        <path d="M166 126 L182 130 M165 133 L181 138 M158 141 L170 146" fill="none" stroke="#AE724F" stroke-width="1.7"/>
      </g>
      <path d="M232 18 L237 7 M246 31 L258 26 M249 44 L261 47" stroke="#B6DF4A" stroke-width="4" stroke-linecap="round"/>
    `, 'adam-art');
  }

  function fibre({ id = 'fibre', supported = true, phase = 0, lens = 'membrane' } = {}) {
    const stage = supported ? 0 : Math.round(clamp(phase, 0, 6));
    const clip = `${safeId(id, 'fibre')}-interior`;
    const membraneEmphasis = lens === 'membrane';
    const energyEmphasis = lens === 'energy';
    const calciumEmphasis = lens === 'calcium';
    const outline = 'M57 35 C126 28 209 36 283 34 S411 41 480 35 S604 39 679 35 C728 33 761 39 775 64 Q793 96 776 132 Q765 156 724 156 C649 150 577 160 505 154 S368 160 293 154 S153 161 58 156 C26 155 16 127 16 96 C16 61 28 38 57 35Z';
    let art = '';
    if (stage < 5) {
      art += `<defs><clipPath id="${clip}"><path d="${outline}"/></clipPath></defs>
        <path d="${outline}" fill="${C.coralLight}" stroke="${C.membrane}" stroke-width="${membraneEmphasis ? 3.4 : 2.5}"/>
        <g clip-path="url(#${clip})">
          <path d="M60 44 C220 36 320 47 480 43 S647 46 744 43 L770 77 V125 L744 145 C600 142 515 151 375 146 S166 151 61 147Z" fill="${C.coral}"/>
          ${[57, 75, 94, 114, 133].map((y, row) => `<g><path d="M65 ${y} C151 ${y - 14} 181 ${y + 10} 268 ${y - 1} S391 ${y + 9} 472 ${y - 1} S597 ${y + 8} 682 ${y - 1} S745 ${y + 1} 775 ${y + 4}" fill="none" stroke="${C.coralDeep}" stroke-width="12" stroke-linecap="round"/><path d="M66 ${y - 2} C152 ${y - 15} 182 ${y + 7} 268 ${y - 4} S391 ${y + 6} 472 ${y - 4} S597 ${y + 5} 682 ${y - 4} S745 ${y - 2} 775 ${y + 1}" fill="none" stroke="${row % 2 ? '#FFAA90' : '#FFB39B'}" stroke-width="7" stroke-linecap="round"/>${[139, 209, 279, 349, 419, 489, 559, 629, 699].map((x, i) => `<path d="M${x + row % 2 * 10} ${y - 4 + (i % 3 - 1) * 2} v7 m4-7 v7 m4-7 v7" stroke="#D45B55" stroke-width="1.3" opacity=".65"/>`).join('')}</g>`).join('')}
          <path d="M79 44 Q278 36 477 43 T755 44 M80 147 Q280 151 478 147 T755 147" fill="none" stroke="#FFE0D1" stroke-width="3"/>
          ${supported ? [111, 162, 213, 264, 315, 366, 417, 468, 519, 570, 621, 672, 723].map((x, i) => support(x, 43 + (i % 4 === 0 ? 1 : 0)) + support(x - 5, 147, true)).join('') : ''}
          ${nucleus(109, 42, .9, -5)}${nucleus(286, 42, 1, 3)}${nucleus(551, 42, .95, -2)}${nucleus(724, 44, .94, 5)}
          ${nucleus(276, 150, 1.05, 0)}${nucleus(556, 151, 1.02, 2)}${nucleus(752, 142, .9, -12)}
          ${mito(181, 85, stage === 4 ? 1.05 : .92, stage === 4, energyEmphasis)}
          ${mito(425, 119, stage === 4 ? 1.3 : .82, stage === 4, energyEmphasis)}
          ${mito(638, 80, stage === 4 ? 1.5 : .89, stage === 4, energyEmphasis)}
        </g>
        <ellipse cx="53" cy="96" rx="36" ry="60" fill="${C.pink}" stroke="${C.membrane}" stroke-width="2.8"/>
        <ellipse cx="51" cy="96" rx="28" ry="51" fill="#DB6266" stroke="#FFE0D2" stroke-width="2"/>
        ${[[45, 55], [57, 59], [35, 70], [48, 75], [64, 76], [32, 88], [46, 93], [63, 94], [32, 107], [47, 112], [64, 112], [37, 127], [51, 130], [59, 143], [43, 143]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${i % 3 ? 5 : 5.5}" ry="8.3" fill="${i % 2 ? '#FFA493' : '#FFBAA3'}" stroke="#E77774" stroke-width=".8"/>`).join('')}`;
      if (stage >= 2) art += `<g class="membrane-tears">
        <g data-tear="true" data-action="flag-tear" class="tear-target" aria-label="Small tear in the upper membrane"><path d="M501 32 L509 39 L505 45 L513 48 L507 58 L521 47 L517 42 L525 36 L518 31" fill="${C.cream}" stroke="${C.membrane}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="513" cy="43" rx="25" ry="26" fill="transparent"/></g>
        <g data-tear="true" data-action="flag-tear" class="tear-target" aria-label="Small tear in the lower membrane"><path d="M615 155 L621 147 L617 142 L630 130 L627 142 L634 146 L628 155" fill="${C.cream}" stroke="${C.membrane}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="625" cy="146" rx="24" ry="25" fill="transparent"/></g>
      </g>`;
      if (stage >= 3) art += [[521, 14], [540, 7], [548, 24], [530, 30], [496, 70], [526, 89], [558, 86], [585, 98], [614, 88], [642, 109], [601, 128], [534, 119], [649, 174], [632, 182]].map(([x, y], i) => calcium(x, y, i % 4 === 0 ? 4.3 : 3.7, calciumEmphasis)).join('') + `<path d="M532 39 L523 51 M523 43 L522 53 L531 49" fill="none" stroke="${C.goldDeep}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (stage < 3) art += calcium(729, 16, 3, calciumEmphasis) + calcium(747, 24, 2.6, calciumEmphasis);
    } else {
      art = `<path d="${outline}" fill="#FBEEE6" stroke="#D9B7B1" stroke-width="2" stroke-dasharray="6 6"/>
        <path d="M57 39 L129 36 L121 54 L135 72 L118 91 L132 110 L119 132 L131 153 L57 152 Q21 150 21 96 Q20 42 57 39Z M710 39 L739 42 Q783 50 782 97 Q783 145 738 151 L707 153 L719 131 L706 110 L721 90 L705 70 L718 54Z" fill="#E9A797" stroke="#D18B7E" stroke-width="1.5"/>
        <path d="M47 70 H124 M38 89 H119 M37 109 H121 M43 129 H121 M716 72 H766 M717 91 H775 M718 110 H773 M716 130 H766" stroke="#CE7B70" stroke-width="5" stroke-linecap="round"/>
        ${nucleus(85, 44, .85)}${nucleus(744, 141, .8, -8)}`;
      if (stage === 5) art += [[171, 83], [246, 130], [315, 71], [387, 118], [457, 67], [519, 133], [588, 82], [651, 122]].map(([x, y], i) => `<path d="M${x - 10} ${y - 8} L${x + 6} ${y - 13} L${x + 17} ${y + 1} L${x + 7} ${y + 13} L${x - 13} ${y + 9}Z" fill="${i % 2 ? '#EDC0B2' : '#DDA294'}"/><path d="M${x - 6} ${y + 1} l12-2" stroke="#C48E80" stroke-width="2"/>`).join('');
      else art += `<g fill="#FFF1B9" stroke="#D7AF4A" stroke-width="2">${[[161, 73, 24], [193, 121, 29], [243, 67, 25], [273, 120, 28], [332, 78, 28], [365, 128, 23], [420, 65, 22], [466, 111, 31], [527, 67, 24], [551, 128, 25], [615, 78, 28], [663, 125, 25]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/><ellipse cx="${x - r * .62}" cy="${y + r * .42}" rx="3.5" ry="6" fill="#C49C3C" stroke="none"/>`).join('')}</g><g fill="none" stroke-linecap="round">${[0, 10, 20].map(d => `<path d="M137 ${111 + d} Q253 ${148 + d} 352 ${94 + d} T524 ${89 + d} Q616 ${115 + d} 703 ${67 + d}" stroke="${C.scar}" stroke-width="6"/><path d="M137 ${110 + d} Q253 ${147 + d} 352 ${93 + d} T524 ${88 + d} Q616 ${114 + d} 703 ${66 + d}" stroke="#D8C2DF" stroke-width="2"/>`).join('')}</g>`;
    }
    const states = ['intact membrane without dystrophin support', 'contraction puts stress on the membrane without dystrophin support', 'small breaks in the upper and lower membrane', 'excess calcium entering through small membrane tears', 'excess calcium and swollen, injured mitochondria', 'a lost muscle fibre, with fragments remaining', 'fat cells and collagen scar replacing a lost muscle fibre'];
    const phaseTransform = Math.round(clamp(phase, 0, 6)) === 1 ? ' transform="translate(20 0) scale(.95 1)"' : '';
    return svg('0 0 800 190', supported ? 'Reference muscle fibre: intact membrane, purple peripheral nuclei, teal mitochondria and lime dystrophin links just inside the membrane.' : `Test muscle fibre: ${states[stage]}.`, `<g class="fibre-body" data-fibre="${safeId(id, 'fibre')}" data-phase="${stage}"${phaseTransform}>${art}</g>`, `fibre-art lens-${['membrane', 'calcium', 'energy'].includes(lens) ? lens : 'membrane'}`).replace('<svg ', '<svg preserveAspectRatio="none" ');
  }

  function tissue({ working = 12, id = 'sample' } = {}) {
    const count = Math.round(clamp(working, 0, 12));
    const prefix = safeId(id, 'sample');
    const p = '-36,-19 -18,-33 18,-31 35,-12 31,20 7,32 -28,27 -39,2';
    const slots = Array.from({ length: 12 }, (_, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      return [71 + col * 80 + (row % 2 ? 12 : 0), 43 + row * 67];
    });
    return svg('0 0 400 220', `Simplified muscle tissue sample: ${count} of 12 model spaces contain working muscle fibres; the other spaces contain non-contractile fat cells or collagen scar. These are model counts, not a patient measurement.`, `<path d="M42 12 Q198-1 358 18 Q393 50 390 112 Q392 180 353 210 Q198 224 41 207 Q13 180 15 108 Q12 48 42 12Z" fill="#F1E5DE" stroke="#E0D2C6" stroke-width="1.5"/>
      ${slots.map(([x, y], i) => {
        const workingSlot = i < count;
        const fatSlot = !workingSlot && (i - count) % 2 === 0;
        const clip = `${prefix}-${i}`;
        return `<g class="tissue-slot ${workingSlot ? 'working-fibre' : fatSlot ? 'fat-cell' : 'scar-tissue'}" transform="translate(${x} ${y})"><polygon points="${p}" fill="${workingSlot ? C.coral : fatSlot ? '#FFF8DC' : '#E9DDEE'}" stroke="${workingSlot ? '#C96965' : fatSlot ? '#D6B55D' : '#B69AC1'}" stroke-width="2.3"/>
          ${workingSlot ? `<polygon points="${p}" transform="scale(.85)" fill="#FFB4A0" stroke="#F8D2B8" stroke-width="2"/><ellipse cx="-28" cy="3" rx="4" ry="9" transform="rotate(-15 -28 3)" fill="${C.purpleDeep}"/>${[[-15, -13], [0, -17], [15, -12], [-17, 4], [0, 0], [18, 3], [-10, 19], [8, 18]].map(([a, b]) => `<ellipse cx="${a}" cy="${b}" rx="5.5" ry="7" fill="#ED8C78" stroke="#DA7869" stroke-width=".8"/><path d="M${a - 3} ${b - 2} h6 M${a - 3} ${b + 2} h6" stroke="#F8BEA3" stroke-width="1"/>`).join('')}` : fatSlot ? `<g fill="#FFF0B7" stroke="#CDA647" stroke-width="1.8"><circle cx="-14" cy="-11" r="15"/><circle cx="15" cy="-8" r="15"/><circle cx="-10" cy="17" r="15"/><circle cx="17" cy="18" r="12"/></g><g fill="#AF8B35"><ellipse cx="-23" cy="-1" rx="2.5" ry="4"/><ellipse cx="23" cy="2" rx="2.5" ry="4"/><ellipse cx="-20" cy="23" rx="2.5" ry="4"/></g>` : `<defs><clipPath id="${clip}"><polygon points="${p}"/></clipPath></defs><g clip-path="url(#${clip})" fill="none" stroke-linecap="round">${[-28, -15, -2, 11, 24].map(d => `<path d="M-43 ${d + 7} Q-16 ${d - 12} 5 ${d + 1} T42 ${d - 7}" stroke="${C.scar}" stroke-width="5"/><path d="M-43 ${d + 6} Q-16 ${d - 13} 5 ${d} T42 ${d - 8}" stroke="#D1B6DD" stroke-width="1.5"/>`).join('')}<path d="M-25-34 Q-8 0-16 35 M15-35 Q1-5 28 32" stroke="#C5ABD0" stroke-width="2.5"/></g>`}
        </g>`;
      }).join('')}`, 'tissue-art');
  }

  function pull({ working = 12, run = false, id = 'pull' } = {}) {
    const count = Math.round(clamp(working, 0, 12));
    const extension = run ? count / 12 * 70 : 0;
    const loadX = 305 - extension;
    const tendonX = 156 - (run ? count / 12 * 14 : 0);
    const springStart = loadX + 42, springEnd = 380;
    const spring = Array.from({ length: 11 }, (_, i) => `${springStart + (springEnd - springStart) * i / 10},${i === 0 || i === 10 ? 50 : i % 2 ? 40 : 60}`).join(' ');
    return svg('0 0 400 100', run ? `A model pull test using ${count} working muscle fibres. Only the working fibres pull the load; more working fibres stretch the resisting spring farther.` : 'A resting muscle-and-spring pull model. Running the test lets working muscle fibres pull a load against a resisting spring.', `
      <path d="M19 81 H386 M20 15 V81 M386 15 V81" stroke="#BDC6AE" stroke-width="2" fill="none"/>
      <path d="M15 20 L22 13 M15 31 L22 24 M15 42 L22 35 M15 53 L22 46 M15 64 L22 57 M380 22 L387 15 M380 33 L387 26 M380 44 L387 37 M380 55 L387 48 M380 66 L387 59" stroke="#9AA68A" stroke-width="1.5"/>
      <path d="M22 50 H39 M${tendonX} 50 H${loadX}" stroke="#C5BB94" stroke-width="6" stroke-linecap="round"/>
      <g data-pull-model="${safeId(id, 'pull')}">${Array.from({ length: 12 }, (_, i) => {
        const y = 24 + i * 4.6;
        return i < count ? `<path class="active-pull-fibre" d="M40 ${y + 4} Q88 ${y - (run ? 5 : 2)} ${tendonX} ${y + 4}" fill="none" stroke="${i % 2 ? C.coralDeep : C.coral}" stroke-width="3.2" stroke-linecap="round"/>` : `<path d="M40 ${y + 4} Q88 ${y - 2} 156 ${y + 4}" fill="none" stroke="${i % 2 ? '#B79BC3' : '#D9BD6B'}" stroke-width="2.5" stroke-dasharray="3 4" stroke-linecap="round"/>`;
      }).join('')}</g>
      <rect x="${loadX}" y="31" width="42" height="38" rx="7" fill="#DFE6CF" stroke="${C.olive}" stroke-width="2"/>
      <path d="M${loadX + 10} 40 H${loadX + 32} M${loadX + 10} 46 H${loadX + 25}" stroke="#B5C19F" stroke-width="2" stroke-linecap="round"/>
      <circle cx="${loadX + 10}" cy="74" r="4" fill="#74835C"/><circle cx="${loadX + 32}" cy="74" r="4" fill="#74835C"/>
      <polyline points="${spring}" fill="none" stroke="${C.olive}" stroke-width="2.4" stroke-linejoin="round"/>
      ${run && count > 0 ? `<path d="M${loadX - 9} 20 H${loadX - 35} M${loadX - 28} 14 L${loadX - 36} 20 L${loadX - 28} 26" fill="none" stroke="${C.olive}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`, 'pull-art');
  }

  function scale(level = 'person') {
    if (level === 'person') return adam({ portrait: false, mood: 'confident' });
    if (level === 'cell') return fibre({ id: 'scale-cell', supported: true });
    if (level === 'tissue') return svg('0 0 360 260', 'Muscle tissue: a bundle of long, parallel muscle fibres surrounded by a thin connective tissue layer.', `
      <path d="M68 48 L266 31 Q323 43 326 115 L316 183 Q297 221 254 226 L66 235 Q34 229 29 151 Q24 81 68 48Z" fill="#EFCEBC" stroke="#C89584" stroke-width="2.5"/>
      <path d="M72 55 L261 39 Q308 47 316 111 L310 176 Q291 211 253 216 L72 226Z" fill="#F5AF99"/>
      ${[[65, 82, 258, 60], [76, 116, 274, 96], [65, 149, 266, 135], [74, 184, 268, 172], [84, 211, 256, 204]].map(([x, y, ex, ey], i) => `<path d="M${x} ${y} Q166 ${y - 20} ${ex} ${ey}" fill="none" stroke="#C85F58" stroke-width="25" stroke-linecap="round"/><path d="M${x} ${y - 3} Q166 ${y - 23} ${ex} ${ey - 3}" fill="none" stroke="${i % 2 ? '#F9A58C' : '#F38C7E'}" stroke-width="18" stroke-linecap="round"/><path d="M133 ${y - 17} l2 16 M194 ${ey - 9} l2 16" stroke="#DA7065" stroke-width="2"/>${nucleus(170, (y + ey) / 2 - 13, .65, -8)}`).join('')}
      <ellipse cx="67" cy="143" rx="43" ry="92" fill="#F7C4B0" stroke="#C48174" stroke-width="2"/>
      ${[[56, 78], [76, 90], [44, 111], [67, 119], [86, 130], [42, 149], [65, 156], [85, 169], [48, 184], [69, 197]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="18" fill="#F38B7D" stroke="#C86460" stroke-width="1.5"/><ellipse cx="${x - 1}" cy="${y - 1}" rx="7" ry="13" fill="#FFAF97"/>`).join('')}
      <path d="M266 32 Q307 32 325 77" fill="none" stroke="#FAE3CD" stroke-width="5"/>
    `);
    if (level === 'organ') return svg('0 0 360 280', 'A single quadriceps muscle organ, with muscle fibres, connective tissue, a small blood vessel and a nerve, narrowing into tendons at its ends.', `
      <path d="M59 231 Q77 208 101 179 L119 195 Q97 223 79 247Z M265 46 Q285 23 304 13 L316 30 Q292 45 280 64Z" fill="#EFE7CF" stroke="#B6AF8C" stroke-width="2"/>
      <path d="M91 199 Q91 135 144 78 Q194 26 275 41 Q292 74 258 126 Q207 198 111 213Z" fill="#F49A83" stroke="#A84E49" stroke-width="2.6"/>
      <path d="M102 194 Q153 62 268 49 M108 200 Q185 79 274 54 M117 204 Q208 113 278 60 M125 205 Q222 161 279 67" fill="none" stroke="#BB5751" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M105 188 Q146 81 245 49 M119 195 Q182 104 264 64 M134 199 Q212 151 270 81" fill="none" stroke="#FFC0A0" stroke-width="4" stroke-linecap="round"/>
      <path d="M116 198 Q160 125 203 75 Q232 44 270 44" fill="none" stroke="#F9D4B8" stroke-width="2.2"/>
      <path d="M76 93 Q114 98 145 115 Q167 127 182 146 M145 115 L148 86 M165 130 L191 118" fill="none" stroke="#B85361" stroke-width="4" stroke-linecap="round"/>
      <path d="M72 103 Q112 107 141 124 Q161 138 176 156 M141 124 L137 98 M158 137 L182 132" fill="none" stroke="#729DA5" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M212 219 Q219 183 236 157 L251 142 M232 167 L256 170 M237 157 L238 135" fill="none" stroke="#C8A143" stroke-width="3" stroke-linecap="round"/>
      <path d="M214 219 Q221 183 238 158" fill="none" stroke="#F1D578" stroke-width="1"/>
    `);
    return svg('0 0 360 300', 'The muscular and skeletal systems work together: a thigh muscle attaches to bones by tendons and pulls across the knee joint.', `
      <path d="M116 25 Q126 12 141 21 Q150 13 163 22 Q175 35 162 47 L190 175 Q197 178 200 192 Q201 207 190 214 Q175 220 165 208 Q152 213 145 199 Q137 186 151 177 L122 50 Q104 42 116 25Z" fill="#F2ECD6" stroke="#A9A587" stroke-width="2.5"/>
      <path d="M184 211 Q197 204 207 213 L264 264 Q279 259 285 272 Q290 286 276 290 Q264 295 257 282 L190 232 Q178 233 175 223Z" fill="#F2ECD6" stroke="#A9A587" stroke-width="2.5"/>
      <path d="M194 231 L249 283" fill="none" stroke="#CFC7A6" stroke-width="7" stroke-linecap="round"/>
      <path d="M112 46 Q93 57 99 91 L124 146 Q137 170 156 176 L175 165 Q161 101 134 61Z" fill="#ED8D7D" stroke="#AF5B51" stroke-width="2.5"/>
      <path d="M111 58 Q114 113 157 163 M119 58 Q130 105 166 159 M104 76 Q108 130 150 163" fill="none" stroke="#BE6255" stroke-width="3" stroke-linecap="round"/>
      <path d="M112 62 Q124 114 158 156" fill="none" stroke="#FFB99A" stroke-width="4"/>
      <path d="M113 46 L120 26 M156 174 Q162 198 190 218" fill="none" stroke="#D8CBA5" stroke-width="11" stroke-linecap="round"/>
      <path d="M113 44 L120 28 M157 176 Q165 197 189 216" fill="none" stroke="#FCF4D9" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="181" cy="196" rx="13" ry="16" fill="#ECE7CB" stroke="#AAA88B" stroke-width="2"/>
      <path d="M72 102 Q69 147 99 173 M87 170 L102 177 L102 162" fill="none" stroke="${C.olive}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    `);
  }

  function icon(name) {
    const paths = {
      play: '<path d="M8 4.5 L20 12 L8 19.5Z"/>',
      pause: '<path d="M8 5 V19 M16 5 V19" stroke-width="3.5"/>',
      sound: '<path d="M3 9 H7 L12 5 V19 L7 15 H3Z M16 8 Q20 12 16 16 M19 5 Q26 12 19 19"/>',
      mute: '<path d="M3 9 H7 L12 5 V19 L7 15 H3Z M16 9 L22 15 M22 9 L16 15"/>',
      replay: '<path d="M19.5 8 A8 8 0 1 0 20 15 M19.5 3 V8.5 H14"/>',
      arrow: '<path d="M4 12 H20 M14 6 L20 12 L14 18"/>',
      back: '<path d="M20 12 H4 M10 6 L4 12 L10 18"/>',
      check: '<path d="M4 12 L9 17 L20 6"/>',
      search: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15 L21 21"/>',
      membrane: '<path d="M2 8 Q7 4 12 8 T22 8 M2 16 Q7 12 12 16 T22 16"/>',
      calcium: '<circle cx="5" cy="7" r="1.5"/><circle cx="13" cy="4" r="1.5"/><circle cx="19" cy="9" r="1.5"/><circle cx="10" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
      energy: '<ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-25 12 12)"/><path d="M5 13 Q6 7 8 11 L10 15 Q12 17 12 11 Q12 6 15 9 L17 13 Q19 15 19 10"/>',
      save: '<path d="M4 3 H16 L21 8 V21 H4Z M8 3 V9 H16 V3 M8 21 V14 H17 V21"/>',
      zoom: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15 L21 21 M7 10 H13 M10 7 V13"/>',
      close: '<path d="M5 5 L19 19 M19 5 L5 19"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9 8 Q9 5.5 12 5.5 Q15 5.5 15 8 Q15 10 12 11.5 V14 M12 17 H12.01"/>'
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="lab-icon">${paths[name] || paths.help}</svg>`;
  }
  return { adam, fibre, tissue, pull, scale, icon };
})();
