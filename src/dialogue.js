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
    this.cache = new Map(); // dialogue files fetched once, reused after
    this.data = null;
    this.isOpen = false;
    this.onOpen = null;   // main.js hooks these to pause/resume movement
    this.onClose = null;

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
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
    this.onClose?.();
  }
}
