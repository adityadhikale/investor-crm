// Loading animation shown while a page loads; each route has a loading.tsx that renders it.
// Single-colour (text-foreground), so it is dark on light theme and white on dark theme.
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="crest-loader flex min-h-[70vh] flex-1 flex-col items-center justify-center gap-5 px-4 text-foreground"
    >
      <svg viewBox="0 0 64 48" className="h-14 w-20" aria-hidden="true" fill="currentColor">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={4 + i * 16}
            y={4}
            width={8}
            height={40}
            rx={2}
            style={{
              transformBox: "fill-box",
              transformOrigin: "bottom",
              animation: `crest-bar-rise 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </svg>
      <p className="text-sm tracking-widest text-muted-foreground">LOADING</p>
    </div>
  );
}
