import { createLocalGuideSession } from './guide-local-api.js';
import { localGuideCatalogForSearch } from './guide-local-profiles.js';

export const HALLWAY_GUIDE_ID = 'hallway-guide';
export const GUIDE_LOCAL_DISCLOSURE =
  'DEVELOPMENT PREVIEW — Fictional information only. Real localhost HTTP; fake provider. No live AI.';

export function isHallwayLocalEnabled({ isDevelopment = false, search = '' } = {}) {
  const params = new URLSearchParams(search);
  return isDevelopment === true && params.get('guideMock') === '1' &&
    params.get('guideBackend') === 'local';
}

function formatOutcome(outcome) {
  const result = outcome.result;
  const pieces = [outcome.response];
  if (result?.specialistName) pieces.push('Fictional specialist: ' + result.specialistName + '.');
  if (result?.destinationZoneName) pieces.push('Fictional destination: ' + result.destinationZoneName + '.');
  if (result?.directions) pieces.push('Fictional directions: ' + result.directions);
  if (result?.destinationZoneId || result?.directions) {
    pieces.push('Route information is fictional and informational only; it does not move you in the tour.');
  }
  const sources = [...new Set((outcome.envelope?.factReferences ?? []).map(ref => ref.sourceId))];
  if (sources.length) pieces.push('Fictional sources: ' + sources.join(', ') + '.');
  return pieces.join(' ');
}

/** Existing hallway guide only; no NPC creation, scene access or navigation capability. */
export function createHallwayLocalQuestionProvider(options = {}) {
  const catalog = localGuideCatalogForSearch(options.search);
  const session = createLocalGuideSession({
    catalog,
    fetchImpl: options.fetchImpl,
    requestTimeoutMs: options.requestTimeoutMs
  });
  return Object.freeze({
    npcId: HALLWAY_GUIDE_ID,
    disclosure: GUIDE_LOCAL_DISCLOSURE,
    prompt: 'What would you like to ask the fictional development guide?',
    inputLabel: 'Question for the CORE Guide development preview',
    inputPlaceholder: 'Type a fictional test question',
    validationMessage: 'Enter a fictional question of at most 300 characters.',
    pendingMessage: 'Contacting the localhost Guide server with a fake provider…',
    errorMessage: 'The development preview is unavailable. Check the local Guide server and try again, or return to normal dialogue.',
    async ask(question) {
      const outcome = await session.ask(question);
      if (outcome.stale) return outcome;
      return Object.freeze({ ...outcome, response: formatOutcome(outcome) });
    },
    reset() { return session.reset(); },
    getState() { return session.getState(); }
  });
}

export function installLocalGuideDisclosure(documentRef = document) {
  const existing = documentRef.getElementById('guide-local-disclosure');
  if (existing) return existing;
  const banner = documentRef.createElement('div');
  banner.id = 'guide-local-disclosure';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.textContent = GUIDE_LOCAL_DISCLOSURE;
  Object.assign(banner.style, {
    position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '15', maxWidth: '80vw', padding: '8px 14px', border: '1px solid #f2bd57',
    borderRadius: '6px', background: 'rgba(58, 43, 11, 0.96)', color: '#ffe5a3',
    fontWeight: '700', textAlign: 'center', pointerEvents: 'none'
  });
  documentRef.body.appendChild(banner);
  return banner;
}
