import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { AuthProvider } from "./contexts/auth-context";
import { CustomerEditModalProvider } from "./contexts/customer-edit-modal-context";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import ViewTransitions from "./components/ViewTransitions";
import ClientScripts from "./components/ClientScripts";
import { MotionProvider } from "./components/motion-provider";
import { PWAInstallPromptBootstrap } from "./components/pwa/PWAInstallPromptBootstrap";

export const metadata: Metadata = {
  title: "Public Gold CRM",
  description: "Public Gold CRM — room rental sublet management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PG CRM",
  },
  keywords: "Publicgold, Publigoldofficial, PG Mall, PG Jewel, Aurora Italia, Emas, GAP, EPP, public gold, public gold malaysia, public gold indonesia, public gold brunei, public gold ampang, public gold bangi, public gold sunway, emas, emas public gold, dinar, gold bar, gold bars, gap, public gold gap",
  metadataBase: new URL('https://publicgolds.com'),
  icons: {
    icon: [{ url: '/icon', type: 'image/png' }],
    apple: [{ url: '/apple-icon', type: 'image/png' }],
  },
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
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PG CRM" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="dns-prefetch" href="https://app.nocodb.com" />
        <link rel="dns-prefetch" href="https://publicgoldofficial.com" />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <PWAInstallPromptBootstrap />
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
          <CustomerEditModalProvider>
            <MotionProvider>
              <ServiceWorkerRegistration />
              <ViewTransitions />
              <ClientScripts />
              {children}
            </MotionProvider>
          </CustomerEditModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
