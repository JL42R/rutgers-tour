# CORE Guide knowledge intake

This is the developer workflow for adding verified Rutgers CORE information to the future Guide.
It does not approve any fact by itself. The repository's current Guide fixture is synthetic, and
the team must not copy proposed story text, visitor statements, model output, or assumptions into
production knowledge.

## Stage 69C.1 integration status

This stage includes only offline document ingestion, simulated knowledge administration, legacy
knowledge conversion, their tests, the fixture loader/registry, and five fictional documents.
The existing schema/contracts and matcher/memory/orchestrator are preserved. Retrieval, Worker
handlers, model adapters, browser clients, and hallway question-provider UI remain later stages;
there is no service, endpoint, backend deployment, live model, telemetry, or production activation.

All five registry documents and administrative examples are synthetic test data. The malicious
note deliberately contains override instructions: ingestion preserves them as draft evidence,
never executes them, and cannot approve them. Registry examples do not auto-publish records.
Plain text and Markdown are supported; PDF, URLs, and arbitrary uploads are not. Ingestion bounds
both original UTF-8 bytes and normalized bytes (default 32 KiB), preserves original source-line
positions through newline normalization, and splits passages at a default 600-character limit.

The administration helper applies immutable simulated transitions with schema checks and new
version labels. `trusted_mock_transition` is an action type, not authentication. Anyone who can
call the helper with a valid object can exercise this test capability. Review metadata does not
prove a real review occurred; only an authorized source owner/reviewer can approve actual content.
Snapshot validity does not establish factual truth or an authenticated publication history.

The compatibility adapter preserves approved joins and prepares legacy data shapes. Fictional
zone IDs remain valid in isolated conversion fixtures. The unchanged runtime memory/orchestrator
still reject routes outside hallway, printing-room, and project-studio. A test-only scoped mock
exercises the real merged pipeline; it does not create NPCs, change zones, or approve CORE facts.

## Local verification

`package.json` has no test script in this stage. Use the tracked Node suite directly:

```powershell
$trackedTests = @(git ls-files -- 'test/*.test.js' 'tests/*.test.js')
node --test @trackedTests
npm.cmd run build
git diff --check
```

## Before writing a record

Create a small intake note for the proposed topic and identify:

- the exact source title, owner, reference or repository location, and page/section/timestamp;
- whether the source is current and authorized for visitor-facing use;
- the person responsible for checking the relevant domain;
- every fact that the visitor may hear, written independently of model wording;
- the stable topic, specialist NPC, and destination-zone IDs already used by the application; and
- the approved route text, if the topic recommends a physical destination.

Equipment descriptions and capabilities need equipment documentation or confirmation from the
responsible staff member. Room purposes and research areas need an authorized room or program
owner. Specialist expertise needs that person's or the team's approval. Safety, access, training,
and operating instructions are high-risk content: an authorized safety or facility owner must
review the exact visitor-facing fact and its source before approval. If an answer is not verified,
leave it unsupported.

## Future production publication workflow

The following workflow requires separate architecture/deployment approval and authorized human
review. The offline helper models state transitions only; it is not an authorized admin service.

1. Add or reuse a source record with a stable lowercase-hyphenated ID. Record the source's exact
   location; do not use a general website title when a page or section is available.
2. Add topic, fact, specialist, and zone records as `draft`. Keep `approval` as `null`.
3. Run the tracked Node verification command above from the repository root. Fix unknown
   references, duplicate IDs, and broken topic/fact/specialist/zone relationships before review.
4. Ask the named domain reviewer to compare every fact and direction with the cited source. Record
   review discussion in an issue or pull request that teammates can audit.
5. Move reviewed records to `in_review`. They remain unavailable to visitors at this stage.
6. Add review metadata: `reviewedBy`, the issue/PR or approval reference, and `reviewedAt`.
7. After explicit approval, move the complete linked record set to `approved`. An approved topic
   cannot point to a draft source, fact, specialist, or zone.
8. Increase each changed record's `recordVersion`, update `updatedAt`, and increase the top-level
   `knowledgeVersion`. Never reuse a published knowledge version for different content.
9. Add fixed evaluation questions for direct questions, destination and expertise follow-ups,
   unsupported questions, ambiguity, and topic switching. Run the tracked Node suite and
   `npm.cmd run build`.
10. Obtain normal code review and deployment approval. Publish the reviewed knowledge and Worker
    together so the response's `knowledgeVersion` identifies the exact approved corpus.

The proposed system does not train a model when knowledge changes. A future Worker would validate
the document, remove non-approved records, retrieve approved topics/facts, and constrain the model
to offered fact IDs. It would reconstruct names, routes and citations from authoritative records.
That Worker path exists only in the preserved handoff and is not integrated or activated here.

## Record checklist

For every addition, check the relevant fields:

- Source: `id`, `title`, `reference`, `location`, lifecycle fields, and review metadata.
- Topic: `id`, visitor-readable `label`, `category`, `factIds`, `specialistIds`, and
  `destinationZoneIds`.
- Fact: one reviewable claim in `content`, plus `topicId`, `sourceId`, exact `sourceLocation`, and
  related specialist/zone IDs.
- Specialist: stable NPC `id`, approved visitor-facing `name`, supported `topicIds`, and the
  canonical `destinationZoneId`.
- Zone: stable internal `id`, approved visitor-facing `name`, and exact `canonicalDirections`.
- Lifecycle: `status`, positive `recordVersion`, `updatedAt`, and complete approval metadata when
  approved.

Do not change `public/zones.json`, NPC placement, or a calibrated route merely to make a knowledge
record validate. The IDs must describe application entities that the team has deliberately
approved. If a real destination does not exist in the tour yet, omit the route and keep the answer
informational until the destination is ready.

## Fictional worked example

Suppose the team is testing a made-up topic called glass gardens. The source is explicitly
fictional and stored as `source-glass-garden-notes`. Draft records begin like this:

```json
{
  "id": "fact-glass-gardens-light",
  "topicId": "glass-gardens",
  "content": "In this fictional fixture, glass gardens bend colored light through suspended prism leaves.",
  "sourceId": "source-glass-garden-notes",
  "sourceLocation": "Section A, paragraph 1",
  "status": "draft",
  "recordVersion": 1,
  "updatedAt": "2026-10-24",
  "approval": null,
  "relatedSpecialistIds": ["npc-glass-gardens-guide"],
  "relatedDestinationZoneIds": ["zone-prism-conservatory"]
}
```

The source, topic, specialist, and zone start as draft too. After a fictional reviewer checks the
source, relationships, friendly names, and direction text, all linked records move to `in_review`.
They are still filtered out. Approval then adds metadata such as:

```json
{
  "reviewedBy": "synthetic-fixture-reviewer",
  "reference": "fixture-review-002",
  "reviewedAt": "2026-10-24"
}
```

Only after explicit approval do the records move to `approved`, their record versions increase,
and the document receives a new `knowledgeVersion`. Evaluations ask about glass gardens, ask where
to find the guide, switch from a different topic, and confirm that the approved name "Fictional
Prism Conservatory" and its canonical direction are returned with the stable zone ID.

## Corrections, retirement, and rollback

Do not edit a published claim in place under the same versions. For a correction, create reviewed
content with increased record and knowledge versions. If a fact is no longer reliable, mark it
`retired`, remove it from an approved topic's `factIds`, increase the versions, and test that it is
no longer retrievable.

If inaccurate information is published:

1. stop the affected knowledge deployment if possible;
2. redeploy the last reviewed knowledge version or revert the knowledge commit;
3. record the affected fact IDs, source, versions, and reason in the issue/PR;
4. add a regression evaluation that catches the inaccurate answer; and
5. use the full draft-to-approval workflow for the correction.

Visitor questions and AI-generated prose never become facts automatically. This phase adds no
public editor, analytics store, transcript storage, or persistent visitor profile.

## Offline document-ingestion prototype

The [document-retrieval handoff](https://github.com/JL42R/rutgers-tour/blob/3d222dd29862abb6226d874ea5f937fcd7a29952/docs/GUIDE_DOCUMENT_RETRIEVAL.md)
contains later-stage retrieval/evaluation work. The ingestion modules imported here automate only
mechanical preparation: format and metadata validation, safe text normalization, bounded passage splitting,
stable IDs, and draft candidate creation. It does not decide whether a passage is true, useful, or
approved. A domain reviewer must still verify every candidate and source location through the
publication workflow above. The local trusted transition helper is a test capability, not real
authentication or authorization.
