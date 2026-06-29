import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/footer";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CollabDocs — Local-First Collaborative Document Editor",
  description:
    "A local-first, collaborative document editor with offline sync, CRDT-based conflict resolution, granular version control, and AI writing assistant. Built with Next.js, PostgreSQL, and Yjs.",
  keywords: [
    "collaborative editor",
    "local-first",
    "offline sync",
    "CRDT",
    "document editor",
    "version control",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <NuqsAdapter>
            <Toaster />
            <div className="min-h-screen flex flex-col">
              <div className="flex-1 flex flex-col">{children}</div>
              <Footer />
            </div>
          </NuqsAdapter>
        </body>
      </html>
    </ClerkProvider>
  );
}
