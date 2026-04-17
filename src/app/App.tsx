import { ChordDetailPage } from "@/features/chord-library/ChordDetailPage";
import { ChordLibraryPage } from "@/features/chord-library/ChordLibraryPage";
import { PracticePage } from "@/features/practice/PracticePage";
import { ChordChangeDrillPage } from "@/features/practice/drills/ChordChangeDrillPage";
import { ProgressionDrillPage } from "@/features/practice/drills/ProgressionDrillPage";
import { StrummingDrillPage } from "@/features/practice/drills/StrummingDrillPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { TunerPage } from "@/features/tuner/TunerPage";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { clsx } from "@/ui/clsx";
import { Suspense, useEffect } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "px-3 py-2 rounded-md text-sm",
          isActive ? "bg-panel text-ink" : "text-muted hover:text-ink hover:bg-panel/60",
        )
      }
      end={to === "/"}
    >
      {label}
    </NavLink>
  );
}

export function App() {
  const hydrateSettings = useSettings((s) => s.hydrate);
  const hydrateProgress = useProgress((s) => s.hydrate);

  useEffect(() => {
    hydrateSettings().catch((err) => console.error("settings hydrate failed", err));
    hydrateProgress().catch((err) => console.error("progress hydrate failed", err));
  }, [hydrateSettings, hydrateProgress]);

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-white/5 bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to="/" className="text-ink font-semibold tracking-tight">
            Guitar Coach
          </Link>
          <nav aria-label="Primary" className="flex gap-1 ml-4">
            <NavItem to="/" label="Tuner" />
            <NavItem to="/chords" label="Chord Library" />
            <NavItem to="/practice" label="Practice" />
          </nav>
          <div className="ml-auto">
            <NavItem to="/settings" label="Settings" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Suspense fallback={<div className="text-muted">Loading…</div>}>
          <Routes>
            <Route path="/" element={<TunerPage />} />
            <Route path="/chords" element={<ChordLibraryPage />} />
            <Route path="/chords/:id" element={<ChordDetailPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/practice/chord-change" element={<ChordChangeDrillPage />} />
            <Route path="/practice/progression/:id" element={<ProgressionDrillPage />} />
            <Route path="/practice/strumming" element={<StrummingDrillPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="border-t border-white/5 text-xs text-muted">
        <div className="max-w-5xl mx-auto px-4 py-3">
          All audio processing happens on your device. Nothing is uploaded.
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Not found</h1>
      <Link to="/" className="text-accent underline">
        Go home
      </Link>
    </div>
  );
}
