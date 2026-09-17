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
      if (e.code === 'Escape') this.close();
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) this.choicesEl.children[n - 1]?.click();
    });
  }

  async start(npc) {
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

    this.isOpen = true;
    this.el.classList.add('open');
    this.onOpen?.();
    this.showNode('start');
  }

  showNode(id) {
    const node = this.data.nodes[id];
    if (!node) { console.error(`Dialogue node "${id}" not found`); return this.close(); }

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
        addButton(`${i + 1}. ${choice.label}`, () => this.showNode(choice.next));
      });
    } else if (node.next) {
      addButton('Continue', () => this.showNode(node.next));
    } else {
      addButton('Close', () => this.close());
    }
    this.choicesEl.firstElementChild?.focus();
    this.speakCurrentText();
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
    this.stopNarration();
    this.currentText = '';
    this.el.classList.remove('open');
    this.onClose?.();
  }
}
