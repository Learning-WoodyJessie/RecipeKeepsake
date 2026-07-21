import type { Metadata } from 'next'
import FamilyContent from './FamilyContent'

export const metadata: Metadata = {
  title: "Family memories — Echoes of Home",
  description: "Browse this family's private memory archive — recipes, stories, songs, and more, preserved forever.",
  openGraph: {
    title: "Family memories — Echoes of Home",
    description: "Browse this family's private memory archive — recipes, stories, songs, and more, preserved forever.",
    siteName: 'Echoes of Home',
    images: [{ url: 'https://www.theechoesofhome.com/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Family memories — Echoes of Home",
    description: "Browse this family's private memory archive — recipes, stories, songs, and more, preserved forever.",
    images: ['https://www.theechoesofhome.com/og-image.png'],
  },
}

export default function FamilyPortalPage() {
  return <FamilyContent />
}
