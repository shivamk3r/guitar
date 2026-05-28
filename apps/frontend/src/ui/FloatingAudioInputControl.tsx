import { useState } from "react";
import { AudioInputSelect } from "./AudioInputSelect";

export function FloatingAudioInputControl() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="fixed bottom-4 right-4 z-30 flex max-w-[calc(100vw-2rem)] justify-end sm:bottom-5 sm:right-5">
      {expanded ? (
        <section
          aria-label="Audio input selector"
          className="w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-surface/95 p-4 text-ink shadow-2xl shadow-black/40 backdrop-blur"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MicrophoneIcon className="h-4 w-4 text-accent" />
              <span>Audio input</span>
            </div>
            <button
              type="button"
              aria-label="Minimize audio input selector"
              title="Minimize audio input selector"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-muted transition-colors hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => setExpanded(false)}
            >
              <MinimizeIcon className="h-4 w-4" />
            </button>
          </div>
          <AudioInputSelect className="w-full [&_select]:w-full" />
        </section>
      ) : (
        <button
          type="button"
          aria-label="Expand audio input selector"
          title="Expand audio input selector"
          className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-panel text-ink shadow-2xl shadow-black/40 transition-colors hover:bg-panel/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => setExpanded(true)}
        >
          <MicrophoneIcon className="h-5 w-5" />
          <ExpandIcon className="absolute bottom-1.5 right-1.5 h-3 w-3 text-accent" />
        </button>
      )}
    </div>
  );
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

function MinimizeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M8 3H3v5" />
      <path d="M16 3h5v5" />
      <path d="M3 16v5h5" />
      <path d="M21 16v5h-5" />
    </svg>
  );
}
