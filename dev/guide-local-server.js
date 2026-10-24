import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';
import { createGuideHandler } from '../worker/src/guide-handler.js';
import { createOpenAIGuideModel } from '../worker/src/openai-guide-model.js';

export const LOCAL_GUIDE_HOST = '127.0.0.1';
export const LOCAL_GUIDE_PORT = 4188;
export const LOCAL_TOUR_ORIGIN = 'http://127.0.0.1:4179';

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
      answerText: supplied.approvedFacts.map((fact) => fact.text).join(' '),
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
  const loadKnowledge = options.loadKnowledge ?? await defaultKnowledgeLoader();
  const providerFetch = options.providerFetch ?? createFakeOpenAIFetch({
    mode: options.providerMode,
    onRequest: options.onProviderRequest
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
      if (url.pathname !== '/guide' || url.search) {
        response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      const controller = new AbortController();
      request.once('aborted', () => controller.abort('browser_disconnected'));
      response.once('close', () => {
        if (!response.writableEnded) controller.abort('browser_disconnected');
      });
      const body = request.method === 'POST' ? await requestBody(request) : undefined;
      const webRequest = new Request(`http://${LOCAL_GUIDE_HOST}${request.url}`, {
        method: request.method,
        headers: request.headers,
        body,
        signal: controller.signal
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

async function runFromCommandLine() {
  const app = await createLocalGuideServer();
  await app.start();
  console.log(`Local fictional guide listening at http://${LOCAL_GUIDE_HOST}:${LOCAL_GUIDE_PORT}/guide`);
  console.log(`Allowed browser origin: ${LOCAL_TOUR_ORIGIN}`);
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
