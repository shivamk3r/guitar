import { PROGRESSIONS } from "@/data/progressions";
import { useProgress } from "@/storage/progress-store";
import { useMemo } from "react";
import { Link } from "react-router-dom";

export function PracticePage() {
  const transitionMap = useProgress((s) => s.transitionBests);
  const sessions = useProgress((s) => s.sessions);
  const transitions = useMemo(() => Object.values(transitionMap), [transitionMap]);
  const sessionsThisWeek = useMemo(
    () =>
      sessions.filter((session) => {
        const t = new Date(session.startedAtIso).getTime();
        return Date.now() - t < 7 * 24 * 60 * 60 * 1000;
      }).length,
    [sessions],
  );

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Practice</h1>
        <p className="text-muted text-sm mt-1">
          Short drills that listen and score each attempt. No streaks, just progress.
        </p>
      </header>

      <div className="mb-6 text-sm text-muted">
        Sessions this week: <span className="text-ink font-medium">{sessionsThisWeek}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <DrillCard
          title="Timed chord practice"
          body="Choose chords, tempo, rotation, and length. Strum on the moving beat timeline."
          to="/practice/timed-chords"
        />
        <DrillCard
          title="Chord change drill"
          body="Pick 2+ chords and a tempo. The metronome counts; the app listens and scores each change."
          to="/practice/chord-change"
        />
        <DrillCard
          title="Strumming pattern drill"
          body="Visual down/up pattern with timing feedback per bar."
          to="/practice/strumming"
        />
      </div>

      <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Progressions</h2>
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {PROGRESSIONS.map((p) => (
          <DrillCard
            key={p.id}
            title={p.name}
            body={`${p.chords.join(" · ")} @ ${p.defaultBpm} BPM`}
            to={`/practice/progression/${p.id}`}
          />
        ))}
      </div>

      {transitions.length > 0 && (
        <>
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">BPM ceilings</h2>
          <div className="bg-panel border border-white/5 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 font-medium">Transition</th>
                  <th className="px-4 py-2 font-medium text-right">BPM ceiling</th>
                  <th className="px-4 py-2 font-medium text-right">Avg score</th>
                  <th className="px-4 py-2 font-medium text-right">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {transitions
                  .sort((a, b) => b.bpmCeiling - a.bpmCeiling)
                  .map((t) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="px-4 py-2 tabular-nums">
                        {t.fromChordId} → {t.toChordId}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.bpmCeiling || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {t.averageScore.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">{t.attempts}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function DrillCard({ title, body, to }: { title: string; body: string; to: string }) {
  return (
    <Link
      to={to}
      className="block bg-panel rounded-lg p-4 border border-white/5 hover:border-white/15 transition-colors"
    >
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted mt-1">{body}</div>
    </Link>
  );
}
