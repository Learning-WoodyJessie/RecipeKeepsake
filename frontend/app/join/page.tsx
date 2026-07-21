import type { Metadata } from 'next'
import JoinContent from './JoinContent'

export const metadata: Metadata = {
  title: "You're invited to a family collection on Echoes of Home",
  description: "A family has invited you to join their memory archive on Echoes of Home. Recipes, songs, and stories preserved forever.",
  openGraph: {
    title: "You're invited to a family collection on Echoes of Home",
    description: "A family has invited you to join their memory archive on Echoes of Home. Recipes, songs, and stories preserved forever.",
    siteName: 'Echoes of Home',
    images: [{ url: 'https://www.theechoesofhome.com/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "You're invited to a family collection on Echoes of Home",
    description: "A family has invited you to join their memory archive on Echoes of Home. Recipes, songs, and stories preserved forever.",
    images: ['https://www.theechoesofhome.com/og-image.png'],
  },
}

export default function JoinPage() {
  return <JoinContent />
}
