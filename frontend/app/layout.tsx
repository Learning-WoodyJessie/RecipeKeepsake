import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary'

export const metadata: Metadata = {
  title: "Echoes of Home",
  description: "Every family carries a world. Don't let it fade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><ErrorBoundary>{children}</ErrorBoundary></body>
    </html>
  );
}
