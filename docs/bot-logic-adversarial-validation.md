# Fawri bot adversarial validation matrix

## Purpose

This gate tests Fawri as one authority system rather than as isolated features. A passing unit test for price, catalog grounding, memory, or the encyclopedia is not enough if a lower-authority layer can still bypass a higher one when the pieces are combined.

The executable matrix is:

`artifacts/api-server/tests/knowledge-bot-adversarial-matrix.test.ts`

The mandatory PR workflow is:

`.github/workflows/bot-logic-adversarial-matrix.yml`

## Fail-closed invariants

The matrix treats the following as release-blocking failures:

- customer prompt injection reaches a fact resolver, retrieval layer, catalog context, or AI provider;
- browser-supplied policy relaxes server-owned merchant policy;
- a policy or data tenant mismatch is converted into a customer answer;
- unavailable live price/stock/order authority falls through to stale Saved Answers, catalog data, the encyclopedia, or AI;
- database outages are disguised as clarifications or generated answers;
- ambiguous product or variant references are guessed instead of clarified;
- lower-authority catalog/curated data overrides a live operational fact;
- curated/catalog disagreement overrides explicit merchant-approved knowledge;
- product descriptions become warranty/return policy authority;
- AI cites a grounding ID the server did not supply;
- AI replies in the wrong language, above the risk threshold, or below the confidence threshold and is still auto-sent;
- an unsupported number, price, SKU, URL, or other factual token is auto-sent;
- mixed-authority composition changes or omits the canonical live fact;
- a generated mixed answer containing live state is promoted into reusable learned knowledge;
- stale conversation variant memory wins over an explicit current-turn variant;
- merchant intervention fails to reset automatic catalog memory;
- Fawri platform subscription guarantee falls through to merchant conversational knowledge when its structured authority is unavailable.

## Language coverage

Clarification behavior is exercised in Arabic, Sorani Kurdish, and English. The language gate for AI-generated grounded replies is also adversarially tested: correct grounding in the wrong output language must fail closed.

## Authority precedence under attack

The matrix explicitly verifies these orderings:

1. server policy and security gates;
2. live structured operational facts;
3. merchant-approved knowledge;
4. merchant catalog product/variant facts;
5. Fawri curated general knowledge;
6. constrained generated composition;
7. clarification or human handoff when the required authority cannot be established.

A lower layer may enrich an answer only through the contracts already documented in `docs/fawri-knowledge-architecture.md`; it may never silently replace the source of truth above it.

## CI contract

Any pull request touching the AI decision engine, knowledge services, Meta auto-reply conversation wiring, or knowledge tests triggers the adversarial workflow. The workflow uses the repository's redacted CI runner and pinned GitHub actions, then executes the matrix directly with `tsx --test`.

The final marker is `BOT_LOGIC_ADVERSARIAL_MATRIX_PASS`. A PR that changes bot logic is not considered ready merely because build/typecheck succeeds; this adversarial gate must also pass.
