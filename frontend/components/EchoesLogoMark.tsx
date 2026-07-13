'use client'

/**
 * Brand mark: spinning vinyl record with radiating echo rings.
 * Echo rings use var(--accent) to blend with sidebar/nav palette.
 * Amber label ties into the warm memory card palette.
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
      <defs>
        <style>{`
          @keyframes rkl-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes rkl-echo {
            0%   { transform: scale(1);   opacity: 0.55; }
            100% { transform: scale(2.1); opacity: 0; }
          }
          .rkl-disc {
            animation: rkl-spin 5s linear infinite;
            transform-origin: 40px 40px;
          }
          .rkl-echo-ring {
            transform-box: fill-box;
            transform-origin: center;
          }
          .rkl-e1 { animation: rkl-echo 3s ease-out infinite; }
          .rkl-e2 { animation: rkl-echo 3s ease-out 1s infinite; }
          .rkl-e3 { animation: rkl-echo 3s ease-out 2s infinite; }
        `}</style>
      </defs>

      {/* Faint outer boundary ring */}
      <circle cx="40" cy="40" r="37" stroke="var(--accent)" strokeWidth="1.5" opacity="0.2" />

      {/* Echo rings — expand from vinyl edge, fade out */}
      <circle className="rkl-echo-ring rkl-e1" cx="40" cy="40" r="19" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
      <circle className="rkl-echo-ring rkl-e2" cx="40" cy="40" r="19" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
      <circle className="rkl-echo-ring rkl-e3" cx="40" cy="40" r="19" fill="none" stroke="var(--accent)" strokeWidth="1.3" />

      {/* Vinyl disc — spinning */}
      <g className="rkl-disc">
        <circle cx="40" cy="40" r="19" fill="#1C1208" />
        <circle cx="40" cy="40" r="17" fill="none" stroke="#2C2010" strokeWidth="0.7" />
        <circle cx="40" cy="40" r="15" fill="none" stroke="#2C2010" strokeWidth="0.7" />
        <circle cx="40" cy="40" r="13" fill="none" stroke="#2C2010" strokeWidth="0.6" />
        <circle cx="40" cy="40" r="11" fill="none" stroke="#2C2010" strokeWidth="0.5" />
        {/* Amber label — matches memory card palette */}
        <circle cx="40" cy="40" r="9"   fill="#C8924A" />
        <circle cx="40" cy="40" r="7.5" fill="#B8801E" />
        <circle cx="40" cy="40" r="5"   fill="none" stroke="#E0B070" strokeWidth="0.6" />
        <circle cx="40" cy="40" r="1.5" fill="#080400" />
        <ellipse cx="33" cy="31" rx="4" ry="2" fill="rgba(255,255,255,0.05)" transform="rotate(-25 33 31)" />
      </g>

      {/* Outer accent ring — same weight as current logo border */}
      <circle cx="40" cy="40" r="37" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
    </svg>
  )
}
