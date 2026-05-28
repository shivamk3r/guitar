import {
  type SessionHistoryItem,
  fetchLearnerHistory,
  fetchSessionDetail,
  recordingMediaUrl,
} from "@/api/client";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { clsx } from "@/ui/clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  activityLabel,
  completionLabel,
  formatDateTime,
  formatDuration,
  getAttempts,
  getConfigRows,
  getScoreRows,
  timelineResult,
} from "./history-utils";

export function HistoryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const settings = useSettings();
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [detail, setDetail] = useState<SessionHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!settings.hydrated) return;
    if (!settings.learnerId) {
      setSessions([]);
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextSessions = await fetchLearnerHistory(settings.learnerId);
      setSessions(nextSessions);
    } catch (err) {
      console.error("history load failed", err);
      setError(err instanceof Error ? err.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [settings.hydrated, settings.learnerId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectedFromList = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      return;
    }
    if (selectedFromList) {
      setDetail(selectedFromList);
      return;
    }
    let cancelled = false;
    setDetail(null);
    fetchSessionDetail(sessionId)
      .then((session) => {
        if (!cancelled) setDetail(session);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("history detail load failed", err);
        setError(err instanceof Error ? err.message : "Could not load activity detail.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFromList, sessionId]);

  const selected = sessionId ? detail : null;

  return (
    <section>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-muted text-sm mt-1">
            Review saved tuning, chord check, and practice activity.
          </p>
        </div>
        <Button variant="secondary" onClick={loadHistory} disabled={loading || !settings.learnerId}>
          Refresh
        </Button>
      </header>

      {error && (
        <div className="mb-4 text-bad text-sm border border-bad/30 rounded px-3 py-2">{error}</div>
      )}

      {!settings.learnerId ? (
        <EmptyHistory />
      ) : (
        <div className="grid lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.25fr)] gap-6">
          <Timeline sessions={sessions} selectedId={sessionId ?? null} loading={loading} />
          {selected ? (
            <HistoryDetail session={selected} />
          ) : (
            <div className="bg-panel border border-white/5 rounded-lg p-6 text-muted">
              {sessions.length > 0
                ? "Choose an activity to see the full session detail."
                : "No saved activity yet."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyHistory() {
  return (
    <div className="bg-panel border border-white/5 rounded-lg p-6">
      <h2 className="font-semibold">No saved activity yet</h2>
      <p className="text-sm text-muted mt-2">
        Start the tuner, check a chord, or run a practice drill to create your learner history.
        Recordings stay off unless you enable recording consent in Settings.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="text-sm text-accent hover:underline" to="/">
          Open tuner
        </Link>
        <Link className="text-sm text-accent hover:underline" to="/practice">
          Open practice
        </Link>
      </div>
    </div>
  );
}

function Timeline({
  loading,
  selectedId,
  sessions,
}: {
  loading: boolean;
  selectedId: string | null;
  sessions: SessionHistoryItem[];
}) {
  if (loading && sessions.length === 0) {
    return (
      <div className="bg-panel border border-white/5 rounded-lg p-6 text-muted">
        Loading history...
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="bg-panel border border-white/5 rounded-lg p-6 text-muted">
        No saved activity yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {sessions.map((session) => {
        const active = selectedId === session.id;
        return (
          <li key={session.id}>
            <Link
              to={`/history/${session.id}`}
              className={clsx(
                "block rounded-lg border p-4 transition-colors",
                active
                  ? "border-accent/70 bg-accent/10"
                  : "border-white/10 bg-panel hover:border-white/25",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {activityLabel(session.activity_type, session.client_metadata)}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {formatDateTime(session.started_at)}
                  </div>
                </div>
                <div className="text-right text-sm tabular-nums">{timelineResult(session)}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
                <TimelineMetric label="Duration" value={formatDuration(session.duration_seconds)} />
                <TimelineMetric label="Status" value={completionLabel(session.completion_status)} />
                <TimelineMetric
                  label="Recording"
                  value={session.recording_available ? "Yes" : "No"}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function TimelineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-wide text-[10px] text-muted/70">{label}</div>
      <div className="text-ink mt-0.5">{value}</div>
    </div>
  );
}

function HistoryDetail({ session }: { session: SessionHistoryItem }) {
  const configRows = getConfigRows(session);
  const scoreRows = getScoreRows(session);
  const attempts = getAttempts(session).slice(-12).reverse();

  return (
    <article className="space-y-5">
      <div className="bg-panel border border-white/5 rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-muted">{formatDateTime(session.started_at)}</div>
            <h2 className="text-xl font-semibold mt-1">
              {activityLabel(session.activity_type, session.client_metadata)}
            </h2>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{timelineResult(session)}</div>
            <div className="text-xs text-muted mt-1">
              {completionLabel(session.completion_status)}
            </div>
          </div>
        </div>
      </div>

      <DetailRows title="Session configuration" rows={configRows} empty="No configuration saved." />
      <DetailRows title="Score breakdown" rows={scoreRows} empty="No score breakdown saved." />

      {attempts.length > 0 && (
        <div className="bg-panel border border-white/5 rounded-lg p-5">
          <h3 className="text-sm uppercase tracking-wide text-muted mb-3">Attempts</h3>
          <ul className="space-y-2">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center justify-between gap-3 rounded border border-white/10 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{attempt.label}</div>
                  {attempt.detail && (
                    <div className="text-xs text-muted mt-0.5">{attempt.detail}</div>
                  )}
                </div>
                <div className="tabular-nums">{attempt.score}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RecordingPanel session={session} />
    </article>
  );
}

function DetailRows({
  empty,
  rows,
  title,
}: {
  empty: string;
  rows: { label: string; value: string }[];
  title: string;
}) {
  return (
    <div className="bg-panel border border-white/5 rounded-lg p-5">
      <h3 className="text-sm uppercase tracking-wide text-muted mb-3">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-sm text-muted">{empty}</div>
      ) : (
        <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {rows.map((row) => (
            <div key={`${title}-${row.label}`}>
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-ink mt-0.5">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RecordingPanel({ session }: { session: SessionHistoryItem }) {
  if (!session.recording_available || session.recordings.length === 0) {
    return (
      <div className="bg-panel border border-white/5 rounded-lg p-5">
        <h3 className="text-sm uppercase tracking-wide text-muted mb-2">Recording</h3>
        <div className="text-sm text-muted">
          No consented recording was saved for this activity.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-white/5 rounded-lg p-5">
      <h3 className="text-sm uppercase tracking-wide text-muted mb-3">Recording</h3>
      <div className="space-y-3">
        {session.recordings.map((recording) => (
          <div key={recording.id}>
            {/* biome-ignore lint/a11y/useMediaCaption: Learner recordings are instrumental practice audio without speech captions. */}
            <audio
              controls
              preload="metadata"
              src={recordingMediaUrl(recording.id)}
              className="w-full"
            />
            <div className="mt-1 text-xs text-muted">
              {Math.round(recording.size_bytes / 1024)} KB · {recording.content_type}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
