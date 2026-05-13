import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.theechoesofhome.com'),
  title: "Echoes of Home",
  description: "Keep your family's stories alive. Record voices, recipes, and memories — all in one private place.",
  openGraph: {
    title: "Echoes of Home",
    description: "Keep your family's stories alive. Record voices, recipes, and memories — all in one private place.",
    siteName: "Echoes of Home",
    type: "website",
    images: [{ url: '/echoes-logo.png', width: 1254, height: 1254, alt: 'Echoes of Home' }],
  },
  twitter: {
    card: 'summary',
    title: "Echoes of Home",
    description: "Keep your family's stories alive.",
    images: ['/echoes-logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><ErrorBoundary>{children}</ErrorBoundary></body>
    </html>
  );
}
