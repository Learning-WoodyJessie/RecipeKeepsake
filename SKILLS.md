# RecipeKeepsake — Claude Code Skills

Invoke any skill by typing the skill name in Claude Code for this project.

---

## `/rk-context`
**Load full project context at the start of any session.**

```
You are working on RecipeKeepsake — a voice-first Telugu recipe capture system.

Read CLAUDE.md first for architecture, constraints, and design decisions.

Key facts:
- Personal tool (not a product) — capture grandma's recipes before they're lost
- Input: Telugu audio narration (grandma talking through a dish while cooking)
- Processing: Whisper transcription → two-step LLM (translate then structure)
- Storage: Supabase (recipes table + voice-notes storage bucket)
- Core constraint: NEVER normalize vague measurements — preserve them in cook_notes
- LLM pipeline: Call A (translation) is SEPARATE from Call B (structuring)

Architecture layers:
  tools/       → audio capture, Whisper transcription, Supabase storage
  prompts/     → translate.py (Call A) and structure.py (Call B)
  scripts/     → orchestrator: capture.py
  web/         → Next.js UI (Phase 2)
```

---

## `/rk-pipeline`
**Validate the two-step LLM pipeline is working correctly.**

```
Test the translation + structuring pipeline end-to-end:

1. Run: python scripts/capture.py --dry-run --input tests/fixtures/sample_telugu.txt
2. Check Call A output: is it a faithful English translation? Are vague terms preserved?
3. Check Call B output: are ingredients parsed? Are vague quantities in cook_notes (not ingredients)?
4. Check review_flags: any implied steps flagged?

Signs the pipeline is working correctly:
- "konjam" / "a little" / "to taste" appears in cook_notes, NOT as a quantity in ingredients
- Dish name is inferred if not stated explicitly
- Steps are in cooking order, not narration order

Signs something is wrong:
- Vague quantities normalized to "1 tsp" etc. → Call B prompt needs strengthening
- Code-switched English words translated back to Telugu → Call A prompt needs adjusting
```

---

*(Add more skills here as patterns emerge during build)*
