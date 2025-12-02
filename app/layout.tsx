import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./contexts/auth-context";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import ViewTransitions from "./components/ViewTransitions";
import ClientScripts from "./components/ClientScripts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: "Public Gold",
  description: "Public Gold",
  keywords: "Publicgold, Publigoldofficial, PG Mall, PG Jewel, Aurora Italia, Emas, GAP, EPP, public gold, public gold malaysia, public gold indonesia, public gold brunei, public gold ampang, public gold bangi, public gold sunway, emas, emas public gold, dinar, gold bar, gold bars, gap, public gold gap",
  metadataBase: new URL('https://publicgolds.com'),
  openGraph: {
    title: "Public Gold Malaysia - All prices are quoted in Malaysia Ringgit (MYR) and excluding Gold Premium",
    images: ["/syariah1.png"],
    url: "/image-gold.png",
    type: "article",
    description: "All prices are quoted in Malaysia Ringgit (MYR) and excluding Gold Premium",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ms" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
        <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PG CRM" />
        <link rel="apple-touch-icon" href="/icons/image.png" />
        <link rel="dns-prefetch" href="https://app.nocodb.com" />
        <link rel="dns-prefetch" href="https://publicgoldofficial.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-T6KDG8SJ"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        
        <AuthProvider>
          <ServiceWorkerRegistration />
          <ViewTransitions />
          <ClientScripts />
        {children}
        </AuthProvider>
      </body>
    </html>
  );
}
