import { Suspense, lazy } from "react";
import InteractiveContent from './components/InteractiveContent';
import { getDealerData, getPageContent } from './lib/data';

// Disable ISR caching - make page dynamic
export const dynamic = 'force-dynamic';


// Loading state component
function LoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: "1rem",
        zIndex: 1000
      }}
    >
      {/* Desktop Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: 'url("/image-loading.png")',
          backgroundSize: "contain",
          backgroundPosition: "center",
          filter: "blur(5px)",
          opacity: 0.5
        }}
        className="desktop-bg"
      />

      {/* Mobile Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: 'url("/image-loading-mb.png")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(5px)",
          opacity: 0.5
        }}
        className="mobile-bg"
      />

      {/* Loading Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          color: "#fff",
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)"
        }}
      >
        <div
          className="loading-spinner"
          style={{
            width: "50px",
            height: "50px",
            border: "5px solid rgba(255,255,255,0.3)",
            borderTop: "5px solid #fff",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 1rem"
          }}
        />
        <p style={{ fontSize: "1.2rem", fontWeight: "bold" }}>Loading...</p>
      </div>
    </div>
  );
}
export default async function Home() {
  try {
    // Server-side data fetching without caching
    const dealerUrl = await getDealerData();
    const pageContent = await getPageContent(dealerUrl);

    return (
      <Suspense fallback={<LoadingScreen />}>
        <InteractiveContent pageContent={pageContent} dealerUrl={dealerUrl} />
      </Suspense>
    );
  } catch (error) {
    console.error('Error in Home component:', error);

    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Content Unavailable
          </h1>
          <p className="text-gray-600">
            Unable to load content at this time. Please try again later.
          </p>
        </div>
      </main>
    );
  }
}
