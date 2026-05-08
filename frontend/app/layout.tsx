import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary'

export const metadata: Metadata = {
  title: "Echoes of Home",
  description: "Keep your family's stories alive. Record voices, recipes, and memories — all in one private place.",
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
