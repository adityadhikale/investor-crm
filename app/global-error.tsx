"use client";

// Last resort: used only if the whole app layout fails. It renders its own page,
// so it uses plain styles and follows the device's light/dark setting.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "Canvas",
          color: "CanvasText",
          colorScheme: "light dark",
          textAlign: "center",
          padding: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 16px", opacity: 0.7 }}>
            CREST CRM could not load. Your data is safe. Please try again.
          </p>
          <button
            onClick={() => retry()}
            style={{ padding: "8px 16px", fontSize: 14, cursor: "pointer", borderRadius: 6 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
