import { LOCAL_GUIDE_CATALOG } from './guide-local-api.js';

export const LOCAL_GUIDE_RETRIEVAL_PROFILE = 'retrieval-quality';

export const LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG = Object.freeze({
  topicIds: Object.freeze([
    'folded-machines',
    'glass-gardens',
    'cloud-kites',
    'ribbon-bridges',
    'prism-orchards',
    'folded-stars',
    'echo-fountains'
  ]),
  specialistNpcIds: Object.freeze([
    'npc-folded-machines-guide',
    'npc-glass-gardens-guide',
    'npc-cloud-kite-guide'
  ]),
  zoneIds: Object.freeze([
    'zone-imaginary-workshop',
    'zone-prism-conservatory',
    'zone-cloud-kite-loft'
  ]),
  factIds: Object.freeze([
    'fact-folded-motion-primary',
    'fact-folded-motion-confirmation',
    'fact-folded-reset-tabs',
    'fact-folded-light-frame',
    'fact-glass-colored-light',
    'fact-glass-patterns',
    'fact-glass-stationary-frame',
    'fact-cloud-silver-ribs',
    'fact-cloud-violet-tether',
    'fact-cloud-painted-stars',
    'fact-ribbon-cable-tension',
    'fact-ribbon-anchor-fans',
    'fact-prism-moonlight',
    'fact-prism-fruit-tokens',
    'fact-stars-seven-folds',
    'fact-stars-navigation-map',
    'fact-echo-duration-short',
    'fact-echo-duration-long'
  ]),
  sourceIds: Object.freeze([
    'source-folded-handbook-v2',
    'source-folded-demonstration-log',
    'source-glass-field-guide-v2',
    'source-cloud-flight-guide-v1',
    'source-ribbon-bridge-notes-v1',
    'source-prism-orchard-atlas-v1',
    'source-folded-stars-catalog-v1',
    'source-echo-fountain-a-v1',
    'source-echo-fountain-b-v1'
  ]),
  knowledgeVersions: Object.freeze([
    'fictional-retrieval-quality-2026-10-25.1',
    'fictional-retrieval-quality-2026-10-25.2'
  ]),
  factSourceIds: Object.freeze({
    'fact-folded-motion-primary': 'source-folded-handbook-v2',
    'fact-folded-motion-confirmation': 'source-folded-demonstration-log',
    'fact-folded-reset-tabs': 'source-folded-handbook-v2',
    'fact-folded-light-frame': 'source-folded-handbook-v2',
    'fact-glass-colored-light': 'source-glass-field-guide-v2',
    'fact-glass-patterns': 'source-glass-field-guide-v2',
    'fact-glass-stationary-frame': 'source-glass-field-guide-v2',
    'fact-cloud-silver-ribs': 'source-cloud-flight-guide-v1',
    'fact-cloud-violet-tether': 'source-cloud-flight-guide-v1',
    'fact-cloud-painted-stars': 'source-cloud-flight-guide-v1',
    'fact-ribbon-cable-tension': 'source-ribbon-bridge-notes-v1',
    'fact-ribbon-anchor-fans': 'source-ribbon-bridge-notes-v1',
    'fact-prism-moonlight': 'source-prism-orchard-atlas-v1',
    'fact-prism-fruit-tokens': 'source-prism-orchard-atlas-v1',
    'fact-stars-seven-folds': 'source-folded-stars-catalog-v1',
    'fact-stars-navigation-map': 'source-folded-stars-catalog-v1',
    'fact-echo-duration-short': 'source-echo-fountain-a-v1',
    'fact-echo-duration-long': 'source-echo-fountain-b-v1'
  }),
  specialistRoutes: Object.freeze({
    'npc-folded-machines-guide': Object.freeze({
      destinationZoneId: 'zone-imaginary-workshop',
      canonicalDirections:
        'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.'
    }),
    'npc-glass-gardens-guide': Object.freeze({
      destinationZoneId: 'zone-prism-conservatory',
      canonicalDirections:
        'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
    }),
    'npc-cloud-kite-guide': Object.freeze({
      destinationZoneId: 'zone-cloud-kite-loft',
      canonicalDirections:
        'From the fictional guide marker, follow the painted cloud spirals to the kite loft.'
    })
  }),
  specialistNames: Object.freeze({
    'npc-folded-machines-guide': 'Fictional Folded Machines Guide',
    'npc-glass-gardens-guide': 'Fictional Glass Gardens Guide',
    'npc-cloud-kite-guide': 'Fictional Cloud Kite Guide'
  }),
  zoneNames: Object.freeze({
    'zone-imaginary-workshop': 'Fictional Imaginary Workshop',
    'zone-prism-conservatory': 'Fictional Prism Conservatory',
    'zone-cloud-kite-loft': 'Fictional Cloud Kite Loft'
  }),
  zoneDirections: Object.freeze({
    'zone-imaginary-workshop':
      'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.',
    'zone-prism-conservatory':
      'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.',
    'zone-cloud-kite-loft':
      'From the fictional guide marker, follow the painted cloud spirals to the kite loft.'
  })
});

export function localGuideCatalogForSearch(search = '') {
  const selected = new URLSearchParams(search).get('guideProfile');
  if (selected === null) return LOCAL_GUIDE_CATALOG;
  if (selected === LOCAL_GUIDE_RETRIEVAL_PROFILE) {
    return LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG;
  }
  throw new TypeError('The local Guide profile is not allowlisted.');
}
