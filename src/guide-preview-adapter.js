import { matchQuestion } from './guide-qa.js';
import {
  clearConversationState,
  createConversationState,
  handleGuideQuestion
} from './guide-conversation.js';
import { orchestrateGuideQuestion } from './guide-ai-orchestrator.js';
import { PREVIEW_KNOWLEDGE } from './guide-preview-knowledge.js';

function resolveWithExistingModules(question, knowledge, state, options = {}) {
  return handleGuideQuestion(question, knowledge, state, {
    ...options,
    matchQuestion
  });
}
/**
 * Produce the exact structured shape Stage 4 validates. This callback is
 * deterministic, local, and synchronous; it performs no network request.
 */
export function generateSimulatedResponse(request) {
  if (!request?.facts?.length || !request?.allowedFactIds?.length) {
    throw new Error('The simulated model requires approved fictional facts.');
  }

  return {
    supported: true,
    topicId: request.topicId,
    answerText: `Simulated guide response: ${request.facts.map((fact) => fact.text).join(' ')}`,
    usedFactIds: [...request.allowedFactIds]
  };
}
/**
 * Hold only the Stage 3 in-memory context for one local preview conversation.
 * Questions and transcripts are never persisted or placed in browser storage.
 */
export function createGuidePreviewSession(options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const knowledge = settings.knowledge ?? PREVIEW_KNOWLEDGE;
  const generateResponse = typeof settings.generateResponse === 'function'
    ? settings.generateResponse
    : generateSimulatedResponse;
  let state = createConversationState();

  return Object.freeze({
    async ask(question) {
      const outcome = await orchestrateGuideQuestion(question, knowledge, state, {
        resolveQuestion: resolveWithExistingModules,
        generateResponse,
        resolverOptions: settings.resolverOptions,
        modelTimeoutMs: settings.modelTimeoutMs
      });
      state = outcome.state;
      return outcome;
    },

    reset() {
      state = clearConversationState();
      return state;
    },

    getState() {
      return state;
    }
  });
}
