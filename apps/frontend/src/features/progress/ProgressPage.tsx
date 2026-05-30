import { type ProgressRecap, buildProgressDashboard, buildSkillStates } from "@/lib/coaching";
import { midiToHz } from "@/lib/math";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { clsx } from "@/ui/clsx";
import { useMemo, useState } from "react";
import {
  type TrainerSessionKind,
  buildTrainerSessionMetadata,
  buildTrainerSessionSummary,
  fallbackTrainerStartIso,
  trainerActivityType,
} from "./trainer-session";
import {
  EAR_EXERCISES,
  type EarAnswer,
  type EarExercise,
  type EarPrompt,
  FRETBOARD_EXERCISES,
  type FretboardExercise,
  type FretboardPrompt,
  choosePrompt,
  isEarAnswerCorrect,
  isFretboardAnswerCorrect,
  trainerProgressPatch,
} from "./trainers";

export function ProgressPage() {
  const chordBests = useProgress((state) => state.chordBests);
  const transitionBests = useProgress((state) => state.transitionBests);
  const progressItems = useProgress((state) => state.progressItems);
  const sessions = useProgress((state) => state.sessions);
  const dashboard = useMemo(
    () => buildProgressDashboard({ chordBests, transitionBests, progressItems, sessions }),
    [chordBests, transitionBests, progressItems, sessions],
  );
  const skills = useMemo(() => buildSkillStates(progressItems), [progressItems]);

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Local mastery, weak spots, streaks, challenges, and review prompts from saved practice.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="7-day minutes" value={dashboard.practiceMinutes7d.toString()} />
        <Metric label="30-day minutes" value={dashboard.practiceMinutes30d.toString()} />
        <Metric label="Streak" value={`${dashboard.streakDays} days`} />
        <Metric label="Mastered skills" value={dashboard.masteredCount.toString()} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <RecapPanel recap={dashboard.recaps.weekly} />
        <RecapPanel recap={dashboard.recaps.monthly} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-white/5 bg-panel p-5">
            <h2 className="text-lg font-semibold">Skill mastery</h2>
            <div className="mt-4 space-y-3">
              {skills.map((skill) => (
                <div key={skill.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span>{skill.title}</span>
                    <span className="text-muted">{skill.status.replace("-", " ")}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full bg-accent" style={{ width: `${skill.mastery}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/5 bg-panel p-5">
            <h2 className="text-lg font-semibold">Ear and fretboard trainers</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <EarTrainer />
              <FretboardTrainer />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <Panel title="Recommendations" items={dashboard.recommendations} />
          <Panel title="Current blockers" items={dashboard.blockers} />
          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Challenges</h2>
            <div className="mt-3 space-y-3">
              {dashboard.challenges.map((challenge) => (
                <div key={challenge.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{challenge.title}</span>
                    <span
                      className={clsx(
                        challenge.status === "complete" ? "text-accent" : "text-muted",
                      )}
                    >
                      {challenge.status}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.round(challenge.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function RecapPanel({ recap }: { recap: ProgressRecap }) {
  return (
    <section className="rounded-lg border border-white/5 bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{recap.title}</h2>
          <p className="mt-1 text-sm text-muted">{recap.consistency}</p>
        </div>
        <div className="text-right text-sm text-muted">
          <div className="text-2xl font-semibold text-ink tabular-nums">{recap.practiceDays}</div>
          <div>{recap.periodDays} days</div>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <RecapRow
          label="Practice"
          value={`${recap.practiceMinutes}m · ${recap.sessionCount} sessions`}
        />
        <RecapRow label="Best improvement" value={recap.bestImprovement} />
        <RecapRow label="Current blocker" value={recap.currentBlocker} />
        <RecapRow label="Next focus" value={recap.suggestedFocus} />
      </dl>
    </section>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Panel({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="rounded-lg border border-white/5 bg-panel p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function EarTrainer() {
  const upsert = useProgress((state) => state.upsertProgressItem);
  const saveSession = useProgress((state) => state.saveSession);
  const settings = useSettings();
  const [exerciseId, setExerciseId] = useState(EAR_EXERCISES[0]!.id);
  const exercise = EAR_EXERCISES.find((item) => item.id === exerciseId) ?? EAR_EXERCISES[0]!;
  const [prompt, setPrompt] = useState<EarPrompt | null>(null);
  const [promptStartedAtIso, setPromptStartedAtIso] = useState<string | null>(null);
  const [result, setResult] = useState<{ answer: EarAnswer; correct: boolean } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function playNext() {
    const nextPrompt = choosePrompt(exercise.prompts);
    setPrompt(nextPrompt);
    setPromptStartedAtIso(new Date().toISOString());
    setResult(null);
    setSyncError(null);
    await playMidiGroups(nextPrompt.midiGroups);
  }

  async function answer(choice: EarAnswer) {
    if (!prompt || result) return;
    const correct = isEarAnswerCorrect(prompt, choice);
    const patch = trainerProgressPatch({
      correct,
      itemType: "ear-training",
      itemId: prompt.itemId,
      promptId: prompt.id,
      answer: choice,
      expected: prompt.answer,
    });
    const sessionId = crypto.randomUUID();
    const startedAtIso = promptStartedAtIso ?? fallbackTrainerStartIso();
    const endedAtIso = new Date().toISOString();
    const metadata = buildTrainerSessionMetadata({
      correct,
      kind: "ear-training",
      patch,
      title: exercise.title,
      details: {
        exerciseId: exercise.id,
        promptDetail: prompt.detail,
        midiGroups: prompt.midiGroups,
      },
    });
    setResult({ answer: choice, correct });
    try {
      await upsert(patch);
      await saveSession(
        buildTrainerSessionSummary({
          correct,
          endedAtIso,
          id: sessionId,
          kind: "ear-training",
          startedAtIso,
          title: exercise.title,
        }),
      );
    } catch (err) {
      console.error("ear trainer progress save failed", err);
      setSyncError(err instanceof Error ? err.message : "Could not save trainer progress.");
      return;
    }

    const syncResult = await syncBackendTrainerSession({
      endedAtIso,
      kind: "ear-training",
      metadata,
      sessionId,
      settings,
      startedAtIso,
    });
    if (!syncResult.synced) {
      console.error("ear trainer backend sync failed", syncResult.error);
      setSyncError("Saved locally; backend sync will retry automatically.");
    }
  }

  return (
    <div className="rounded-md border border-white/10 p-4">
      <h3 className="font-medium">Ear trainer</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {EAR_EXERCISES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectExercise(item)}
            className={clsx(
              "rounded-md border px-3 py-1.5 text-sm",
              exercise.id === item.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-white/10 text-muted",
            )}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={playNext}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface"
        >
          {prompt ? "Play new" : "Play"}
        </button>
        {exercise.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => answer(option)}
            disabled={!prompt || result !== null}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-muted"
          >
            {answerLabel(option)}
          </button>
        ))}
      </div>
      {result && prompt && (
        <p className={clsx("mt-3 text-sm", result.correct ? "text-accent" : "text-warn")}>
          {result.correct ? "Correct" : `Answer: ${answerLabel(prompt.answer)}`}
        </p>
      )}
      {syncError && <p className="mt-2 text-sm text-bad">{syncError}</p>}
    </div>
  );

  function selectExercise(nextExercise: EarExercise) {
    setExerciseId(nextExercise.id);
    setPrompt(null);
    setPromptStartedAtIso(null);
    setResult(null);
    setSyncError(null);
  }
}

function FretboardTrainer() {
  const upsert = useProgress((state) => state.upsertProgressItem);
  const saveSession = useProgress((state) => state.saveSession);
  const settings = useSettings();
  const [exerciseId, setExerciseId] = useState(FRETBOARD_EXERCISES[0]!.id);
  const exercise =
    FRETBOARD_EXERCISES.find((item) => item.id === exerciseId) ?? FRETBOARD_EXERCISES[0]!;
  const [index, setIndex] = useState(0);
  const prompt = exercise.prompts[index % exercise.prompts.length]!;
  const [promptStartedAtIso, setPromptStartedAtIso] = useState(new Date().toISOString());
  const [selectedFret, setSelectedFret] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; prompt: FretboardPrompt } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function submit() {
    if (selectedFret == null || result) return;
    const correct = isFretboardAnswerCorrect(prompt, selectedFret);
    const patch = trainerProgressPatch({
      correct,
      itemType: "fretboard",
      itemId: prompt.itemId,
      promptId: prompt.id,
      answer: selectedFret,
      expected: prompt.fret,
    });
    const sessionId = crypto.randomUUID();
    const endedAtIso = new Date().toISOString();
    const metadata = buildTrainerSessionMetadata({
      correct,
      kind: "fretboard",
      patch,
      title: "Fretboard notes",
      details: {
        exerciseId: exercise.id,
        note: prompt.note,
        string: prompt.string,
        fret: prompt.fret,
        question: prompt.question,
      },
    });
    setResult({ correct, prompt });
    try {
      await upsert(patch);
      await saveSession(
        buildTrainerSessionSummary({
          correct,
          endedAtIso,
          id: sessionId,
          kind: "fretboard",
          startedAtIso: promptStartedAtIso,
          title: exercise.title,
        }),
      );
    } catch (err) {
      console.error("fretboard trainer progress save failed", err);
      setSyncError(err instanceof Error ? err.message : "Could not save trainer progress.");
      return;
    }

    const syncResult = await syncBackendTrainerSession({
      endedAtIso,
      kind: "fretboard",
      metadata,
      sessionId,
      settings,
      startedAtIso: promptStartedAtIso,
    });
    if (!syncResult.synced) {
      console.error("fretboard trainer backend sync failed", syncResult.error);
      setSyncError("Saved locally; backend sync will retry automatically.");
    }
  }

  function next() {
    setIndex((current) => current + 1);
    setSelectedFret(null);
    setResult(null);
    setSyncError(null);
    setPromptStartedAtIso(new Date().toISOString());
  }

  return (
    <div className="rounded-md border border-white/10 p-4">
      <h3 className="font-medium">Fretboard trainer</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {FRETBOARD_EXERCISES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectExercise(item)}
            className={clsx(
              "rounded-md border px-3 py-1.5 text-sm",
              exercise.id === item.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-white/10 text-muted",
            )}
          >
            {item.title}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{prompt.question}</p>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {Array.from({ length: 13 }, (_, fret) => (
          <button
            key={fret}
            type="button"
            disabled={result !== null}
            onClick={() => setSelectedFret(fret)}
            className={clsx(
              "rounded border px-2 py-1.5 text-sm tabular-nums",
              selectedFret === fret
                ? "border-accent bg-accent/10 text-accent"
                : "border-white/10 text-muted",
            )}
          >
            {fret}
          </button>
        ))}
      </div>
      {result && (
        <p className={clsx("mt-3 text-sm", result.correct ? "text-accent" : "text-warn")}>
          {result.correct ? "Correct" : `Answer: fret ${result.prompt.fret}`}
        </p>
      )}
      {syncError && <p className="mt-2 text-sm text-bad">{syncError}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={selectedFret == null || result !== null}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={next}
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-muted"
        >
          Next
        </button>
      </div>
    </div>
  );

  function selectExercise(nextExercise: FretboardExercise) {
    setExerciseId(nextExercise.id);
    setIndex(0);
    setSelectedFret(null);
    setResult(null);
    setSyncError(null);
    setPromptStartedAtIso(new Date().toISOString());
  }
}

async function syncBackendTrainerSession(input: {
  endedAtIso: string;
  kind: TrainerSessionKind;
  metadata: Record<string, unknown>;
  sessionId: string;
  settings: ReturnType<typeof useSettings.getState>;
  startedAtIso: string;
}): Promise<{ synced: boolean; queued: boolean; error: string | null }> {
  return syncLearningSessionOrQueue(
    {
      sessionId: input.sessionId,
      activityType: trainerActivityType(input.kind),
      endedAtIso: input.endedAtIso,
      metadata: input.metadata,
      startedAtIso: input.startedAtIso,
    },
    input.settings,
  );
}

async function playMidiGroups(midiGroups: number[][]): Promise<void> {
  const ctx = new AudioContext();
  const out = ctx.createGain();
  out.gain.value = 0.25;
  out.connect(ctx.destination);
  const start = ctx.currentTime + 0.04;
  const groupDuration = 0.72;
  midiGroups.forEach((midis, groupIndex) => {
    const groupStart = start + groupIndex * groupDuration;
    midis.forEach((midi, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = midiToHz(midi);
      gain.gain.setValueAtTime(0.0001, groupStart + index * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.4, groupStart + index * 0.025 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, groupStart + 0.62);
      osc.connect(gain).connect(out);
      osc.start(groupStart + index * 0.025);
      osc.stop(groupStart + 0.66);
    });
  });
  await new Promise((resolve) =>
    window.setTimeout(resolve, Math.max(900, midiGroups.length * groupDuration * 1000 + 120)),
  );
  await ctx.close();
}

function answerLabel(answer: EarAnswer): string {
  return answer;
}
