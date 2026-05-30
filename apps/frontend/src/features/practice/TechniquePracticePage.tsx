import {
  TECHNIQUE_TARGETS,
  type TechniquePracticeTarget,
  getTechniqueTarget,
} from "@/data/technique-practice";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  buildTechniquePracticeMetadata,
  buildTechniqueProgressPatch,
  buildTechniqueSessionSummary,
  fallbackTechniqueStartIso,
} from "./technique-session";

export function TechniquePracticePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTarget = useMemo(
    () => getTechniqueTarget(searchParams.get("target")),
    [searchParams],
  );
  const [target, setTarget] = useState(initialTarget);
  const [minutes, setMinutes] = useState(initialTarget.defaultMinutes);
  const [bpm, setBpm] = useState(initialTarget.defaultBpm);
  const [rating, setRating] = useState(7);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const settings = useSettings();
  const upsertProgressItem = useProgress((state) => state.upsertProgressItem);
  const saveSession = useProgress((state) => state.saveSession);

  function chooseTarget(next: TechniquePracticeTarget) {
    setTarget(next);
    setMinutes(next.defaultMinutes);
    setBpm(next.defaultBpm);
    setNotes("");
    setError(null);
    setSyncWarning(null);
    setSearchParams({ target: next.id });
  }

  async function savePractice() {
    setSaving(true);
    setError(null);
    setSyncWarning(null);
    const sessionId = crypto.randomUUID();
    const endedAtIso = new Date().toISOString();
    const startedAtIso = fallbackTechniqueStartIso(minutes);
    const metadata = buildTechniquePracticeMetadata({ bpm, minutes, notes, rating, target });
    try {
      await upsertProgressItem(
        buildTechniqueProgressPatch({
          bpm,
          minutes,
          notes,
          rating,
          target,
        }),
      );
      await saveSession(
        buildTechniqueSessionSummary({
          bpm,
          endedAtIso,
          id: sessionId,
          rating,
          startedAtIso,
          target,
        }),
      );
    } catch (err) {
      console.error("technique practice save failed", err);
      setError(err instanceof Error ? err.message : "Could not save technique practice.");
      setSaving(false);
      return;
    }

    const syncResult = await syncLearningSessionOrQueue(
      {
        sessionId,
        activityType: "technique_drill",
        endedAtIso,
        metadata,
        startedAtIso,
      },
      settings,
    );
    if (!syncResult.synced) {
      console.error("technique backend sync failed", syncResult.error);
      setSyncWarning("Saved locally; backend sync will retry automatically.");
    }
    setSaving(false);
  }

  return (
    <section>
      <Link to="/practice" className="text-sm text-muted hover:text-ink">
        Back to Practice
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold">Technique practice</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Save focused work on technique, scales, lead, fingerstyle, and theory targets.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-white/5 bg-panel p-5">
          <div className="mb-5">
            <label className="text-sm text-muted">
              Target
              <select
                value={target.id}
                onChange={(event) => chooseTarget(getTechniqueTarget(event.target.value))}
                className="mt-1 block w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              >
                {TECHNIQUE_TARGETS.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-md border border-white/10 bg-surface/60 p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{target.area}</div>
            <h2 className="mt-1 text-xl font-semibold">{target.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{target.focus}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {target.checkpoints.map((checkpoint) => (
                <span key={checkpoint} className="rounded border border-white/10 px-2 py-1 text-sm">
                  {checkpoint}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm text-muted">
              Minutes
              <input
                type="number"
                min={1}
                max={60}
                value={minutes}
                onChange={(event) => setMinutes(Math.max(1, Number(event.target.value)))}
                className="mt-1 block w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="text-sm text-muted">
              BPM
              <input
                type="number"
                min={30}
                max={240}
                value={bpm ?? ""}
                placeholder="Off"
                onChange={(event) =>
                  setBpm(event.target.value === "" ? null : Number(event.target.value))
                }
                className="mt-1 block w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="text-sm text-muted">
              Rating
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
                className="mt-3 block w-full accent-accent"
              />
              <span className="mt-1 block tabular-nums text-ink">{rating}/10</span>
            </label>
          </div>

          <label className="mt-5 block text-sm text-muted">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              placeholder="Best take, blocker, or next adjustment"
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={savePractice} disabled={saving}>
              {saving ? "Saving..." : "Save practice"}
            </Button>
            {error && <span className="text-sm text-bad">{error}</span>}
            {syncWarning && <span className="text-sm text-warn">{syncWarning}</span>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Linked lesson</h2>
            <Link
              to={`/learn/lessons/${target.lessonId}`}
              className="mt-3 inline-block rounded-md border border-white/10 px-3 py-2 text-sm text-accent"
            >
              Open lesson
            </Link>
          </section>
          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Practice targets</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Info label="Progress type" value={target.itemType} />
              <Info label="Evidence id" value={target.itemId} />
              <Info label="Skill" value={target.skillId} />
            </dl>
          </section>
        </aside>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
