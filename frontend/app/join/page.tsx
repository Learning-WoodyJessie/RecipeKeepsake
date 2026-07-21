import type { Metadata } from 'next'
import JoinContent from './JoinContent'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.theechoesofhome.com'

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ invite?: string }> }
): Promise<Metadata> {
  const { invite } = await searchParams
  let groupName = 'a family'
  if (invite) {
    try {
      const res = await fetch(`${API}/family/invite/${invite}/preview`, { next: { revalidate: 3600 } })
      if (res.ok) {
        const data = await res.json() as { group_name: string }
        groupName = data.group_name
      }
    } catch { /* fallback to generic */ }
  }

  const title = `You're invited to join ${groupName} on Echoes of Home`
  const description = `${groupName} is preserving family memories on Echoes of Home. Tap to accept the invitation.`

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Echoes of Home' },
    twitter: { card: 'summary', title, description },
  }
}

export default function JoinPage() {
  return <JoinContent />
}
