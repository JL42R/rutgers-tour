import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  prepareApprovedKnowledge,
  createStaticApprovedKnowledgeLoader
} from '../worker/src/approved-knowledge.js';
import { createGuideHandler } from '../worker/src/guide-handler.js';
import { createOpenAIGuideModel } from '../worker/src/openai-guide-model.js';
import {
  retrievalQualityFixture,
  retrievalQualityRetiredCloudFixture
} from '../test-support/guide-retrieval-quality-fixture.js';

export const LOCAL_GUIDE_HOST = '127.0.0.1';
export const LOCAL_GUIDE_PORT = 4188;
export const LOCAL_TOUR_ORIGIN = 'http://127.0.0.1:4179';
export const LOCAL_GUIDE_DEFAULT_PROFILE = 'default';
export const LOCAL_GUIDE_RETRIEVAL_PROFILE = 'retrieval-quality';
export const LOCAL_GUIDE_ADVANCE_PATH = '/guide-test/advance-knowledge';

const LOCAL_GUIDE_PROFILES = new Set([
  LOCAL_GUIDE_DEFAULT_PROFILE,
  LOCAL_GUIDE_RETRIEVAL_PROFILE
]);

const fixtureUrl = new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url);
const fakeProviderKey = 'local-fixture-key-not-a-secret';

function fakeProviderResponse(result) {
  return new Response(JSON.stringify({
    status: 'completed',
    output: [{
      type: 'message',
      status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(result) }]
    }]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function waitForFakeProviderDelay(delayMs, signal) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error('Fake provider request was cancelled.');
      error.name = 'AbortError';
      reject(error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/** Deterministic fetch double for the OpenAI adapter. It never performs I/O. */
export function createFakeOpenAIFetch(options = {}) {
  const mode = options.mode ?? 'success';
  return async function fakeOpenAIFetch(url, init = {}) {
    if (url !== 'https://api.openai.com/v1/responses' || init.method !== 'POST') {
      throw new Error('The fake provider rejected an unexpected request target.');
    }
    if (init.headers?.Authorization !== `Bearer ${fakeProviderKey}`) {
      return new Response('{}', { status: 401 });
    }
    const providerBody = JSON.parse(init.body);
    options.onRequest?.(Object.freeze({
      model: providerBody.model,
      store: providerBody.store,
      toolCount: Array.isArray(providerBody.tools) ? providerBody.tools.length : -1
    }));
    await waitForFakeProviderDelay(options.delayMs ?? 0, init.signal);

    if (mode === 'http_error') return new Response('{}', { status: 503 });
    if (mode === 'refusal') {
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          status: 'completed',
          content: [{ type: 'refusal', refusal: 'Synthetic refusal.' }]
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const inputText = providerBody.input?.[1]?.content?.[0]?.text;
    const prefix = 'Use this JSON data only:\n';
    if (typeof inputText !== 'string' || !inputText.startsWith(prefix)) {
      throw new Error('The fake provider received an invalid grounded input.');
    }
    const supplied = JSON.parse(inputText.slice(prefix.length));
    const result = {
      answerText: options.answerText ?? supplied.approvedFacts.map((fact) => fact.text).join(' '),
      supported: true,
      topicId: supplied.topicId,
      usedFactIds: [...supplied.allowedFactIds]
    };
    if (mode === 'unknown_fact') result.usedFactIds.push('fact-not-approved');
    return fakeProviderResponse(result);
  };
}

async function defaultKnowledgeLoader() {
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  return createStaticApprovedKnowledgeLoader(raw);
}

function retrievalQualityKnowledgeController() {
  const initial = retrievalQualityFixture();
  const retired = retrievalQualityRetiredCloudFixture();
  let current = prepareApprovedKnowledge(initial.knowledge, {
    retrievalProfile: initial.profile
  });
  const retiredPrepared = prepareApprovedKnowledge(retired.knowledge, {
    retrievalProfile: retired.profile
  });
  let advanced = false;

  return Object.freeze({
    loadKnowledge: async () => current,
    advance() {
      if (advanced) return null;
      advanced = true;
      current = retiredPrepared;
      return Object.freeze({ knowledgeVersion: current.knowledgeVersion });
    }
  });
}

async function knowledgeController(profile) {
  if (!LOCAL_GUIDE_PROFILES.has(profile)) {
    throw new TypeError('The local Guide profile is not allowlisted.');
  }
  if (profile === LOCAL_GUIDE_RETRIEVAL_PROFILE) {
    return retrievalQualityKnowledgeController();
  }
  return Object.freeze({
    loadKnowledge: await defaultKnowledgeLoader(),
    advance: null
  });
}

function jsonNodeResponse(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
  response.end(JSON.stringify(value));
}

function writeNodeResponse(nodeResponse, webResponse) {
  nodeResponse.statusCode = webResponse.status;
  for (const [name, value] of webResponse.headers) nodeResponse.setHeader(name, value);
  return webResponse.arrayBuffer().then((body) => {
    nodeResponse.end(Buffer.from(body));
  });
}

function requestBody(nodeRequest, maximumBytes = 8192) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    nodeRequest.on('data', (chunk) => {
      length += chunk.length;
      if (length > maximumBytes) {
        reject(new Error('Local request exceeded the transport limit.'));
        nodeRequest.destroy();
        return;
      }
      chunks.push(chunk);
    });
    nodeRequest.on('end', () => resolve(Buffer.concat(chunks)));
    nodeRequest.on('error', reject);
  });
}

export async function createLocalGuideServer(options = {}) {
  const profile = options.profile ?? LOCAL_GUIDE_DEFAULT_PROFILE;
  if (!LOCAL_GUIDE_PROFILES.has(profile)) {
    throw new TypeError('The local Guide profile is not allowlisted.');
  }
  const controller = options.loadKnowledge
    ? Object.freeze({ loadKnowledge: options.loadKnowledge, advance: null })
    : await knowledgeController(profile);
  if (options.enableTestControls && typeof controller.advance !== 'function') {
    throw new TypeError('Knowledge test controls require the retrieval-quality profile.');
  }
  const loadKnowledge = controller.loadKnowledge;
  const providerFetch = options.providerFetch ?? createFakeOpenAIFetch({
    mode: options.providerMode,
    delayMs: options.providerDelayMs,
    onRequest: options.onProviderRequest,
    answerText: options.providerAnswerText ?? (
      profile === LOCAL_GUIDE_RETRIEVAL_PROFILE
        ? 'Untrusted simulated provider prose that the Worker must discard.'
        : undefined
    )
  });
  const model = createOpenAIGuideModel({
    fetchImpl: providerFetch,
    getApiKey: async () => fakeProviderKey,
    model: 'local-fixture-model',
    requestTimeoutMs: options.providerTimeoutMs ?? 1000
  });
  const handler = createGuideHandler({
    loadKnowledge,
    model,
    allowedOrigins: options.allowedOrigins ?? [LOCAL_TOUR_ORIGIN],
    allowMissingOrigin: options.allowMissingOrigin ?? false,
    modelTimeoutMs: options.modelTimeoutMs ?? 1500,
    logger: options.logger
  });

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${LOCAL_GUIDE_HOST}`);
      if (url.pathname === LOCAL_GUIDE_ADVANCE_PATH && !url.search &&
          options.enableTestControls) {
        if (request.method !== 'POST' || request.headers.origin !== LOCAL_TOUR_ORIGIN) {
          jsonNodeResponse(response, 403, { error: 'forbidden' });
          return;
        }
        const transition = controller.advance();
        if (!transition) {
          jsonNodeResponse(response, 409, { error: 'already_advanced' });
          return;
        }
        jsonNodeResponse(response, 200, transition, {
          'Access-Control-Allow-Origin': LOCAL_TOUR_ORIGIN,
          'Cache-Control': 'no-store'
        });
        return;
      }
      if (url.pathname !== '/guide' || url.search) {
        response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      const requestController = new AbortController();
      request.once('aborted', () => requestController.abort('browser_disconnected'));
      response.once('close', () => {
        if (!response.writableEnded) requestController.abort('browser_disconnected');
      });
      const body = request.method === 'POST' ? await requestBody(request) : undefined;
      const webRequest = new Request(`http://${LOCAL_GUIDE_HOST}${request.url}`, {
        method: request.method,
        headers: request.headers,
        body,
        signal: requestController.signal
      });
      await writeNodeResponse(response, await handler(webRequest));
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      if (!response.writableEnded) response.end(JSON.stringify({ error: 'local_server_error' }));
    }
  });

  return Object.freeze({
    server,
    profile,
    start(port = LOCAL_GUIDE_PORT) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, LOCAL_GUIDE_HOST, () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
}

function commandLineOptions(args) {
  let profile = LOCAL_GUIDE_DEFAULT_PROFILE;
  let enableTestControls = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--profile') {
      profile = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('--profile=')) {
      profile = argument.slice('--profile='.length);
      continue;
    }
    if (argument === '--test-controls') {
      enableTestControls = true;
      continue;
    }
    throw new TypeError(`Unknown local Guide option: ${argument}`);
  }
  if (!LOCAL_GUIDE_PROFILES.has(profile)) {
    throw new TypeError('The local Guide profile is not allowlisted.');
  }
  if (enableTestControls && profile !== LOCAL_GUIDE_RETRIEVAL_PROFILE) {
    throw new TypeError('Knowledge test controls require the retrieval-quality profile.');
  }
  return Object.freeze({ profile, enableTestControls });
}

async function runFromCommandLine() {
  const settings = commandLineOptions(process.argv.slice(2));
  const app = await createLocalGuideServer({
    ...settings,
    providerDelayMs: 500
  });
  await app.start();
  console.log(`Local fictional guide listening at http://${LOCAL_GUIDE_HOST}:${LOCAL_GUIDE_PORT}/guide`);
  console.log(`Allowed browser origin: ${LOCAL_TOUR_ORIGIN}`);
  console.log(`Knowledge profile: ${app.profile}`);
  if (settings.enableTestControls) {
    console.log(`Fixed knowledge transition: http://${LOCAL_GUIDE_HOST}:${LOCAL_GUIDE_PORT}${LOCAL_GUIDE_ADVANCE_PATH}`);
  }
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runFromCommandLine();
}
