import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "🫙 RecipeKeepsake",
  description: "Grandma's recipes, preserved forever.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: "#0A0A18" }}>
        <header
          className="px-4 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid #1E1B4B" }}
        >
          <Link href="/" className="text-xl font-bold" style={{ color: "#A78BFA" }}>
            🫙 RecipeKeepsake
          </Link>
          <Link
            href="/record"
            className="text-sm font-medium px-4 py-1.5 rounded-full"
            style={{ background: "#A78BFA", color: "white" }}
          >
            + Record
          </Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
