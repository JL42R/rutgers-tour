// dialogue.js — the conversation UI. Dialogue lives in JSON files
// (public/dialogue/*.json) as a set of named "nodes". Each node has text
// and either choices (branching), a "next" node, or "end": true.
// The UI is plain HTML, so keyboards and screen readers work for free.
// Press number keys 1-9 to pick a choice, or Escape to close.

export class Dialogue {
  constructor() {
    this.el = document.getElementById('dialogue');
    this.nameEl = document.getElementById('dlg-name');
    this.textEl = document.getElementById('dlg-text');
    this.choicesEl = document.getElementById('dlg-choices');
    this.portraitEl = document.getElementById('dlg-portrait');
    this.narrationButton = document.getElementById('dlg-narration');
    this.narrationStateEl = document.getElementById('dlg-narration-state');
    this.narrationSupported = !!window.speechSynthesis &&
      typeof window.SpeechSynthesisUtterance === 'function';
    this.narrationEnabled = false; // opt-in; remembered only until the page reloads
    this.currentText = '';
    this.currentUtterance = null;
    this.cache = new Map(); // dialogue files fetched once, reused after
    this.data = null;
    this.isOpen = false;
    this.currentNodeId = null;
    this.aiReturnNodeId = null;
    this.aiMode = false;
    this.aiSubmitting = false;
    this.choiceShortcutsEnabled = true;
    this.previouslyFocused = null;
    this.onOpen = null;   // main.js hooks these to pause/resume movement
    this.onClose = null;

    this.narrationButton.disabled = !this.narrationSupported;
    this.narrationButton.setAttribute('aria-pressed', String(this.narrationEnabled));
    this.narrationStateEl.textContent = this.narrationSupported ? 'Off' : 'Unavailable in this browser';

    this.narrationButton.addEventListener('click', () => {
      if (!this.narrationSupported) return;
      this.narrationEnabled = !this.narrationEnabled;
      this.narrationButton.setAttribute('aria-pressed', String(this.narrationEnabled));
      this.narrationStateEl.textContent = this.narrationEnabled ? 'On' : 'Off';
      if (this.narrationEnabled) this.speakCurrentText();
      else this.stopNarration();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      if (e.key === 'Tab') {
        const controls = this.getFocusableControls();
        if (!controls.length) {
          e.preventDefault();
          return;
        }

        const first = controls[0];
        const last = controls[controls.length - 1];
        const activeIndex = controls.indexOf(document.activeElement);
        if (activeIndex === -1) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
          return;
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
          return;
        }
      }
      const n = parseInt(e.key, 10);
      if (this.choiceShortcutsEnabled && n >= 1 && n <= 9) {
        this.choicesEl.children[n - 1]?.click();
      }
    });
  }

  getFocusableControls() {
    const candidates = this.el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return [...candidates].filter((element) => {
      if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
      if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
  }

  isAppropriateFocusTarget(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (this.el.contains(element) || element.matches(':disabled')) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const nativeFocusable = element.matches(
      'button, input, select, textarea, a[href], area[href], iframe, object, embed'
    );
    return nativeFocusable || element.isContentEditable || element.hasAttribute('tabindex');
  }

  async start(npc) {
    this.resetAIState();
    this.currentNodeId = null;
    if (!this.cache.has(npc.dialogueFile)) {
      const res = await fetch(npc.dialogueFile);
      if (!res.ok) {
        console.error(`Missing dialogue file: ${npc.dialogueFile}`);
        return;
      }
      this.cache.set(npc.dialogueFile, await res.json());
    }
    this.data = this.cache.get(npc.dialogueFile);

    this.nameEl.textContent = this.data.name ?? npc.name ?? 'Guide';
    this.portraitEl.innerHTML = '';
    if (npc.portrait) {
      const img = document.createElement('img');
      img.src = npc.portrait;
      img.alt = '';
      this.portraitEl.appendChild(img);
    } else {
      this.portraitEl.textContent = (this.nameEl.textContent)[0].toUpperCase();
    }

    this.previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.isOpen = true;
    this.el.classList.add('open');
    this.onOpen?.();
    this.showNode('start');
  }

  showNode(id) {
    const node = this.data.nodes[id];
    if (!node) { console.error(`Dialogue node "${id}" not found`); return this.close(); }

    this.currentNodeId = id;
    this.aiMode = false;
    this.aiSubmitting = false;
    this.choiceShortcutsEnabled = true;
    this.textEl.textContent = node.text;
    this.currentText = this.textEl.textContent;
    this.choicesEl.innerHTML = '';

    const addButton = (label, action) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', action);
      this.choicesEl.appendChild(b);
      return b;
    };

    if (node.choices?.length) {
      node.choices.forEach((choice, i) => {
        addButton(`${i + 1}. ${choice.label}`, () => this.handleChoice(choice));
      });
    } else if (node.next) {
      addButton('Continue', () => this.showNode(node.next));
    } else {
      addButton('Close', () => this.close());
    }
    this.choicesEl.firstElementChild?.focus();
    this.speakCurrentText();
  }

  handleChoice(choice) {
    if (choice.next) {
      this.showNode(choice.next);
      return;
    }
    if (choice.action === 'ask-ai') {
      this.showAIQuestionForm();
      return;
    }
    console.warn('Dialogue choice has no supported next node or action:', choice);
  }

  showAIQuestionForm() {
    if (!this.aiReturnNodeId) this.aiReturnNodeId = this.currentNodeId;
    this.aiMode = true;
    this.aiSubmitting = false;
    this.choiceShortcutsEnabled = false;
    this.textEl.textContent = 'Sure! What would you like to know?';
    this.currentText = this.textEl.textContent;
    this.choicesEl.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'dlg-ai-form';

    const input = document.createElement('input');
    input.id = 'dlg-ai-question';
    input.type = 'text';
    input.maxLength = 300;
    input.required = true;
    input.autocomplete = 'off';
    input.placeholder = 'Type your question for Johnny';
    input.setAttribute('aria-label', 'Question for Johnny');

    const actions = document.createElement('div');
    actions.className = 'dlg-ai-actions';

    const askButton = document.createElement('button');
    askButton.type = 'submit';
    askButton.textContent = 'Ask';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => this.returnToScriptedDialogue());

    actions.append(askButton, cancelButton);
    form.append(input, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitAIQuestion(input, askButton, cancelButton);
    });
    this.choicesEl.appendChild(form);
    input.focus();
    this.speakCurrentText();
  }

  submitAIQuestion(input, askButton, cancelButton) {
    if (this.aiSubmitting || !this.aiMode) return;
    const question = input.value.trim();
    if (!question) {
      input.setCustomValidity('Enter a question for Johnny.');
      input.reportValidity();
      input.focus();
      return;
    }

    input.setCustomValidity('');
    this.aiSubmitting = true;
    input.disabled = true;
    askButton.disabled = true;
    cancelButton.disabled = true;
    this.showAIResponse(question);
  }

  showAIResponse(question) {
    this.choiceShortcutsEnabled = true;
    this.textEl.textContent = `AI TEST: Johnny received your question: ${question}`;
    this.currentText = this.textEl.textContent;
    this.choicesEl.innerHTML = '';

    const addButton = (label, action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      this.choicesEl.appendChild(button);
    };
    addButton('1. Ask another question', () => this.showAIQuestionForm());
    addButton('2. Return to normal dialogue', () => this.returnToScriptedDialogue());
    this.choicesEl.firstElementChild?.focus();
    this.speakCurrentText();
  }

  returnToScriptedDialogue() {
    const returnNodeId = this.aiReturnNodeId ?? 'start';
    this.resetAIState();
    this.showNode(returnNodeId);
  }

  resetAIState() {
    this.aiReturnNodeId = null;
    this.aiMode = false;
    this.aiSubmitting = false;
    this.choiceShortcutsEnabled = true;
  }

  stopNarration() {
    // Clear the reference first so cancellation callbacks cannot affect a new line.
    this.currentUtterance = null;
    if (!this.narrationSupported) return true;
    try {
      window.speechSynthesis.cancel();
      return true;
    } catch (err) {
      this.reportNarrationFailure(err);
      return false;
    }
  }

  speakCurrentText() {
    if (!this.narrationSupported || !this.narrationEnabled || !this.isOpen) return;
    if (!this.stopNarration() || !this.currentText.trim()) return;

    try {
      const utterance = new window.SpeechSynthesisUtterance(this.currentText);
      utterance.lang = document.documentElement.lang || 'en';
      this.currentUtterance = utterance;
      this.narrationStateEl.textContent = 'On';
      utterance.onend = () => {
        if (this.currentUtterance === utterance) this.currentUtterance = null;
      };
      utterance.onerror = (event) => {
        if (this.currentUtterance !== utterance) return;
        this.currentUtterance = null;
        if (event.error === 'canceled' || event.error === 'interrupted') return;
        this.reportNarrationFailure(event.error);
      };
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      this.currentUtterance = null;
      this.reportNarrationFailure(err);
    }
  }

  reportNarrationFailure(error) {
    console.warn('Dialogue narration failed:', error);
    this.narrationStateEl.textContent = this.narrationEnabled ? 'On (audio unavailable)' : 'Off (audio unavailable)';
  }

  close() {
    this.isOpen = false;
    this.resetAIState();
    this.currentNodeId = null;
    this.stopNarration();
    this.currentText = '';
    this.el.classList.remove('open');
    this.onClose?.();

    const fallback = document.getElementById('app');
    const focusTarget = this.isAppropriateFocusTarget(this.previouslyFocused)
      ? this.previouslyFocused
      : fallback;
    this.previouslyFocused = null;
    focusTarget?.focus({ preventScroll: true });
  }
}
