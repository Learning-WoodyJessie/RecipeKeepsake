'use client'

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)', marginBottom: '1.5rem' }}>Privacy Policy</h1>
      <p style={{ color: 'var(--text2)', lineHeight: 1.8, fontSize: '0.9rem' }}>
        Echoes of Home stores your voice recordings, transcripts, and structured memories securely in Supabase.
        Your data is private to your account and never shared with third parties.
        Audio is stored in a private storage bucket with signed URLs.
        You may delete your account and all associated data at any time from the Account page.
      </p>
    </div>
  )
}
