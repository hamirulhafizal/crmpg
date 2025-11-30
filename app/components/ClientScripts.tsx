'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'

export default function ClientScripts() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // Only render scripts after component mounts (client-side only)
    setIsMounted(true)
  }, [])

  // Don't render anything during SSR or before mount
  if (!isMounted) {
    return null
  }

  return (
    <>
      {/* Tailwind CSS CDN */}
      <Script
        src="https://cdn.tailwindcss.com"
        strategy="afterInteractive"
      />

      {/* Google Analytics */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-HN3HP90WZY"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-HN3HP90WZY');
        `}
      </Script>

      {/* Google Tag Manager */}
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-T6KDG8SJ');
        `}
      </Script>
    </>
  )
}

