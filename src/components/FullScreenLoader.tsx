export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
        <span className="rec-dot" />
        FACELESS REELS
      </div>
      <div className="shimmer-bar h-1 w-40 rounded-full" />
    </div>
  );
}
