# Family Sharing & WhatsApp Portal — PRD

**Date:** 2026-07-07  
**Status:** Approved for planning  
**Feature:** Family Groups + Public Memory Portal + WhatsApp Sharing

---

## Problem

Memories recorded in Echoes of Home are siloed to the person who recorded them. Families — especially multigenerational South Asian families — share memories collectively and use WhatsApp groups as their primary communication channel. There is no way for multiple family members to contribute to a shared collection, no stable place for the whole family to browse those memories, and no friction-free way to surface a shared link in a WhatsApp group without it getting buried in chat history.

---

## Goals

1. Make the family — not the individual — the organizing unit for memories
2. Give every family a stable, public URL they can pin once in their WhatsApp group
3. Let multiple family members contribute recordings to the shared collection
4. Give contributors control over what is public vs private
5. Support richer content types beyond recipes

---

## Design Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Sharing channel | WhatsApp deep link only | Business API doesn't support consumer group membership; deep link is zero-setup |
| WhatsApp group sync | Not feasible via official API | Meta Groups API is limited to business-created groups (max 8 members); unofficial libraries violate ToS |
| Portal access | Public URL, no login required | Grandma's relatives in Hyderabad have no account and never will; friction kills reach |
| URL security model | Unguessable token (UUID) | Same model as Google Doc "share via link" — no auth, but URL is not guessable |
| Family library | All contributors see all memories | Family is a unit — no private silos between members |
| Portal content | Explicit per-memory toggle ("Add to family portal") | Private family stories should never be auto-public; one tap is acceptable friction |
| Content types | recipe, song, story, fable, moral | Families share more than recipes; type drives display and WhatsApp message copy |
| Multiple contributors | Invite link (not WhatsApp group sync) | Only feasible approach without unofficial API access |

---

## User Stories

### Family Admin (the person who sets up the group)
- As a family admin, I can create a Family Group so I have a stable portal URL to share
- As a family admin, I can copy an invite link to paste into our WhatsApp group so relatives can join as contributors
- As a family admin, I can see everyone in my family group and what they've contributed

### Contributor (family member with an account)
- As a contributor, I can record a memory (any type) and choose whether it goes to the family portal
- As a contributor, I can see all memories recorded by anyone in my family group
- As a contributor, I can share any memory to WhatsApp with one tap — pre-written message, ready to send
- As a contributor, I can toggle a memory's portal visibility on or off after saving

### Viewer (anyone with the portal link — no account)
- As a viewer, I can open the family portal URL on my phone and browse all memories marked public
- As a viewer, I can play any audio recording without signing in
- As a viewer, I can see who recorded each memory (narrator + contributor name) and when
- As a viewer, I can filter memories by type (recipes, songs, stories, etc.)

---

## Content Types

| Type | AI Pipeline? | Display on Portal |
|---|---|---|
| `recipe` | Yes — transcribe → translate → structure | Ingredients + steps + audio |
| `song` | No — direct audio upload | Title + narrator + audio player |
| `story` | No — direct audio upload | Title + narrator + audio + optional notes |
| `fable` | No — direct audio upload | Title + narrator + audio |
| `moral` | No — direct audio upload | Title + narrator + short text + audio |

The existing `mode === 'ai'` upload flow maps to `recipe`. The existing `mode === 'direct'` flow maps to all other types — the user selects the type before uploading.

---

## Data Model Changes

### New table: `family_groups`
```sql
CREATE TABLE family_groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid references auth.users(id),
  portal_token    text unique not null default gen_random_uuid()::text,
  invite_token    text unique not null default gen_random_uuid()::text,
  created_at      timestamptz default now()
);
```

### New table: `family_group_members`
```sql
CREATE TABLE family_group_members (
  group_id    uuid references family_groups(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  role        text default 'contributor', -- 'admin' | 'contributor'
  joined_at   timestamptz default now(),
  primary key (group_id, user_id)
);
```

### Changes to `memories`
```sql
ALTER TABLE memories
  ADD COLUMN type         text default 'recipe',      -- recipe|song|story|fable|moral
  ADD COLUMN family_group_id uuid references family_groups(id),
  ADD COLUMN portal_visible  boolean default false;    -- explicit opt-in for public portal
```

### Row-level security
- `memories`: contributors can read all memories where `family_group_id` matches their group
- `family_group_members`: members can read their own group's member list
- Portal endpoint (`/portal/[token]`): public, no auth — reads only `portal_visible = true` memories

---

## User Flows

### Flow 1 — Create a Family Group
1. User opens Settings (or Home) → "Create Family Group"
2. Enters group name (e.g. "Lakshmi Family")
3. App creates group, generates `portal_token` and `invite_token`
4. User sees: portal URL + invite link + copy/share buttons
5. User pastes portal URL to WhatsApp group → group admin pins it

### Flow 2 — Join as Contributor (invite link)
1. Family member receives invite link in WhatsApp: `echoes.home/join/[invite_token]`
2. Clicks link → landing page explaining what Echoes of Home is
3. Signs up (email or Apple Sign-In)
4. Automatically added to the family group as contributor
5. Immediately sees the family's shared library

### Flow 3 — Record & Share a Memory
1. Contributor records a memory (recipe via AI pipeline, or song/story/fable/moral via direct upload)
2. On the save screen: type selector (if direct upload) + "Add to family portal?" toggle
3. Memory saves → if portal toggle on, appears on the public portal immediately
4. Contributor taps "Share to WhatsApp" → WhatsApp opens with pre-written message:
   - Recipe: *"Ammamma recorded her Pesarattu recipe in her own voice 🎙️ — [link]"*
   - Song: *"Ammamma singing Lali Lali — listen here 🎵 — [link]"*
   - Story: *"Ammamma shares a story about [title] — [link]"*
5. Contributor selects family WhatsApp group → sends

### Flow 4 — Browse Family Portal (viewer, no login)
1. Viewer clicks pinned portal URL in WhatsApp group
2. Sees family portal: group name, photo count, filter tabs by type
3. Each card: title, narrator name, contributor name, type badge, date, play button
4. Clicks play → audio plays inline, no redirect, no login prompt
5. Optional: "Join to contribute your own memories" nudge at the bottom (not a wall)

### Flow 5 — Family Library (logged-in contributors)
1. Contributor opens app → Home shows all family memories (not just their own)
2. Can filter by contributor, type, narrator, date
3. Each memory shows portal visibility badge (public / private)
4. Can toggle visibility on any memory (not just their own — family unit)

---

## WhatsApp Message Templates

Generated client-side based on content type:

```
recipe:  "[narrator] recorded her [title] recipe in her own voice 🎙️\n[memory URL]"
song:    "[narrator] singing [title] 🎵\n[memory URL]"
story:   "[narrator] shares: [title] 📖\n[memory URL]"
fable:   "[narrator] tells a fable: [title] ✨\n[memory URL]"
moral:   "[narrator] — [title] 🙏\n[memory URL]"
```

WhatsApp share: `https://wa.me/?text=[encoded message]`

---

## Portal Page Design

URL: `/family/[portal_token]`  
Auth: none required

```
┌─────────────────────────────────┐
│  🎙️ Lakshmi Family Memories     │
│  24 memories · 6 contributors   │
├─────────────────────────────────┤
│  [All] [Recipes] [Songs] [Stories] [More ▾]  │
├─────────────────────────────────┤
│  ┌──────────────────────────┐   │
│  │ 🍛 Pesarattu             │   │
│  │ Ammamma · recipe · 2d ago│   │
│  │ recorded by Pavani       │   │
│  │ ▶ Play (2:34)            │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ 🎵 Lali Lali             │   │
│  │ Ammamma · song · 5d ago  │   │
│  │ ▶ Play (1:12)            │   │
│  └──────────────────────────┘   │
│  ...                            │
│                                 │
│  Want to add your own memories? │
│  [Join the family →]            │
└─────────────────────────────────┘
```

---

## Out of Scope (MVP)

- Instagram sharing (future — requires image card generation)
- WhatsApp Business API integration (not feasible without Meta approval)
- Scheduled "memory of the week" push to WhatsApp
- Family group chat or comments within the app
- Multiple family groups per user
- Per-memory access control beyond public/private toggle
- Pinning within the app (deferred by user)

---

## Open Questions

None — all design decisions confirmed in brainstorm session 2026-07-07.

---

## Implementation Phases

**Phase A — Content Types** (smallest, unblocks everything else)
- Add `type` field to memories table and upload UI
- Direct upload type selector: song / story / fable / moral
- Memory detail page renders differently per type

**Phase B — Family Groups**
- `family_groups` + `family_group_members` tables + RLS
- Create group flow + invite link flow
- Family library view (logged-in, sees all members' memories)

**Phase C — Public Portal**
- `/family/[portal_token]` public page — no auth
- `portal_visible` toggle on memory save + memory detail
- Filter tabs by content type

**Phase D — WhatsApp Sharing**
- Per-type message templates
- "Share to WhatsApp" button on memory detail + portal card
- Portal URL + invite link copy/share on group settings page
