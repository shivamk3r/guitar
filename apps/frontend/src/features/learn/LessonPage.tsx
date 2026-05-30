import { type Lesson, getLesson, lessonProgress } from "@/data/curriculum";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { clsx } from "@/ui/clsx";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  buildLessonSessionMetadata,
  buildLessonSessionSummary,
  fallbackLessonStartIso,
} from "./lesson-session";

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const lesson = getLesson(lessonId);
  const settings = useSettings();
  const progressItems = useProgress((state) => state.progressItems);
  const completeLesson = useProgress((state) => state.completeLesson);
  const saveSession = useProgress((state) => state.saveSession);
  const completed = useMemo(
    () => (lesson ? lessonProgress(progressItems, lesson.id)?.status === "mastered" : false),
    [lesson, progressItems],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  if (!lesson) {
    return (
      <section>
        <h1 className="text-xl font-semibold">Lesson not found</h1>
        <Link to="/learn" className="mt-3 inline-block text-accent underline">
          Back to Learn
        </Link>
      </section>
    );
  }

  async function handleComplete() {
    if (!lesson) return;
    setSaving(true);
    setError(null);
    setSyncWarning(null);
    const sessionId = crypto.randomUUID();
    const endedAtIso = new Date().toISOString();
    const startedAtIso = fallbackLessonStartIso(lesson.estimatedMinutes);
    const metadata = buildLessonSessionMetadata({
      lesson,
      minutes: lesson.estimatedMinutes,
    });
    try {
      await completeLesson(lesson.id, lesson.estimatedMinutes);
      await saveSession(
        buildLessonSessionSummary({
          id: sessionId,
          lesson,
          startedAtIso,
          endedAtIso,
        }),
      );
    } catch (err) {
      console.error("lesson completion failed", err);
      setError(err instanceof Error ? err.message : "Could not save lesson progress.");
      setSaving(false);
      return;
    }

    const syncResult = await syncLearningSessionOrQueue(
      {
        sessionId,
        activityType: "lesson",
        endedAtIso,
        metadata,
        startedAtIso,
      },
      settings,
    );
    if (!syncResult.synced) {
      console.error("lesson backend sync failed", syncResult.error);
      setSyncWarning("Saved locally; backend sync will retry automatically.");
    }
    setSaving(false);
  }

  return (
    <section>
      <Link to="/learn" className="text-sm text-muted hover:text-ink">
        Back to Learn
      </Link>
      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm text-accent">{lesson.area}</div>
          <h1 className="text-3xl font-semibold">{lesson.title}</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-muted">{lesson.summary}</p>
        </div>
        <div className="rounded-md border border-white/10 px-3 py-2 text-sm text-muted">
          {lesson.estimatedMinutes} min
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {lesson.sections.map((section, index) => (
            <section
              key={section.heading}
              className="rounded-lg border border-white/5 bg-panel p-5"
            >
              <div className="text-xs uppercase tracking-wide text-muted">Step {index + 1}</div>
              <h2 className="mt-1 text-lg font-semibold">{section.heading}</h2>
              <p className="mt-3 text-sm leading-6 text-muted">{section.body}</p>
              <div className="mt-4 rounded-md border border-white/10 bg-surface/60 p-3 text-sm">
                {section.exercise}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <LessonVisual lesson={lesson} />

          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Outcomes</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {lesson.outcomes.map((outcome) => (
                <li key={outcome} className="flex gap-2">
                  <span className="text-accent">-</span>
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-white/5 bg-panel p-4">
            <h2 className="text-lg font-semibold">Next action</h2>
            <div className="mt-3 flex flex-col gap-2">
              {lesson.links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm text-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <Button
              className="mt-4 w-full justify-center"
              onClick={handleComplete}
              disabled={saving || completed}
            >
              {completed ? "Completed" : saving ? "Saving..." : "Mark lesson complete"}
            </Button>
            {error && <p className="mt-3 text-sm text-bad">{error}</p>}
            {syncWarning && <p className="mt-3 text-sm text-warn">{syncWarning}</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}

function LessonVisual({ lesson }: { lesson: Lesson }) {
  const cells = lesson.outcomes.slice(0, 3);
  return (
    <div
      className="rounded-lg border border-white/10 bg-panel p-4"
      role="img"
      aria-label={`${lesson.title} practice visual`}
    >
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, index) => (
          <div
            key={cell}
            className={clsx(
              "flex aspect-square items-center justify-center rounded-md border p-2 text-center text-xs",
              index === 0
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-white/10 bg-surface text-muted",
            )}
          >
            {cell.split(" ").slice(0, 4).join(" ")}
          </div>
        ))}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full w-2/3 bg-accent" />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        Move from understanding to a slow try, then save progress only when the idea is repeatable.
      </p>
    </div>
  );
}
