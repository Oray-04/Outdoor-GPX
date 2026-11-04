import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Announcement } from "@/components/layout/announcement";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OfflineBoot } from "@/components/offline/offline-boot";
import { CSP } from "@/lib/csp";
import { GeoProvider } from "@/components/home/geo-context";
import { AuthProvider } from "@/lib/auth";
import { SyncProvider } from "@/lib/sync";

export const metadata: Metadata = {
  title: { default: "Crête — Plateforme outdoor : parcours GPS, trail, randonnée, vélo", template: "%s · Crête" },
  description: "Créez, explorez et partagez vos parcours de trail, running, randonnée et vélo. Outils de cartographie et de gestion d'événements.",
};
export const viewport: Viewport = { themeColor: "#0d1b17", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Aller au contenu</a>
        <AuthProvider><SyncProvider>
        <GeoProvider>
          <OfflineBoot />
          <Announcement />
          <Header />
          <main id="contenu">{children}</main>
          <Footer />
          <MobileNav />
        </GeoProvider>
        </SyncProvider></AuthProvider>
      </body>
    </html>
  );
}
