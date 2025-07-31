import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import { Toaster } from "sonner";

import { ConvexClientProvider } from "@/providers/convex";
import ConditionalLayout from "@/components/conditional-layout";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeKit | Turn complex integrations into one-click experiences",
  description:
    "VibeKit Onboard turns complex integrations into one-click experiences — using a coding agent embedded directly in your docs.",
  openGraph: {
    images: ["/og-onboard.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <link rel="icon" href="/favicon.svg" />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider>
          <ConvexClientProvider>
            <SignedIn>
              <ConditionalLayout>{children}</ConditionalLayout>
            </SignedIn>
            <SignedOut>
              <div className="flex flex-col h-screen bg-muted">{children}</div>
            </SignedOut>
          </ConvexClientProvider>
        </ClerkProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
