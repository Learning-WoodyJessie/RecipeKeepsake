import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Support - Echoes of Home',
  description: 'Get help with Echoes of Home. Contact us or find answers to common questions.',
}

const faqs = [
  {
    q: 'How do I record a memory?',
    a: 'Open the app, tap the record button on the Capture screen, select a family member, and start speaking. The app will transcribe and translate the recording automatically.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Transcription and English translation have been verified in Telugu. The app is built to support other languages as well.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. All recordings, transcripts, and memories are private to your account. Nothing is shared publicly. Only you and people you explicitly invite can access your archive.',
  },
  {
    q: 'How do I share memories with family?',
    a: 'You can create a Family Group and invite members, or share a read-only Family Portal link with relatives.',
  },
  {
    q: 'How do I delete a memory?',
    a: 'Open the memory, scroll to the bottom, and tap Delete. It is removed from your archive immediately.',
  },
  {
    q: 'How do I delete my account and all my data?',
    a: 'Email us at echoesofhome63@gmail.com and we will delete your account and all associated data within 30 days.',
  },
]

export default function SupportPage() {
  return (
    <>
      <style>{`
        :root {
          --sp-bg: #FAF6F0;
          --sp-surface: #F2EBE2;
          --sp-border: #E0D5C8;
          --sp-heading: #2D2420;
          --sp-body: #5C4D45;
          --sp-muted: #9A8A82;
          --sp-accent: #2D6A5A;
          --sp-accent-light: #EAF3F0;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --sp-bg: #1C1612;
            --sp-surface: #261F1A;
            --sp-border: #3A302A;
            --sp-heading: #EDE5DC;
            --sp-body: #C8BAB1;
            --sp-muted: #7A6E68;
            --sp-accent: #5AB89A;
            --sp-accent-light: #1A2D28;
          }
        }
        :root[data-theme="dark"] {
          --sp-bg: #1C1612; --sp-surface: #261F1A; --sp-border: #3A302A;
          --sp-heading: #EDE5DC; --sp-body: #C8BAB1; --sp-muted: #7A6E68;
          --sp-accent: #5AB89A; --sp-accent-light: #1A2D28;
        }
        :root[data-theme="light"] {
          --sp-bg: #FAF6F0; --sp-surface: #F2EBE2; --sp-border: #E0D5C8;
          --sp-heading: #2D2420; --sp-body: #5C4D45; --sp-muted: #9A8A82;
          --sp-accent: #2D6A5A; --sp-accent-light: #EAF3F0;
        }
        * { box-sizing: border-box; }
        .sp-page { background: var(--sp-bg); min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: var(--sp-body); }
        .sp-topbar {
          background: var(--sp-bg); border-bottom: 1px solid var(--sp-border);
          padding: 0 1.5rem; height: 56px; display: flex; align-items: center;
          justify-content: space-between; position: sticky; top: 0; z-index: 10;
        }
        .sp-brand { display: flex; align-items: center; gap: 0.6rem; text-decoration: none; }
        .sp-brand-circle {
          width: 28px; height: 28px; border-radius: 50%;
          border: 2px solid var(--sp-accent); display: flex; align-items: center;
          justify-content: center; font-size: 0.75rem; color: var(--sp-accent);
        }
        .sp-brand-name {
          font-family: 'Playfair Display', Georgia, serif; font-size: 1rem;
          font-weight: 600; color: var(--sp-heading); letter-spacing: -0.01em;
        }
        .sp-back { font-size: 0.8rem; color: var(--sp-muted); text-decoration: none; }
        .sp-back:hover { color: var(--sp-accent); }
        .sp-hero { max-width: 640px; margin: 0 auto; padding: 3.5rem 1.5rem 2rem; }
        .sp-eyebrow {
          font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.12em; color: var(--sp-accent); margin-bottom: 0.75rem;
        }
        .sp-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(1.8rem, 4vw, 2.4rem); font-weight: 700;
          color: var(--sp-heading); line-height: 1.2; margin: 0 0 0.6rem;
        }
        .sp-subtitle { font-size: 0.95rem; color: var(--sp-muted); margin-bottom: 2.5rem; }
        .sp-contact {
          background: var(--sp-accent-light); border: 1px solid var(--sp-accent);
          border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 0.75rem;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.75rem;
        }
        .sp-contact-label { font-size: 0.85rem; color: var(--sp-body); }
        .sp-contact-label strong { color: var(--sp-heading); display: block; margin-bottom: 0.15rem; font-size: 0.9rem; }
        .sp-contact-btn {
          background: var(--sp-accent); color: #fff; text-decoration: none;
          padding: 0.55rem 1.1rem; border-radius: 8px; font-size: 0.85rem;
          font-weight: 500; white-space: nowrap;
        }
        .sp-article { max-width: 640px; margin: 0 auto; padding: 0 1.5rem 6rem; }
        .sp-faq-heading {
          font-family: 'Playfair Display', Georgia, serif; font-size: 1.2rem;
          font-weight: 600; color: var(--sp-heading); margin: 0 0 1.25rem;
        }
        .sp-faq { border-top: 1px solid var(--sp-border); }
        .sp-faq-item { border-bottom: 1px solid var(--sp-border); padding: 1.1rem 0; }
        .sp-q { font-size: 0.92rem; font-weight: 600; color: var(--sp-heading); margin-bottom: 0.4rem; }
        .sp-a { font-size: 0.88rem; color: var(--sp-body); line-height: 1.7; margin: 0; }
        .sp-link { color: var(--sp-accent); }
      `}</style>

      <div className="sp-page">
        <header className="sp-topbar">
          <Link href="/" className="sp-brand">
            <div className="sp-brand-circle">♪</div>
            <span className="sp-brand-name">Echoes of Home</span>
          </Link>
          <Link href="/home" className="sp-back">← Back to app</Link>
        </header>

        <div className="sp-hero">
          <p className="sp-eyebrow">Support</p>
          <h1 className="sp-title">How can we help?</h1>
          <p className="sp-subtitle">Find answers below, report an issue, or share ideas. We usually respond within 24 hours.</p>

          <div className="sp-contact">
            <div className="sp-contact-label">
              <strong>Get help or share feedback</strong>
              echoesofhome63@gmail.com
            </div>
            <a href="mailto:echoesofhome63@gmail.com" className="sp-contact-btn">Send a message</a>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '3rem', flexWrap: 'wrap' }}>
            <a
              href="mailto:echoesofhome63@gmail.com?subject=Support%20request"
              style={{
                flex: 1, minWidth: 140, textAlign: 'center',
                background: 'var(--sp-surface)', border: '1px solid var(--sp-border)',
                borderRadius: 10, padding: '0.85rem 1rem', textDecoration: 'none',
                color: 'var(--sp-body)',
              }}
            >
              <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>🛠️</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sp-heading)', marginBottom: '0.15rem' }}>Report an issue</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--sp-muted)' }}>Something not working?</div>
            </a>
            <a
              href="mailto:echoesofhome63@gmail.com?subject=Feedback%20%2F%20suggestion"
              style={{
                flex: 1, minWidth: 140, textAlign: 'center',
                background: 'var(--sp-surface)', border: '1px solid var(--sp-border)',
                borderRadius: 10, padding: '0.85rem 1rem', textDecoration: 'none',
                color: 'var(--sp-body)',
              }}
            >
              <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>💡</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sp-heading)', marginBottom: '0.15rem' }}>Share feedback</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--sp-muted)' }}>Ideas or suggestions</div>
            </a>
          </div>
        </div>

        <article className="sp-article">
          <h2 className="sp-faq-heading">Common questions</h2>
          <div className="sp-faq">
            {faqs.map((item, i) => (
              <div key={i} className="sp-faq-item">
                <p className="sp-q">{item.q}</p>
                <p className="sp-a">{item.a}</p>
              </div>
            ))}
          </div>

          <p style={{ marginTop: '2.5rem', fontSize: '0.82rem', color: 'var(--sp-muted)' }}>
            More questions? Email us at{' '}
            <a className="sp-link" href="mailto:echoesofhome63@gmail.com">echoesofhome63@gmail.com</a>
            {' '}or read our{' '}
            <Link className="sp-link" href="/privacy">Privacy Policy</Link>.
          </p>
        </article>
      </div>
    </>
  )
}
