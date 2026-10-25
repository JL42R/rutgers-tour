import { readFileSync } from 'node:fs';

const registryUrl = new URL('../knowledge/document-fixtures.v1.json', import.meta.url);
const registry = JSON.parse(readFileSync(registryUrl, 'utf8'));

export function documentFixture(documentId) {
  const entry = registry.documents.find((document) => document.id === documentId);
  if (!entry) throw new Error(`Unknown synthetic document fixture: ${documentId}`);
  const { path, ...metadata } = structuredClone(entry);
  const content = readFileSync(new URL(`../knowledge/${path}`, import.meta.url), 'utf8');
  return { ...metadata, content };
}

export function documentFixtureRegistry() {
  return structuredClone(registry);
}
