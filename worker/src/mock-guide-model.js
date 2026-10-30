function abortError(reason) {
  const error = new Error('Mock model generation was aborted.');
  error.name = 'AbortError';
  error.reason = reason;
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal.reason);
}

function waitForDelay(delayMs, signal) {
  if (delayMs <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal.reason));
    };

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/**
 * Deterministic offline substitute for a future provider implementation.
 * It never performs network I/O and builds answers only from supplied facts.
 */
export function createMockGuideModel(options = {}) {
  const mode = options.mode ?? 'success';
  const delayMs = Number.isInteger(options.delayMs) && options.delayMs >= 0
    ? options.delayMs
    : 0;
  const fixedAnswerText = typeof options.answerText === 'string'
    ? options.answerText
    : null;

  return Object.freeze({
    async generateResponse(request, invocation = {}) {
      const signal = invocation.signal;
      throwIfAborted(signal);
      await waitForDelay(delayMs, signal);
      throwIfAborted(signal);

      if (mode === 'error') throw new Error('Synthetic provider failure.');
      if (mode === 'malformed') return Object.freeze({ answerText: 'Malformed fixture output.' });

      const facts = Array.isArray(request?.facts) ? request.facts : [];
      const usedFactIds = facts.map((fact) => fact.id);
      const answerText = fixedAnswerText ?? facts.map((fact) => fact.text).join(' ');

      if (mode === 'unsupported_fact') usedFactIds.push('fact-invented-by-model');

      return Object.freeze({
        answerText,
        supported: true,
        topicId: request?.topicId,
        usedFactIds: Object.freeze(usedFactIds)
      });
    }
  });
}
