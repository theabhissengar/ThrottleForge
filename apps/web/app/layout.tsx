import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Shell } from "@/components/shell";
import { BOOT_SCRIPT, SIDEBAR_BUTTON_SCRIPT } from "@/lib/preferences/boot";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "ThrottleForge",
    template: "%s",
  },
  description: "Process-local traffic control for the ThrottleForge API.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans text-ink antialiased">
        <Shell>{children}</Shell>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BUTTON_SCRIPT }} />
      </body>
    </html>
  );
}
