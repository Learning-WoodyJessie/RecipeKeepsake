# Memory Sharing & Non-Owner Viewing Experience — Design

*Brainstormed 2026-07-14, following up from the WhatsApp-share-redirect bug fix earlier the same day.*

## Goal

When someone opens a memory shared via a one-off link (WhatsApp, `/memory?token=...`) and they are not its owner, the page should show them a clean, honest, read-only view instead of the owner's full editable dashboard — and closing a memory into the Family Collection should make it obvious how family members actually get access to it.

## Audience

End users of the Next.js frontend (`frontend/app/(app)/memory/page.tsx`), specifically:
- **Owners** (Keepers) — unaffected by this change, their experience stays as-is.
- **Non-owner viewers** — anyone who opens a memory's share token while not being its `user_id`. Two sub-cases: a member of the same family group as the owner, and an outsider (friend, unrelated user, or first-time visitor).

## Scope — what we're NOT building

- **No new roles/permissions system.** Phase 5 (Viewer/Contributor roles) is still 📋 planned and out of scope — every non-owner stays strictly read-only here, regardless of family-group membership. This design does not anticipate or scaffold for Contributor edit rights.
- **No portal-lookup personalization.** We do not look up whether the *memory owner* belongs to a family group/portal to personalize the outsider banner. The banner is generic ("start your own archive"), gated only by the *viewer's* own memory count.
- **No dynamic WhatsApp link previews.** Personalizing the Open Graph title/image per memory requires a new unauthenticated endpoint generating data/images on the fly — a meaningfully larger lift that also sits awkwardly against the "no anonymous access" security posture. Logged as debt (D-019), not built here.
- **No fix for the audio "no sound" issue.** Orthogonal to this work — logged separately (D-020), pending browser-tool access to inspect the actual audio stream.

## Core Requirements

1. **Ownership check added to `PATCH /recipe/{token}`** ([scripts/serve.py:1190](scripts/serve.py:1190)). Currently has no ownership check at all (unlike `DELETE`, which does). Any authenticated holder of a share token can silently rename, re-tag, or otherwise mutate a memory they don't own. Mirror the existing `DELETE` endpoint's `user_id` check.

2. **Frontend viewer-mode branch** in `MemoryDetail` (`frontend/app/(app)/memory/page.tsx`), computed from `memory.user_id` (already returned by the API) vs. the signed-in user's id:
   - **Owner** → unchanged, full editable layout.
   - **Same-family-group member** (checked via existing `GET /family/members`, no new endpoint) → read-only layout, no onboarding banner.
   - **Outsider** → read-only layout; onboarding banner shown only if the viewer's own `api.recipes.list()` is empty (true first-timer).

3. **Non-owner read-only layout** strips, for both the audio-memory and recipe layouts:
   - Title/narrator edit affordances → render as plain static text (no button wrapper, no pencil icon)
   - Delete button
   - Category/tag picker (recipe layout)
   - Photo upload / "Change photo" control
   - "Your notes" auto-save textarea (hidden entirely — there is no per-viewer notes field; showing an editable box that a locked-down `PATCH` will now reject is worse than not showing it)
   - "Add to Family Collection" toggle (that decision belongs to the owner only)
   - Favorite button (favoriting writes to the viewer's own `localStorage`, but their Favorites filter is scoped to their own `api.recipes.list()` — a memory they don't own will never surface there even if favorited, so the control doesn't do what it implies)
   - "All Recipes" back-link (replaced with nothing, or the Echoes of Home logo linking to the viewer's own `/home`)

4. **Onboarding banner** (outsider + zero-memories case only): a single static line, e.g. "❤️ Loved this? Start preserving your own family's memories" linking to the landing/signup page. Not personalized to the sharer.

5. **Share button fix** ([openWhatsApp()](frontend/app/(app)/memory/page.tsx:275)): currently does `portalUrl || memoryUrl`, where `portalUrl` comes from the *viewer's own* `api.family.getMyGroup()`. A non-owner who belongs to their own unrelated family group would forward a link to *their* portal instead of the memory being viewed. Fix: only substitute `portalUrl` when the viewer is the owner; non-owners always share the direct memory link.

6. **Close the loop on "Add to Family Collection"** (owner-only, since the toggle itself stays owner-only per #3):
   - Static caption near the toggle, always visible, explaining the effect before it's clicked: "Visible to anyone who joins [group] via your invite link."
   - On successful toggle-on: reuse the existing `flash()` / `SavedBadge` confirmation pattern already in this file, extended to include a "Copy invite link" action using `invite_url` (already returned by `GET /family/groups/me`, currently only `portal_url` is read into state — no new backend work needed).
   - On toggle-off: matching quiet "Removed — no longer visible to your family" confirmation.

## Success Criteria

- A non-owner opening any shared memory link sees no control that would 403 if clicked (i.e., every remaining interactive element on the page actually works for them).
- Sharing a memory you don't own always produces a link to that specific memory, never to your own unrelated family portal.
- Toggling "Add to Family Collection" produces, within the same interaction, both a confirmation and a copyable invite link — no navigation to Account settings required to close the loop.
- `PATCH /recipe/{token}` returns 403 for a non-owner attempting to modify a memory, matching `DELETE`'s existing behavior.

## Edge Cases & Failure Modes

- **Viewer has no `user_id` yet resolved (race on load)** — default to the strictest state (read-only, no banner) until ownership is confirmed, then relax.
- **Viewer is in a family group, but a *different* one from the memory owner** — treated as an outsider (not same-group), banner logic applies based on their own memory count.
- **`GET /family/members` fails/404s (viewer has no group)** — treat as outsider; existing `.catch(() => {})` pattern already used for `getMyGroup()` in this file covers this.
- **Same link forwarded further by a non-owner viewer** (chain-sharing) — each subsequent viewer's experience is computed independently at view time from their own account state; no special handling needed.
- **A memory with no `portal_visible` flag set, owner not in any group at all** — outsider/same-group logic is unaffected by `portal_visible`; that field only governs the separate public portal listing.
