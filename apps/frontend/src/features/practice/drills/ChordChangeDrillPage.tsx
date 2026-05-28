import { CHORDS, type ChordDef, getChord } from "@/data/chords";
import { Button } from "@/ui/Button";
import { useMemo, useState } from "react";
import { suggestBpmChange, usePractice } from "../practice-store";
import { DrillShell } from "./DrillShell";
import { useDrillSession } from "./useDrillSession";

export function ChordChangeDrillPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>(["G", "C", "D"]);
  const chords = selectedIds.map((id) => getChord(id)).filter((c): c is ChordDef => !!c);
  const [beatsPerChange, setBeatsPerChange] = useState(2);

  const session = useDrillSession({
    chords,
    beatsPerChange,
    bpm: 60,
  });

  const events = usePractice((s) => s.events);
  const suggestion = useMemo(
    () =>
      suggestBpmChange(
        session.bpm,
        events.map((e) => e.score.score),
      ),
    [session.bpm, events],
  );

  const currentChord = chords[session.currentIndex % chords.length] ?? chords[0]!;
  const upcomingChord = chords[(session.currentIndex + 1) % chords.length] ?? null;

  function toggleChord(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (chords.length < 2) {
    return (
      <section>
        <h1 className="text-2xl font-semibold mb-4">Chord change drill</h1>
        <p className="text-muted mb-4">Pick at least two chords to practice.</p>
        <ChordPicker selectedIds={selectedIds} onToggle={toggleChord} />
      </section>
    );
  }

  return (
    <DrillShell
      title="Chord change drill"
      subtitle={`${chords.map((c) => c.name).join(" → ")} · ${beatsPerChange} beats per change`}
      session={session}
      currentChord={currentChord}
      upcomingChord={upcomingChord}
      sidebar={
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm text-muted">
              Beats per chord change
              <select
                className="ml-2 bg-panel border border-white/10 rounded px-2 py-1 text-ink"
                value={beatsPerChange}
                onChange={(e) => setBeatsPerChange(Number(e.target.value))}
                disabled={session.running}
              >
                <option value={1}>1 (hard)</option>
                <option value={2}>2</option>
                <option value={4}>4 (easier)</option>
              </select>
            </label>
          </div>
          <ChordPicker
            selectedIds={selectedIds}
            onToggle={toggleChord}
            disabled={session.running}
          />
          {suggestion && (
            <div className="text-sm rounded border border-accent/30 bg-accent/10 p-3">
              <div className="text-accent font-medium">
                {suggestion.direction === "up"
                  ? "You're crushing it — try +5 BPM?"
                  : "Slow down? −5 BPM."}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => session.setBpm(suggestion.to)}
                disabled={session.running}
              >
                Set BPM to {suggestion.to}
              </Button>
            </div>
          )}
        </div>
      }
    />
  );
}

function ChordPicker({
  selectedIds,
  onToggle,
  disabled,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-sm text-muted mb-2">Chords</div>
      <div className="flex flex-wrap gap-2">
        {CHORDS.map((c) => {
          const on = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(c.id)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                on
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-white/10 bg-panel text-muted hover:text-ink"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
