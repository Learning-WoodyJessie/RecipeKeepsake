import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.theechoesofhome.com'),
  title: "Echoes of Home",
  description: "Keep your family's stories alive. Record voices, recipes, and memories, all in one private place.",
  openGraph: {
    title: "Echoes of Home",
    description: "Keep your family's stories alive. Record voices, recipes, and memories, all in one private place.",
    siteName: "Echoes of Home",
    type: "website",
    images: [{ url: 'https://www.theechoesofhome.com/og-image.png', width: 1200, height: 630, alt: 'Echoes of Home' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Echoes of Home",
    description: "Keep your family's stories alive.",
    images: ['https://www.theechoesofhome.com/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Explicit OG tags — belt-and-suspenders for static export + WhatsApp */}
        <meta property="og:site_name" content="Echoes of Home" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.theechoesofhome.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://www.theechoesofhome.com/og-image.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><ErrorBoundary>{children}</ErrorBoundary></body>
    </html>
  );
}
