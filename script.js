/* MUSCLE MYSTERY
 * This file has two parts: the activity controller, then the inline SVG artwork.
 * No imports, requests or persistent storage: opening index.html is enough.
 * EDITING GUIDE: change lesson copy in the data tables and render functions below.
 * Keep completion rules in canAdvance(), rather than on individual Next buttons.
 */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const stage = document.querySelector('#stage');
  const footer = document.querySelector('#navigation');
  const announcer = document.querySelector('#announcer');
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    stage: 1, highest: 1, warmAnswer: '', parts: new Set(), activePart: '',
    placed: false, pieceSelected: false, placementMessage: '', placementTone: 'info',
    prediction: '', labStep: 0, labBusy: false, labTimer: null,
    damaged: 0, stairsAnswer: '', sample: '',
    order: ['movement', 'mutation', 'tissue', 'dystrophin', 'damage'],
    orderCorrect: false, orderMessage: '', closing: false,
    reduceMotion: motionMedia.matches
  };
  const stageNames = ['Meet Adam', 'Make the kick', 'Explore a cell', 'Find the support', 'Contraction lab', 'Cells to tissue', 'Back to Adam', 'Be the scientist', 'Connect the clues'];
  const stageTimes = ['1 minute', '1 minute', '2 minutes', '1 minute', '3 minutes', '2 minutes', '1 minute', '2 minutes', '2 minutes'];
  const orderLabels = { mutation: 'Mutation', dystrophin: 'No dystrophin', damage: 'Fibre damage', tissue: 'Weakened tissue', movement: 'Movement difficulty' };
  const correctOrder = ['mutation', 'dystrophin', 'damage', 'tissue', 'movement'];
  const parts = {
    nucleus: { name: 'Nucleus', body: 'The nucleus holds DNA: the instructions a cell uses to make proteins. A muscle fibre has many nuclei near its edge.', clue: 'The DMD gene contains instructions for making dystrophin.' },
    mitochondria: { name: 'Mitochondria', body: 'Mitochondria help release usable energy from food. Muscle cells need this energy to contract and keep working.', clue: 'Too much calcium inside a cell can harm its mitochondria.' },
    cytoplasm: { name: 'Cytoplasm', body: 'Cytoplasm fills the inside of the cell around its organelles. Many of the chemical reactions that keep a cell alive happen here.', clue: 'Inside a muscle fibre, long protein filaments slide to help it shorten.' },
    membrane: { name: 'Cell membrane', body: 'The cell membrane is a thin boundary. It controls what enters and leaves the cell. In muscle fibres, it is also called the sarcolemma.', clue: 'A damaged membrane can let too much calcium enter.' },
    dystrophin: { name: 'Dystrophin', body: 'Dystrophin is a protein just inside the membrane. It links the cell’s inner supports to proteins in the membrane, helping the fibre handle the stress of movement.', clue: 'In DMD, there is little or no working dystrophin.' }
  };
  const warmOptions = [
    { id: 'cells', label: 'His muscle cells', feedback: 'Exactly. Muscle cells shorten, or contract. Working together, they pull on bones through tendons to move Adam’s leg.' },
    { id: 'bones', label: 'His bones', feedback: 'Bones move when muscles pull on them, but bones do not contract. Which cells can shorten to make that pull?' },
    { id: 'skin', label: 'His skin', feedback: 'Skin stretches as Adam moves, but it does not make the pulling force for his kick. Look for the cells inside his muscles.' },
    { id: 'blood', label: 'His blood cells', feedback: 'Blood carries oxygen and nutrients to muscles. The force for a kick comes from other cells that can shorten.' }
  ];
  const stairsOptions = [
    { id: 'bones', label: 'His bones have stopped contracting.', feedback: 'Bones do not contract. Muscles pull on bones to move them. Look for the answer that connects damaged fibres with less pulling force.' },
    { id: 'fibres', label: 'Repeated fibre damage has weakened his muscles.', feedback: 'You connected the scales. Fewer working fibres means less pulling force, so lifting his body up each stair can become harder.' },
    { id: 'effort', label: 'He just needs to try harder.', feedback: 'DMD is caused by a gene change, not a lack of effort. Adam can be trying very hard while his muscles produce less force.' }
  ];
  const labMessages = [
    'First, predict which fibre will be more easily damaged when it contracts.',
    'Both fibres can contract. Dystrophin helps the healthy fibre handle the strain.',
    'Without working dystrophin, the membrane is more easily damaged. Small tears can form.',
    'Calcium is useful in the right amount. Tears can let too much calcium enter the cell.',
    'Calcium overload can harm the cell, including its mitochondria. The damage is building.',
    'Damage and repair repeat over time. Some muscle fibres eventually die when repair cannot keep up.',
    'Over time, lost fibres are replaced by fat and scar tissue. These cannot contract like muscle fibres.'
  ];
  const labShort = ['Ready to test', 'Under strain', 'Membrane tears', 'Calcium overload', 'Mitochondria damaged', 'Fibre lost', 'Fat + scar tissue'];

  // Small shared primitives keep labels, feedback and input states consistent.
  const arrow = direction => `<span class="arrow" aria-hidden="true">${direction === 'back' ? '←' : '→'}</span>`;
  const feedback = (message, tone = 'info') => `<div id="feedback" class="feedback ${tone}"><span class="feedback-symbol" aria-hidden="true">${tone === 'success' ? '✓' : tone === 'warning' ? '!' : 'i'}</span><p>${message}</p></div>`;
  const trail = active => `<div class="scale-trail" aria-label="Scale of this activity">${['Person', 'Muscle', 'Cell', 'Protein'].map(x => x === active ? `<strong>${x}</strong>` : `<span>${x}</span>`).join('<span aria-hidden="true">›</span>')}</div>`;
  const heading = (title, intro, scale = 'Cell', extra = '') => `<div class="stage-heading"><span class="stage-label">${state.stage} of 9 · ${stageNames[state.stage - 1]}</span>${trail(scale)}</div><h1 id="stage-title" tabindex="-1" class="${extra}">${title}</h1>${intro ? `<p class="intro">${intro}</p>` : ''}`;
  const choiceList = (options, value, correct) => `<div class="choice-list" role="group" aria-label="Choose your answer">${options.map(o => `<button type="button" id="answer-${o.id}" class="choice ${value === o.id ? (o.id === correct ? 'correct' : 'incorrect') : ''}" data-answer="${o.id}" aria-pressed="${value === o.id}" aria-describedby="feedback"><span class="choice-mark" aria-hidden="true">${value === o.id ? (o.id === correct ? '✓' : '•') : ''}</span><span>${o.label}</span></button>`).join('')}</div>`;
  const protein = () => '<svg viewBox="0 0 130 35" aria-hidden="true"><path d="M6 19Q20 7 33 18T60 18T87 18T116 18" stroke="#517d2b" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M7 16Q20 7 33 15T60 15T87 15T116 15" stroke="#cae97c" stroke-width="5" fill="none" stroke-linecap="round"/></svg>';
  const kickArt = () => `<svg viewBox="0 0 520 360" role="img" aria-label="A leg muscle shortens and pulls through a tendon to move the lower leg and kick a ball."><path d="M0 326H520" stroke="#ced5cb"/><path d="M196 35C160 87 165 127 205 177L277 260L345 273L358 250L293 224L245 151C232 109 243 76 258 52Z" fill="#f4e1cd" stroke="#a67e60" stroke-width="2"/><path d="M212 56Q160 107 213 152Q244 112 240 61Z" fill="#ed8078" stroke="#b94d50" stroke-width="2"/><path d="M209 67Q187 111 215 141M220 65Q203 105 221 138M229 67Q217 106 225 130" fill="none" stroke="#ffd0bb" stroke-width="3"/><path d="M220 151L233 174" stroke="#fffdf5" stroke-width="9"/><path d="M236 182L287 242" stroke="#fffdf5" stroke-width="10"/><path d="M282 247L340 259L368 282Q371 299 348 302L275 280Z" fill="#293b32"/><path d="M277 276L353 295L369 289" stroke="#ffffff" stroke-width="5" fill="none"/><circle cx="426" cy="268" r="49" fill="#ffffff" stroke="#2c3c30" stroke-width="2"/><path d="M420 244L441 251L444 273L424 285L408 270Z M388 250L400 232L409 228L404 247Z M454 231L467 246L462 258L448 245Z M451 291L450 309L428 316L425 298Z M380 273L390 296L406 291L394 275Z" fill="#293b32"/><path d="M310 160Q367 165 384 205" stroke="#3e5c30" stroke-width="3" fill="none"/><path d="M371 203L386 210L387 193" stroke="#3e5c30" stroke-width="3" fill="none"/><path d="M73 94H173M84 190H224" stroke="#66765c" stroke-width="1.5"/><text x="48" y="82" fill="#263620" font-family="system-ui,sans-serif" font-size="18">Muscle</text><text x="48" y="180" fill="#263620" font-family="system-ui,sans-serif" font-size="18">Tendon</text></svg>`;

  function canAdvance() {
    return [false, true, state.warmAnswer === 'cells', state.parts.size === 5, state.placed,
      state.labStep === 6 && !state.labBusy, state.damaged >= 6, state.stairsAnswer === 'fibres', state.sample === 'dmd', state.orderCorrect][state.stage];
  }
  function navHint() {
    if (state.closing) return 'You followed the evidence from a gene to movement.';
    const locked = ['', 'About 15 minutes · No timer, take your time', 'Choose the cells that make the pulling force.', `Explore ${5 - state.parts.size} more cell ${state.parts.size === 4 ? 'part' : 'parts'}.`, 'Place dystrophin on the inside of the membrane.', state.prediction ? `Complete ${6 - state.labStep} more model ${state.labStep === 5 ? 'step' : 'steps'}.` : 'Make a prediction, then run the experiment.', `Damage ${Math.max(0, 6 - state.damaged)} more fibres to compare the tissue.`, 'Connect the muscle damage with the stairs.', 'Choose the sample that shows the muscle-cell problem.', 'Arrange all five clues, then check your order.'];
    return canAdvance() && state.stage > 1 ? 'Clue understood. Continue when you’re ready.' : locked[state.stage];
  }
  function renderNavigation() {
    const label = state.closing ? 'Investigate again' : state.stage === 9 ? 'Reveal the big picture' : state.stage === 5 ? 'Next: cells to tissue' : 'Next';
    footer.innerHTML = state.stage === 1
      ? '<span class="small">A fictional story. Real cell science.</span><span class="navigation-note">9 discoveries · About 15 minutes</span>'
      : `<button type="button" id="back-button" class="button">${arrow('back')} Back</button><span class="navigation-note">${navHint()}</span><button type="button" id="next-button" class="button primary" ${!canAdvance() && !state.closing ? 'disabled' : ''}>${label} ${arrow()}</button>`;
  }
  function renderProgress() {
    document.querySelector('#progress').innerHTML = stageNames.map((name, index) => `<li class="${index + 1 === state.stage ? 'current' : index + 1 < state.stage ? 'done' : ''}" ${index + 1 === state.stage ? 'aria-current="step"' : ''} aria-label="${index + 1}: ${name}${index + 1 < state.stage ? ', completed' : ''}"><span aria-hidden="true">${index + 1 < state.stage ? '✓' : index + 1}</span></li>`).join('');
  }
  function renderWelcome() {
    return `<div class="stage-heading"><span class="stage-label">1 of 9 · The mystery begins</span><span class="small">About 15 minutes</span></div><div class="welcome"><div class="welcome-copy"><span class="tag">A fictional story</span><h1 id="stage-title" tabindex="-1">Meet Adam.</h1><p>Adam is 12 and loves soccer. Lately, stairs and getting up from the floor have become harder.</p><p>He has Duchenne muscular dystrophy, or <strong>DMD</strong>. It is one of a group of genetic conditions that make muscles weaker over time. What is happening inside his muscles?</p><button id="start-button" type="button" class="button primary large">Start investigating ${arrow()}</button><span class="small">Follow the clues from Adam’s world to a single cell.</span></div><div class="welcome-art">${MuscleArt.adam()}<div class="scene-caption"><span>A love of soccer</span><span>A clue on the stairs</span><span>A mystery inside</span></div></div></div>`;
  }
  function renderWarmup() {
    const answer = warmOptions.find(o => o.id === state.warmAnswer);
    return heading('What makes the kick?', 'Adam kicks a soccer ball. What actually contracts to make his leg move?', 'Muscle') + `<div class="question-layout"><div class="question-art">${kickArt()}<div class="illustration-caption">Contract means to shorten and produce a pulling force.</div></div><div>${choiceList(warmOptions, state.warmAnswer, 'cells')}${feedback(answer?.feedback || 'Choose an answer. A good scientist starts with a prediction.', !answer ? 'info' : state.warmAnswer === 'cells' ? 'success' : 'warning')}</div></div>`;
  }
  function renderCell() {
    const active = parts[state.activePart];
    return heading('Inside a muscle cell.', 'A muscle fibre is one long cell. Select each of its five labelled parts to uncover a clue.') + `<div class="cell-layout"><div class="cell-diagram">${MuscleArt.fibre({id:'explore',labels:false})}${Object.entries(parts).map(([key,part]) => `<button type="button" id="part-${key}" data-part="${key}" aria-pressed="${state.activePart === key}" aria-controls="part-details" class="cell-hotspot ${key} ${['cytoplasm','dystrophin','membrane'].includes(key) ? 'bottom' : ''}">${state.parts.has(key) ? '<span aria-hidden="true">✓ </span>' : ''}${part.name}</button>`).join('')}</div><div id="part-details" class="part-panel"><div class="part-count">${state.parts.size} of 5 parts explored</div><h2>${active?.name || 'Where will you look first?'}</h2><p>${active?.body || 'Choose a label on the cell. Each part has a different job that helps a muscle fibre work.'}</p>${active ? `<div class="part-clue">${active.clue}</div>` : ''}<div class="visited-parts" aria-hidden="true">${Object.keys(parts).map(k => `<span class="${state.parts.has(k) ? 'seen' : ''}"></span>`).join('')}</div></div></div>`;
  }
  function renderPlacement() {
    return heading('Place the missing support.', 'Where does dystrophin belong? Drag the protein into place, or select it and then select a location.', 'Protein') + `<div class="placement-layout"><div class="membrane-board">${MuscleArt.membrane({placed:state.placed})}<button id="zone-outside" class="drop-zone outside" data-zone="outside" type="button">Outside the cell</button><button id="zone-inside" class="drop-zone inside ${state.placed ? 'placed' : ''}" data-zone="inside" type="button">${state.placed ? '✓ Dystrophin in place' : 'Just inside the membrane'}</button><button id="zone-nucleus" class="drop-zone nucleus" data-zone="nucleus" type="button">Deep in the cytoplasm</button></div><div class="piece-tray"><h2>One important protein</h2><button id="dystrophin-piece" class="protein-piece" type="button" aria-pressed="${state.pieceSelected}" ${state.placed ? 'disabled' : ''}>${protein()}<span>Dystrophin</span></button><span class="small">${state.placed ? 'Support added. Now test what happens without it.' : state.pieceSelected ? 'Protein selected. Choose its place.' : 'Drag, or tap the piece and then a location.'}</span>${feedback(state.placementMessage || 'Look for the place where the cell’s inner supports meet its membrane.',state.placementTone)}</div></div>`;
  }
  function renderLab() {
    return `<div class="lab">${heading('Same movement. Different protection.', 'Press CONTRACT and compare what happens to the two muscle fibres.', 'Cell', 'lab-title')}<div ${state.labStep > 0 ? 'hidden' : ''} class="prediction ${state.prediction ? 'revealed' : ''}" role="group" aria-label="Predict which fibre will be damaged"><span class="prediction-label">${state.prediction ? 'Your prediction:' : 'Predict first: which fibre will be more easily damaged?'}</span>${[['healthy','Healthy fibre'],['dmd','DMD fibre'],['both','Both equally']].map(([id,label]) => `<button type="button" id="predict-${id}" class="button subtle" data-prediction="${id}" aria-pressed="${state.prediction === id}" ${state.labStep > 0 ? 'disabled' : ''}>${label}</button>`).join('')}</div><div class="fibre-pair ${state.labBusy ? 'contracting' : ''}"><section class="fibre-panel" aria-label="Healthy fibre comparison"><h2>Healthy fibre</h2><div class="panel-subtitle">Dystrophin supports the membrane.</div>${MuscleArt.fibre({id:'healthy-lab',step:state.labStep,labels:true})}<span class="tag success">✓ ${state.labStep ? 'Contracts and recovers' : 'Support in place'}</span></section><section class="fibre-panel" aria-label="DMD fibre comparison"><h2>DMD fibre</h2><div class="panel-subtitle">Little or no working dystrophin.</div>${MuscleArt.fibre({id:'dmd-lab',dmd:true,step:state.labStep,labels:true})}<span class="tag ${state.labStep > 1 ? 'warning' : ''}">${state.labStep > 1 ? '! ' : ''}${labShort[state.labStep]}</span></section></div><ol class="lab-timeline" aria-label="Model steps">${['Strain','Tears','Calcium','Damage','Fibre lost','Fat + scar'].map((label,i) => `<li class="${state.labStep >= i + 1 ? 'passed' : ''} ${state.labStep === i + 1 ? 'active' : ''}" ${state.labStep === i + 1 ? 'aria-current="step"' : ''}><span>${i + 1}</span>${label}</li>`).join('')}</ol><div class="lab-controls"><button type="button" id="contract-button" class="button primary contract" ${!state.prediction || state.labStep >= 6 || state.labBusy ? 'disabled' : ''} ${state.labBusy ? 'aria-busy="true"' : ''}>${state.labBusy ? 'CONTRACTING…' : state.labStep === 6 ? 'MODEL COMPLETE' : 'CONTRACT'}</button><span id="model-count" class="model-count" tabindex="-1">${state.labStep} of 6 model steps</span><button type="button" class="button subtle" id="reset-lab">↻ Reset experiment</button></div><div class="lab-feedback">${feedback(state.labStep === 0 && state.prediction ? 'Prediction recorded. Run the experiment to compare it with the evidence.' : labMessages[state.labStep],state.labStep === 6 ? 'success' : state.labStep > 1 ? 'warning' : 'info')}<div class="model-note">Sped-up model: six clicks represent damage building over time, not six real muscle movements.</div></div></div>`;
  }
  function renderTissue() {
    const strength = Math.round(100 * (1 - state.damaged / 12));
    const message = state.damaged === 0 ? 'One damaged cell does not make a whole muscle stop working. Add damage and watch the pattern.' : state.damaged < 6 ? `${state.damaged} of 12 fibres are damaged. Other fibres can still pull, but the tissue has less working muscle.` : 'You found the link: as more fibres are lost, tissue has fewer cells that can pull. The whole muscle becomes weaker.';
    return heading('From one cell to a whole tissue.', 'Muscle tissue is made of many fibres working together. What happens as more of them are damaged?', 'Muscle') + `<div class="tissue-layout"><div class="tissue-art">${MuscleArt.tissue({damaged:state.damaged,total:12})}<div class="legend"><span><b>✓</b> Working fibre</span><span><b class="damaged">×</b> Damaged fibre</span></div></div><div class="tissue-controls"><h2>How much pulling power?</h2><div class="strength-label"><label for="strength">Tissue strength in this model</label><strong>${strength}%</strong></div><meter id="strength" min="0" max="100" value="${strength}">${strength}%</meter><div class="small">${state.damaged} of 12 fibres damaged · simplified comparison</div><button type="button" id="damage-button" class="button primary" ${state.damaged === 12 ? 'disabled' : ''}>${state.damaged === 12 ? 'All model fibres damaged' : 'Damage another fibre'} ${arrow()}</button>${feedback(message,state.damaged >= 6 ? 'success' : 'info')}</div></div><div class="scale-strip" aria-label="Levels of organisation"><span><strong>Cell</strong> · one fibre</span>${arrow()}<span><strong>Tissue</strong> · many fibres</span>${arrow()}<span><strong>Organ</strong> · a muscle</span>${arrow()}<span><strong>System</strong> · muscles + bones</span></div>`;
  }
  function renderStairs() {
    const answer = stairsOptions.find(o => o.id === state.stairsAnswer);
    return heading('Back to the stairs.', 'Adam’s leg muscles help lift his body up each step. Why can this become harder with DMD?', 'Person') + `<div class="question-layout"><div class="question-art">${MuscleArt.adam({stairs:true})}<div class="illustration-caption">A change inside cells can affect everyday movement.</div></div><div>${choiceList(stairsOptions,state.stairsAnswer,'fibres')}${feedback(answer?.feedback || 'Use what you saw in the cell and tissue experiments.',!answer ? 'info' : state.stairsAnswer === 'fibres' ? 'success' : 'warning')}</div></div>`;
  }
  function renderSamples() {
    const samples = [
      {id:'healthy',name:'Healthy muscle',copy:'Dystrophin supports the edges.',message:'Healthy muscle is useful for comparison. To investigate Adam’s problem, also look for muscle with missing dystrophin.'},
      {id:'dmd',name:'Muscle with missing dystrophin',copy:'The support signal is missing.',message:'That is the key sample. Missing dystrophin helps explain why these muscle fibres are more easily damaged. Healthy muscle provides a comparison.'},
      {id:'skin',name:'Healthy skin',copy:'Different cells, with a different job.',message:'Skin cells help protect the outside of the body. Adam’s movement problem involves muscle fibres, so investigate the muscle sample.'}
    ];
    const selected = samples.find(s=>s.id===state.sample);
    return heading('You’re the scientist.', 'These drawings represent tissue samples. Which would you investigate to learn more about Adam’s muscle-cell problem?', 'Cell') + `<div class="samples" role="group" aria-label="Choose a tissue sample">${samples.map((sample,i)=>`<button type="button" id="sample-${sample.id}" class="sample" data-sample="${sample.id}" aria-pressed="${state.sample===sample.id}" aria-describedby="feedback">${MuscleArt.sample(sample.id)}<span class="sample-heading"><b>${'ABC'[i]}</b>${sample.name}</span><span class="sample-copy">${sample.copy}</span></button>`).join('')}</div>${feedback(selected?.message || 'Compare the type of tissue and the dystrophin signal in each sample.',!selected ? 'info' : state.sample==='dmd' ? 'success' : 'warning')}<div class="sample-note">Illustrated samples, not photographs. A real diagnosis uses medical tests and a care team.</div>`;
  }
  function renderOrder() {
    return heading('Connect the clues.', 'Put these events in order to explain how DMD can affect movement. A mutation is a change in DNA instructions.', 'Person') + `<div class="sequence-layout"><ol class="sequence" aria-label="Order of events">${state.order.map((id,i)=>`<li class="order-item" data-order-item="${id}"><button type="button" id="drag-${id}" class="drag-handle" data-drag-item="${id}" aria-label="Drag ${orderLabels[id]}; use the adjacent arrow buttons with a keyboard">⠿</button><span class="order-label">${orderLabels[id]}</span><span class="move-buttons"><button type="button" id="up-${id}" data-move="${id}" data-direction="up" class="move-button" aria-label="Move ${orderLabels[id]} up" ${i===0?'disabled':''}>↑</button><button type="button" id="down-${id}" data-move="${id}" data-direction="down" class="move-button" aria-label="Move ${orderLabels[id]} down" ${i===4?'disabled':''}>↓</button></span></li>`).join('')}</ol><div class="sequence-actions">${feedback(state.orderMessage || 'Start with the change in the instructions. Then move from a protein, to cells, to tissue, to the person.',state.orderMessage ? state.orderCorrect ? 'success' : 'warning' : 'info')}<button type="button" id="check-order" class="button primary">Check my order</button><span class="small">Drag a grip, or use the up and down arrow buttons.</span></div></div>`;
  }
  function renderClosing() {
    return `<div class="stage-heading"><span class="stage-label">9 of 9 · Investigation complete</span><span class="tag success">✓ Evidence connected</span></div><div class="closing"><div><h1 id="stage-title" tabindex="-1">You solved the mystery.</h1><p>A tiny change in DNA can affect a protein, then muscle cells, then a whole tissue. That helps explain why everyday movements can become harder for Adam.</p><div class="conclusion-chain" aria-label="The complete explanation">${correctOrder.map(id=>`<span>${orderLabels[id]}</span>`).join('<b aria-hidden="true">→</b>')}</div><h2>The story is still being written.</h2><p>There is no cure yet. Medicines, physiotherapy and support for the heart and breathing can help people with DMD. Scientists are studying ways to protect muscle and restore working dystrophin. Treatments do not work the same way for everyone.</p><div class="tag">Adam is more than his diagnosis. He is still Adam.</div></div><div class="closing-art">${MuscleArt.adam()}</div></div><details class="sources"><summary>Sources, model notes & credits</summary><ul><li><a href="https://medlineplus.gov/genetics/condition/duchenne-and-becker-muscular-dystrophy/" target="_blank" rel="noopener noreferrer">MedlinePlus Genetics: Duchenne and Becker muscular dystrophy</a> — DMD gene, dystrophin and progressive muscle damage.</li><li><a href="https://www.nhs.uk/conditions/muscular-dystrophy/treatment/" target="_blank" rel="noopener noreferrer">NHS: Muscular dystrophy treatment</a> — care, treatment and ongoing research.</li><li><a href="https://doi.org/10.3390/ijms222011040" target="_blank" rel="noopener noreferrer">Zabłocka and colleagues (2021): Disrupted calcium homeostasis in DMD</a> — calcium overload and cell injury.</li><li>This simplified model speeds up a complex process. Real damage develops over time; six contractions do not cause the sequence shown here. Tissue percentages illustrate a pattern, not a prediction about a person.</li><li>Muscular dystrophy is a group of conditions. This investigation focuses on Duchenne. “No dystrophin” is shorthand for little or no functional dystrophin.</li><li>Created for BIOC21 by Mishal, Aman, Usman and Uzair. Adam is fictional. Educational diagrams are simplified and not to scale. Sources checked October 2026.</li><li>Everything in the activity works from local files. Progress is kept during this visit only. Source links need an internet connection.</li></ul></details>`;
  }
  const renderers = [null,renderWelcome,renderWarmup,renderCell,renderPlacement,renderLab,renderTissue,renderStairs,renderSamples,renderOrder];
  function render(focusTitle=false) {
    const focusedId = document.activeElement?.id;
    stage.dataset.stage = String(state.stage);
    stage.classList.toggle('lab-stage',state.stage===5);
    document.body.classList.toggle('in-lab',state.stage===5);
    stage.innerHTML = state.closing ? renderClosing() : renderers[state.stage]();
    renderProgress(); renderNavigation();
    document.body.classList.toggle('reduce-motion',state.reduceMotion);
    document.querySelector('#motion-toggle').setAttribute('aria-pressed',String(state.reduceMotion));
    if (focusTitle) {
      document.querySelector('#stage-title').focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'instant'});
    } else if (focusedId) {
      const nextFocus = document.getElementById(focusedId);
      if (nextFocus && !nextFocus.disabled) nextFocus.focus({preventScroll:true});
      else if (nextFocus?.disabled) {
        // Keep focus in the activity when its action reaches a disabled boundary.
        const fallback = focusedId === 'contract-button' ? (state.labBusy ? 'model-count' : 'next-button')
          : focusedId.startsWith('up-') ? focusedId.replace('up-','down-')
          : focusedId.startsWith('down-') ? focusedId.replace('down-','up-')
          : focusedId === 'dystrophin-piece' ? 'zone-inside' : 'next-button';
        document.getElementById(fallback)?.focus({preventScroll:true});
      }
    }
  }
  function announce(message) { announcer.textContent=message; }
  function cancelLabTimer() { clearTimeout(state.labTimer); state.labTimer=null; state.labBusy=false; }
  function navigate(direction) {
    cancelLabTimer();
    if (state.closing && direction<0) { state.closing=false; render(true); return; }
    if (direction>0 && !canAdvance()) return;
    if (state.stage===9 && direction>0) { state.closing=true; render(true); return; }
    state.stage=Math.max(1,Math.min(9,state.stage+direction));
    state.highest=Math.max(state.highest,state.stage); render(true);
  }
  function placeProtein(zone) {
    if (state.placed) return;
    if (!state.pieceSelected) { state.placementMessage='Select the dystrophin piece first, then choose where it belongs.';state.placementTone='info'; }
    else if (zone==='inside') { state.placed=true;state.pieceSelected=false;state.placementMessage='Support in place. Dystrophin sits just inside the membrane, linking the cell’s inner supports to membrane proteins.';state.placementTone='success'; }
    else { state.pieceSelected=false;state.placementMessage=zone==='outside' ? 'Dystrophin works inside the cell. Put it just under the membrane, where it can link to the inner supports.' : 'Dystrophin needs to connect to the membrane. A spot deep in the cytoplasm is too far away; try just inside the boundary.';state.placementTone='warning'; }
    render();announce(state.placementMessage);
  }
  function contract() {
    if (!state.prediction || state.labStep>=6 || state.labBusy) return;
    state.labStep+=1;state.labBusy=!state.reduceMotion;render();
    announce(labMessages[state.labStep]);
    if (state.labBusy) state.labTimer=setTimeout(()=>{
      const restore = document.activeElement?.id === 'model-count';
      state.labBusy=false;state.labTimer=null;
      if(state.stage===5){render();if(restore)document.getElementById(state.labStep===6?'next-button':'contract-button')?.focus({preventScroll:true});}
    },700);
  }
  function moveItem(id,to) {
    const from=state.order.indexOf(id);
    if (from<0||to<0||to>=state.order.length||to===from) return;
    state.order.splice(from,1);state.order.splice(to,0,id);
    state.orderCorrect=false;state.orderMessage='';render();
    announce(`${orderLabels[id]} moved to position ${to+1}.`);
  }
  function checkOrder() {
    state.orderCorrect=state.order.every((id,i)=>id===correctOrder[i]);
    if(state.orderCorrect) state.orderMessage='You connected every clue: a gene change affects a protein, then cells, then tissue, then movement.';
    else {
      const before=(a,b)=>state.order.indexOf(a)<state.order.indexOf(b);
      state.orderMessage=!before('mutation','dystrophin')?'The gene holds instructions for dystrophin. Put the mutation before the missing protein.':!before('dystrophin','damage')?'Without working dystrophin, fibres are more easily damaged. Put the missing protein before fibre damage.':!before('damage','tissue')?'Tissue is made of cells. Put damage to the muscle fibres before the weakened tissue.':'Think about scale: the tissue weakens before movement becomes harder.';
    }
    render();announce(state.orderMessage);
  }

  // One delegated listener works with all screens, including re-rendered content.
  let suppressClick=false;
  stage.addEventListener('click',event=>{
    if(suppressClick){suppressClick=false;return;}
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.id==='start-button'){navigate(1);return;}
    if(button.dataset.answer){
      const key=state.stage===2?'warmAnswer':'stairsAnswer';state[key]=button.dataset.answer;
      render();announce(document.querySelector('#feedback').innerText);return;
    }
    if(button.dataset.part){state.activePart=button.dataset.part;state.parts.add(state.activePart);render();announce(`${parts[state.activePart].name}. ${parts[state.activePart].body} ${parts[state.activePart].clue}`);return;}
    if(button.id==='dystrophin-piece'){state.pieceSelected=!state.pieceSelected;render();announce(state.pieceSelected?'Dystrophin selected. Choose a location.':'Selection cleared.');return;}
    if(button.dataset.zone){placeProtein(button.dataset.zone);return;}
    if(button.dataset.prediction){state.prediction=button.dataset.prediction;render();announce('Prediction recorded. Press Contract to test it.');return;}
    if(button.id==='contract-button'){contract();return;}
    if(button.id==='reset-lab'){cancelLabTimer();state.labStep=0;state.prediction='';render();announce('Experiment reset. Make a new prediction.');return;}
    if(button.id==='damage-button'){state.damaged=Math.min(12,state.damaged+1);render();announce(`${state.damaged} of 12 fibres damaged. ${document.querySelector('#feedback').innerText}`);return;}
    if(button.dataset.sample){state.sample=button.dataset.sample;render();announce(document.querySelector('#feedback').innerText);return;}
    if(button.dataset.move){const id=button.dataset.move;const dir=button.dataset.direction==='up'?-1:1;moveItem(id,state.order.indexOf(id)+dir);return;}
    if(button.id==='check-order')checkOrder();
  });
  footer.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.id==='back-button')navigate(-1);
    else if(button.id==='next-button'){
      if(state.closing){ // Starting again is explicit and clears only this visit's memory.
        cancelLabTimer();state.stage=1;state.highest=1;state.warmAnswer='';state.parts.clear();state.activePart='';
        state.placed=false;state.pieceSelected=false;state.placementMessage='';state.placementTone='info';
        state.prediction='';state.labStep=0;state.damaged=0;state.stairsAnswer='';state.sample='';
        state.order=['movement','mutation','tissue','dystrophin','damage'];state.orderCorrect=false;state.orderMessage='';state.closing=false;render(true);
      }else navigate(1);
    }
  });
  document.querySelector('#motion-toggle').addEventListener('click',()=>{
    state.reduceMotion=!state.reduceMotion;if(state.reduceMotion)cancelLabTimer();render();announce(state.reduceMotion?'Reduced motion on.':'Reduced motion off.');
  });
  const followMotionPreference=event=>{state.reduceMotion=event.matches;if(event.matches)cancelLabTimer();render();};
  if(motionMedia.addEventListener)motionMedia.addEventListener('change',followMotionPreference);

  // Pointer events support mouse, pen and touch. Tapping/arrow buttons remain equivalent.
  let drag=null;
  stage.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('#dystrophin-piece, [data-drag-item]');
    if(!handle||handle.disabled||event.button!==0)return;
    drag={kind:handle.id==='dystrophin-piece'?'protein':'order',id:handle.dataset.dragItem,startX:event.clientX,startY:event.clientY,moved:false,ghost:null,pointerId:event.pointerId,handle};
    handle.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>8){
      drag.moved=true;drag.ghost=document.createElement('div');drag.ghost.className='drag-ghost';drag.ghost.setAttribute('aria-hidden','true');drag.ghost.textContent=drag.kind==='protein'?'Dystrophin':orderLabels[drag.id];document.body.append(drag.ghost);
    }
    if(drag.moved){event.preventDefault();drag.ghost.style.transform=`translate(${event.clientX+12}px,${event.clientY+12}px)`;}
  });
  stage.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const done=drag;drag=null;done.ghost?.remove();
    if(!done.moved)return;
    suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
    const hit=document.elementFromPoint(event.clientX,event.clientY);
    if(done.kind==='protein'){
      const zone=hit?.closest('[data-zone]');state.pieceSelected=true;
      if(zone)placeProtein(zone.dataset.zone);
      else if(hit?.closest('.dystrophin-target'))placeProtein('inside');
      else {state.placementMessage='Drop the protein on a labelled location. It belongs just inside the membrane.';state.placementTone='warning';render();announce(state.placementMessage);}
    }else{
      const item=hit?.closest('[data-order-item]');
      if(item)moveItem(done.id,state.order.indexOf(item.dataset.orderItem));
      else announce('Drop on another event, or use the arrow buttons to reorder.');
    }
  });
  stage.addEventListener('pointercancel',()=>{drag?.ghost?.remove();drag=null;});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){drag?.ghost?.remove();drag=null;if(state.pieceSelected){state.pieceSelected=false;render();announce('Selection cleared.');}}
  });
  render();
});

/* SVG ARTWORK is appended below. It is inline, deterministic and dependency-free. */

/* Muscle Mystery: original SVG teaching illustrations.
 * The drawings simplify cell structures for ages 12–13. Sizes and time are not
 * to scale. Dystrophin links the internal actin cytoskeleton to a membrane
 * protein complex; it does not span the cell or make the filaments contract.
 */
const MuscleArt = (() => {
  const C = {
    ink: '#253B29', olive: '#38552D', lime: '#C5DE58', soft: '#EEF2DE',
    coral: '#EE887A', coralDark: '#B85452', coralLight: '#F9B7A8',
    teal: '#4CADA7', tealDark: '#247F7B', tealLight: '#9CD7CF',
    purple: '#9675B1', purpleDark: '#70558C', gold: '#F3BF4A',
    cream: '#FFF0AE', scar: '#AA89B4', line: '#CCD3C4'
  };
  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const bound = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
  const svg = (box, label, content, extra = '') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${esc(label)}" class="muscle-art" ${extra}>${content}</svg>`;
  const nucleus = (x, y, angle = -8) => `<g transform="translate(${x} ${y}) rotate(${angle})">
    <ellipse rx="18" ry="7.5" fill="${C.purple}" stroke="${C.purpleDark}" stroke-width="1.8"/>
    <path d="M-10-2 Q-2-5 8-3" fill="none" stroke="#C7B2D8" stroke-width="2.2" stroke-linecap="round"/>
  </g>`;
  const mito = (x, y, scale = 1, damaged = false) => `<g transform="translate(${x} ${y}) scale(${scale}) rotate(-7)">
    <ellipse rx="29" ry="14" fill="${damaged ? '#8ED0C8' : C.tealLight}" stroke="${C.tealDark}" stroke-width="2.4"/>
    <ellipse rx="24" ry="10" fill="${C.teal}"/>
    <path d="M-18 1 Q-20-8-14-6 Q-9-5-11 3 Q-12 10-5 6 Q-2 4-5-4 Q-6-10 1-7 Q6-5 3 3 Q2 9 9 6 Q13 4 10-3 Q10-8 17-5 Q21-2 18 3" fill="none" stroke="${C.tealDark}" stroke-width="2" stroke-linecap="round"/>
    ${damaged ? '<path d="M-17-10 L-9-12 M18 8 L23 4" stroke="#E5F5D9" stroke-width="3" stroke-linecap="round"/>' : ''}
  </g>`;
  const link = (x, bottom = false) => `<g transform="translate(${x} ${bottom ? 198 : 78}) scale(1 ${bottom ? -1 : 1})">
    <path d="M-6-1 H6" stroke="${C.olive}" stroke-width="5" stroke-linecap="round"/>
    <path d="M0 2 L-3 10 L1 18 L-2 25" fill="none" stroke="#6E8D32" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M0 2 L-3 10 L1 18 L-2 25" fill="none" stroke="${C.lime}" stroke-width="3.3" stroke-linecap="round"/>
    <circle cy="26" cx="-2" r="3.5" fill="${C.olive}"/>
  </g>`;
  const calcium = (x, y, r = 4) => `<circle class="calcium-dot" style="--calcium-entry-y:${y > 170 ? 30 : -30}px" cx="${x}" cy="${y}" r="${r}" fill="${C.gold}" stroke="#BB7A17" stroke-width="1.2"/>`;

  function adam({ stairs = false } = {}) {
    return svg('0 0 560 480', stairs
      ? 'Adam, a fictional 12-year-old in a green soccer shirt, taking a step up at school with a hand on the railing.'
      : 'Adam, a fictional 12-year-old with dark hair and a green soccer shirt, standing with his soccer ball outside school.', `
      <path d="M67 91 Q91 39 181 47 L428 46 Q504 47 518 115 L523 378 Q520 437 455 448 L110 451 Q47 440 43 380 L42 171 Q43 121 67 91Z" fill="#F0F2E7"/>
      <path d="M345 65 L500 91 L500 358 H340Z" fill="#E2DCCB"/>
      <path d="M331 66 L345 58 L512 87 L501 100Z" fill="#C4C6B8"/>
      <path d="M370 113 L471 128 V292 H370Z" fill="#F9FAF5" stroke="#BBBFAF" stroke-width="5"/>
      <path d="M380 124 L421 130 V199 H380Z M431 132 L460 137 V199 H431Z M380 210 H421 V281 H380Z M431 210 H460 V281 H431Z" fill="#A7C2C1"/>
      <path d="M384 133 L409 136 V188 H384Z M435 142 L449 144 V187 H435Z" fill="#C8DCDA"/>
      <path d="M351 97 L357 98 M351 116 L357 117 M351 135 L357 136 M351 154 L357 155 M351 173 L357 174 M351 192 L357 193" stroke="#C7BFAE" stroke-width="3"/>
      <path d="M66 341 C46 319 66 293 84 305 C79 269 114 256 131 278 C153 251 181 274 171 297 C202 292 211 326 194 343Z" fill="#9EAF77"/>
      <path d="M57 351 C46 334 65 319 83 331 C87 304 114 303 125 324 C151 302 173 324 167 343 C191 330 205 345 203 361Z" fill="#718B4D"/>
      <path d="M56 358 H175 V395 H56Z" fill="#D9CCB8"/>
      <path d="M57 370 H175 M88 359 V370 M142 370 V384 M58 384 H175" stroke="#F3EDDF" stroke-width="3"/>
      <path d="M158 412 H332 V381 H388 V350 H444 V319 H506 V430 H158Z" fill="#DBD9CD"/>
      <path d="M158 412 H332 M332 381 H388 M388 350 H444 M444 319 H506" stroke="#FDFDF7" stroke-width="6"/>
      <path d="M333 390 H504 M389 359 H505 M444 328 H505" stroke="#B9BCB0" stroke-width="1.5"/>
      <path d="M318 384 V304 L493 214 V344" fill="none" stroke="#8B9D8B" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M317 303 L493 213" fill="none" stroke="#DDE5D7" stroke-width="3" stroke-linecap="round"/>
      <path d="M61 432 Q260 418 502 433" fill="none" stroke="#C8CCBC" stroke-width="3"/>
      <ellipse cx="274" cy="436" rx="103" ry="10" fill="#DDE1D0"/>
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="M230 188 Q215 187 205 201 L190 247 L207 256 L232 227Z" fill="#658B43" stroke="#304B2B" stroke-width="2.5"/>
        <path d="M196 239 L210 246 L206 267 L217 301 Q221 311 214 316 Q206 317 201 308 L188 273 Q185 260 190 250Z" fill="#CF936A" stroke="#734D3B" stroke-width="2"/>
        ${stairs ? '<path d="M311 202 Q327 204 334 230 L340 259 L365 263 L375 252 Q381 249 385 253 Q389 259 382 265 L372 276 Q367 280 359 278 L328 275 Q320 274 317 264 L305 232Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/>' : '<path d="M310 204 Q326 210 330 236 L336 287 L331 323 Q329 332 323 330 Q318 329 319 321 L318 293 L307 248Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/>'}
        <path d="M224 185 L245 176 H285 L307 188 Q319 215 321 246 L317 291 Q273 307 221 290 L218 239Z" fill="#4F7836" stroke="#304B2B" stroke-width="2.8"/>
        <path d="M224 186 L237 179 Q239 204 267 207 Q293 205 298 182 L307 189 Q298 218 268 219 Q235 216 224 186Z" fill="#F6F4DE"/>
        <path d="M242 179 V159 H283 V182 Q282 198 267 199 Q251 199 242 179Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/>
        <path d="M242 163 Q258 181 283 169 V180 Q257 185 242 170Z" fill="#C78860" stroke="none"/>
        <path d="M226 212 Q228 249 220 285 Q245 284 259 271" fill="#618847" stroke="none"/>
        <path d="M269 282 Q290 287 312 279 M249 233 L243 254 M292 249 L301 269" fill="none" stroke="#385D2D" stroke-width="2.5"/>
        <path d="M303 190 L315 198 L332 230 L315 238 L305 216" fill="#507735" stroke="#304B2B" stroke-width="2"/>
        <path d="M316 231 L330 225 M195 242 L210 249" stroke="#F2F1DD" stroke-width="5"/>
        <path d="M283 225 L298 225 L296 239 L290 245 L284 239Z" fill="#EBECCA" stroke="#304B2B" stroke-width="1.8"/>
        <path d="M287 230 H294 L292 237 L290 239 L288 236Z" fill="#99B563" stroke="none"/>
        <path d="M220 288 Q269 302 317 288 L319 337 L279 339 L267 316 L252 341 L213 328Z" fill="#363E35" stroke="#263028" stroke-width="2.5"/>
        <path d="M305 297 L307 329 M310 296 L312 329" stroke="#DDE1D1" stroke-width="2.5"/>
        ${stairs ? '<path d="M215 328 L251 339 L265 375 L300 375 L301 392 L255 394 Q246 393 243 384Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/><path d="M282 338 L313 337 L308 410 L287 410Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/><path d="M282 396 L309 396 L308 418 L286 418Z" fill="#F6F4E8" stroke="#ADB7A9" stroke-width="1.5"/><path d="M279 375 L301 375 L305 393 L281 394Z" fill="#F6F4E8" stroke="#ADB7A9" stroke-width="1.5"/><path d="M280 390 L304 388 Q317 384 326 392 L331 400 L279 401Z" fill="#354136" stroke="#263028" stroke-width="2"/>' : '<path d="M215 328 L250 338 L235 379 L224 404 L204 396 L213 364Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/><path d="M282 338 L313 337 L306 411 L285 411Z" fill="#DDA079" stroke="#734D3B" stroke-width="2"/><path d="M207 386 L230 394 L226 412 L202 404Z" fill="#F6F4E8" stroke="#ADB7A9" stroke-width="1.5"/><path d="M283 395 L307 395 L306 418 L284 418Z" fill="#F6F4E8" stroke="#ADB7A9" stroke-width="1.5"/><path d="M204 400 L227 409 L225 421 Q211 424 187 414 Q184 405 204 400Z" fill="#354136" stroke="#263028" stroke-width="2"/><path d="M187 415 Q207 425 225 422" fill="none" stroke="#F8F7EC" stroke-width="4"/>'}
        <path d="M285 412 L307 412 L312 429 Q314 437 302 438 L269 438 Q265 432 275 427Z" fill="#354136" stroke="#263028" stroke-width="2"/>
        <path d="M269 436 H310 M287 420 L302 421 M284 425 L304 426" fill="none" stroke="#F8F7EC" stroke-width="3"/>
        <ellipse cx="223" cy="137" rx="10" ry="15" fill="#DDA079" stroke="#734D3B" stroke-width="2"/>
        <ellipse cx="304" cy="137" rx="9" ry="15" fill="#DDA079" stroke="#734D3B" stroke-width="2"/>
        <path d="M226 104 Q235 75 271 78 Q305 82 305 114 L302 147 Q299 173 271 180 Q242 180 230 156Z" fill="#DDA079" stroke="#734D3B" stroke-width="2.3"/>
        <path d="M229 112 Q228 92 242 81 Q254 71 271 79 L274 66 L282 76 L297 70 L295 81 Q312 87 312 109 L301 126 L296 102 Q286 109 275 105 L280 91 Q265 109 252 108 L256 94 Q241 113 230 124Z" fill="#3E322C" stroke="#2D2723" stroke-width="2.5"/>
        <path d="M229 100 Q235 85 248 80 M254 86 Q270 70 283 77 M289 86 Q302 89 305 98" fill="none" stroke="#685045" stroke-width="3"/>
        <path d="M239 125 Q246 120 253 123 M276 122 Q284 118 291 123" fill="none" stroke="#54392B" stroke-width="2.8"/>
        <ellipse cx="247" cy="135" rx="6" ry="8" fill="#FCF7EB"/><ellipse cx="284" cy="133" rx="6" ry="8" fill="#FCF7EB"/>
        <ellipse cx="249" cy="136" rx="3.4" ry="5.4" fill="#352C26"/><ellipse cx="285" cy="134" rx="3.4" ry="5.4" fill="#352C26"/>
        <circle cx="250" cy="134" r="1.3" fill="white"/><circle cx="286" cy="132" r="1.3" fill="white"/>
        <path d="M267 134 L264 145 Q267 149 272 146" fill="none" stroke="#A96F4F" stroke-width="2"/>
        <path d="M253 157 Q267 167 282 154" fill="none" stroke="#734D3B" stroke-width="2.5"/>
        <path d="M258 158 Q268 161 278 156" fill="none" stroke="#F8DDC3" stroke-width="2.5"/>
        <path d="M222 133 Q229 129 229 141" fill="none" stroke="#A96F4F" stroke-width="2"/>
      </g>
      <g transform="translate(${stairs ? 159 : 173} 425)">
        <circle r="29" fill="#FAFBF4" stroke="#394A40" stroke-width="2.5"/>
        <path d="M-4-12 L10-7 L11 7 L-2 15 L-13 5Z M-24-15 L-14-24 L-5-22 L-4-12 L-17-8Z M21-19 L28-7 L23 2 L11 7 L10-7Z M-21 18 L-14 25 L-2 29 L-2 15 L-13 5 L-23 9Z M15 20 L9 27 L22 19 L26 10 L18 12Z" fill="#394A40"/>
        <path d="M-14-24 L0-28 L15-23 M-17-8 L-23 9 M23 2 L26 10 M-2 15 L9 27" fill="none" stroke="#819087" stroke-width="1.2"/>
      </g>`);
  }

  function fibre({ id = 'fibre', dmd = false, step = 0, labels = false } = {}) {
    const stage = dmd ? Math.round(bound(step, 0, 6)) : 0;
    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '') || 'fibre';
    const state = ['intact membrane, without dystrophin', 'contraction stresses the unsupported membrane',
      'small tears in the membrane', 'excess calcium enters through membrane tears',
      'excess calcium and swollen mitochondria', 'a muscle fibre has been lost over time',
      'lost muscle fibre replaced by fat and scar tissue'][stage];
    let body = '';
    if (stage >= 5) {
      body = `<path d="M91 69 Q233 62 523 69 C553 69 568 97 568 137 C568 177 553 206 523 206 Q230 214 91 206 C59 205 41 177 41 138 C41 98 58 72 91 69Z" fill="#FAEFEB" stroke="#DDC4BF" stroke-width="2" stroke-dasharray="7 6"/>
        <path d="M88 76 L154 72 L140 90 L158 110 L137 133 L151 153 L139 178 L153 204 L88 200 C63 199 48 175 48 139 C48 105 62 80 88 76Z" fill="#E6AAA0"/>
        <path d="M468 72 L523 76 Q557 87 557 139 Q553 185 523 200 L468 203 L479 180 L462 157 L479 135 L463 112 L478 91Z" fill="#E6AAA0"/>
        <path d="M64 119 H138 M63 135 H131 M66 151 H137 M478 119 H540 M479 135 H546 M479 151 H542" stroke="#C77971" stroke-width="5" stroke-linecap="round"/>
        ${nucleus(94, 90)}${nucleus(507, 190)}`;
      if (stage === 5) {
        body += `<path d="M171 104 L188 94 L201 106 L194 123 L175 122Z M221 170 L236 162 L249 176 L239 191 L222 186Z M311 110 L325 98 L342 112 L334 127 L318 124Z M382 161 L395 148 L413 156 L411 175 L393 181Z M430 102 L442 96 L451 107 L444 118 L432 115Z" fill="#D59891"/>
          <path d="M190 146 L205 132 L221 146 L214 161 L196 165Z M272 92 L287 90 L293 106 L279 116 L268 106Z M278 159 L299 152 L309 170 L294 184 L278 178Z M353 128 L370 116 L385 133 L374 148 L357 146Z" fill="#E8BCB2"/>
          <circle cx="249" cy="129" r="5" fill="#B98482"/><circle cx="329" cy="178" r="6" fill="#B98482"/><circle cx="405" cy="120" r="4" fill="#B98482"/>`;
      } else {
        body += `<g fill="${C.cream}" stroke="#DCB249" stroke-width="2">
          <circle cx="190" cy="110" r="26"/><circle cx="228" cy="93" r="22"/><circle cx="236" cy="143" r="29"/>
          <circle cx="184" cy="163" r="28"/><circle cx="279" cy="109" r="25"/><circle cx="282" cy="176" r="24"/>
          <circle cx="339" cy="100" r="25"/><circle cx="338" cy="166" r="28"/><circle cx="392" cy="107" r="26"/>
          <circle cx="411" cy="169" r="27"/><circle cx="449" cy="126" r="23"/>
        </g><g fill="none" stroke-linecap="round">
          <path d="M154 178 Q232 195 315 137 T462 99 M164 195 Q249 185 313 154 T462 117 M167 201 Q250 207 326 171 T462 136" stroke="${C.scar}" stroke-width="9"/>
          <path d="M157 179 Q239 194 315 136 T461 98 M165 195 Q249 184 315 152 T460 116 M170 201 Q250 207 326 170 T460 136" stroke="#D6BEDB" stroke-width="3"/>
          <path d="M260 82 Q281 118 330 140 T448 190 M275 77 Q293 115 338 129 T455 179" stroke="${C.scar}" stroke-width="6"/>
        </g>`;
      }
    } else {
      body = `<path d="M91 66 Q266 58 524 65 C552 65 571 94 571 137 C571 181 551 211 524 210 Q300 217 91 210 C58 209 39 180 39 138 C39 96 58 68 91 66Z" fill="${C.coralLight}" stroke="${C.coralDark}" stroke-width="2.2"/>
        <path d="M88 76 Q288 67 523 75 M88 199 Q290 206 523 199" fill="none" stroke="#FDE0CE" stroke-width="5"/>
        <path d="M88 105 Q281 98 523 103 L523 175 Q293 184 88 177 Q68 176 67 140 Q68 108 88 105Z" fill="#D66E65"/>
        ${[113, 128, 143, 158, 173].map((y, row) => `<g>
          <path d="M86 ${y} Q293 ${y - 5} 531 ${y - 1}" fill="none" stroke="#A94E4C" stroke-width="10" stroke-linecap="round"/>
          <path d="M86 ${y - 2} Q293 ${y - 7} 531 ${y - 3}" fill="none" stroke="#F8A28B" stroke-width="6" stroke-linecap="round"/>
          ${[113, 172, 231, 290, 349, 408, 467].map(x => `<path d="M${x + row % 2 * 4} ${y - 6} v8" stroke="#FFE1BD" stroke-width="2"/>`).join('')}
        </g>`).join('')}
        <path d="M89 103 H514 M89 174 H514" stroke="#A56844" stroke-width="2.3"/>
        ${!dmd ? [141, 224, 307, 390, 473].map(x => link(x) + link(x, true)).join('') : ''}
        ${nucleus(115, 78)}${nucleus(351, 76, 3)}${nucleus(486, 79, 5)}
        ${nucleus(112, 197, 7)}${nucleus(350, 201, -3)}${nucleus(491, 197, -8)}
        ${mito(179, 92, stage === 4 ? 1.37 : .82, stage === 4)}
        ${mito(423, 91, stage === 4 ? 1.25 : .78, stage === 4)}
        ${mito(199, 188, stage === 4 ? 1.45 : .9, stage === 4)}
        ${mito(423, 186, stage === 4 ? 1.5 : .9, stage === 4)}
        <ellipse cx="533" cy="138" rx="29" ry="69" fill="#F4A092" stroke="${C.coralDark}" stroke-width="2.2"/>
        <ellipse cx="533" cy="138" rx="22" ry="59" fill="#F7B8A7" stroke="#FAD6C1" stroke-width="3"/>
        ${[[531, 99], [524, 117], [539, 117], [522, 138], [539, 138], [524, 159], [539, 159], [531, 178]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.3" ry="7.2" fill="#D77468" stroke="#BD5D56" stroke-width="1.2"/>`).join('')}`;
      if (stage >= 2) body += `<g fill="#FFFDF7" stroke="#D2926F" stroke-width="2" stroke-linejoin="round">
        <path d="M261 62 L255 78 L263 87 L255 105 L270 91 L266 79 L276 63"/>
        <path d="M447 64 L439 80 L446 89 L435 107 L452 93 L450 81 L460 65"/>
        <path d="M313 212 L320 194 L313 185 L324 171 L320 189 L329 196 L325 213"/>
      </g>`;
      if (stage >= 3) body += [[259, 42], [284, 52], [253, 22], [443, 40], [470, 51], [466, 25], [265, 112], [277, 137], [249, 159], [301, 120], [322, 142], [356, 119], [375, 153], [414, 133], [452, 116], [479, 151], [324, 226], [307, 246]].map(([x, y], i) => calcium(x, y, i % 3 === 0 ? 4.5 : 3.7)).join('') +
        '<path d="M280 29 Q277 42 268 62 M458 30 Q450 41 448 61" fill="none" stroke="#B17B1C" stroke-width="2.5" stroke-linecap="round"/><path d="M263 57 L268 65 L275 59 M443 56 L448 64 L454 58" fill="none" stroke="#B17B1C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
      if (stage === 1) body += `<g fill="none" stroke="${C.olive}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M126 37 Q173 20 214 37 M204 29 L216 38 L202 41 M463 37 Q416 20 375 37 M387 29 L373 38 L388 41"/>
        <path d="M66 121 L78 130 L67 140 L78 151 M499 120 L487 130 L499 141 L488 152" stroke="#9E5146"/>
      </g>`;
    }
    let labelArt = '';
    if (labels && stage < 5) labelArt = `<g font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="${C.ink}">
      <text x="49" y="28">Nucleus</text><path d="M101 35 L113 66" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
      <text x="475" y="28">Membrane</text><path d="M515 35 L538 65" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
      <text x="132" y="254">Mitochondrion</text><path d="M211 235 L202 207" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
      ${!dmd ? `<text x="274" y="28">Dystrophin</text><path d="M313 35 L308 76" fill="none" stroke="${C.ink}" stroke-width="1.5"/>` : ''}
    </g>`;
    return svg('0 0 600 270', `${dmd ? 'DMD' : 'Healthy'} muscle fibre: ${dmd ? state : 'an intact membrane, peripheral nuclei, mitochondria and internal dystrophin links supporting the membrane'}.`,
      `<g class="fibre-body" data-fibre="${safeId}">${body}</g>${labelArt}`);
  }

  function membrane({ placed = false } = {}) {
    // Cross-section: extracellular space above; every part of dystrophin is on
    // the cytoplasmic (lower) side and connects actin to a membrane complex.
    const heads = Array.from({ length: 31 }, (_, i) => 10 + i * 22);
    const rod = '<path d="M287 259 L310 246 L328 237 L350 224 L370 212 L393 199 L410 190" fill="none" stroke="#5F7F2A" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="M287 259 L310 246 L328 237 L350 224 L370 212 L393 199 L410 190" fill="none" stroke="#C5DE58" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M304 240 L313 253 M342 217 L351 230 M382 193 L391 206" stroke="#839E34" stroke-width="2.5"/>';
    return svg('0 0 680 340', placed
      ? 'Dystrophin is placed inside the cell, linking the internal actin cytoskeleton to a protein complex in the cell membrane.'
      : 'A cell membrane separates the outside above from the muscle cell below. A dotted target inside the cell joins an internal filament to a membrane protein complex.', `
      <path d="M0 0 H680 V128 H0Z" fill="#F7F8EE"/>
      <path d="M0 172 H680 V340 H0Z" fill="#FFF0E8"/>
      <path d="M0 132 H680 V168 H0Z" fill="#F2B0A0"/>
      <g stroke="#C9796B" stroke-width="2" stroke-linecap="round">
        ${heads.map(x => `<path d="M${x - 3} 138 L${x - 5} 149 M${x + 3} 138 L${x + 5} 149 M${x - 3} 163 L${x - 5} 153 M${x + 3} 163 L${x + 5} 153"/>`).join('')}
      </g><g fill="#EA9A89" stroke="#C9796B" stroke-width="1.5">
        ${heads.map(x => `<circle cx="${x}" cy="131" r="7"/><circle cx="${x}" cy="170" r="7"/>`).join('')}
      </g>
      <path d="M396 113 Q411 102 427 113 L433 174 Q430 192 412 194 Q394 191 390 178Z" fill="#90BEB3" stroke="#527D72" stroke-width="2.5"/>
      <path d="M406 119 L402 172 Q404 184 414 184" fill="none" stroke="#CAE0D1" stroke-width="5" stroke-linecap="round"/>
      <path d="M65 273 H604" stroke="#BC6457" stroke-width="10" stroke-linecap="round"/>
      ${Array.from({ length: 27 }, (_, i) => `<ellipse cx="${73 + i * 20}" cy="273" rx="11.5" ry="9.5" fill="${i % 2 ? '#E99A80' : '#F3B49A'}" stroke="#C77561" stroke-width="1.8"/>`).join('')}
      ${placed ? `<g class="placed-dystrophin">${rod}</g>` : '<path class="dystrophin-target" d="M277 247 L400 177 Q412 172 422 184 Q429 196 416 205 L294 277 Q282 280 275 268 Q270 255 277 247Z" fill="#EEF0D5" stroke="#5E7837" stroke-width="2.5" stroke-dasharray="7 6"/>'}
      <g font-family="system-ui, sans-serif" fill="${C.ink}">
        <text x="28" y="46" font-size="18" font-weight="650">Outside the cell</text>
        <text x="28" y="318" font-size="18" font-weight="650">Inside the muscle cell</text>
        <text x="459" y="80" font-size="16">Membrane anchor</text>
        <path d="M478 89 L433 119" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
        <text x="463" y="226" font-size="16">${placed ? 'Dystrophin in place' : 'Dystrophin fits here'}</text>
        <path d="M454 222 L404 212" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
        <text x="462" y="318" font-size="16">Internal actin filament</text>
        <path d="M521 300 V286" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
      </g>`);
  }

  function tissue({ damaged = 0, total = 24 } = {}) {
    const n = Math.round(bound(total, 1, 48));
    const count = Math.round(bound(damaged, 0, n));
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (a * 37 + 13) % 101 - (b * 37 + 13) % 101);
    const damagedSet = new Set(order.slice(0, count));
    const cols = Math.ceil(Math.sqrt(n * 1.5));
    const rows = Math.ceil(n / cols);
    const w = Math.min(80, 510 / (cols + .45));
    const h = Math.min(67, 270 / rows);
    const ox = (600 - (cols + .45) * w) / 2 + w / 2;
    const oy = (330 - rows * h) / 2 + h / 2;
    return svg('0 0 600 330', `Muscle tissue in cross-section. ${n - count} intact fibres and ${count} damaged fibres. Damaged fibres have visible cracks.`,
      `<path d="M40 70 Q51 21 112 25 L487 25 Q551 27 561 81 L565 246 Q555 304 491 306 L110 306 Q46 305 35 251Z" fill="#F2F0E7"/>
      ${Array.from({ length: n }, (_, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const x = ox + col * w + (row % 2 ? w * .45 : 0), y = oy + row * h;
        const bad = damagedSet.has(i);
        const dx = w * .47, dy = h * .46;
        const p = `${-dx * .92},${-dy * .55} ${-dx * .42},${-dy} ${dx * .57},${-dy * .94} ${dx},${-dy * .2} ${dx * .87},${dy * .66} ${dx * .12},${dy} ${-dx * .78},${dy * .7}`;
        return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          <polygon points="${p}" fill="${bad ? '#E8A091' : i % 3 ? '#A5BC6C' : '#B7CA80'}" stroke="${bad ? '#B95F55' : '#608343'}" stroke-width="2.5"/>
          <polygon points="${p}" transform="scale(.78)" fill="${bad ? '#EFB4A3' : '#C6D79B'}"/>
          <ellipse cx="${(-dx * .68).toFixed(1)}" cy="${(dy * .2).toFixed(1)}" rx="4" ry="7" transform="rotate(-16)" fill="${C.purpleDark}"/>
          ${bad ? `<path d="M${-dx * .45} ${-dy * .65} L-3-5 L${dx * .38} -1 L1 9 L${dx * .54} ${dy * .65} M-3-5 L-10 7 L${-dx * .65} 10" fill="none" stroke="#9C5049" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>` : `<g fill="#91AA5D"><circle cx="-8" cy="-7" r="2.7"/><circle cx="8" cy="-9" r="2.7"/><circle cx="14" cy="6" r="2.7"/><circle cx="-1" cy="10" r="2.7"/></g>`}
        </g>`;
      }).join('')}`);
  }

  function sample(kind = 'healthy') {
    if (kind === 'skin') return svg('0 0 320 210', 'Skin sample: flattened cells arranged in layers, unlike muscle fibres in cross-section.', `
      <rect x="10" y="12" width="300" height="186" rx="12" fill="#F4E5DC"/>
      <path d="M15 31 Q89 21 160 31 T305 29" fill="none" stroke="#C89385" stroke-width="12"/>
      ${Array.from({ length: 4 }, (_, row) => Array.from({ length: 6 }, (_, col) => {
        const x = 15 + col * 48 + (row % 2 ? 5 : 0), y = 39 + row * 29;
        return `<path d="M${x} ${y + 4} Q${x + 21} ${y - 4} ${x + 43} ${y + 3} L${x + 42} ${y + 24} Q${x + 18} ${y + 29} ${x + 1} ${y + 23}Z" fill="${row % 2 ? '#E9BEB0' : '#F2CFBF'}" stroke="#C38F84" stroke-width="1.7"/><ellipse cx="${x + 22}" cy="${y + 14}" rx="5.5" ry="3.3" fill="${C.purple}"/>`;
      }).join('')).join('')}
      <path d="M18 169 Q72 153 128 169 T302 166 M18 184 Q92 169 157 184 T302 182" fill="none" stroke="#C8A6BC" stroke-width="6"/>
    `);
    const dmd = kind === 'dmd';
    const cells = [
      [48, 45, 30, 28], [108, 42, 29, 26], [169, 45, 30, 29], [230, 43, 29, 28], [283, 45, 21, 28],
      [30, 101, 21, 29], [79, 100, 29, 28], [140, 102, 30, 30], [200, 101, 29, 29], [261, 102, 30, 31],
      [48, 160, 30, 28], [110, 161, 30, 27], [170, 163, 28, 28], [231, 162, 29, 27], [283, 161, 21, 28]
    ];
    return svg('0 0 320 210', dmd
      ? 'DMD muscle sample: irregular muscle fibres with missing or broken dystrophin support around their edges, and wider spaces containing replacement tissue.'
      : 'Healthy muscle sample: closely packed muscle fibres with continuous green dystrophin support just inside each membrane.', `
      <rect x="8" y="10" width="304" height="190" rx="12" fill="${dmd ? '#F1DCD5' : '#F0E9DF'}"/>
      ${cells.map(([x, y, rx, ry], i) => {
        const size = dmd ? [.69, .92, .57, .86, .76][i % 5] : .93;
        const points = `${-rx * .83},${-ry * .68} ${-rx * .07},${-ry} ${rx * .85},${-ry * .68} ${rx},${ry * .35} ${rx * .39},${ry} ${-rx * .63},${ry * .83} ${-rx},${ry * .04}`;
        return `<g transform="translate(${x} ${y}) scale(${size})"><polygon points="${points}" fill="#ECA28E" stroke="#BE7766" stroke-width="1.5"/>
          <polygon points="${points}" transform="scale(.87)" fill="#F4B5A0" stroke="${dmd ? '#D88674' : '#768E35'}" stroke-width="${dmd ? 1.7 : 4}" ${dmd && i % 3 === 0 ? 'stroke-dasharray="8 12"' : ''}/>
          <ellipse cx="${-rx * .63}" cy="${ry * .2}" rx="3" ry="5.5" fill="${C.purpleDark}"/>
          <g fill="#D88D78"><circle cx="-5" cy="-8" r="2.3"/><circle cx="8" cy="-2" r="2.3"/><circle cx="-2" cy="9" r="2.3"/></g></g>`;
      }).join('')}
      ${dmd ? `<g fill="#FFF0B0" stroke="#D2B16B" stroke-width="1.4"><circle cx="160" cy="48" r="9"/><circle cx="180" cy="70" r="8"/><circle cx="137" cy="142" r="10"/><circle cx="153" cy="156" r="8"/><circle cx="286" cy="133" r="7"/></g><path d="M16 137 Q81 124 118 145 T190 139 Q235 119 305 134 M17 144 Q83 132 118 151 T192 146 Q242 126 304 141" fill="none" stroke="#AA89B4" stroke-width="3" stroke-linecap="round"/>` : ''}`);
  }
  return { adam, fibre, membrane, tissue, sample };
})();
