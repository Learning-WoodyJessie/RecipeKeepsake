import type { Metadata } from 'next'
import JoinContent from './JoinContent'

export const metadata: Metadata = {
  title: "You're invited to a family collection — Echoes of Home",
  description: "A family has invited you to join their memory archive on Echoes of Home — recipes, songs, and stories preserved forever.",
  openGraph: {
    title: "You're invited to a family collection — Echoes of Home",
    description: "A family has invited you to join their memory archive on Echoes of Home — recipes, songs, and stories preserved forever.",
    siteName: 'Echoes of Home',
  },
  twitter: {
    card: 'summary',
    title: "You're invited to a family collection — Echoes of Home",
    description: "A family has invited you to join their memory archive on Echoes of Home — recipes, songs, and stories preserved forever.",
  },
}

export default function JoinPage() {
  return <JoinContent />
}
