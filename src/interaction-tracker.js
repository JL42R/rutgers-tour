// interaction-tracker.js — renders tour-wide NPC progress and keeps it
// between visits. Storage failures are non-fatal; the in-memory Set remains
// usable for the rest of the current page session.

export const TOUR_PROGRESS_STORAGE_KEY = 'rutgers-tour.completed-npc-ids';
export const TOUR_COMPLETE_MESSAGE = 'Tour complete! You visited every guide.';

export class InteractionTracker {
  constructor() {
    this.el = document.getElementById('tour-progress');
    this.toggleButton = document.getElementById('tour-progress-toggle');
    this.toggleIcon = document.getElementById('tour-progress-toggle-icon');
    this.compactCountEl = document.getElementById('tour-progress-compact-count');
    this.announcementEl = document.getElementById('tour-progress-announcement');
    this.bodyEl = document.getElementById('tour-progress-body');
    this.summaryEl = document.getElementById('tour-progress-summary');
    this.progressBarEl = document.getElementById('tour-progress-bar');
    this.zonesEl = document.getElementById('tour-progress-zones');
    this.completionMessageEl = document.getElementById('tour-progress-complete');
    this.resetButton = document.getElementById('tour-progress-reset');

    this.zones = [];
    this.npcIds = new Set();
    this.completedNpcIds = new Set();
    this.onReset = null;

    this.toggleButton.addEventListener('click', () => {
      this.setCollapsed(!this.el.classList.contains('collapsed'));
    });
    this.resetButton.addEventListener('click', () => this.reset());

    const smallScreen = window.matchMedia?.('(max-width: 640px)').matches ?? false;
    this.setCollapsed(smallScreen);
    this.render();
  }

  setConfig(config) {
    this.zones = (config.zones ?? []).map((zone) => ({
      id: zone.id,
      label: zone.label ?? zone.id,
      npcs: (zone.npcs ?? []).map((npc) => ({
        id: npc.id,
        label: npc.trackerLabel ?? npc.name ?? npc.id,
      })),
    }));
    this.npcIds = new Set(this.zones.flatMap((zone) => zone.npcs.map((npc) => npc.id)));

    const savedNpcIds = this.loadSavedProgress();
    this.completedNpcIds = new Set(
      [...this.completedNpcIds, ...savedNpcIds].filter((npcId) => this.npcIds.has(npcId))
    );
    this.render();
  }

  loadSavedProgress() {
    try {
      const saved = window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY);
      if (saved === null) return [];

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Saved progress is not a list.');
      return parsed.filter((npcId) => typeof npcId === 'string' && this.npcIds.has(npcId));
    } catch (error) {
      console.warn('Could not load saved tour progress:', error);
      return [];
    }
  }

  saveProgress() {
    try {
      const configuredCompletedIds = [...this.npcIds].filter((npcId) =>
        this.completedNpcIds.has(npcId)
      );
      window.localStorage.setItem(
        TOUR_PROGRESS_STORAGE_KEY,
        JSON.stringify(configuredCompletedIds)
      );
    } catch (error) {
      console.warn('Could not save tour progress:', error);
    }
  }

  complete(npcId) {
    if (!this.npcIds.has(npcId) || this.completedNpcIds.has(npcId)) return false;

    this.completedNpcIds.add(npcId);
    this.saveProgress();
    this.render();
    return true;
  }

  reset() {
    this.completedNpcIds.clear();
    try {
      window.localStorage.removeItem(TOUR_PROGRESS_STORAGE_KEY);
    } catch (error) {
      console.warn('Could not clear saved tour progress:', error);
    }
    this.render();
    this.onReset?.();
  }

  setCollapsed(collapsed) {
    this.el.classList.toggle('collapsed', collapsed);
    this.bodyEl.hidden = collapsed;
    this.toggleButton.setAttribute('aria-expanded', String(!collapsed));
    this.toggleIcon.textContent = collapsed ? '+' : '−';
    this.updateToggleLabel();
  }

  collapse() {
    this.setCollapsed(true);
  }

  updateToggleLabel() {
    const completed = [...this.completedNpcIds].filter((npcId) =>
      this.npcIds.has(npcId)
    ).length;
    const action = this.el.classList.contains('collapsed') ? 'Expand' : 'Collapse';
    this.toggleButton.setAttribute(
      'aria-label',
      `${action} Tour Progress, ${completed} of ${this.npcIds.size} completed`
    );
  }

  render() {
    const total = this.npcIds.size;
    const completed = [...this.completedNpcIds].filter((npcId) =>
      this.npcIds.has(npcId)
    ).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    const tourComplete = total > 0 && completed === total;

    const summary = `${completed} of ${total} NPC conversations completed`;
    this.summaryEl.textContent = summary;
    this.announcementEl.textContent = tourComplete
      ? `${summary}. ${TOUR_COMPLETE_MESSAGE}`
      : summary;
    this.compactCountEl.textContent = `${completed}/${total}`;
    this.progressBarEl.style.width = `${percent}%`;
    this.progressBarEl.parentElement.setAttribute('aria-valuenow', String(completed));
    this.progressBarEl.parentElement.setAttribute('aria-valuemax', String(total));
    this.progressBarEl.parentElement.setAttribute(
      'aria-valuetext',
      `${completed} of ${total} NPC conversations completed`
    );

    this.zonesEl.replaceChildren();
    for (const zone of this.zones) {
      const zoneCompleted = zone.npcs.filter((npc) =>
        this.completedNpcIds.has(npc.id)
      ).length;

      const section = document.createElement('section');
      section.className = 'tour-progress-zone';

      const heading = document.createElement('h3');
      heading.textContent = `${zone.label} — ${zoneCompleted}/${zone.npcs.length}`;
      section.appendChild(heading);

      if (zone.npcs.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'tour-progress-empty';
        empty.textContent = 'No NPCs in this zone yet.';
        section.appendChild(empty);
      } else {
        const list = document.createElement('ul');
        for (const npc of zone.npcs) {
          const isComplete = this.completedNpcIds.has(npc.id);
          const item = document.createElement('li');
          item.classList.toggle('completed', isComplete);

          const marker = document.createElement('span');
          marker.className = 'tour-progress-marker';
          marker.setAttribute('aria-hidden', 'true');
          marker.textContent = isComplete ? '✓' : '○';

          const label = document.createElement('span');
          label.textContent = npc.label;

          const status = document.createElement('span');
          status.className = 'tour-progress-status';
          status.textContent = isComplete ? 'Completed' : 'Remaining';

          item.append(marker, label, status);
          list.appendChild(item);
        }
        section.appendChild(list);
      }

      this.zonesEl.appendChild(section);
    }

    this.completionMessageEl.textContent = TOUR_COMPLETE_MESSAGE;
    this.completionMessageEl.hidden = !tourComplete;
    this.updateToggleLabel();
  }
}
