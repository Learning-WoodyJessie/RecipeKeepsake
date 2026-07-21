import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Echoes of Home',
  description: 'Privacy Policy for the Echoes of Home app.',
}

export default function PrivacyPage() {
  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '3rem 1.5rem 6rem',
      fontFamily: 'Georgia, "Times New Roman", serif',
      lineHeight: 1.75,
      color: '#1a1a1a',
    }}>
      <style>{`
        @media (prefers-color-scheme: dark) {
          .pp-root { color: #e8e0d6 !important; }
          .pp-muted { color: #9a8f84 !important; }
          .pp-body { color: #c9bfb5 !important; }
          .pp-link { color: #a78a6c !important; }
        }
        :root[data-theme="dark"] .pp-root { color: #e8e0d6 !important; }
        :root[data-theme="dark"] .pp-muted { color: #9a8f84 !important; }
        :root[data-theme="dark"] .pp-body { color: #c9bfb5 !important; }
        :root[data-theme="dark"] .pp-link { color: #a78a6c !important; }
        :root[data-theme="light"] .pp-root { color: #1a1a1a !important; }
        :root[data-theme="light"] .pp-muted { color: #666 !important; }
        :root[data-theme="light"] .pp-body { color: #333 !important; }
        :root[data-theme="light"] .pp-link { color: #7c5c3e !important; }
        .pp-link { color: #7c5c3e; }
        .pp-h2 { font-family: Georgia, serif; font-size: 1.2rem; font-weight: 600; margin-bottom: 0.75rem; margin-top: 0; }
        .pp-h3 { font-size: 1rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; }
        .pp-section { margin-top: 2rem; }
        .pp-body { color: #333; }
        .pp-muted { color: #666; }
        .pp-root { color: #1a1a1a; }
      `}</style>

      <div className="pp-root">
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem', fontFamily: 'Georgia, serif' }}>
          Privacy Policy
        </h1>
        <p className="pp-muted" style={{ fontSize: '0.9rem', marginBottom: '2.5rem' }}>
          Echoes of Home &nbsp;·&nbsp; Effective date: July 1, 2026 &nbsp;·&nbsp; Last updated: July 1, 2026
        </p>

        <section className="pp-section">
          <h2 className="pp-h2">1. What Echoes of Home Does</h2>
          <p className="pp-body" style={{ marginBottom: '0.75rem' }}>
            Echoes of Home is a private family archive. You use it to record voice narrations of recipes,
            songs, and stories from family members, and the app transcribes, translates, and stores those
            memories so your family can revisit them forever.
          </p>
          <p className="pp-body">
            We do not sell your data. We do not advertise. The app exists only to preserve your family&apos;s memories.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">2. Information We Collect</h2>

          <h3 className="pp-h3">2a. Audio recordings</h3>
          <p className="pp-body">
            When you record a narration, the audio is captured on your device and sent to our transcription
            service (Google Gemini) for speech-to-text conversion. The audio file is then stored in your
            private Supabase storage bucket, linked only to your account.
          </p>

          <h3 className="pp-h3">2b. Transcripts and translations</h3>
          <p className="pp-body">
            The raw transcript produced by Gemini, and the English translation produced by OpenAI GPT-4o,
            are stored in your private database row. No other user can access them.
          </p>

          <h3 className="pp-h3">2c. Photos</h3>
          <p className="pp-body">
            Photos you attach to recipes or family member profiles are uploaded to your private storage
            bucket. They are not shared publicly.
          </p>

          <h3 className="pp-h3">2d. Account information</h3>
          <p className="pp-body">
            When you sign in with Apple, we receive a unique identifier and, optionally, an email address.
            We store only the identifier to authenticate you. We do not receive your Apple ID password.
          </p>

          <h3 className="pp-h3">2e. Usage data</h3>
          <p className="pp-body">
            We collect minimal server-side logs (HTTP method, route, status code, timestamp) for debugging
            and rate limiting. These logs do not include the content of your recordings or memories.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">3. How We Use Your Information</h2>
          <ul className="pp-body" style={{ paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.4rem' }}>To transcribe and translate your voice recordings into structured memories</li>
            <li style={{ marginBottom: '0.4rem' }}>To display your memories to you and invited family members</li>
            <li style={{ marginBottom: '0.4rem' }}>To generate recipe images (when you request it) via OpenAI DALL-E 3</li>
            <li style={{ marginBottom: '0.4rem' }}>To enforce per-account daily rate limits and prevent abuse</li>
            <li style={{ marginBottom: '0.4rem' }}>To authenticate you on sign-in</li>
          </ul>
          <p className="pp-body" style={{ marginTop: '0.75rem' }}>We do not use your data to train AI models.</p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">4. Third-Party Services</h2>
          <p className="pp-body" style={{ marginBottom: '0.75rem' }}>We use the following third-party services to operate the app:</p>
          <ul className="pp-body" style={{ paddingLeft: '1.25rem' }}>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>Supabase</strong> — database and file storage (US region).{' '}
              <a className="pp-link" href="https://supabase.com/privacy">Supabase Privacy Policy</a>
            </li>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>Google Gemini</strong> — audio transcription. Audio is not retained beyond standard API data retention.{' '}
              <a className="pp-link" href="https://policies.google.com/privacy">Google Privacy Policy</a>
            </li>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>OpenAI</strong> — translation, structuring, content moderation, and image generation.{' '}
              <a className="pp-link" href="https://openai.com/policies/privacy-policy">OpenAI Privacy Policy</a>
            </li>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>Railway</strong> — backend hosting.{' '}
              <a className="pp-link" href="https://railway.app/legal/privacy">Railway Privacy Policy</a>
            </li>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>Apple Sign In</strong> — authentication. Governed by Apple&apos;s privacy policy.
            </li>
          </ul>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">5. Who Can See Your Data</h2>
          <p className="pp-body" style={{ marginBottom: '0.75rem' }}>
            Your memories are private by default. Only you can see them. If you create or join a Family
            Group, members of that group can see memories that are shared within the group. There are no
            public links or anonymous access.
          </p>
          <p className="pp-body" style={{ marginBottom: '0.75rem' }}>
            The Family Portal (a read-only view for family members) requires the portal link, which is
            only accessible to people you share it with.
          </p>
          <p className="pp-body">
            We (the developers) can access your data as database administrators, but only to provide
            support when you request it or when required by law.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">6. Data Retention and Deletion</h2>
          <p className="pp-body">
            Your data is retained for as long as your account exists. To delete your account and all
            associated data (recordings, transcripts, photos, memories), email us at{' '}
            <a className="pp-link" href="mailto:support@theechoesofhome.com">support@theechoesofhome.com</a>.
            We will complete deletion within 30 days and confirm by email.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">7. Children&apos;s Privacy</h2>
          <p className="pp-body">
            Echoes of Home is not directed at children under 13. We do not knowingly collect personal
            information from children under 13. If you believe a child has provided information to us,
            please contact us and we will delete it promptly.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">8. Security</h2>
          <p className="pp-body">
            All data is transmitted over HTTPS. Audio files and database rows are stored in Supabase with
            row-level security — your data is accessible only with a valid authenticated session. API keys
            are never exposed to the client.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">9. Changes to This Policy</h2>
          <p className="pp-body">
            If we make material changes to this policy, we will update the &quot;Last updated&quot; date at the top
            and notify users via in-app notice or email where required by law.
          </p>
        </section>

        <section className="pp-section">
          <h2 className="pp-h2">10. Contact</h2>
          <p className="pp-body" style={{ marginBottom: '0.25rem' }}>Questions about this privacy policy or your data:</p>
          <p className="pp-body">
            <strong>Echoes of Home</strong><br />
            <a className="pp-link" href="mailto:support@theechoesofhome.com">support@theechoesofhome.com</a>
          </p>
        </section>
      </div>
    </div>
  )
}
