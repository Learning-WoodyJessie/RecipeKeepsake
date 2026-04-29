# RecipeKeepsake — Roadmap

## Phase 0 — Core pipeline ✅
- [x] PRD approved (brainstorm complete)
- [x] Whisper transcription tool (`tools/transcribe.py`)
- [x] Two-step LLM pipeline (`prompts/translate.py`, `prompts/structure.py`)
- [x] CLI capture script (`scripts/capture.py`)
- [ ] Supabase schema + storage bucket
- [x] Tests for all tools and prompts (mocked)

## Phase 1 — Mobile capture UI + Recipe Blog
- [x] PRD approved (brainstorm complete)
- [ ] `/record` page — record button, progress stages, review screen, photo upload
- [ ] DALL-E image generation (`prompts/image.py`) — auto-generates if no photo
- [ ] Audio + image upload to Supabase Storage
- [ ] Blog home (`/`) — recipe grid, most recent first
- [ ] Individual recipe page (`/recipe/[token]`) — card + audio player
- [ ] WhatsApp share — pre-filled message with recipe link

## Phase 2 — Search + playback
- [ ] Full-text search across recipes
- [ ] Audio playback alongside structured recipe
- [ ] Tag-based filtering (by dish type, occasion, etc.)

## Won't build (explicit exclusions)
- Sharing / social features — this is private family data
- Automated sends or notifications — no delivery layer needed
- Edit-in-place UI for ingredients — edit via review flow only
