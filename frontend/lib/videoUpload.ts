// Video upload keeps only the sound. The server pulls the audio out of the video and stores that;
// the video itself is never kept. This file holds the rules and wording the Upload page uses.
// tests/video-upload.test.mjs ties the messages below to what the server really sends.

const MB = 1024 * 1024
const AUDIO_MAX_BYTES = 25 * MB
export const VIDEO_MAX_BYTES = 200 * MB

export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-m4v,.mov,.m4v'

type PickedFile = { name: string; size: number; type?: string }

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Should this file go the video way? Only files that cannot be handled as audio today:
 * phone .mov/.m4v always, and an .mp4 that is too big for the audio limit. Everything that
 * already works as an audio upload keeps going the audio way, exactly as before.
 */
export function isVideoUpload(file: PickedFile): boolean {
  const ext = extensionOf(file.name)
  if (ext === '.mov' || ext === '.m4v') return true
  return ext === '.mp4' && file.size > AUDIO_MAX_BYTES
}

export function videoTooLarge(file: PickedFile): boolean {
  return file.size > VIDEO_MAX_BYTES
}

export const VIDEO_TOO_LARGE_MESSAGE = 'File too large. Maximum size is 200 MB.'
export const VIDEO_HINT = 'Have a video? Upload it too. We keep only the sound, not the video.'
export const VIDEO_PROCESSING_TITLE = '✨ Taking the sound from your video…'
export const VIDEO_PROCESSING_NOTE = 'We keep only the audio, not the video. Large videos can take a few minutes to upload.'

// What the server says when a video cannot be used (tools/video.py). Shown as written.
export const VIDEO_PROBLEMS = [
  "We couldn't find any sound in this video.",
  "We couldn't read this video.",
  'This video took too long to process.',
  'File does not appear to be a valid video file.',
]

export function isVideoProblemMessage(message: string): boolean {
  return VIDEO_PROBLEMS.some((m) => message.includes(m))
}
