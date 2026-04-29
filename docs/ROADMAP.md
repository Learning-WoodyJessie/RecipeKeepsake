# RecipeKeepsake — Roadmap

## Phase 0 — Core pipeline (current)
- [ ] PRD approved (brainstorm complete)
- [ ] Whisper transcription tool (`tools/transcribe.py`)
- [ ] Two-step LLM pipeline (`prompts/translate.py`, `prompts/structure.py`)
- [ ] CLI capture script (`scripts/capture.py`)
- [ ] Supabase schema + storage bucket
- [ ] Tests for all tools and prompts (mocked)

## Phase 1 — Mobile capture UI
- [ ] Next.js recording page (mobile-first, MediaRecorder API)
- [ ] Upload to Supabase Storage
- [ ] Trigger pipeline on upload
- [ ] Browse recipes UI

## Phase 2 — Search + playback
- [ ] Full-text search across recipes
- [ ] Audio playback alongside structured recipe
- [ ] Tag-based filtering (by dish type, occasion, etc.)

## Won't build (explicit exclusions)
- Sharing / social features — this is private family data
- Automated sends or notifications — no delivery layer needed
- Edit-in-place UI for ingredients — edit via review flow only
