import {
  type PracticeAnalysis,
  type PracticeAttemptAnalysis,
  type RecordingAnalysis,
  type RecordingAnalysisSummary,
  type RecordingSummary,
  type SessionHistoryItem,
  createSessionJournal,
  deleteRecording,
  fetchLearnerHistory,
  fetchRecordingAnalysis,
  fetchSessionDetail,
  fetchSessionJournal,
  markRecordingExported,
  recordingMediaUrl,
} from "@/api/client";
import {
  type JournalViewEntry,
  createLocalJournalEntry,
  getLocalJournalEntriesForSession,
  localJournalToView,
  markLocalJournalEntrySynced,
  mergeJournalEntries,
  syncUnsyncedLocalJournalEntries,
} from "@/storage/journal-store";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { clsx } from "@/ui/clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  activityLabel,
  analysisResultText,
  backendScoreRows,
  completionLabel,
  formatDateTime,
  formatDuration,
  getAttempts,
  getConfigRows,
  getScoreRows,
  isLocalOnlyHistorySession,
  localSessionToHistoryItem,
  mergeHistorySessions,
  timelineResult,
} from "./history-utils";

export function HistoryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const settings = useSettings();
  const progressHydrated = useProgress((state) => state.hydrated);
  const localSessions = useProgress((state) => state.sessions);
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [detail, setDetail] = useState<SessionHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!settings.hydrated || !progressHydrated) return;
    const localHistory = localSessions.map((session) =>
      localSessionToHistoryItem(session, settings.learnerId),
    );
    setSessions(localHistory);
    if (!settings.learnerId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const journalSync = await syncUnsyncedLocalJournalEntries({ learnerId: settings.learnerId });
      if (journalSync.failed > 0) {
        console.error("journal backend sync retry failed", journalSync);
      }
      const nextSessions = await fetchLearnerHistory(settings.learnerId);
      setSessions(mergeHistorySessions(localHistory, nextSessions));
    } catch (err) {
      console.error("history load failed", err);
      setSessions(localHistory);
      setError(
        localHistory.length > 0
          ? "Showing local history; backend history is unavailable."
          : err instanceof Error
            ? err.message
            : "Could not load history.",
      );
    } finally {
      setLoading(false);
    }
  }, [localSessions, progressHydrated, settings.hydrated, settings.learnerId]);

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
    if (!settings.learnerId) {
      setDetail(null);
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
  }, [selectedFromList, sessionId, settings.learnerId]);

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
        <Button variant="secondary" onClick={loadHistory} disabled={loading}>
          Refresh
        </Button>
      </header>

      {error && (
        <div className="mb-4 text-bad text-sm border border-bad/30 rounded px-3 py-2">{error}</div>
      )}

      {sessions.length === 0 && !settings.learnerId ? (
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
        <Link className="text-sm text-accent hover:underline" to="/tools/tuner">
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
      <JournalPanel session={session} />

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

function JournalPanel({ session }: { session: SessionHistoryItem }) {
  const settings = useSettings();
  const [entries, setEntries] = useState<JournalViewEntry[]>([]);
  const [body, setBody] = useState("");
  const [focus, setFocus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localOnly = isLocalOnlyHistorySession(session);

  useEffect(() => {
    let cancelled = false;
    async function loadEntries() {
      const localEntries = await getLocalJournalEntriesForSession(session.id);
      if (localOnly) {
        if (!cancelled) setEntries(mergeJournalEntries(localEntries, []));
        return;
      }
      try {
        const backendEntries = await fetchSessionJournal(session.id);
        if (!cancelled) setEntries(mergeJournalEntries(localEntries, backendEntries));
      } catch (err) {
        console.error("journal load failed", err);
        if (!cancelled) setEntries(mergeJournalEntries(localEntries, []));
      }
    }
    loadEntries().catch((err) => {
      console.error("local journal load failed", err);
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notes.");
    });
    return () => {
      cancelled = true;
    };
  }, [localOnly, session.id]);

  async function saveNote() {
    if (body.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const localEntry = await createLocalJournalEntry({
        learnerId: settings.learnerId,
        sessionId: session.id,
        body: body.trim(),
        focus: focus.trim() || null,
      });
      setEntries((current) =>
        [localJournalToView(localEntry), ...current].sort((a, b) =>
          b.createdAtIso.localeCompare(a.createdAtIso),
        ),
      );
      setBody("");
      setFocus("");
      if (!settings.learnerId || localOnly) return;
      try {
        const backendEntry = await createSessionJournal({
          sessionId: session.id,
          learnerId: settings.learnerId,
          body: localEntry.body,
          focus: localEntry.focus,
          mood: localEntry.mood,
        });
        const syncedEntry = await markLocalJournalEntrySynced(localEntry.id, backendEntry);
        if (syncedEntry) {
          setEntries((current) =>
            current.map((entry) =>
              entry.id === localEntry.id ? localJournalToView(syncedEntry) : entry,
            ),
          );
        }
      } catch (err) {
        console.error("journal backend sync failed", err);
        setError("Saved locally; backend note sync is unavailable.");
      }
    } catch (err) {
      console.error("local journal save failed", err);
      setError(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-panel border border-white/5 rounded-lg p-5">
      <h3 className="text-sm uppercase tracking-wide text-muted mb-3">Practice notes</h3>
      <div className="grid gap-3">
        <input
          value={focus}
          onChange={(event) => setFocus(event.target.value)}
          placeholder="Focus, e.g. best take or needs work"
          className="rounded border border-white/10 bg-surface px-3 py-2 text-sm text-ink"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What improved? What should tomorrow review?"
          rows={3}
          className="rounded border border-white/10 bg-surface px-3 py-2 text-sm text-ink"
        />
        <div className="flex items-center gap-3">
          <Button onClick={saveNote} disabled={saving || body.trim().length === 0}>
            {saving ? "Saving..." : "Save note"}
          </Button>
          {error && <span className="text-sm text-bad">{error}</span>}
        </div>
      </div>
      {entries.length > 0 && (
        <ol className="mt-4 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded border border-white/10 px-3 py-2 text-sm">
              {entry.focus && <div className="mb-1 font-medium">{entry.focus}</div>}
              <p className="text-muted">{entry.body}</p>
              <div className="mt-1 text-xs text-muted">
                {formatDateTime(entry.createdAtIso)}
                {entry.source === "local" && !entry.synced ? " · local" : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
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
        {session.recordings.map((recording) => {
          const mediaUrl = recordingMediaUrl(recording.id);
          return (
            <div key={recording.id}>
              {/* biome-ignore lint/a11y/useMediaCaption: Learner recordings are instrumental practice audio without speech captions. */}
              <audio controls preload="metadata" src={mediaUrl} className="w-full" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {Math.round(recording.size_bytes / 1024)} KB ·{" "}
                  {recordingContentLabel(recording.content_type)}
                </span>
                <a
                  href={mediaUrl}
                  download={`guitar-session-${recording.id}.${recordingExtension(
                    recording.content_type,
                  )}`}
                  onClick={() => markRecordingExported(recording.id).catch(console.error)}
                  className="text-accent hover:underline"
                >
                  Download raw audio
                </a>
                <button
                  type="button"
                  className="text-bad hover:underline"
                  onClick={() => {
                    if (!confirm("Delete this local recording? Session metadata stays.")) return;
                    deleteRecording(recording.id, "learner-requested")
                      .then(() => window.location.reload())
                      .catch((err) => alert(err instanceof Error ? err.message : "Delete failed"));
                  }}
                >
                  Delete recording
                </button>
              </div>
              <RecordingAnalysisSummaryLine summary={recording.analysis} />
              <RecordingAnalysisFeedback recording={recording} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecordingAnalysisSummaryLine({ summary }: { summary: RecordingAnalysisSummary }) {
  const status = analysisStatusLabel(summary.status);
  const result = analysisResultText(summary);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className={clsx("rounded px-2 py-1", analysisStatusClass(summary))}>{status}</span>
      <span className="text-muted">{result}</span>
    </div>
  );
}

function RecordingAnalysisFeedback({ recording }: { recording: RecordingSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<RecordingAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canFetch = recording.analysis.status !== "not_started";

  const toggle = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded || analysis || loading || !canFetch) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await fetchRecordingAnalysis(recording.id));
    } catch (err) {
      console.error("recording analysis load failed", err);
      setError(err instanceof Error ? err.message : "Could not load backend feedback.");
    } finally {
      setLoading(false);
    }
  };

  if (!canFetch) return null;

  return (
    <div className="mt-3">
      <Button variant="secondary" size="sm" onClick={toggle}>
        {expanded ? "Hide backend feedback" : "View backend feedback"}
      </Button>
      {expanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {loading && <div className="text-sm text-muted">Loading backend feedback...</div>}
          {error && <div className="text-sm text-bad">{error}</div>}
          {analysis && <RecordingAnalysisDetail analysis={analysis} />}
        </div>
      )}
    </div>
  );
}

function RecordingAnalysisDetail({ analysis }: { analysis: RecordingAnalysis }) {
  const rows = analysisDetailRows(analysis);
  const topPredictions = analysis.prediction?.top_predictions ?? [];
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-muted">{row.label}</dt>
            <dd className="text-ink mt-0.5">{row.value}</dd>
          </div>
        ))}
      </dl>
      {analysis.practice && <PracticeAnalysisDetail practice={analysis.practice} />}
      {topPredictions.length > 0 && (
        <div>
          <div className="text-muted mb-2">Top model estimates</div>
          <ol className="space-y-1">
            {topPredictions.slice(0, 5).map((item, index) => (
              <li
                key={`${item.chord_id ?? "unknown"}-${index}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span>{item.chord_id ?? "Unknown"}</span>
                <span className="tabular-nums">{percent(item.confidence)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {analysis.guidance && <div className="text-muted">{analysis.guidance}</div>}
    </div>
  );
}

function PracticeAnalysisDetail({ practice }: { practice: PracticeAnalysis }) {
  if (practice.attempts.length === 0) return null;
  return (
    <div>
      <div className="text-muted mb-2">Backend attempt feedback</div>
      <div className="max-h-96 overflow-auto rounded border border-white/10">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="sticky top-0 bg-panel text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Expected</th>
              <th className="px-3 py-2 font-medium">Backend heard</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Frontend</th>
              <th className="px-3 py-2 font-medium">Window</th>
              <th className="px-3 py-2 font-medium">Top estimates</th>
            </tr>
          </thead>
          <tbody>
            {practice.attempts.map((attempt, index) => (
              <PracticeAttemptRow
                key={attempt.id ?? `${attempt.expected_index}-${index}`}
                attempt={attempt}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PracticeAttemptRow({ attempt }: { attempt: PracticeAttemptAnalysis }) {
  return (
    <tr className="border-t border-white/10 align-top">
      <td className="px-3 py-2 tabular-nums">{attemptNumber(attempt)}</td>
      <td className="px-3 py-2 font-medium text-ink">{attempt.expected_chord_id}</td>
      <td className="px-3 py-2">{attempt.backend_predicted_chord_id ?? "Unknown"}</td>
      <td className="px-3 py-2">{analysisResultLabel(attempt.verifier_status) ?? "Unknown"}</td>
      <td className="px-3 py-2 tabular-nums">{percentOrUndefined(attempt.confidence) ?? "-"}</td>
      <td className="px-3 py-2">
        {frontendAttemptLabel(attempt)}
        {attempt.timing_delta_ms != null && (
          <div className="mt-0.5 text-muted tabular-nums">
            {Math.round(attempt.timing_delta_ms)} ms
          </div>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        {attempt.capture_start_sec.toFixed(2)}-{attempt.capture_end_sec.toFixed(2)}s
      </td>
      <td className="px-3 py-2">{topPredictionLabel(attempt.top_predictions)}</td>
    </tr>
  );
}

function analysisDetailRows(analysis: RecordingAnalysis): { label: string; value: string }[] {
  if (analysis.practice) return practiceDetailRows(analysis);
  if (analysis.tuner) return tunerDetailRows(analysis);
  const prediction = analysis.prediction;
  const capture = analysis.capture;
  const rows: { label: string; value: string }[] = [];
  addAnalysisRow(
    rows,
    "Result",
    analysisResultLabel(prediction?.verifier_status ?? analysis.status),
  );
  addAnalysisRow(rows, "Target", analysis.target.chord_id ?? undefined);
  addAnalysisRow(rows, "Backend heard", prediction?.chord_id ?? undefined);
  addAnalysisRow(rows, "Confidence", percentOrUndefined(prediction?.confidence));
  addAnalysisRow(rows, "Expected match", percentOrUndefined(prediction?.expected_similarity));
  addAnalysisRow(rows, "Closest alternative", prediction?.best_alternative_chord_id ?? undefined);
  addAnalysisRow(rows, "Alternative match", percentOrUndefined(prediction?.alternative_similarity));
  addAnalysisRow(rows, "Margin", percentOrUndefined(prediction?.margin));
  addAnalysisRow(rows, "Model", analysis.detector?.name);
  addAnalysisRow(rows, "Raw root", capture?.raw_root ?? undefined);
  addAnalysisRow(rows, "Raw quality", rawQualityLabel(capture?.raw_quality));
  addAnalysisRow(rows, "Frames used", numberOrUndefined(capture?.frames_used));
  return rows;
}

function practiceDetailRows(analysis: RecordingAnalysis): { label: string; value: string }[] {
  const practice = analysis.practice;
  const rows: { label: string; value: string }[] = [];
  if (!practice) return rows;
  addAnalysisRow(rows, "Result", analysisResultLabel(analysisResultValue(analysis)));
  addAnalysisRow(rows, "Mode", practiceModeLabel(practice.mode));
  rows.push(...backendScoreRows(practice.score));
  addAnalysisRow(
    rows,
    "Attempts analyzed",
    `${practice.analyzed_attempt_count}/${practice.attempt_count}`,
  );
  addAnalysisRow(
    rows,
    "Backend accepted",
    `${practice.accepted_count} accepted · ${practice.rejected_count} rejected · ${practice.uncertain_count} uncertain`,
  );
  addAnalysisRow(rows, "Average confidence", percentOrUndefined(practice.average_confidence));
  addAnalysisRow(rows, "BPM", numberOrUndefined(practice.bpm));
  addAnalysisRow(rows, "Beats per chord", numberOrUndefined(practice.beats_per_chord));
  addAnalysisRow(rows, "Count-in", numberOrUndefined(practice.count_in_beats));
  addAnalysisRow(rows, "Model", analysis.detector?.name);
  return rows;
}

function tunerDetailRows(analysis: RecordingAnalysis): { label: string; value: string }[] {
  const tuner = analysis.tuner;
  const rows: { label: string; value: string }[] = [];
  if (!tuner) return rows;
  addAnalysisRow(rows, "Result", analysisResultLabel(analysisResultValue(analysis)));
  addAnalysisRow(rows, "Tuning", tuner.tuning_name ?? tuner.tuning_id ?? undefined);
  addAnalysisRow(rows, "Median note", tuner.median_note ?? undefined);
  addAnalysisRow(rows, "Median frequency", hertzLabel(tuner.median_hz));
  addAnalysisRow(rows, "Median cents", centsLabel(tuner.median_cents));
  addAnalysisRow(rows, "Average cents from center", centsLabel(tuner.mean_abs_cents));
  addAnalysisRow(rows, "Pitch spread", centsLabel(tuner.cents_std_dev));
  addAnalysisRow(rows, "Centered frames", percentOrUndefined(tuner.in_tune_frame_rate));
  addAnalysisRow(rows, "Voiced frames", `${tuner.voiced_frame_count}/${tuner.frame_count}`);
  addAnalysisRow(rows, "Model", analysis.detector?.name);
  return rows;
}

function addAnalysisRow(
  rows: { label: string; value: string }[],
  label: string,
  value: string | undefined,
): void {
  if (!value) return;
  rows.push({ label, value });
}

function analysisResultValue(analysis: RecordingAnalysis): string {
  if (analysis.tuner) return "tuning_analyzed";
  if (analysis.practice) return "analyzed";
  return analysis.prediction?.verifier_status ?? analysis.status;
}

function attemptNumber(attempt: PracticeAttemptAnalysis): string {
  return attempt.expected_index == null ? "-" : String(attempt.expected_index + 1);
}

function frontendAttemptLabel(attempt: PracticeAttemptAnalysis): string {
  const detected = attempt.frontend_detected_chord_id ?? "not detected";
  const score = attempt.frontend_score == null ? "" : ` · ${attempt.frontend_score}/10`;
  return `${detected}${score}`;
}

function topPredictionLabel(items: PracticeAttemptAnalysis["top_predictions"]): string {
  if (items.length === 0) return "-";
  return items
    .slice(0, 3)
    .map((item) => `${item.chord_id ?? "Unknown"} ${percent(item.confidence)}`)
    .join(", ");
}

function practiceModeLabel(value: string | null): string | undefined {
  if (!value) return undefined;
  if (value === "timed_chord_practice") return "Timed chord practice";
  if (value === "chord_change_drill") return "Chord change drill";
  if (value === "progression_drill") return "Progression drill";
  return completionLabel(value);
}

function analysisStatusLabel(status: string): string {
  if (status === "queued") return "Queued";
  if (status === "running") return "Analyzing";
  if (status === "completed") return "Analyzed";
  if (status === "failed") return "Failed";
  return "Not analyzed";
}

function analysisStatusClass(summary: RecordingAnalysisSummary): string {
  if (summary.status === "failed" || summary.result === "rejected") {
    return "bg-bad/10 text-bad border border-bad/30";
  }
  if (
    summary.result === "accepted" ||
    summary.result === "analyzed" ||
    summary.result === "tuning_analyzed"
  ) {
    return "bg-accent/10 text-accent border border-accent/30";
  }
  if (summary.status === "queued" || summary.status === "running") {
    return "bg-accent/10 text-accent border border-accent/30";
  }
  return "bg-white/5 text-muted border border-white/10";
}

function analysisResultLabel(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return completionLabel(value);
}

function percentOrUndefined(value: number | null | undefined): string | undefined {
  return value == null ? undefined : percent(value);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function numberOrUndefined(value: number | null | undefined): string | undefined {
  return value == null ? undefined : String(value);
}

function centsLabel(value: number | null | undefined): string | undefined {
  return value == null ? undefined : `${value.toFixed(1)} cents`;
}

function hertzLabel(value: number | null | undefined): string | undefined {
  return value == null ? undefined : `${value.toFixed(2)} Hz`;
}

function rawQualityLabel(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value === "" ? "major" : value;
}

function recordingContentLabel(contentType: string): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav") {
    return "Raw PCM WAV";
  }
  return contentType;
}

function recordingExtension(contentType: string): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav") {
    return "wav";
  }
  if (normalized === "audio/mp4") return "mp4";
  return "webm";
}
