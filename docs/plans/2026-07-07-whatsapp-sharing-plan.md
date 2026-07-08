# Phase D — WhatsApp Sharing Plan

**Goal:** One-tap WhatsApp sharing of memories and the family portal, with bilingual (English + Telugu) pre-written messages.  
**Layer:** Frontend only (Next.js / TypeScript)  
**Architecture:** Extract all message-building logic into `frontend/lib/share.ts` so memory detail and account pages share the same copy. Memory detail page already calls `api.family.getMyGroup()` — extend that call to also capture `portal_url`. Account page adds a single WhatsApp share button next to the existing portal copy row.  
**Design doc:** `docs/plans/2026-07-07-whatsapp-sharing-design.md`

**Pre-read findings:**
- `openWhatsApp()` already exists in `memory/page.tsx:221` — links to `/memory?token=...` with generic copy. Phase D upgrades it to use the portal URL and bilingual per-type copy.
- `WaIcon` SVG already defined at `memory/page.tsx:51` — reuse pattern, replicate in account page inline.
- `api.family.getMyGroup()` in `memory/page.tsx:131` discards the response (only sets `isInGroup`). Chunk D.2 captures `portal_url` from the same call.
- `FamilyGroupSection` in `account/page.tsx:91` already has `data.portal_url` and `data.group.name` in scope — no new API calls needed for D.3.
- No existing equivalent of a message-builder utility — `share.ts` is net-new.
- No Python layer changes. No tests beyond `next build` verification.

---

## Chunk D.1 — `frontend/lib/share.ts`: bilingual message builder

**Files:**
- Create: `frontend/lib/share.ts`

**What it does:**
- `buildMemoryShareMessage(type, title, narrator, portalUrl)` — returns English + Telugu bilingual string for each content type
- `buildPortalShareMessage(groupName, portalUrl)` — returns archive-intro bilingual string
- `toWhatsAppUrl(message)` — wraps message in `https://wa.me/?text=` with encoding

**Implementation:**

```typescript
// frontend/lib/share.ts

type MemoryType = 'recipe' | 'song' | 'story' | 'fable' | 'moral'

const EN: Record<MemoryType, (narrator: string, title: string) => string> = {
  recipe: (n, t) => `${n} recorded her ${t} recipe in her own voice 🎙️`,
  song:   (n, t) => `${n} singing ${t} — listen here 🎵`,
  story:  (n, t) => `${n} shares a story: ${t} 📖`,
  fable:  (n, t) => `${n} tells a fable: ${t} ✨`,
  moral:  (n, t) => `${n} — ${t} 🙏`,
}

const TE: Record<MemoryType, (narrator: string, title: string) => string> = {
  recipe: (n, t) => `${n} ${t} రెసిపీని తన స్వంత గొంతుతో చెప్పారు 🎙️`,
  song:   (n, t) => `${n} ${t} పాడారు — ఇక్కడ వినండి 🎵`,
  story:  (n, t) => `${n} ఒక కథ చెప్పారు: ${t} 📖`,
  fable:  (n, t) => `${n} ఒక నీతి కథ చెప్పారు: ${t} ✨`,
  moral:  (n, t) => `${n} — ${t} 🙏`,
}

export function buildMemoryShareMessage(
  type: MemoryType | null | undefined,
  title: string | null | undefined,
  narrator: string | null | undefined,
  portalUrl: string,
): string {
  const t = type ?? 'recipe'
  const safeTitle = title ?? 'this memory'
  const safeNarrator = narrator ?? 'A family member'
  const en = EN[t](safeNarrator, safeTitle)
  const te = TE[t](safeNarrator, safeTitle)
  return `${en}\n${te}\n\n${portalUrl}`
}

export function buildPortalShareMessage(groupName: string, portalUrl: string): string {
  return `Our family memories — ${groupName} archive 🏡\nమన కుటుంబ జ్ఞాపకాలు — ${groupName} 🏡\n\n${portalUrl}`
}

export function toWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
```

**Verification:**
```bash
cd frontend && node_modules/.bin/next build
```
Expected: clean build, `share.ts` compiled with no TS errors.

**Commit:**
```bash
git add frontend/lib/share.ts
git commit -m "[Add] [frontend]: share.ts — bilingual WhatsApp message builder (Chunk D.1)"
```

---

## Chunk D.2 — Memory detail: upgrade `openWhatsApp()` to bilingual + portal URL

**Files:**
- Modify: `frontend/app/(app)/memory/page.tsx`

**Changes:**
1. Import `buildMemoryShareMessage` and `toWhatsAppUrl` from `@/lib/share`
2. Add `portalUrl` state: `const [portalUrl, setPortalUrl] = useState('')`
3. In the existing `getMyGroup()` useEffect (line 130–132), capture `portal_url`:
   ```tsx
   api.family.getMyGroup()
     .then((d: { portal_url?: string }) => {
       setIsInGroup(true)
       setPortalUrl(d?.portal_url ?? '')
     })
     .catch(() => {})
   ```
4. Replace the body of `openWhatsApp()` (currently lines 221–226):
   ```tsx
   function openWhatsApp() {
     const url = portalUrl || `${window.location.origin}/memory?token=${token}`
     const msg = buildMemoryShareMessage(memory?.type, memory?.dish_name, memory?.narrator, url)
     window.open(toWhatsAppUrl(msg), '_blank')
   }
   ```
   Note: `window.open()` remains synchronous — no await anywhere in this function (iOS Safari rule).

**Verification:**
```bash
cd frontend && node_modules/.bin/next build
```
Expected: clean build.

**Manual check:** Open a memory detail page, tap Share — WhatsApp (or wa.me web) should open with bilingual message and portal URL (or memory URL as fallback if not in group).

**Commit:**
```bash
git add frontend/app/\(app\)/memory/page.tsx
git commit -m "[Update] [frontend]: openWhatsApp uses bilingual per-type message + portal URL (Chunk D.2)"
```

---

## Chunk D.3 — Account page: WhatsApp share button for the family portal

**Files:**
- Modify: `frontend/app/(app)/account/page.tsx`

**Changes:**

1. Import `buildPortalShareMessage` and `toWhatsAppUrl` from `@/lib/share` at the top of the file.

2. In `FamilyGroupSection`, add a `WaIcon` inline SVG (same as in `memory/page.tsx`):
   ```tsx
   function WaIcon() {
     return (
       <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
         <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
       </svg>
     )
   }
   ```

3. Add `sharePortal` function inside `FamilyGroupSection` (alongside `copy()`):
   ```tsx
   function sharePortal() {
     if (!data) return
     const msg = buildPortalShareMessage(data.group.name, data.portal_url)
     window.open(toWhatsAppUrl(msg), '_blank')
   }
   ```
   `window.open()` is synchronous — no await (iOS Safari rule).

4. Add the share button after the "Copy" button in the Portal URL row:
   ```tsx
   <button
     onClick={sharePortal}
     style={{
       flexShrink: 0,
       display: 'inline-flex', alignItems: 'center', gap: 4,
       background: '#25D366', color: 'white', border: 'none',
       borderRadius: 8, padding: '0.3rem 0.75rem',
       fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--sans)',
     }}
   >
     <WaIcon /> Share
   </button>
   ```

**Verification:**
```bash
cd frontend && node_modules/.bin/next build
```
Expected: clean build, 20 static routes.

**Manual check:** Open Account page → Family Group section → tap green Share button → WhatsApp opens with "Our family memories — [group name] archive 🏡 / మన కుటుంబ జ్ఞాపకాలు…" and the portal URL.

**Commit:**
```bash
git add frontend/app/\(app\)/account/page.tsx
git commit -m "[Add] [frontend]: WhatsApp share button for family portal on account page (Chunk D.3)"
```

---

## Completion gate

- [ ] D.1 committed — `share.ts` builds cleanly
- [ ] D.2 committed — memory detail `openWhatsApp()` uses bilingual + portal URL
- [ ] D.3 committed — account page has green WhatsApp share button
- [ ] Full build clean: `cd frontend && node_modules/.bin/next build`
- [ ] `/audit` passes
