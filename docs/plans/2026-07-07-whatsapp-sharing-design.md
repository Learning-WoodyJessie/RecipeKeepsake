# Phase D — WhatsApp Sharing PRD

**Date:** 2026-07-07  
**Status:** Approved for planning  
**Depends on:** Phase C (Public Portal) — complete

---

## Goal

Let any family member share a memory — or the whole family archive — to WhatsApp with one tap, with a warm, bilingual message already written for them.

---

## Audience

Contributors (logged-in family members) who want to surface a specific memory or the entire portal in their family WhatsApp group.

---

## Scope — what we're NOT building

- Instagram sharing (requires image card generation — future phase)
- WhatsApp Business API integration (not feasible; deep link is the right approach)
- Scheduled "memory of the week" automatic sends
- Share button on the public portal page (portal is for readers, not management)
- Per-viewer analytics ("X people opened this link")
- Ability to customise the message before sending (WhatsApp lets the user edit it anyway)

---

## Design Decisions (locked in brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| Share destination | Family portal (`/family?p=TOKEN`) always | Portal is stable, grows over time, more valuable than a single memory link |
| Message tone | Memory-led — specific memory is the hook, portal is the destination | "Ammamma recorded her Pesarattu…" not "Our archive has a new entry" |
| Language | English + Telugu bilingual, in the same message | Older generation reads Telugu; younger reads English; one message serves both |
| Share button locations | Memory detail page + Account page only | Memory detail = peak emotional intent; Account = archive management hub |
| Portal page | Read-only — no share button | Portal is for viewers, not management; re-sharing via Account page is correct |
| iOS Safari | `window.open()` must be synchronous — no await before it | Async before `window.open()` is blocked silently on iOS Safari |

---

## WhatsApp Message Templates

Each message has an English line and a Telugu line, then the portal URL.

### Memory detail share (per content type)

```
recipe:
  EN: "{narrator} recorded her {title} recipe in her own voice 🎙️"
  TE: "{narrator} {title} రెసిపీని తన స్వంత గొంతుతో చెప్పారు 🎙️"

song:
  EN: "{narrator} singing {title} — listen here 🎵"
  TE: "{narrator} {title} పాడారు — ఇక్కడ వినండి 🎵"

story:
  EN: "{narrator} shares a story: {title} 📖"
  TE: "{narrator} ఒక కథ చెప్పారు: {title} 📖"

fable:
  EN: "{narrator} tells a fable: {title} ✨"
  TE: "{narrator} ఒక నీతి కథ చెప్పారు: {title} ✨"

moral:
  EN: "{narrator} — {title} 🙏"
  TE: "{narrator} — {title} 🙏"

(all types append:)
  \n\n{portal_url}
```

### Account page portal share

```
EN: "Our family memories — {group_name} archive 🏡"
TE: "మన కుటుంబ జ్ఞాపకాలు — {group_name} 🏡"
\n\n{portal_url}
```

---

## UI Placement

### Memory detail page (`/memory?token=...`)

Location: Below the portal toggle button, above the image.

```
[+ Add to family portal]     ← existing (Chunk 3.3)
[↗ Share to WhatsApp]        ← new (Phase D)
```

Only visible when `isInGroup` is true (same gate as the portal toggle).  
If `!inPortal`, share button still shows — sharing sends to portal regardless.

### Account page (`/account`)

Location: Inside the FamilyGroupSection, below the portal URL copy row.

```
Portal URL: echoes.home/family?p=…   [Copy]
                                      [↗ Share on WhatsApp]   ← new
```

---

## Implementation — `frontend/lib/share.ts`

Single utility module with two exported functions:

```typescript
buildMemoryShareMessage(memory: ShareableMemory, portalUrl: string): string
buildPortalShareMessage(groupName: string, portalUrl: string): string
```

Both return the complete bilingual string ready to pass to `encodeURIComponent`.

The WhatsApp URL: `https://wa.me/?text=${encodeURIComponent(message)}`

Must be built synchronously before any click handler runs (iOS Safari rule).

---

## Success Criteria

1. Tapping "Share to WhatsApp" on a memory detail page opens WhatsApp with a pre-filled bilingual message and the portal URL — on iOS Safari and Android Chrome.
2. The message copy is correct for all 5 content types (recipe, song, story, fable, moral).
3. The portal share button on the Account page produces the archive-intro message with the group name.
4. Both buttons are only visible when the user is in a family group.
5. `cd frontend && node_modules/.bin/next build` passes with no TypeScript errors.

---

## Edge Cases & Failure Modes

| Case | Handling |
|---|---|
| User not in a family group | Share buttons hidden (same `isInGroup` gate as portal toggle) |
| Memory has no narrator name | Message omits narrator: "A recipe was recorded…" |
| WhatsApp not installed | `window.open()` opens browser wa.me — WhatsApp web fallback, user is not blocked |
| Portal token missing (group has no portal) | Share button hidden — portal_token is generated at group creation, so this can only happen if data is corrupt |
| Very long dish name | No truncation — WhatsApp can handle long pre-fills; user can edit before sending |

---

## Chunks

**D.1** — `frontend/lib/share.ts`: bilingual message builder + WhatsApp URL helper  
**D.2** — Memory detail page: Share button wired to `share.ts`  
**D.3** — Account page: Portal share button wired to `share.ts`  

---

## Decisions log entries

```
[2026-07-07] [WhatsApp Sharing] — Decision: Share destination is always the family portal URL, not individual memory URLs. Rejected: per-memory direct link. Because: portal grows over time and is more valuable as a pinned link; memory-led message copy provides the hook.
[2026-07-07] [WhatsApp Sharing] — Decision: Bilingual messages (English + Telugu in same message). Rejected: English only. Because: older generation (the narrators) reads Telugu; younger generation reads English; one message serves both in a multigenerational WhatsApp group.
[2026-07-07] [WhatsApp Sharing] — Decision: Share buttons on memory detail + account page only. Rejected: share button on portal page. Because: portal is a read destination, not a management surface; adding share there blurs the model and enables uncontrolled re-sharing by viewers.
```
