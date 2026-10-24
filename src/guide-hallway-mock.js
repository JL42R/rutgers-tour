import { createGuidePreviewSession } from './guide-preview-adapter.js';
import { createLocalGuideSession } from './guide-local-api.js';
import { PREVIEW_KNOWLEDGE } from './guide-preview-knowledge.js';

export const HALLWAY_GUIDE_ID = 'hallway-guide';
export const GUIDE_MOCK_DISCLOSURE =
  'Development preview — localhost Worker, fake provider, and fictional information only.';

export function isGuideMockEnabled({ isDevelopment = false, search = '' } = {}) {
  const params = new URLSearchParams(search);
  return Boolean(isDevelopment) && params.get('guideMock') === '1' &&
    params.get('guideBackend') === 'local';
}

export function isGuideLocalBackendEnabled(search = '') {
  return new URLSearchParams(search).get('guideBackend') === 'local';
}

export function isGuideMockModelFailureEnabled(search = '') {
  return new URLSearchParams(search).get('guideMockFailure') === '1';
}

export function formatGuideMockResult(result, knowledge = PREVIEW_KNOWLEDGE) {
  const pieces = [result?.response || 'The simulated guide could not answer safely.'];
  const specialist = knowledge.specialists.find((item) => item.id === result?.destinationNpcId);
  const zone = knowledge.zones.find((item) => item.id === result?.destinationZoneId);
  const specialistName = result?.specialistName ?? specialist?.displayName ?? null;
  const destinationZoneName = result?.destinationZoneName ?? zone?.label ?? null;

  if (specialistName) pieces.push(`Specialist: ${specialistName}.`);
  if (destinationZoneName) pieces.push(`Destination: ${destinationZoneName}.`);
  if (result?.directions && result.directions !== result.response) {
    pieces.push(`Directions: ${result.directions}`);
  }
  return pieces.join(' ');
}

export function createHallwayGuideQuestionProvider(options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const knowledge = settings.knowledge ?? PREVIEW_KNOWLEDGE;
  const generateResponse = isGuideMockModelFailureEnabled(settings.search)
    ? () => Promise.reject(new Error('Development-only simulated model failure.'))
    : settings.generateResponse;
  const localBackend = isGuideLocalBackendEnabled(settings.search);
  const createSession = typeof settings.createSession === 'function'
    ? settings.createSession
    : () => localBackend
      ? createLocalGuideSession({
        endpoint: settings.endpoint,
        fetchImpl: settings.fetchImpl,
        catalog: settings.catalog,
        requestTimeoutMs: settings.requestTimeoutMs
      })
      : createGuidePreviewSession({
        knowledge,
        generateResponse,
        modelTimeoutMs: settings.modelTimeoutMs
      });
  let session = createSession();
  let requestVersion = 0;

  return Object.freeze({
    npcId: HALLWAY_GUIDE_ID,
    disclosure: GUIDE_MOCK_DISCLOSURE,
    prompt: 'What would you like to ask the fictional development guide?',
    inputLabel: 'Question for the CORE Guide development preview',
    inputPlaceholder: 'Type a fictional test question',
    validationMessage: 'Enter a question for the CORE Guide development preview.',
    pendingMessage: localBackend
      ? 'Contacting the localhost Worker with a fake provider…'
      : 'Generating a local simulated response…',
    errorMessage: 'The development preview could not process that question safely.',

    async ask(question) {
      const versionAtStart = requestVersion;
      const activeSession = session;
      const outcome = await activeSession.ask(question);
      if (versionAtStart !== requestVersion) {
        return Object.freeze({ stale: true, result: null, response: '' });
      }

      return Object.freeze({
        stale: false,
        result: outcome.result,
        response: formatGuideMockResult(outcome.result, knowledge)
      });
    },

    reset() {
      requestVersion += 1;
      session.reset();
      session = createSession();
      return session.getState();
    },

    getState() {
      return session.getState();
    }
  });
}

export function installGuideMockDisclosure(documentRef = document) {
  const existing = documentRef.getElementById('guide-mock-banner');
  if (existing) return existing;

  const banner = documentRef.createElement('div');
  banner.id = 'guide-mock-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.textContent = GUIDE_MOCK_DISCLOSURE;
  Object.assign(banner.style, {
    position: 'fixed',
    left: '50%',
    top: '16px',
    transform: 'translateX(-50%)',
    zIndex: '5',
    padding: '8px 14px',
    border: '1px solid #f2bd57',
    borderRadius: '6px',
    background: 'rgba(58, 43, 11, 0.96)',
    color: '#ffe5a3',
    fontWeight: '700',
    textAlign: 'center'
  });
  documentRef.body.appendChild(banner);
  return banner;
}
