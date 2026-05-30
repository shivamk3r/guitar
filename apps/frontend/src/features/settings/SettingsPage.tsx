import { ensureLearnerProfile, fetchLearnerExport } from "@/api/client";
import { TUNINGS } from "@/data/tunings";
import { buildIndexedDbAccountExport } from "@/storage/local-account-export";
import { profileSyncPayloadFromSettings, syncProfileOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { useState } from "react";

export function SettingsPage() {
  const settings = useSettings();
  const clearProgress = useProgress((s) => s.clear);
  const [dataError, setDataError] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);

  async function updateRecordingConsent(granted: boolean) {
    setDataError(null);
    setDataMessage(null);
    setSavingConsent(true);
    const nowIso = new Date().toISOString();
    const localPatch = {
      recordingConsentGranted: granted,
      recordingConsentUpdatedIso: nowIso,
    };
    try {
      await settings.update(localPatch);
    } catch (err) {
      console.error(err);
      setSavingConsent(false);
      setDataError(err instanceof Error ? err.message : "Could not save recording consent.");
      return;
    }
    const syncResult = await syncProfileOrQueue(
      profileSyncPayloadFromSettings(
        {
          ...settings,
          ...localPatch,
        },
        { consentChanged: true, consentSource: "settings" },
      ),
      useSettings.getState(),
    );
    if (!syncResult.synced) {
      console.error("recording consent backend sync failed", syncResult.error);
      setDataMessage("Consent saved locally; backend sync will retry automatically.");
    }
    setSavingConsent(false);
  }

  async function saveProfile() {
    setDataError(null);
    setDataMessage(null);
    setSavingProfile(true);
    const localPatch = {
      onboardingCompleted: true,
      profileUpdatedIso: new Date().toISOString(),
    };
    try {
      await settings.update(localPatch);
    } catch (err) {
      console.error(err);
      setSavingProfile(false);
      setDataError(err instanceof Error ? err.message : "Could not save learner profile.");
      return;
    }
    const syncResult = await syncProfileOrQueue(
      profileSyncPayloadFromSettings(
        {
          ...settings,
          ...localPatch,
        },
        { consentChanged: false, consentSource: "settings" },
      ),
      useSettings.getState(),
    );
    if (!syncResult.synced) {
      console.error("profile backend sync failed", syncResult.error);
      setDataMessage("Profile saved locally; backend sync will retry automatically.");
    }
    setSavingProfile(false);
  }

  async function exportLocalAccount() {
    setDataError(null);
    setDataMessage(null);
    setExporting(true);
    try {
      const indexeddb = await buildIndexedDbAccountExport(settings);
      let backend = null;
      try {
        const profile = await ensureLearnerProfile({
          learnerId: settings.learnerId,
          anonymousLearnerId: settings.anonymousLearnerId,
          onProfile: settings.update,
        });
        backend = await fetchLearnerExport(profile.id);
      } catch (err) {
        console.error("backend export unavailable", err);
      }
      const data = {
        source: backend ? "backend-and-indexeddb" : "indexeddb",
        generated_at: new Date().toISOString(),
        backend_available: backend !== null,
        backend,
        indexeddb,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `guitar-coach-local-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      if (!backend) {
        setDataMessage("Exported IndexedDB account data; backend export was unavailable.");
      }
    } catch (err) {
      console.error(err);
      setDataError(err instanceof Error ? err.message : "Could not export local account data.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted text-sm mt-1">
          Control tuning defaults, local practice history, and consented session recording.
        </p>
      </header>

      <div className="space-y-6 max-w-xl">
        <div className="pb-6 border-b border-white/10">
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Profile</h2>
          <div className="space-y-4">
            <Field label="Display name">
              <input
                className="w-full rounded border border-white/10 bg-panel px-2 py-1 text-ink"
                value={settings.displayName}
                onChange={(event) => settings.update({ displayName: event.target.value })}
              />
            </Field>
            <Field label="Skill level">
              <select
                className="bg-panel border border-white/10 rounded px-2 py-1 text-ink"
                value={settings.skillLevel}
                onChange={(event) =>
                  settings.update({
                    skillLevel: event.target.value as typeof settings.skillLevel,
                  })
                }
              >
                <option value="new">New</option>
                <option value="beginner">Beginner</option>
                <option value="late-beginner">Late beginner</option>
                <option value="early-intermediate">Early intermediate</option>
                <option value="intermediate">Intermediate</option>
              </select>
            </Field>
            <Field label="Daily target">
              <input
                type="number"
                min={5}
                max={180}
                className="w-24 rounded border border-white/10 bg-panel px-2 py-1 text-ink"
                value={settings.dailyPracticeTargetMinutes}
                onChange={(event) =>
                  settings.update({ dailyPracticeTargetMinutes: Number(event.target.value) })
                }
              />
              <span className="ml-2 text-xs text-muted">minutes</span>
            </Field>
            <Field label="Handedness">
              <select
                className="bg-panel border border-white/10 rounded px-2 py-1 text-ink"
                value={settings.handedness}
                onChange={(event) =>
                  settings.update({ handedness: event.target.value as typeof settings.handedness })
                }
              >
                <option value="right">Right-handed</option>
                <option value="left">Left-handed</option>
              </select>
            </Field>
            <Field label="Guitar">
              <select
                className="bg-panel border border-white/10 rounded px-2 py-1 text-ink"
                value={settings.instrumentPreference}
                onChange={(event) =>
                  settings.update({
                    instrumentPreference: event.target
                      .value as typeof settings.instrumentPreference,
                  })
                }
              >
                <option value="acoustic">Acoustic</option>
                <option value="electric">Electric</option>
                <option value="both">Both</option>
              </select>
            </Field>
            <Field label="Goals">
              <input
                className="w-full rounded border border-white/10 bg-panel px-2 py-1 text-ink"
                value={settings.goals.join(", ")}
                onChange={(event) => settings.update({ goals: parseList(event.target.value) })}
              />
            </Field>
            <Field label="Genres">
              <input
                className="w-full rounded border border-white/10 bg-panel px-2 py-1 text-ink"
                value={settings.preferredGenres.join(", ")}
                onChange={(event) =>
                  settings.update({ preferredGenres: parseList(event.target.value) })
                }
              />
            </Field>
            <Button variant="secondary" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </div>

        <Field label="Default tuning">
          <select
            className="bg-panel border border-white/10 rounded px-2 py-1 text-ink"
            value={settings.tuningId}
            onChange={(e) => settings.update({ tuningId: e.target.value })}
          >
            {TUNINGS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Audible metronome">
          <input
            type="checkbox"
            aria-label="Audible metronome"
            checked={settings.metronomeAudible}
            onChange={(e) => settings.update({ metronomeAudible: e.target.checked })}
          />
          <span className="ml-2 text-xs text-muted">
            Off by default — headphones recommended for accurate feedback.
          </span>
        </Field>

        <Field label="Metronome mode">
          <select
            className="bg-panel border border-white/10 rounded px-2 py-1 text-ink"
            value={settings.metronomeMode}
            onChange={(event) =>
              settings.update({
                metronomeMode: event.target.value as typeof settings.metronomeMode,
              })
            }
          >
            <option value="normal">Normal click</option>
            <option value="accented">Accented beat</option>
            <option value="silent-bars">Silent bars</option>
            <option value="groove">Basic groove</option>
          </select>
        </Field>

        <Field label="Metronome volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.metronomeVolume}
            onChange={(e) => settings.update({ metronomeVolume: Number(e.target.value) })}
          />
          <span className="ml-3 text-xs text-muted tabular-nums">
            {Math.round(settings.metronomeVolume * 100)}%
          </span>
        </Field>

        <div className="pt-6 border-t border-white/10">
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Data</h2>
          <label className="flex items-start gap-3 mb-4 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings.recordingConsentGranted}
              disabled={savingConsent}
              onChange={(e) => updateRecordingConsent(e.target.checked)}
            />
            <span>
              <span className="block text-ink">Record tuning and practice sessions</span>
              <span className="block text-xs text-muted mt-1">
                With consent, completed session audio is uploaded to the local backend so future
                analysis can guide your progress.
              </span>
            </span>
          </label>
          {dataError && <p className="text-bad text-xs mb-4">{dataError}</p>}
          {dataMessage && <p className="text-accent text-xs mb-4">{dataMessage}</p>}
          <div className="mb-3">
            <Button variant="secondary" onClick={exportLocalAccount} disabled={exporting}>
              {exporting ? "Exporting..." : "Export local account data"}
            </Button>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Clear all local practice history? This cannot be undone.")) {
                clearProgress();
              }
            }}
          >
            Clear practice history
          </Button>
        </div>
      </div>
    </section>
  );
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-muted block mb-1">{label}</div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
