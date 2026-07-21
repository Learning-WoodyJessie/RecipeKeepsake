import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Echoes of Home',
  description: 'How Echoes of Home collects, uses, and protects your family\'s data.',
}

export default function PrivacyPage() {
  return (
    <>
      <style>{`
        :root {
          --pp-bg: #FAF6F0;
          --pp-surface: #F2EBE2;
          --pp-border: #E0D5C8;
          --pp-heading: #2D2420;
          --pp-body: #5C4D45;
          --pp-muted: #9A8A82;
          --pp-accent: #2D6A5A;
          --pp-accent-light: #EAF3F0;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --pp-bg: #1C1612;
            --pp-surface: #261F1A;
            --pp-border: #3A302A;
            --pp-heading: #EDE5DC;
            --pp-body: #C8BAB1;
            --pp-muted: #7A6E68;
            --pp-accent: #5AB89A;
            --pp-accent-light: #1A2D28;
          }
        }
        :root[data-theme="dark"] {
          --pp-bg: #1C1612;
          --pp-surface: #261F1A;
          --pp-border: #3A302A;
          --pp-heading: #EDE5DC;
          --pp-body: #C8BAB1;
          --pp-muted: #7A6E68;
          --pp-accent: #5AB89A;
          --pp-accent-light: #1A2D28;
        }
        :root[data-theme="light"] {
          --pp-bg: #FAF6F0;
          --pp-surface: #F2EBE2;
          --pp-border: #E0D5C8;
          --pp-heading: #2D2420;
          --pp-body: #5C4D45;
          --pp-muted: #9A8A82;
          --pp-accent: #2D6A5A;
          --pp-accent-light: #EAF3F0;
        }
        * { box-sizing: border-box; }
        .pp-page {
          background: var(--pp-bg);
          min-height: 100vh;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: var(--pp-body);
        }
        .pp-topbar {
          background: var(--pp-bg);
          border-bottom: 1px solid var(--pp-border);
          padding: 0 1.5rem;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .pp-brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          text-decoration: none;
        }
        .pp-brand-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid var(--pp-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          color: var(--pp-accent);
        }
        .pp-brand-name {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1rem;
          font-weight: 600;
          color: var(--pp-heading);
          letter-spacing: -0.01em;
        }
        .pp-back {
          font-size: 0.8rem;
          color: var(--pp-muted);
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          transition: color 0.15s;
        }
        .pp-back:hover { color: var(--pp-accent); }
        .pp-hero {
          max-width: 680px;
          margin: 0 auto;
          padding: 3.5rem 1.5rem 2rem;
        }
        .pp-eyebrow {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--pp-accent);
          margin-bottom: 0.75rem;
        }
        .pp-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(2rem, 5vw, 2.75rem);
          font-weight: 700;
          color: var(--pp-heading);
          line-height: 1.2;
          margin: 0 0 0.75rem;
          text-wrap: balance;
        }
        .pp-meta {
          font-size: 0.82rem;
          color: var(--pp-muted);
          margin-bottom: 2.5rem;
        }
        .pp-glance {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          margin-bottom: 3rem;
        }
        .pp-glance-card {
          background: var(--pp-surface);
          border: 1px solid var(--pp-border);
          border-radius: 10px;
          padding: 1rem 1.1rem;
        }
        .pp-glance-icon {
          font-size: 1.2rem;
          margin-bottom: 0.4rem;
        }
        .pp-glance-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--pp-heading);
          margin-bottom: 0.2rem;
        }
        .pp-glance-desc {
          font-size: 0.75rem;
          color: var(--pp-muted);
          line-height: 1.5;
        }
        .pp-article {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 1.5rem 6rem;
        }
        .pp-section {
          padding: 2rem 0;
          border-top: 1px solid var(--pp-border);
        }
        .pp-section:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pp-h2 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--pp-heading);
          margin: 0 0 1rem;
          line-height: 1.3;
        }
        .pp-h3 {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--pp-heading);
          margin: 1.5rem 0 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .pp-p {
          font-size: 0.92rem;
          line-height: 1.8;
          color: var(--pp-body);
          margin: 0 0 0.85rem;
        }
        .pp-p:last-child { margin-bottom: 0; }
        .pp-ul {
          padding-left: 1.15rem;
          margin: 0 0 0.85rem;
        }
        .pp-ul li {
          font-size: 0.92rem;
          line-height: 1.8;
          color: var(--pp-body);
          margin-bottom: 0.35rem;
        }
        .pp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          margin: 0.75rem 0 0.85rem;
        }
        .pp-table th {
          text-align: left;
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--pp-muted);
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid var(--pp-border);
        }
        .pp-table td {
          padding: 0.65rem 0.75rem;
          border-bottom: 1px solid var(--pp-border);
          color: var(--pp-body);
          vertical-align: top;
          line-height: 1.6;
        }
        .pp-table tr:last-child td { border-bottom: none; }
        .pp-table-wrap { overflow-x: auto; border: 1px solid var(--pp-border); border-radius: 8px; margin: 0.75rem 0; }
        .pp-link {
          color: var(--pp-accent);
          text-decoration: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color 0.15s;
        }
        .pp-link:hover { text-decoration-color: var(--pp-accent); }
        .pp-contact-box {
          background: var(--pp-accent-light);
          border: 1px solid var(--pp-accent);
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          margin-top: 0.75rem;
        }
        .pp-contact-box .pp-p { color: var(--pp-body); }
        .pp-contact-box strong { color: var(--pp-heading); }
      `}</style>

      <div className="pp-page">
        {/* Top bar */}
        <header className="pp-topbar">
          <Link href="/" className="pp-brand">
            <div className="pp-brand-circle">♪</div>
            <span className="pp-brand-name">Echoes of Home</span>
          </Link>
          <Link href="/home" className="pp-back">
            ← Back to app
          </Link>
        </header>

        {/* Hero */}
        <div className="pp-hero">
          <p className="pp-eyebrow">Legal</p>
          <h1 className="pp-title">Privacy Policy</h1>
          <p className="pp-meta">
            Effective July 1, 2026 &nbsp;·&nbsp; Last updated July 1, 2026
          </p>

          {/* At a glance cards */}
          <div className="pp-glance">
            <div className="pp-glance-card">
              <div className="pp-glance-icon">🔒</div>
              <div className="pp-glance-label">Private by default</div>
              <div className="pp-glance-desc">Your memories are never public. Only you and people you invite can see them.</div>
            </div>
            <div className="pp-glance-card">
              <div className="pp-glance-icon">🚫</div>
              <div className="pp-glance-label">No ads, no selling</div>
              <div className="pp-glance-desc">We don't sell your data or use it for advertising. Ever.</div>
            </div>
            <div className="pp-glance-card">
              <div className="pp-glance-icon">🗑️</div>
              <div className="pp-glance-label">Delete anytime</div>
              <div className="pp-glance-desc">Email us and we'll erase your account and all its data within 30 days.</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <article className="pp-article">

          <section className="pp-section">
            <h2 className="pp-h2">What Echoes of Home does</h2>
            <p className="pp-p">
              Echoes of Home is a private family archive. You record voice narrations — recipes,
              songs, stories — from family members. The app transcribes the audio, translates it
              into English if needed, and stores the memory so your family can revisit it forever.
            </p>
            <p className="pp-p">
              We built this for one reason: so that the stories told in kitchens and at dinner
              tables don't fade. We don't advertise. We don't sell your data. The app exists only
              to preserve your family's memories.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Information we collect</h2>

            <h3 className="pp-h3">Audio recordings</h3>
            <p className="pp-p">
              When you record a narration, your device captures the audio and sends it to
              Google Gemini for transcription. The resulting audio file is stored in a private
              Supabase storage bucket linked only to your account — no one else can access it.
            </p>

            <h3 className="pp-h3">Transcripts & translations</h3>
            <p className="pp-p">
              The raw transcript from Gemini and the English translation from OpenAI GPT-4o are
              stored in your private database row. If your narration is in Telugu, Tamil, Hindi,
              or another language, both versions are kept — the original voice and the translation.
            </p>

            <h3 className="pp-h3">Photos</h3>
            <p className="pp-p">
              Photos you attach to recipes or family member profiles are uploaded to your private
              storage bucket. They are never accessible publicly or to other users.
            </p>

            <h3 className="pp-h3">Account information</h3>
            <p className="pp-p">
              When you sign in with Apple, we receive a unique identifier and — only if you
              choose to share it — an email address. We store the identifier to authenticate you.
              We never receive your Apple ID password.
            </p>

            <h3 className="pp-h3">Usage data</h3>
            <p className="pp-p">
              Our server logs HTTP method, route, status code, and timestamp for debugging and
              rate limiting. Logs do not include the content of your recordings or memories.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">How we use your information</h2>
            <ul className="pp-ul">
              <li>Transcribe and translate your voice recordings into structured memories</li>
              <li>Display your memories to you and invited family members</li>
              <li>Generate recipe images on request via OpenAI DALL-E 3</li>
              <li>Enforce per-account daily rate limits to prevent abuse</li>
              <li>Authenticate you when you sign in</li>
            </ul>
            <p className="pp-p">
              We do not use your data to train AI models. We do not build advertising profiles.
              We do not share your data with third parties for their marketing.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Third-party services</h2>
            <p className="pp-p">
              Running the app requires the following services. Each processes only what's
              necessary for its function:
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Purpose</th>
                    <th>Privacy policy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Supabase</strong></td>
                    <td>Database & file storage (US region)</td>
                    <td><a className="pp-link" href="https://supabase.com/privacy">supabase.com/privacy</a></td>
                  </tr>
                  <tr>
                    <td><strong>Google Gemini</strong></td>
                    <td>Audio transcription</td>
                    <td><a className="pp-link" href="https://policies.google.com/privacy">policies.google.com</a></td>
                  </tr>
                  <tr>
                    <td><strong>OpenAI</strong></td>
                    <td>Translation, structuring, moderation, image generation</td>
                    <td><a className="pp-link" href="https://openai.com/policies/privacy-policy">openai.com/policies</a></td>
                  </tr>
                  <tr>
                    <td><strong>Railway</strong></td>
                    <td>Backend hosting</td>
                    <td><a className="pp-link" href="https://railway.app/legal/privacy">railway.app/legal</a></td>
                  </tr>
                  <tr>
                    <td><strong>Apple Sign In</strong></td>
                    <td>Authentication</td>
                    <td><a className="pp-link" href="https://www.apple.com/legal/privacy/">apple.com/legal/privacy</a></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Who can see your data</h2>
            <p className="pp-p">
              Your memories are <strong>private by default</strong>. Only you can see them.
            </p>
            <p className="pp-p">
              If you create or join a Family Group, members of that group can see the memories
              shared within it. The Family Portal — a read-only view for relatives — requires a
              specific link that only you control. There are no public links and no anonymous access.
            </p>
            <p className="pp-p">
              We (the developers) can access your data as database administrators. We will only
              do so to provide support when you request it, or when required by law. We will
              notify you if legally permitted to do so.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Data retention & deletion</h2>
            <p className="pp-p">
              Your data is retained for as long as your account exists. To delete your account
              and all associated data — recordings, transcripts, photos, memories — email us at{' '}
              <a className="pp-link" href="mailto:support@theechoesofhome.com">
                support@theechoesofhome.com
              </a>. We will confirm deletion within 30 days.
            </p>
            <p className="pp-p">
              Individual memories can be deleted at any time from within the app. Deleted
              memories are removed from our database and storage immediately.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Children's privacy</h2>
            <p className="pp-p">
              Echoes of Home is not directed at children under 13. We do not knowingly collect
              personal information from children under 13. If you believe a child has provided
              us with information, contact us and we will delete it promptly.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Security</h2>
            <p className="pp-p">
              All data is transmitted over HTTPS. Audio files and database rows are protected by
              Supabase row-level security — your data is only accessible with a valid authenticated
              session. API keys and service credentials are server-side only and never exposed to
              the client.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Changes to this policy</h2>
            <p className="pp-p">
              If we make material changes, we will update the "Last updated" date above and
              notify you via in-app notice or email as required by law.
            </p>
          </section>

          <section className="pp-section">
            <h2 className="pp-h2">Contact us</h2>
            <p className="pp-p">
              Questions about this policy or how your data is handled — we're happy to answer.
            </p>
            <div className="pp-contact-box">
              <p className="pp-p" style={{ margin: 0 }}>
                <strong>Echoes of Home</strong><br />
                <a className="pp-link" href="mailto:support@theechoesofhome.com">
                  support@theechoesofhome.com
                </a>
              </p>
            </div>
          </section>

        </article>
      </div>
    </>
  )
}
