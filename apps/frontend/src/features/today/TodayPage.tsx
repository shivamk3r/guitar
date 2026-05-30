import { LESSONS_BY_ID } from "@/data/curriculum";
import { buildPracticePlanOptions, buildSkillStates } from "@/lib/coaching";
import type { SettingsRow } from "@/storage/db";
import { profileSyncPayloadFromSettings, syncProfileOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { clsx } from "@/ui/clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Draft = Pick<
  SettingsRow,
  | "displayName"
  | "skillLevel"
  | "goals"
  | "handedness"
  | "instrumentPreference"
  | "dailyPracticeTargetMinutes"
  | "preferredGenres"
  | "recordingConsentGranted"
>;

const GOAL_OPTIONS = [
  "Build a complete beginner foundation",
  "Play full songs",
  "Improve rhythm",
  "Learn lead guitar",
  "Understand theory",
  "Train my ear",
];

const GENRE_OPTIONS = ["folk", "rock", "blues", "pop", "country", "worship", "indie"];

export function TodayPage() {
  const settings = useSettings();
  const progress = useProgress();
  const [selectedMinutes, setSelectedMinutes] = useState<10 | 20 | 45>(20);

  const planOptions = useMemo(
    () =>
      buildPracticePlanOptions({
        settings,
        chordBests: progress.chordBests,
        transitionBests: progress.transitionBests,
        progressItems: progress.progressItems,
      }),
    [settings, progress.chordBests, progress.transitionBests, progress.progressItems],
  );
  const selectedPlan =
    planOptions.find((option) => option.minutes === selectedMinutes) ?? planOptions[1]!;
  const skillStates = useMemo(
    () => buildSkillStates(progress.progressItems),
    [progress.progressItems],
  );
  const nextSkill = skillStates.find((skill) =>
    ["review", "in-progress", "ready"].includes(skill.status),
  );

  if (!settings.hydrated || !progress.hydrated) {
    return <div className="text-muted">Loading local coach...</div>;
  }

  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {settings.onboardingCompleted
              ? `${settings.displayName}, start with the plan below and keep the loop small.`
              : "Set up the local learner profile so Guitar Coach can choose your first path."}
          </p>
        </div>
        {settings.onboardingCompleted && (
          <Link to="/settings" className="text-sm text-accent hover:underline">
            Edit profile
          </Link>
        )}
      </header>

      {!settings.onboardingCompleted ? (
        <OnboardingPanel />
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="rounded-lg border border-white/5 bg-panel p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Daily plan</h2>
                  <p className="text-sm text-muted">
                    Target: {settings.dailyPracticeTargetMinutes} minutes ·{" "}
                    {settings.skillLevel.replace("-", " ")}
                  </p>
                </div>
                <div
                  className="flex rounded-md border border-white/10 p-1"
                  aria-label="Plan length"
                >
                  {planOptions.map((option) => (
                    <button
                      key={option.minutes}
                      type="button"
                      onClick={() => setSelectedMinutes(option.minutes)}
                      className={clsx(
                        "rounded px-3 py-1.5 text-sm",
                        selectedMinutes === option.minutes
                          ? "bg-accent text-surface"
                          : "text-muted hover:text-ink",
                      )}
                    >
                      {option.minutes}m
                    </button>
                  ))}
                </div>
              </div>

              <ol className="space-y-3">
                {selectedPlan.tasks.map((task, index) => (
                  <li
                    key={task.id}
                    className="grid gap-3 rounded-md border border-white/10 p-3 sm:grid-cols-[44px_minmax(0,1fr)_auto]"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded border border-white/10 text-sm tabular-nums text-muted">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{task.title}</div>
                      <div className="mt-1 text-sm text-muted">{task.reason}</div>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <span className="text-sm tabular-nums text-muted">{task.minutes}m</span>
                      <Link
                        to={task.route}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface"
                      >
                        Start
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="rounded-lg border border-white/5 bg-panel p-5">
              <h2 className="text-lg font-semibold">Next skill</h2>
              {nextSkill ? (
                <div className="mt-3">
                  <div className="text-sm uppercase tracking-wide text-muted">{nextSkill.area}</div>
                  <div className="mt-1 text-xl font-semibold">{nextSkill.title}</div>
                  <p className="mt-2 text-sm leading-6 text-muted">{nextSkill.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {nextSkill.lessonIds.map((lessonId) => {
                      const lesson = LESSONS_BY_ID[lessonId];
                      return lesson ? (
                        <Link
                          key={lessonId}
                          to={`/learn/lessons/${lessonId}`}
                          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-accent"
                        >
                          {lesson.title}
                        </Link>
                      ) : null;
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">Everything is in review. Pick any song.</p>
              )}
            </aside>
          </section>

          <SkillTreePreview skills={skillStates} />
        </>
      )}
    </section>
  );
}

function OnboardingPanel() {
  const settings = useSettings();
  const [draft, setDraft] = useState<Draft>({
    displayName: settings.displayName,
    skillLevel: settings.skillLevel,
    goals: settings.goals,
    handedness: settings.handedness,
    instrumentPreference: settings.instrumentPreference,
    dailyPracticeTargetMinutes: settings.dailyPracticeTargetMinutes,
    preferredGenres: settings.preferredGenres,
    recordingConsentGranted: settings.recordingConsentGranted,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSyncWarning(null);
    const nowIso = new Date().toISOString();
    const consentChanged = draft.recordingConsentGranted !== settings.recordingConsentGranted;
    const localPatch = {
      ...draft,
      onboardingCompleted: true,
      profileUpdatedIso: nowIso,
      recordingConsentUpdatedIso: consentChanged ? nowIso : settings.recordingConsentUpdatedIso,
    };
    try {
      await settings.update(localPatch);
    } catch (err) {
      console.error("local profile setup failed", err);
      setError(err instanceof Error ? err.message : "Could not save the local learner profile.");
      setSaving(false);
      return;
    }

    const syncResult = await syncProfileOrQueue(
      profileSyncPayloadFromSettings(
        {
          ...settings,
          ...localPatch,
        },
        { consentChanged, consentSource: "onboarding" },
      ),
      useSettings.getState(),
    );
    if (!syncResult.synced) {
      console.error("profile backend sync failed", syncResult.error);
      setSyncWarning("Profile saved locally; backend sync will retry automatically.");
    }
    setSaving(false);
  }

  return (
    <section className="rounded-lg border border-white/5 bg-panel p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-muted">Display name</span>
            <input
              value={draft.displayName}
              onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
              className="mt-1 w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Skill level</span>
              <select
                value={draft.skillLevel}
                onChange={(event) =>
                  setDraft({ ...draft, skillLevel: event.target.value as Draft["skillLevel"] })
                }
                className="mt-1 w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              >
                <option value="new">New</option>
                <option value="beginner">Beginner</option>
                <option value="late-beginner">Late beginner</option>
                <option value="early-intermediate">Early intermediate</option>
                <option value="intermediate">Intermediate</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Daily target</span>
              <input
                type="number"
                min={5}
                max={180}
                value={draft.dailyPracticeTargetMinutes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dailyPracticeTargetMinutes: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Handedness</span>
              <select
                value={draft.handedness}
                onChange={(event) =>
                  setDraft({ ...draft, handedness: event.target.value as Draft["handedness"] })
                }
                className="mt-1 w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              >
                <option value="right">Right-handed</option>
                <option value="left">Left-handed</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Guitar</span>
              <select
                value={draft.instrumentPreference}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    instrumentPreference: event.target.value as Draft["instrumentPreference"],
                  })
                }
                className="mt-1 w-full rounded border border-white/10 bg-surface px-3 py-2 text-ink"
              >
                <option value="acoustic">Acoustic</option>
                <option value="electric">Electric</option>
                <option value="both">Both</option>
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-5">
          <ChoiceGroup
            title="Goals"
            options={GOAL_OPTIONS}
            selected={draft.goals}
            onChange={(goals) => setDraft({ ...draft, goals })}
          />
          <ChoiceGroup
            title="Preferred genres"
            options={GENRE_OPTIONS}
            selected={draft.preferredGenres}
            onChange={(preferredGenres) => setDraft({ ...draft, preferredGenres })}
          />
          <label className="flex items-start gap-3 rounded-md border border-white/10 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.recordingConsentGranted}
              onChange={(event) =>
                setDraft({ ...draft, recordingConsentGranted: event.target.checked })
              }
            />
            <span>
              <span className="block text-ink">Enable local recording analysis</span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                Audio uploads only to the local API and only after consent. Metadata still saves
                with consent off.
              </span>
            </span>
          </label>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
      {syncWarning && <p className="mt-4 text-sm text-warn">{syncWarning}</p>}
      <div className="mt-5 flex justify-end">
        <Button onClick={saveProfile} disabled={saving || draft.displayName.trim().length === 0}>
          {saving ? "Saving..." : "Create local profile"}
        </Button>
      </div>
    </section>
  );
}

function ChoiceGroup({
  onChange,
  options,
  selected,
  title,
}: {
  onChange: (values: string[]) => void;
  options: string[];
  selected: string[];
  title: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-muted">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(
                  active ? selected.filter((item) => item !== option) : [...selected, option],
                )
              }
              className={clsx(
                "rounded-md border px-3 py-1.5 text-sm",
                active
                  ? "border-accent/70 bg-accent/10 text-accent"
                  : "border-white/10 text-muted hover:text-ink",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SkillTreePreview({ skills }: { skills: ReturnType<typeof buildSkillStates> }) {
  return (
    <section>
      <h2 className="mb-3 text-sm uppercase tracking-wide text-muted">Learning path</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <Link
            key={skill.id}
            to={skill.lessonIds[0] ? `/learn/lessons/${skill.lessonIds[0]}` : skill.practiceRoute}
            className={clsx(
              "rounded-lg border p-4 transition-colors",
              skill.status === "locked"
                ? "border-white/5 bg-panel/50 text-muted"
                : "border-white/10 bg-panel hover:border-white/25",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">{skill.area}</div>
                <div className="mt-1 font-medium">{skill.title}</div>
              </div>
              <span className="rounded border border-white/10 px-2 py-0.5 text-xs text-muted">
                {skill.status.replace("-", " ")}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-accent" style={{ width: `${skill.mastery}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
