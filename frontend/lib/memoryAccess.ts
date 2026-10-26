// What the page says when a memory cannot be opened. The server answers the same 404 whether the memory
// belongs to another account, was removed, or the link is wrong (so it never confirms a memory exists),
// which means the wording has to cover all three and say what to do next.
// tests/memory-unavailable.test.mjs pins this wording.

export const UNAVAILABLE_TITLE = "We can't open this memory"
export const UNAVAILABLE_REASON = 'It may belong to a different account, or it may have been removed.'
export const UNAVAILABLE_STEPS = [
  'Try the account that saved it.',
  'Got this link from someone? Ask them to share it again with the Share button. That link opens for anyone.',
]

export function isNotFoundMessage(message: string): boolean {
  return /not found/i.test(message)
}

/** The short reference the server appends as "[req:xxxx]", handy when asking for help. */
export function requestRefOf(message: string): string | null {
  return message.match(/\[req:([A-Za-z0-9_-]+)\]/)?.[1] ?? null
}

export function signedInAs(email: string | null | undefined): string {
  return email ? `You're signed in as ${email}.` : ''
}
