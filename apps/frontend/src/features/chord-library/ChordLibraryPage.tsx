import { CHORDS, type ChordTier } from "@/data/chords";
import { useProgress } from "@/storage/progress-store";
import { Fretboard } from "@/ui/Fretboard";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const TIERS: Array<{ id: ChordTier; label: string }> = [
  { id: "first", label: "First chords" },
  { id: "open", label: "More open chords" },
  { id: "seventh", label: "Dominant 7ths" },
  { id: "power", label: "Power chords" },
];

export function ChordLibraryPage() {
  const [query, setQuery] = useState("");
  const chordBests = useProgress((s) => s.chordBests);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHORDS;
    return CHORDS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.altNames?.some((n) => n.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <section>
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Chord Library</h1>
          <p className="text-muted text-sm mt-1">
            Open chords and simple shapes. Pick one to see its diagram and check your own play.
          </p>
        </div>
        <label className="text-sm text-muted">
          <span className="sr-only">Search chords</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search (e.g. G, minor, key of C)"
            className="bg-panel border border-white/10 rounded px-3 py-1.5 text-ink w-64"
          />
        </label>
      </header>

      {TIERS.map((tier) => {
        const chords = filtered.filter((c) => c.tier === tier.id);
        if (chords.length === 0) return null;
        return (
          <div key={tier.id} className="mb-8">
            <h2 className="text-sm uppercase tracking-wide text-muted mb-3">{tier.label}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {chords.map((chord) => {
                const best = chordBests[chord.id]?.bestScore;
                return (
                  <Link
                    key={chord.id}
                    to={`/chords/${chord.id}`}
                    className="bg-panel rounded-lg p-3 border border-white/5 hover:border-white/15 transition-colors flex flex-col items-center"
                  >
                    <Fretboard chord={chord} size="sm" />
                    <div className="mt-2 flex items-center justify-between w-full">
                      <div className="text-sm font-medium">{chord.name}</div>
                      {best != null && (
                        <div
                          className="text-xs rounded-full bg-accent/10 text-accent px-2 py-0.5"
                          title="Best score"
                        >
                          {best}/10
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
