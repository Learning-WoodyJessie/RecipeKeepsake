'use client'

/**
 * Brand mark: waveform + heart in rings (same artwork as sidebar).
 * SVG avoids Unicode 〰/♥ which render inconsistently across WebKit vs desktop fonts.
 */
export function EchoesLogoMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="40" cy="40" r="37" stroke="var(--accent)" strokeWidth="3.5" />
      <circle cx="40" cy="40" r="31" stroke="var(--accent2)" strokeWidth="1" />
      <rect x="10" y="37" width="2.5" height="6" rx="1.25" fill="var(--accent)" />
      <rect x="14" y="34" width="2.5" height="12" rx="1.25" fill="var(--accent)" />
      <rect x="18" y="30" width="2.5" height="20" rx="1.25" fill="var(--accent)" />
      <rect x="22" y="33" width="2.5" height="14" rx="1.25" fill="var(--accent)" />
      <rect x="26" y="27" width="2.5" height="26" rx="1.25" fill="var(--accent)" />
      <rect x="30" y="31" width="2.5" height="18" rx="1.25" fill="var(--accent)" />
      <rect x="34" y="35" width="2.5" height="10" rx="1.25" fill="var(--accent)" />
      <path
        d="M40 45 C40 45 33 39 33 35 C33 32.2 35.7 30 38 31.5 C39 32.1 40 33.2 40 33.2 C40 33.2 41 32.1 42 31.5 C44.3 30 47 32.2 47 35 C47 39 40 45 40 45Z"
        fill="var(--accent)"
      />
      <rect x="43.5" y="35" width="2.5" height="10" rx="1.25" fill="var(--accent)" />
      <rect x="47.5" y="31" width="2.5" height="18" rx="1.25" fill="var(--accent)" />
      <rect x="51.5" y="27" width="2.5" height="26" rx="1.25" fill="var(--accent)" />
      <rect x="55.5" y="33" width="2.5" height="14" rx="1.25" fill="var(--accent)" />
      <rect x="59.5" y="30" width="2.5" height="20" rx="1.25" fill="var(--accent)" />
      <rect x="63.5" y="34" width="2.5" height="12" rx="1.25" fill="var(--accent)" />
      <rect x="67.5" y="37" width="2.5" height="6" rx="1.25" fill="var(--accent)" />
    </svg>
  )
}
