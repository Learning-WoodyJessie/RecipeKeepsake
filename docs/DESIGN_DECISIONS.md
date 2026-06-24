# Design Decisions

A narrative writeup of the key architectural, AI, and design choices behind Echoes of Home, and the reasoning behind each.

---

## 1. Architecture: deterministic pipeline over agentic

**Decision:** A two step (sometimes three step) LLM pipeline: Whisper, then Translate (Call A), then Structure (Call B), then optional DALL-E image generation. Orchestrated by plain Python, not autonomous agents.

**Why:** The product's core promise is fidelity to a narrator's voice, not cleverness. Deterministic, single purpose calls (`temperature=0`) are debuggable and auditable. Agentic autonomy would introduce exactly the failure mode the app exists to prevent: content nobody actually said.

This was the simplest architecture that satisfies the requirement, chosen deliberately over a more complex multi-agent design.

---

## 2. The two-step translate/structure split

**Decision:** Translation and structuring are separate LLM calls, never combined into one.

**Why:** A combined call normalizes vague language ("a little" becomes "1 tsp") because the model wants to be helpful and precise. Splitting the concerns, one model whose only job is faithful translation, another whose only job is schema filling, preserves the narrator's imprecision as data instead of noise.

This is the signature tradeoff of the project: roughly double the API calls, more latency and cost, traded for correctness on the one thing that mattered most.

---

## 3. Treating hallucination as a first-class bug, not a tuning nuisance

**Decision:** When Whisper or the structuring LLM fabricated content (mid-sentence cutoffs, vague quantities normalized into precise ones), the fix was root-causing rather than tuning around the symptom. In both cases (D-002, D-015), the prompt itself was instructing the model to do the wrong thing: "infer dish_name," "translate the vague amount into quantity." Removing the instruction fixed the model's behavior instead of papering over it.

**Why this matters:** it shows the debugging discipline of tracing an eval failure back to the literal rule causing it, and fixing the rule rather than reaching for a bigger model or more examples to mask the symptom.

---

## 4. Evals as a tiered quality gate

**Decision:** Tier 1 (mocked unit tests, run on every commit), Tier 1.5 (real model eval, gated behind `@pytest.mark.evals`, run pre-release), Tier 2 (golden audio fixtures, planned), Tier 3 (LLM-as-judge, planned, offline only, not a live gate).

**Why:** Cheap tests catch API shape regressions on every commit. Expensive real-model tests run only when actually validating model behavior, such as before a model swap (the `gpt-4o-mini` attempt). Judge-model evaluation belongs offline because gating every live save on a second LLM call would double cost and latency for no benefit when a human reviewer already exists in the product flow.

---

## 5. Security and scale as deliberate phases, not afterthoughts

**Decision:** Every endpoint is auth gated from day one (Supabase JWT). Row level security policies act as a database level backstop behind application level ownership checks. Auth fails closed in production. Rate limiting runs through a Postgres function rather than an in-memory counter, because Railway runs multiple instances.

**Why:** Family voice recordings are sensitive, personal data. "Private family archive" was treated as a hard security requirement from the start, not a feature to bolt on later.

---

## 6. Design system: identity-driven, not template-driven

**Decision:** Moved the color palette away from generic "ethnic food app" terracotta-orange. Iterated through a dusk indigo (too cold), then an oxblood maroon (too dull), before landing on a kumkum red plus turmeric gold palette, chosen because that color is actually worn in the family photos, not because it is a default warm palette.

**Why:** Differentiation should come from the product's actual emotional core (preserving a grandmother's voice, her bindi, her photos), not from generic category conventions. This is also a useful example of design iteration: two earlier attempts were discarded because they did not feel right, rather than settling for "good enough."

---

## Elevator summary

A deterministic, two step generative AI pipeline was chosen over an agentic system because the product's value is fidelity to a real narrator's voice. Every decision, from the translate/structure split, to the prompt fixes, to the color palette, optimized for authenticity over cleverness.
