const webSocketUrl = process.argv[2];
const phase = process.argv[3];
if (!webSocketUrl || !['success', 'failure', 'production'].includes(phase)) {
  throw new Error('Usage: node dev/chrome-guide-smoke.js <cdp-websocket-url> <success|failure|production>');
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed.');
  }
  return result.result.value;
}

async function waitFor(client, expression, description, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitFor(client, 'document.readyState === "complete"', `page load: ${url}`);
  await waitFor(client, 'document.querySelector("#dialogue.open")', 'automatic welcome', 60000);
}

async function click(client, selector) {
  const clicked = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Element not found: ${selector}`);
}

async function finishScriptedDialogue(client) {
  for (let index = 0; index < 3; index += 1) {
    await click(client, '#dlg-choices button');
    await delay(50);
  }
}

async function press(client, key, code, modifiers = 0) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
}

async function approachGuide(client) {
  const testHookMoved = await evaluate(client,
    'window.__tourGuideTest?.approachNpc("hallway-guide") === true');
  if (testHookMoved) {
    await waitFor(
      client,
      'document.querySelector("#interact-prompt").style.display === "block"',
      'guide interaction range'
    );
    return;
  }
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS' });
  await delay(850);
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS' });
  await delay(200);
  if (await evaluate(client,
    'document.querySelector("#interact-prompt").style.display === "block"')) return;

  // The hallway's saved spawn yaw determines whether forward or backward is
  // toward the guide. Cross the spawn point if the first direction was away.
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' });
  await delay(2200);
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' });
  await waitFor(
    client,
    'document.querySelector("#interact-prompt").style.display === "block"',
    'guide interaction range'
  );
}

async function reopenGuide(client) {
  await evaluate(client, "document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))");
  await waitFor(client, 'document.querySelector("#dialogue.open")', 'guide replay');
}

async function enterQuestion(client, question) {
  await evaluate(client, `(() => {
    const input = document.querySelector('#dlg-ai-question');
    input.value = ${JSON.stringify(question)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click(client, '.dlg-ai-actions button[type="submit"]');
}

async function verifyNpcReplay(client, npcId, expectedName) {
  const approached = await evaluate(client,
    `window.__tourGuideTest.approachNpc(${JSON.stringify(npcId)})`);
  if (!approached) throw new Error(`Could not approach existing NPC: ${npcId}`);
  await reopenGuide(client);
  const name = await evaluate(client, 'document.querySelector("#dlg-name").textContent');
  if (name !== expectedName) throw new Error(`Unexpected NPC dialogue name for ${npcId}: ${name}`);
  await press(client, 'Escape', 'Escape');
  await waitFor(client, '!document.querySelector("#dialogue.open")', `${npcId} dialogue close`);
}

async function successPhase(client) {
  await navigate(client, 'http://127.0.0.1:4179/?guideTest=1');
  if (await evaluate(client, 'Boolean(document.querySelector("#guide-mock-banner"))')) {
    throw new Error('Normal mode unexpectedly enabled the local guide.');
  }
  await finishScriptedDialogue(client);
  const normalButtons = await evaluate(client,
    '[...document.querySelectorAll("#dlg-choices button")].map((button) => button.textContent)');
  if (normalButtons.join('|') !== 'Close') throw new Error('Normal mode is not scripted-only.');
  await click(client, '#dlg-choices button');
  await waitFor(client, '!document.querySelector("#dialogue.open")', 'normal welcome close');
  const completedAfterWelcome = await evaluate(client,
    'document.querySelector("#tour-progress-summary").textContent');
  if (!completedAfterWelcome.startsWith('1 of 6')) throw new Error('Welcome completion was not tracked once.');

  await click(client, '#tour-progress-reset');
  await approachGuide(client);
  await reopenGuide(client);
  await press(client, 'Escape', 'Escape');
  await waitFor(client, '!document.querySelector("#dialogue.open")', 'early Escape close');
  const completedAfterEscape = await evaluate(client,
    'document.querySelector("#tour-progress-summary").textContent');
  if (!completedAfterEscape.startsWith('0 of 6')) throw new Error('Early Escape created false completion.');

  await navigate(client, 'http://127.0.0.1:4179/?guideMock=1&guideBackend=local&guideTest=1');
  await waitFor(client, 'document.querySelector("#guide-mock-banner")', 'development disclosure');
  await finishScriptedDialogue(client);
  const automaticButtons = await evaluate(client,
    '[...document.querySelectorAll("#dlg-choices button")].map((button) => button.textContent)');
  if (automaticButtons.includes('1. Ask a question')) {
    throw new Error('Automatic welcome unexpectedly enabled questions.');
  }
  await click(client, '#dlg-choices button');
  await approachGuide(client);
  await reopenGuide(client);
  await click(client, '#tour-progress-reset');
  if (!await evaluate(client, 'document.querySelector("#dialogue.open") !== null')) {
    throw new Error('Tracker reset closed the dialogue.');
  }
  await finishScriptedDialogue(client);
  const replayButtons = await evaluate(client,
    '[...document.querySelectorAll("#dlg-choices button")].map((button) => button.textContent)');
  if (!replayButtons.includes('1. Ask a question')) throw new Error('Local question action is missing.');
  await click(client, '#dlg-choices button');

  const initialFocus = await evaluate(client, 'document.activeElement.id');
  if (initialFocus !== 'dlg-ai-question') throw new Error('Question input did not receive focus.');
  await press(client, 'Tab', 'Tab');
  const tabInside = await evaluate(client, 'document.querySelector("#dialogue").contains(document.activeElement)');
  if (!tabInside) throw new Error('Tab escaped the dialogue.');
  await press(client, 'Tab', 'Tab', 8);
  const shiftTabInside = await evaluate(client, 'document.querySelector("#dialogue").contains(document.activeElement)');
  if (!shiftTabInside) throw new Error('Shift+Tab escaped the dialogue.');

  const narration = await evaluate(client, `(() => {
    const button = document.querySelector('#dlg-narration');
    const before = button.getAttribute('aria-pressed');
    if (!button.disabled) button.click();
    return { disabled: button.disabled, before, after: button.getAttribute('aria-pressed') };
  })()`);
  if (!narration.disabled && narration.after !== 'true') throw new Error('Narration toggle did not activate.');

  await enterQuestion(client, 'How do folded machines move?');
  await waitFor(client, 'document.querySelector("#dlg-text").textContent.includes("rotational motion")', 'grounded answer');
  const firstAnswer = await evaluate(client, 'document.querySelector("#dlg-text").textContent');
  await click(client, '#dlg-choices button');
  await enterQuestion(client, 'Where can I find them?');
  await waitFor(client, 'document.querySelector("#dlg-text").textContent.includes("silver paper arrows")', 'canonical directions');
  const directionsAnswer = await evaluate(client, 'document.querySelector("#dlg-text").textContent');
  await click(client, '#dlg-choices button');
  await enterQuestion(client, 'What do they specialize in?');
  await waitFor(client, 'document.querySelector("#dlg-text").textContent.includes("rotational motion")', 'expertise follow-up');
  await click(client, '#dlg-choices button');
  await enterQuestion(client, 'What is the weather tomorrow?');
  await waitFor(client, 'document.querySelector("#dlg-text").textContent.includes("verified answer")', 'unsupported fallback');

  await click(client, '#dlg-choices button');
  await press(client, 'Escape', 'Escape');
  await waitFor(client, '!document.querySelector("#dialogue.open")', 'dialogue close and reset');
  await reopenGuide(client);
  await finishScriptedDialogue(client);
  await click(client, '#dlg-choices button');
  await enterQuestion(client, 'Where can I find them?');
  await waitFor(client, 'document.querySelector("#dlg-text").textContent.includes("specialist first")', 'cleared context');
  await click(client, '#dlg-choices button');

  await press(client, 'Escape', 'Escape');
  const printingZone = await evaluate(client,
    'window.__tourGuideTest.switchZone("printing-room")');
  if (printingZone !== 'printing-room') throw new Error('Printing-room switch failed.');
  for (const npcId of [
    'johnny-bambu',
    'johnny-ultimaker',
    'johnny-stratasys',
    'johnny-sca'
  ]) {
    await verifyNpcReplay(client, npcId, 'Johnny');
  }
  await verifyNpcReplay(client, 'vishan-ergonomics', 'Vishan');
  const hallwayZone = await evaluate(client,
    'window.__tourGuideTest.switchZone("hallway")');
  if (hallwayZone !== 'hallway') throw new Error('Hallway return switch failed.');
  await approachGuide(client);
  await reopenGuide(client);
  await finishScriptedDialogue(client);
  await click(client, '#dlg-choices button');

  return { firstAnswer, directionsAnswer, narration };
}

async function failurePhase(client) {
  const alreadyFailed = await evaluate(client,
    'document.querySelector("#dlg-text").textContent.includes("could not process")');
  if (!alreadyFailed) {
    const hasInput = await evaluate(client, 'Boolean(document.querySelector("#dlg-ai-question"))');
    if (!hasInput) {
      const firstButton = await evaluate(client,
        'document.querySelector("#dlg-choices button")?.textContent ?? ""');
      if (!firstButton.includes('Ask another')) {
        const text = await evaluate(client, 'document.querySelector("#dlg-text").textContent');
        throw new Error(`Backend failure setup is not at the question form: ${text}`);
      }
      await click(client, '#dlg-choices button');
    }
    await enterQuestion(client, 'How do folded machines move?');
  }
  await waitFor(
    client,
    'document.querySelector("#dlg-text").textContent.includes("could not process")',
    'safe backend failure'
  );
  return { message: await evaluate(client, 'document.querySelector("#dlg-text").textContent') };
}

async function productionPhase(client) {
  await navigate(client, 'http://127.0.0.1:4180/?guideMock=1&guideBackend=local&guideTest=1');
  if (await evaluate(client, 'Boolean(window.__tourGuideTest)')) {
    throw new Error('Production build exposed the development test hook.');
  }
  if (await evaluate(client, 'Boolean(document.querySelector("#guide-mock-banner"))')) {
    throw new Error('Production build enabled development guide UI.');
  }
  await finishScriptedDialogue(client);
  const buttons = await evaluate(client,
    '[...document.querySelectorAll("#dlg-choices button")].map((button) => button.textContent)');
  if (buttons.join('|') !== 'Close') throw new Error('Production guide is not scripted-only.');
  return { buttons };
}

const client = new CdpClient(webSocketUrl);
await client.connect();
await Promise.all([
  client.send('Page.enable'),
  client.send('Runtime.enable'),
  client.send('Network.enable')
]);
await client.send('Page.bringToFront');

try {
  const startEvent = client.events.length;
  const result = phase === 'success'
    ? await successPhase(client)
    : phase === 'failure'
      ? await failurePhase(client)
      : await productionPhase(client);
  const events = client.events.slice(startEvent);
  const requests = events
    .filter((event) => event.method === 'Network.requestWillBeSent')
    .map((event) => event.params.request.url);
  const externalProviderRequests = requests.filter((url) =>
    /api\.openai\.com|openai\.com\/v1|anthropic|cloudflare/i.test(url));
  if (externalProviderRequests.length) {
    throw new Error(`Unexpected external provider request: ${externalProviderRequests[0]}`);
  }
  if (phase === 'success' && !requests.some((url) => url === 'http://127.0.0.1:4188/guide')) {
    throw new Error('Chrome did not observe the localhost guide request.');
  }
  if (phase === 'production' && requests.some((url) => url.includes(':4188/guide'))) {
    throw new Error('Production build attempted a localhost guide request.');
  }
  const exceptions = events.filter((event) => event.method === 'Runtime.exceptionThrown');
  if (exceptions.length) throw new Error('Chrome reported an uncaught runtime exception.');
  console.log(JSON.stringify({ phase, result, requestCount: requests.length }, null, 2));
} finally {
  client.close();
}
