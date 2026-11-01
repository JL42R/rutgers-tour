import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Dialogue } from '../src/dialogue.js';
import { NPCManager } from '../src/npc.js';
import { InteractionTracker, TOUR_PROGRESS_STORAGE_KEY } from '../src/interaction-tracker.js';

const hallway = JSON.parse(readFileSync(new URL('../public/dialogue/hallway-guide.json', import.meta.url)));
const guide = { id: 'hallway-guide', name: 'CORE Guide', dialogueFile: '/hallway.json' };
const ordinary = { id: 'ordinary-guide', name: 'Ordinary', dialogueFile: '/ordinary.json' };
const ordinaryScript = { name: 'Ordinary', nodes: {
  start: { text: 'Scripted choice', choices: [{ label: 'Ask Johnny', action: 'ask-ai' }, { label: 'Finish', next: 'done' }] },
  done: { text: 'Scripted ending' }
} };
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(t) {
  const previous = { document: globalThis.document, window: globalThis.window,
    HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch };
  let doc;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
      this.style = {}; this.attributes = new Map(); this.handlers = new Map();
      this.hidden = false; this.disabled = false; this.value = ''; this._text = '';
      const classes = new Set();
      this.classList = { add: x => classes.add(x), remove: x => classes.delete(x),
        contains: x => classes.has(x), toggle(x, force) {
          const selected = force ?? !classes.has(x); if (selected) classes.add(x); else classes.delete(x);
          return selected;
        } };
    }
    get parentElement() { return this.parentNode; }
    get isConnected() { return this === doc.documentElement || Boolean(this.parentNode?.isConnected); }
    get firstElementChild() { return this.children[0] ?? null; }
    set textContent(value) { this._text = String(value ?? ''); this.replaceChildren(); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set innerHTML(value) { assert.equal(value, '', 'Only clearing existing static containers may use innerHTML'); this._text = ''; this.replaceChildren(); }
    get innerHTML() { return ''; }
    appendChild(child) {
      if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
      child.parentNode = this; this.children.push(child); return child;
    }
    append(...children) { children.forEach(c => this.appendChild(c)); }
    replaceChildren(...children) {
      this.children.forEach(c => { c.parentNode = null; }); this.children = [];
      children.forEach(c => this.appendChild(c));
    }
    contains(child) { return child === this || this.children.some(c => c.contains(child)); }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    hasAttribute(k) { return this.attributes.has(k); }
    matches(selector) {
      if (selector === ':disabled') return this.disabled;
      return selector.split(',').some(part => {
        const s = part.trim();
        if (s.startsWith('[tabindex')) return this.hasAttribute('tabindex') && this.getAttribute('tabindex') !== '-1';
        if (s === '[href]') return this.hasAttribute('href');
        if (s.endsWith('[href]')) return this.tagName === s.split('[')[0].toUpperCase() && this.hasAttribute('href');
        return this.tagName === s.toUpperCase();
      });
    }
    querySelectorAll(selector) {
      return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
    }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    emit(type, values = {}) { const event = { type, preventDefault() { this.prevented = true; }, ...values };
      for (const fn of this.handlers.get(type) ?? []) fn(event); return event; }
    click() { if (!this.disabled) this.emit('click'); }
    focus() { if (!this.disabled && this.isConnected) doc.activeElement = this; }
    getClientRects() { return this.hidden || !this.isConnected ? [] : [{}]; }
    setCustomValidity(text) { this.validationMessage = text; }
    reportValidity() { this.reported = true; }
    getContext() { return { beginPath() {}, arc() {}, fill() {}, stroke() {}, fillText() {} }; }
  }
  doc = { handlers: new Map(), createElement: tag => new Element(tag) };
  doc.documentElement = new Element('html'); doc.documentElement.lang = 'en';
  doc.body = new Element('body'); doc.documentElement.appendChild(doc.body);
  doc.getElementById = id => {
    const find = el => el.id === id ? el : el.children.map(find).find(Boolean);
    return find(doc.documentElement) ?? null;
  };
  doc.addEventListener = (type, fn) => {
    if (!doc.handlers.has(type)) doc.handlers.set(type, []); doc.handlers.get(type).push(fn);
  };
  doc.emitKey = values => {
    const event = { preventDefault() { this.prevented = true; }, ...values };
    for (const fn of doc.handlers.get('keydown') ?? []) fn(event);
    return event;
  };
  function add(id, tag = 'div', parent = doc.body) {
    const el = doc.createElement(tag); el.id = id; parent.appendChild(el); return el;
  }
  const app = add('app'); app.setAttribute('tabindex', '0');
  const el = add('dialogue');
  for (const id of ['dlg-name', 'dlg-text', 'dlg-choices', 'dlg-portrait', 'dlg-narration-state']) add(id, 'div', el);
  add('dlg-narration', 'button', el);
  for (const id of ['interact-prompt', 'guide-direction', 'guide-direction-arrow', 'guide-direction-name',
    'guide-direction-distance', 'tour-progress', 'tour-progress-toggle-icon', 'tour-progress-compact-count',
    'tour-progress-announcement', 'tour-progress-body', 'tour-progress-summary', 'tour-progress-zones', 'tour-progress-complete']) add(id);
  for (const id of ['tour-progress-toggle', 'tour-progress-reset']) add(id, 'button');
  add('tour-progress-bar', 'div', add('progress-wrapper'));
  const storage = new Map(), spoken = [], speech = { cancels: 0, cancel() { this.cancels++; }, speak(u) { spoken.push(u.text); } };
  globalThis.document = doc; globalThis.HTMLElement = Element;
  globalThis.window = { getComputedStyle: el => ({ display: el.style.display ?? 'block', visibility: 'visible' }),
    speechSynthesis: speech, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } };
  globalThis.fetch = () => { throw new Error('Tests preload script data; no HTTP expected'); };
  t.after(() => Object.assign(globalThis, previous));
  const dialogue = new Dialogue();
  dialogue.cache.set(guide.dialogueFile, hallway); dialogue.cache.set(ordinary.dialogueFile, ordinaryScript);
  app.focus();
  return { dialogue, doc, app, storage, spoken, speech };
}

function provider(ask = async () => ({ stale: false, response: 'Canonical fictional answer.' })) {
  const value = { npcId: guide.id, resets: 0, disclosure: 'DEVELOPMENT PREVIEW — fictional only.',
    prompt: 'Ask a fictional question.', inputLabel: 'Development question', inputPlaceholder: 'Fictional question',
    validationMessage: 'Use 1–300 characters.', pendingMessage: 'Pending localhost request…',
    errorMessage: 'The local preview is unavailable.', ask, reset() { value.resets++; },
    getState() { return { topicIds: [], specialistNpcIds: [], destinationZoneIds: [] }; } };
  return value;
}
function beginQuestion(dialogue, question = 'A fictional question?') {
  dialogue.showAIQuestionForm();
  const form = dialogue.choicesEl.children[0], input = form.children[0];
  const [ask, cancel] = form.children[1].children;
  input.value = question;
  return { input, pending: dialogue.submitAIQuestion(input, ask, cancel) };
}
function finishScript(dialogue) { while (dialogue.data.nodes[dialogue.currentNodeId].next) dialogue.showNode(dialogue.data.nodes[dialogue.currentNodeId].next); }

test('Dialogue local: no provider preserves scripted buttons, completion and focus restoration', async t => {
  const { dialogue, app } = setup(t); const completions = [];
  dialogue.onComplete = id => completions.push(id);
  await dialogue.start(guide);
  assert.equal(dialogue.textEl.textContent, hallway.nodes.start.text);
  assert.equal(dialogue.choicesEl.firstElementChild.textContent, 'Continue');
  finishScript(dialogue);
  assert.deepEqual(dialogue.choicesEl.children.map(b => b.textContent), ['Close']);
  dialogue.close();
  assert.deepEqual(completions, ['hallway-guide']);
  assert.equal(document.activeElement, app);
});

test('Dialogue local: existing non-provider AI TEST echo and completion semantics remain unchanged', async t => {
  const { dialogue } = setup(t); const completions = [];
  dialogue.onComplete = id => completions.push(id);
  await dialogue.start(ordinary);
  await beginQuestion(dialogue, 'Hello Johnny').pending;
  assert.equal(dialogue.textEl.textContent, 'AI TEST: Johnny received your question: Hello Johnny');
  dialogue.close(); assert.deepEqual(completions, ['ordinary-guide']);
});

test('Dialogue local: automatic welcome explicitly suppresses registered provider and remains scripted', async t => {
  const { dialogue } = setup(t); const p = provider(); dialogue.registerQuestionProvider(guide.id, p);
  await dialogue.start(guide, { allowQuestionProvider: false });
  finishScript(dialogue);
  assert.equal(dialogue.activeQuestionProvider, null);
  assert.deepEqual(dialogue.choicesEl.children.map(b => b.textContent), ['Close']);
  dialogue.close();
  await dialogue.start(guide);
  finishScript(dialogue);
  assert.match(dialogue.choicesEl.firstElementChild.textContent, /Ask a development question/);
});

test('Dialogue local: pending text and validated result use textContent with no HTML interpretation', async t => {
  const { dialogue, doc } = setup(t); let resolve;
  const p = provider(() => new Promise(r => { resolve = r; }));
  dialogue.registerQuestionProvider(guide.id, p); await dialogue.start(guide);
  const { pending } = beginQuestion(dialogue);
  assert.equal(dialogue.textEl.textContent, p.pendingMessage);
  assert.equal(doc.activeElement, dialogue.choicesEl.firstElementChild);
  resolve({ stale: false, response: '<img src=x onerror=unsafe> Canonical text.' });
  await pending;
  assert.equal(dialogue.textEl.textContent, '<img src=x onerror=unsafe> Canonical text.');
  assert.equal(dialogue.textEl.children.length, 0);
  assert.equal(dialogue.aiSubmitting, false);
});

test('Dialogue local: provider errors are friendly, private and never create completion credit', async t => {
  const { dialogue } = setup(t); const logs = [], completions = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(console, 'warn', (...args) => logs.push(args));
  const p = provider(async () => { throw new Error('private-question-and-network-secret'); });
  dialogue.registerQuestionProvider(guide.id, p); dialogue.onComplete = id => completions.push(id);
  await dialogue.start(guide);
  await beginQuestion(dialogue).pending;
  assert.equal(dialogue.textEl.textContent, p.errorMessage);
  assert.doesNotMatch(JSON.stringify(logs), /private-question-and-network-secret/);
  dialogue.close(); assert.deepEqual(completions, []);
});

test('Dialogue local: a successful preview alone does not invent scripted completion', async t => {
  const { dialogue } = setup(t); const completions = [];
  dialogue.registerQuestionProvider(guide.id, provider()); dialogue.onComplete = id => completions.push(id);
  await dialogue.start(guide); await beginQuestion(dialogue).pending;
  dialogue.close(); assert.deepEqual(completions, []);
});

test('Dialogue local: existing scripted terminal still earns completion after an unsupported preview', async t => {
  const { dialogue } = setup(t); const completions = [];
  dialogue.registerQuestionProvider(guide.id, provider(async () => ({ stale: false, response: 'No verified answer.' })));
  dialogue.onComplete = id => completions.push(id);
  await dialogue.start(guide); finishScript(dialogue);
  await beginQuestion(dialogue).pending; dialogue.close();
  await dialogue.start(guide); finishScript(dialogue); dialogue.close();
  assert.deepEqual(completions, ['hallway-guide']);
});

test('Dialogue local: empty and over-300-character questions never invoke the provider', async t => {
  const { dialogue } = setup(t); let calls = 0;
  dialogue.registerQuestionProvider(guide.id, provider(async () => { calls++; }));
  await dialogue.start(guide);
  for (const question of ['', 'x'.repeat(301)]) {
    const { input, pending } = beginQuestion(dialogue, question); await pending;
    assert.equal(input.maxLength, 300); assert.equal(input.reported, true);
    assert.equal(document.activeElement, input);
  }
  assert.equal(calls, 0);
});

test('Dialogue local: Escape cancels pending work, clears preview DOM, restores controls/focus and ignores late results', async t => {
  const { dialogue, doc, app } = setup(t); let resolve, enabled = true;
  const p = provider(() => new Promise(r => { resolve = r; }));
  dialogue.registerQuestionProvider(guide.id, p);
  dialogue.onOpen = () => { enabled = false; }; dialogue.onClose = () => { enabled = true; };
  await dialogue.start(guide); const { pending } = beginQuestion(dialogue);
  const before = p.resets;
  doc.emitKey({ code: 'Escape', key: 'Escape' });
  assert.equal(enabled, true); assert.equal(dialogue.isOpen, false);
  assert.ok(p.resets > before); assert.equal(doc.activeElement, app);
  assert.equal(dialogue.textEl.textContent, ''); assert.equal(dialogue.choicesEl.children.length, 0);
  resolve({ response: 'Late private answer' }); await pending;
  assert.equal(dialogue.textEl.textContent, '');
});

test('Dialogue local: return to script resets pending work and rejects its late response', async t => {
  const { dialogue } = setup(t); let resolve;
  const p = provider(() => new Promise(r => { resolve = r; }));
  dialogue.registerQuestionProvider(guide.id, p); await dialogue.start(guide);
  const { pending } = beginQuestion(dialogue);
  dialogue.returnToScriptedDialogue();
  assert.equal(dialogue.textEl.textContent, hallway.nodes.start.text);
  resolve({ response: 'Late answer' }); await pending;
  assert.equal(dialogue.textEl.textContent, hallway.nodes.start.text);
  assert.equal(dialogue.aiMode, false);
});

test('Dialogue local: changing NPC invalidates previous provider results', async t => {
  const { dialogue } = setup(t); let resolve;
  dialogue.registerQuestionProvider(guide.id, provider(() => new Promise(r => { resolve = r; })));
  await dialogue.start(guide); const { pending } = beginQuestion(dialogue);
  await dialogue.start(ordinary);
  resolve({ response: 'Wrong NPC late answer' }); await pending;
  assert.equal(dialogue.activeNpcId, ordinary.id);
  assert.equal(dialogue.activeQuestionProvider, null);
  assert.equal(dialogue.textEl.textContent, 'Scripted choice');
});

test('Dialogue local: a second question supersedes the first in pending UI', async t => {
  const { dialogue } = setup(t); const resolves = [];
  dialogue.registerQuestionProvider(guide.id, provider(() => new Promise(r => resolves.push(r))));
  await dialogue.start(guide);
  const first = beginQuestion(dialogue, 'First?');
  const second = beginQuestion(dialogue, 'Second?');
  resolves[1]({ response: 'Second canonical result' }); await second.pending;
  resolves[0]({ response: 'First late result' }); await first.pending;
  assert.equal(dialogue.textEl.textContent, 'Second canonical result');
});

test('Dialogue local: form focus, numeric typing, Tab wrapping and return button remain usable', async t => {
  const { dialogue, doc } = setup(t); dialogue.registerQuestionProvider(guide.id, provider());
  await dialogue.start(guide); dialogue.showAIQuestionForm();
  const input = doc.getElementById('dlg-ai-question');
  assert.equal(doc.activeElement, input);
  assert.match(dialogue.textEl.textContent, /DEVELOPMENT PREVIEW/);
  assert.equal(input.getAttribute('aria-label'), 'Development question');
  doc.emitKey({ key: '1', code: 'Digit1' });
  assert.equal(dialogue.aiMode, true); assert.equal(doc.activeElement, input);
  const controls = dialogue.getFocusableControls();
  controls.at(-1).focus();
  assert.equal(doc.emitKey({ key: 'Tab', shiftKey: false }).prevented, true);
  assert.equal(doc.activeElement, controls[0]);
  controls[0].focus();
  doc.emitKey({ key: 'Tab', shiftKey: true });
  assert.equal(doc.activeElement, controls.at(-1));
  dialogue.returnToScriptedDialogue();
  assert.equal(dialogue.choiceShortcutsEnabled, true);
});

test('Dialogue local: narration stays opt-in and follows pending/result text', async t => {
  const { dialogue, spoken, speech } = setup(t); dialogue.registerQuestionProvider(guide.id, provider());
  await dialogue.start(guide); assert.equal(spoken.length, 0);
  dialogue.narrationButton.click();
  assert.equal(spoken.at(-1), hallway.nodes.start.text);
  await beginQuestion(dialogue).pending;
  assert.equal(spoken.at(-1), 'Canonical fictional answer.');
  assert.equal(dialogue.currentText, dialogue.textEl.textContent);
  dialogue.close(); assert.ok(speech.cancels > 0);
});

test('Dialogue local: current NPC manager and tracker retain E selection, completion and discoverability', async t => {
  const { dialogue, storage } = setup(t);
  const tracker = new InteractionTracker();
  tracker.setConfig({ zones: [{ id: 'hallway', npcs: [guide, ordinary] }] });
  dialogue.onComplete = id => tracker.complete(id);
  const manager = new NPCManager(new THREE.Scene(), dialogue, {
    isCompleted: id => tracker.completedNpcIds.has(id)
  });
  manager.setNPCs([{ ...guide, position: [0, 1.6, 0], radius: 2 }, { ...ordinary, position: [5, 1.6, 0], radius: 2 }]);
  manager.update({ x: 0, z: 0 });
  document.emitKey({ code: 'KeyE', key: 'e' }); await tick();
  assert.equal(dialogue.activeNpcId, guide.id);
  finishScript(dialogue); dialogue.close();
  assert.equal(tracker.completedNpcIds.has(guide.id), true);
  assert.deepEqual(JSON.parse(storage.get(TOUR_PROGRESS_STORAGE_KEY)), ['hallway-guide']);
  manager.update({ x: 0, z: 3 });
  assert.equal(manager.directionTargetId, ordinary.id);
  assert.equal(manager.directionEl.hidden, false);
  assert.doesNotMatch(JSON.stringify([...storage.values()]), /question|Canonical fictional/);
});

test('Dialogue local: closing during a slow script fetch cannot reopen a stale NPC', async t => {
  const { dialogue } = setup(t); let resolve;
  globalThis.fetch = () => new Promise(r => { resolve = r; });
  const starting = dialogue.start({ ...guide, dialogueFile: '/slow-script.json' });
  dialogue.close();
  resolve(new Response(JSON.stringify(hallway))); await starting;
  assert.equal(dialogue.isOpen, false);
});

test('Dialogue local: provider registration requires a matching trusted NPC interface', t => {
  const { dialogue } = setup(t);
  assert.throws(() => dialogue.registerQuestionProvider('', provider()), /matching NPC/);
  assert.throws(() => dialogue.registerQuestionProvider(ordinary.id, provider()), /matching NPC/);
});
