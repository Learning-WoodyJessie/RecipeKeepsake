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

// Upload checks in scripts/serve.py (_validate_audio_upload) explain exactly what is wrong with the
// chosen file, so people can fix it themselves. tests/server-messages.test.mjs keeps these in step.
export const SERVER_FILE_PROBLEMS = ['File does not appear to be a valid audio file.', 'Unsupported file type', 'File too large.']

export function isFileProblemMessage(message: string): boolean {
  return SERVER_FILE_PROBLEMS.some((m) => message.includes(m))
}
