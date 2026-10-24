// Fictional fixtures for the local guide preview only. None of these records
// describe Rutgers CORE people, rooms, equipment, or locations.
export const PREVIEW_KNOWLEDGE = Object.freeze({
  topics: Object.freeze([
    Object.freeze({
      id: 'paper-robotics-overview',
      status: 'verified',
      type: 'answer',
      response: 'Paper robotics is a fictional field that uses folded materials to demonstrate motion.',
      phrases: Object.freeze([
        'what is paper robotics',
        'explain paper robotics'
      ]),
      facts: Object.freeze([
        Object.freeze({
          id: 'paper-robotics-definition',
          status: 'approved',
          text: 'In this fictional preview, paper robotics uses folded materials to demonstrate mechanical motion.'
        })
      ])
    }),
    Object.freeze({
      id: 'paper-robotics-specialist',
      status: 'verified',
      type: 'route',
      response: 'I recommend the fictional paper-robotics specialist.',
      phrases: Object.freeze([
        'who can teach me paper robotics',
        'who teaches paper robotics',
        'paper robotics specialist'
      ]),
      destinationNpcId: 'npc-paper-specialist',
      destinationZoneId: 'zone-paper-workshop',
      facts: Object.freeze([
        Object.freeze({
          id: 'paper-specialist-role',
          status: 'approved',
          text: 'The fictional paper specialist demonstrates folded mechanisms.'
        })
      ])
    }),
    Object.freeze({
      id: 'glass-engine-specialist',
      status: 'verified',
      type: 'route',
      response: 'I recommend the fictional glass-engine specialist.',
      phrases: Object.freeze([
        'who can teach me glass engine design',
        'who teaches glass engine design',
        'glass engine specialist'
      ]),
      destinationNpcId: 'npc-glass-specialist',
      destinationZoneId: 'zone-glass-lab',
      facts: Object.freeze([
        Object.freeze({
          id: 'glass-specialist-role',
          status: 'approved',
          text: 'The fictional glass specialist demonstrates transparent engine models.'
        })
      ])
    }),
    Object.freeze({
      id: 'fictional-design-alpha',
      status: 'verified',
      type: 'answer',
      response: 'There are multiple fictional design topics that could match.',
      phrases: Object.freeze(['tell me about fictional design']),
      facts: Object.freeze([
        Object.freeze({
          id: 'fictional-design-alpha-fact',
          status: 'approved',
          text: 'Alpha is one fictional design topic.'
        })
      ])
    }),
    Object.freeze({
      id: 'fictional-design-beta',
      status: 'verified',
      type: 'answer',
      response: 'There are multiple fictional design topics that could match.',
      phrases: Object.freeze(['tell me about fictional design']),
      facts: Object.freeze([
        Object.freeze({
          id: 'fictional-design-beta-fact',
          status: 'approved',
          text: 'Beta is another fictional design topic.'
        })
      ])
    })
  ]),
  specialists: Object.freeze([
    Object.freeze({
      id: 'npc-paper-specialist',
      displayName: 'Parker, the fictional paper-robotics specialist',
      status: 'approved',
      zoneId: 'zone-paper-workshop',
      topicIds: Object.freeze(['paper-robotics-specialist']),
      directions: 'Walk to the fictional paper workshop beside the blue model display.',
      expertise: 'Parker specializes in fictional folded mechanisms and paper motion demonstrations.'
    }),
    Object.freeze({
      id: 'npc-glass-specialist',
      displayName: 'Gale, the fictional glass-engine specialist',
      status: 'approved',
      zoneId: 'zone-glass-lab',
      topicIds: Object.freeze(['glass-engine-specialist']),
      directions: 'Walk to the fictional glass lab beside the amber model cabinet.',
      expertise: 'Gale specializes in fictional transparent components and glass-engine models.'
    })
  ]),
  zones: Object.freeze([
    Object.freeze({
      id: 'zone-paper-workshop',
      label: 'Fictional Paper Workshop',
      status: 'approved'
    }),
    Object.freeze({
      id: 'zone-glass-lab',
      label: 'Fictional Glass Lab',
      status: 'approved'
    })
  ])
});
