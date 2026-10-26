// The server (tools/errors.py) now answers failures with a fixed set of calm,
// user-safe messages. Pages that translate raw errors into friendlier text must
// let these through untouched, otherwise a precise message such as "we couldn't
// read this recording" is replaced by a vague "something went wrong".
// tests/server-messages.test.mjs keeps this list in step with tools/errors.py.
export const SERVER_SAFE_MESSAGES = [
  "We can't process new recordings right now.",
  'Our processing is busy right now.',
  "We couldn't read this recording.",
  'Something went wrong on our side.',
]

export function isServerSafeMessage(message: string): boolean {
  return SERVER_SAFE_MESSAGES.some((m) => message.includes(m))
}
