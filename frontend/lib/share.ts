type MemoryType = 'recipe' | 'song' | 'story' | 'fable' | 'wisdom' | 'poem'

const EN: Record<MemoryType, (narrator: string, title: string) => string> = {
  recipe:  (n, t) => `${n} recorded her ${t} recipe in her own voice 🎤`,
  song:    (n, t) => `${n} singing ${t}, listen here 🎵`,
  story:   (n, t) => `${n} shares a story: ${t} 📖`,
  fable:   (n, t) => `${n} tells a fable: ${t} ✨`,
  wisdom:  (n, t) => `${n}: ${t} 🙏`,
  poem:    (n, t) => `${n}: ${t} 🖊️`,
}

const TE: Record<MemoryType, (narrator: string, title: string) => string> = {
  recipe:  (n, t) => `${n} ${t} రెసిపీని తన స్వంత గొంతుతో చెప్పారు 🎤`,
  song:    (n, t) => `${n} ${t} పాడారు, ఇక్కడ వినండి 🎵`,
  story:   (n, t) => `${n} ఒక కథ చెప్పారు: ${t} 📖`,
  fable:   (n, t) => `${n} ఒక నీతి కథ చెప్పారు: ${t} ✨`,
  wisdom:  (n, t) => `${n}: ${t} 🙏`,
  poem:    (n, t) => `${n}: ${t} 🖊️`,
}

export function buildMemoryShareMessage(
  type: MemoryType | null | undefined,
  title: string | null | undefined,
  narrator: string | null | undefined,
  portalUrl: string,
): string {
  const t = type && type in EN ? type : 'recipe'
  const safeTitle = title ?? 'this memory'
  const safeNarrator = narrator ?? 'A family member'
  const en = EN[t](safeNarrator, safeTitle)
  const te = TE[t](safeNarrator, safeTitle)
  return `${en}\n${te}\n\n${portalUrl}`
}

export function buildPortalShareMessage(groupName: string, portalUrl: string): string {
  return `Our family memories: ${groupName} archive 🏡\nమన కుటుంబ జ్ఞాపకాలు: ${groupName} 🏡\n\n${portalUrl}`
}

export function toWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
