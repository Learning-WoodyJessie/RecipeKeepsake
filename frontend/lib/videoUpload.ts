// Video upload keeps only the sound. The server pulls the audio out of the video and stores that;
// the video itself is never kept. This file holds the rules and wording the Upload page uses.
// tests/video-upload.test.mjs ties the messages below to what the server really sends.

const MB = 1024 * 1024
export const VIDEO_MAX_BYTES = 200 * MB

export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-m4v,.mov,.m4v'

type PickedFile = { name: string; size: number; type?: string }

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Should this file go the video way? Phone video formats: .mov, .m4v and .mp4. Voice recordings are
 * .m4a, so an .mp4 picked here is a video (WhatsApp, camera roll); sending it the video way keeps only
 * its sound, as the screen says. Every audio format keeps going the audio way, exactly as before.
 */
export function isVideoUpload(file: PickedFile): boolean {
  const ext = extensionOf(file.name)
  return ext === '.mov' || ext === '.m4v' || ext === '.mp4'
}

export function videoTooLarge(file: PickedFile): boolean {
  return file.size > VIDEO_MAX_BYTES
}

export const VIDEO_TOO_LARGE_MESSAGE = 'File too large. Maximum size is 200 MB.'
export const VIDEO_HINT = "Recorded it on video? Drop it in. We'll save the voice."
export const VIDEO_PROCESSING_TITLE = '✨ Saving the voice from your video…'
export const VIDEO_PROCESSING_NOTE = 'We save just the voice, so your video stays on your phone. Big files can take a few minutes.'

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
