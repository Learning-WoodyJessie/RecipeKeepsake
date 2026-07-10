'use client'

import { useState } from 'react'
import Link from 'next/link'

const FAQS = [
  {
    section: 'Recording & Uploading',
    items: [
      {
        q: 'What languages can I record in?',
        a: 'Any language. We support Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Urdu, and more, as well as English and mixed-language recordings. If your grandmother switches between Telugu and English mid-sentence, that\'s fine.',
      },
      {
        q: 'What audio formats can I upload?',
        a: 'MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WebM, AIFF, and MP4. This covers iPhone voice memos (M4A), WhatsApp voice notes (Opus), and exports from most recording apps. Max file size is 50 MB.',
      },
      {
        q: 'How long can the recording be?',
        a: 'Between 30 seconds and about 15 minutes works best. Very short clips may not have enough detail. Very long recordings (30+ minutes) can be split into parts, one per dish or section.',
      },
      {
        q: 'What if the recording quality is poor or there\'s background noise?',
        a: 'We do our best, but quality matters. A quiet room with the phone close to the narrator gives the best results. If the AI misses something, you can always edit ingredients and steps before saving.',
      },
      {
        q: 'Do I need to be present when recording?',
        a: 'No, you can record on any device and upload later. Many families record on a phone during a cooking session and upload from a laptop afterwards.',
      },
    ],
  },
  {
    section: 'Sharing with Family',
    items: [
      {
        q: 'How do I share a memory with my family?',
        a: 'Open any memory and tap the Share button. This creates a link you can send via WhatsApp, SMS, or email.',
      },
      {
        q: 'Does my family need to sign up to view a shared memory?',
        a: 'Yes — we ask family members to create a free account before viewing. We do this so that all the memories you\'ve already saved stay private and protected. Without it, anyone who forwarded the link could access your entire archive.',
      },
      {
        q: 'Can multiple family members add memories to the same collection?',
        a: 'Each account has its own collection right now. The best way to share a family collection is to use one shared family account, or share individual memory links as you add them.',
      },
    ],
  },
  {
    section: 'Privacy & Security',
    items: [
      {
        q: 'Who can see my memories?',
        a: 'Only you, unless you share a link. Your recordings, transcripts, and recipes are private to your account. We don\'t share your data with anyone.',
      },
      {
        q: 'Where is my audio stored?',
        a: 'Audio is stored securely in encrypted cloud storage (Supabase). It is never used to train AI models or shared with third parties.',
      },
      {
        q: 'Can I delete my data?',
        a: 'Yes. You can delete individual memories from the memory page. To delete your entire account and all associated data, go to Account → Delete account.',
      },
    ],
  },
  {
    section: 'Editing & Managing Memories',
    items: [
      {
        q: 'What if the AI got the recipe wrong?',
        a: 'You can edit the title, ingredients, and steps before saving, and again afterwards from the memory page. The original audio is always preserved, so nothing is ever lost.',
      },
      {
        q: 'Can I edit a memory after saving?',
        a: 'Yes. Open any memory and tap the edit icon next to the title. Ingredients and steps can also be updated from the memory page.',
      },
      {
        q: 'Can I delete a memory?',
        a: 'Yes, open the memory and scroll to the bottom. The delete option is available there. Deletion is permanent.',
      },
      {
        q: 'Can I favourite a memory to find it quickly?',
        a: 'Yes. Tap the ♡ on any memory card to add it to your favourites. On the home page, tap the ♥ filter to see only your favourited memories.',
      },
    ],
  },
  {
    section: 'Account & Family Members',
    items: [
      {
        q: 'How do I add family members as narrators?',
        a: 'Go to Our People in the sidebar. Add a family member with their name, relationship, and a photo. When recording or uploading, select their name as the narrator so memories are credited to them.',
      },
      {
        q: 'How do I sign in?',
        a: 'You can sign in with Google or Apple. We don\'t offer password login, this keeps your account secure without having to remember another password.',
      },
      {
        q: 'Is there a limit on how many memories I can save?',
        a: 'There\'s no hard limit on saved memories. New recordings are limited to 10 per day and translations to 50 per day to keep the service running well for everyone.',
      },
    ],
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', padding: '1rem 0', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.4 }}>{q}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--accent)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <p style={{ fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.7, paddingBottom: '1rem', margin: 0 }}>
          {a}
        </p>
      )}
    </div>
  )
}

export default function FAQPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.75rem 1.5rem 3rem' }}>
      {/* Back */}
      <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text2)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1.75rem', fontWeight: 500 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </Link>

      {/* Header */}
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', lineHeight: 1.2 }}>
        Frequently asked questions
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '2.5rem', lineHeight: 1.6 }}>
        Everything you need to know about preserving family memories with Echoes of Home.
      </p>

      {/* Sections */}
      {FAQS.map(section => (
        <div key={section.section} style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.25rem' }}>
            {section.section}
          </h2>
          <div>
            {section.items.map(item => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      ))}

      {/* Footer CTA */}
      <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', textAlign: 'center', marginTop: '1rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.4rem' }}>
          Still have a question?
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Reach out and we'll get back to you.
        </p>
        <a
          href="mailto:hello@theechoesofhome.com"
          style={{ display: 'inline-block', padding: '0.6rem 1.5rem', background: 'var(--accent)', color: 'white', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: '0.88rem' }}
        >
          Contact us
        </a>
      </div>
    </div>
  )
}
