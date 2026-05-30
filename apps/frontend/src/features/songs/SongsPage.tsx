import { ensureLearnerProfile, startLearningSession } from "@/api/client";
import { SONGS, type Song, completedSongSectionIds, getSong, songProgress } from "@/data/songs";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { clsx } from "@/ui/clsx";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  buildSongPracticeMetadata,
  buildSongPracticeSummary,
  buildSongSectionProgressPatch,
  buildStoppedSongPracticeMetadata,
  fallbackSongPracticeStartIso,
  songPracticeMinutes,
} from "./song-session";

interface ActiveSongPractice {
  sectionId: string;
  sessionId: string;
  startedAtIso: string;
  backendStarted: boolean;
}

export function SongsPage() {
  const { songId } = useParams<{ songId: string }>();
  const song = getSong(songId);

  if (songId && !song) {
    return (
      <section>
        <h1 className="text-xl font-semibold">Song not found</h1>
        <Link to="/songs" className="mt-3 inline-block text-accent underline">
          Back to Songs
        </Link>
      </section>
    );
  }

  return song ? <SongDetail song={song} /> : <SongList />;
}

function SongList() {
  const progressItems = useProgress((state) => state.progressItems);

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Songs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Local seed songs use app-authored or public-domain material and unlock from the same skill
          tree as lessons.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SONGS.map((song) => {
          const progress = songProgress(progressItems, song.id);
          return (
            <Link
              key={song.id}
              to={`/songs/${song.id}`}
              className="rounded-lg border border-white/5 bg-panel p-4 transition-colors hover:border-white/15"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{song.title}</h2>
                  <p className="mt-1 text-xs text-muted">{song.origin}</p>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-muted">
                  {song.difficulty}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {song.chords.map((chord) => (
                  <span key={chord} className="rounded border border-white/10 px-2 py-0.5 text-sm">
                    {chord}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{song.recommendation}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, progress?.mastery ?? 0)}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SongDetail({ song }: { song: Song }) {
  const settings = useSettings();
  const progressItems = useProgress((state) => state.progressItems);
  const recordSongProgress = useProgress((state) => state.recordSongProgress);
  const saveSession = useProgress((state) => state.saveSession);
  const upsertProgressItem = useProgress((state) => state.upsertProgressItem);
  const progress = songProgress(progressItems, song.id);
  const completed = useMemo(() => completedSongSectionIds(progress), [progress]);
  const [activeSectionId, setActiveSectionId] = useState(song.sections[0]?.id ?? "");
  const [tempo, setTempo] = useState(song.tempo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [activePractice, setActivePractice] = useState<ActiveSongPractice | null>(null);
  const activeSection =
    song.sections.find((section) => section.id === activeSectionId) ?? song.sections[0]!;
  const completedSet = new Set(completed);
  const mastery = Math.round((completedSet.size / song.sections.length) * 100);
  const activePracticeForSection =
    activePractice?.sectionId === activeSection.id ? activePractice : null;

  function sectionPracticeStartMetadata(): Record<string, unknown> {
    return {
      practiceMode: "song_section_loop",
      songId: song.id,
      songTitle: song.title,
      sectionId: activeSection.id,
      sectionName: activeSection.name,
      bpm: tempo,
      originalBpm: song.tempo,
      chords: activeSection.chords,
      bars: activeSection.bars,
      recordingConsentGranted: settings.recordingConsentGranted,
    };
  }

  async function startSectionPractice() {
    const practice: ActiveSongPractice = {
      sectionId: activeSection.id,
      sessionId: crypto.randomUUID(),
      startedAtIso: new Date().toISOString(),
      backendStarted: false,
    };
    setError(null);
    setSyncWarning(null);
    setActivePractice(practice);

    try {
      const learner = await ensureLearnerProfile({
        learnerId: settings.learnerId,
        anonymousLearnerId: settings.anonymousLearnerId,
        onProfile: (profile) => settings.update(profile),
      });
      await startLearningSession({
        id: practice.sessionId,
        learnerId: learner.id,
        activityType: "song_practice",
        startedAtIso: practice.startedAtIso,
        metadata: sectionPracticeStartMetadata(),
      });
      setActivePractice((current) =>
        current?.sessionId === practice.sessionId ? { ...current, backendStarted: true } : current,
      );
    } catch (err) {
      console.error("song practice backend start failed", err);
      setSyncWarning("Practicing locally; backend sync unavailable.");
    }
  }

  async function stopSectionPractice() {
    const practice = activePracticeForSection;
    if (!practice) return;
    const endedAtIso = new Date().toISOString();
    const minutes = songPracticeMinutes({
      startedAtIso: practice.startedAtIso,
      endedAtIso,
    });
    const stoppedMetadata = buildStoppedSongPracticeMetadata({
      minutes,
      section: activeSection,
      song,
      tempo,
    });
    setError(null);
    setSyncWarning(null);
    setActivePractice(null);

    try {
      await saveSession(
        buildSongPracticeSummary({
          id: practice.sessionId,
          score: 0,
          section: activeSection,
          startedAtIso: practice.startedAtIso,
          endedAtIso,
          tempo,
        }),
      );
    } catch (err) {
      console.error("song practice local session save failed", err);
      setError(err instanceof Error ? err.message : "Could not save local song practice.");
    }

    const syncResult = await syncLearningSessionOrQueue(
      {
        sessionId: practice.sessionId,
        activityType: "song_practice",
        endedAtIso,
        metadata: stoppedMetadata,
        startedAtIso: practice.startedAtIso,
      },
      settings,
    );
    if (!syncResult.synced) {
      console.error("song practice backend stop failed", syncResult.error);
      setSyncWarning("Practice stopped locally; backend sync will retry automatically.");
    }
  }

  async function markSectionComplete() {
    setSaving(true);
    setError(null);
    setSyncWarning(null);
    const endedAtIso = new Date().toISOString();
    const practice = activePracticeForSection ?? {
      sectionId: activeSection.id,
      sessionId: crypto.randomUUID(),
      startedAtIso: fallbackSongPracticeStartIso(),
      backendStarted: false,
    };
    const nextCompleted = Array.from(new Set([...completed, activeSection.id]));
    const nextMastery = Math.round((nextCompleted.length / song.sections.length) * 100);
    const minutes = songPracticeMinutes({
      startedAtIso: practice.startedAtIso,
      endedAtIso,
    });
    const sessionMetadata = buildSongPracticeMetadata({
      completedSectionIds: nextCompleted,
      mastery: nextMastery,
      minutes,
      section: activeSection,
      song,
      tempo,
    });
    try {
      await upsertProgressItem(
        buildSongSectionProgressPatch({
          endedAtIso,
          minutes,
          section: activeSection,
          song,
          tempo,
        }),
      );
      await recordSongProgress(song.id, {
        status: nextMastery >= 100 ? "mastered" : "in-progress",
        mastery: nextMastery,
        attempts: 1,
        minutes,
        bestScore: nextMastery,
        lastScore: nextMastery,
        lastPracticedIso: endedAtIso,
        metadata: { completedSectionIds: nextCompleted, lastTempo: tempo },
      });
      await saveSession(
        buildSongPracticeSummary({
          id: practice.sessionId,
          score: 10,
          section: activeSection,
          startedAtIso: practice.startedAtIso,
          endedAtIso,
          tempo,
        }),
      );
    } catch (err) {
      console.error("song progress failed", err);
      setError(err instanceof Error ? err.message : "Could not save song progress.");
      setSaving(false);
      return;
    }

    setActivePractice((current) => (current?.sessionId === practice.sessionId ? null : current));

    const syncResult = await syncLearningSessionOrQueue(
      {
        sessionId: practice.sessionId,
        activityType: "song_practice",
        endedAtIso,
        metadata: sessionMetadata,
        startedAtIso: practice.startedAtIso,
        songProgress: {
          songId: song.id,
          status: nextMastery >= 100 ? "mastered" : "in-progress",
          mastery: nextMastery,
          minutes,
          completedSectionIds: nextCompleted,
          lastTempo: tempo,
        },
      },
      settings,
    );
    if (!syncResult.synced) {
      console.error("song backend sync failed", syncResult.error);
      setSyncWarning("Saved locally; backend sync will retry automatically.");
    }
    setSaving(false);
  }

  return (
    <section>
      <Link to="/songs" className="text-sm text-muted hover:text-ink">
        Back to Songs
      </Link>
      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm text-accent">{song.origin}</div>
          <h1 className="text-3xl font-semibold">{song.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{song.recommendation}</p>
        </div>
        <div className="rounded-md border border-white/10 px-3 py-2 text-sm text-muted">
          {mastery}% complete
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-white/5 bg-panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Section loop</h2>
                <p className="text-sm text-muted">
                  {song.strummingPattern} - original tempo {song.tempo} BPM
                </p>
              </div>
              <label className="text-sm text-muted">
                Tempo
                <input
                  type="range"
                  min={Math.max(40, song.tempo - 30)}
                  max={song.tempo + 30}
                  value={tempo}
                  onChange={(event) => setTempo(Number(event.target.value))}
                  className="ml-3 align-middle accent-accent"
                />
                <span className="ml-2 tabular-nums text-ink">{tempo}</span>
              </label>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {song.sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  disabled={activePractice !== null && activePractice.sectionId !== section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={clsx(
                    "rounded-md border px-3 py-1.5 text-sm",
                    section.id === activeSection.id
                      ? "border-accent/70 bg-accent/10 text-accent"
                      : "border-white/10 text-muted hover:text-ink",
                    activePractice !== null &&
                      activePractice.sectionId !== section.id &&
                      "opacity-50",
                  )}
                >
                  {section.name}
                </button>
              ))}
            </div>

            <ChordTimeline chords={activeSection.chords} bars={activeSection.bars} />
            <p className="mt-4 text-sm leading-6 text-muted">{activeSection.guidance}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={startSectionPractice}
                disabled={
                  saving || completedSet.has(activeSection.id) || !!activePracticeForSection
                }
              >
                {activePracticeForSection ? "Practicing..." : "Start section practice"}
              </Button>
              {activePracticeForSection && (
                <Button type="button" variant="ghost" onClick={stopSectionPractice}>
                  Stop practice
                </Button>
              )}
              <Button
                type="button"
                onClick={markSectionComplete}
                disabled={saving || completedSet.has(activeSection.id)}
              >
                {completedSet.has(activeSection.id)
                  ? "Section complete"
                  : saving
                    ? "Saving..."
                    : "Mark section complete"}
              </Button>
              {error && <span className="text-sm text-bad">{error}</span>}
              {syncWarning && <span className="text-sm text-warn">{syncWarning}</span>}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Song targets</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Info label="Difficulty" value={song.difficulty} />
              <Info label="Tempo" value={`${song.tempo} BPM`} />
              <Info label="Chords" value={song.chords.join(", ")} />
              <Info label="Skills" value={song.requiredSkillIds.join(", ")} />
            </dl>
          </section>

          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Sections</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {song.sections.map((section) => (
                <li
                  key={section.id}
                  className="flex items-center justify-between gap-3 rounded border border-white/10 px-3 py-2"
                >
                  <span>{section.name}</span>
                  <span className={completedSet.has(section.id) ? "text-accent" : "text-muted"}>
                    {completedSet.has(section.id) ? "done" : `${section.bars} bars`}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ChordTimeline({ bars, chords }: { bars: number; chords: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {Array.from({ length: bars }, (_, index) => {
        const chord = chords[index % chords.length]!;
        return (
          <div
            key={`${index}-${chord}`}
            className="rounded-md border border-white/10 bg-surface p-3"
          >
            <div className="text-xs text-muted">Bar {index + 1}</div>
            <div className="mt-1 text-xl font-semibold">{chord}</div>
          </div>
        );
      })}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
