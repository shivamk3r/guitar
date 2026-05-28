import { ensureLearnerProfile, saveRecordingConsent } from "@/api/client";
import { TUNINGS } from "@/data/tunings";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { useState } from "react";

export function SettingsPage() {
  const settings = useSettings();
  const clearProgress = useProgress((s) => s.clear);
  const [dataError, setDataError] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  async function updateRecordingConsent(granted: boolean) {
    setDataError(null);
    setSavingConsent(true);
    try {
      const profile = await ensureLearnerProfile({
        learnerId: settings.learnerId,
        anonymousLearnerId: settings.anonymousLearnerId,
        onProfile: settings.update,
      });
      await saveRecordingConsent({
        learnerId: profile.id,
        granted,
        policyVersion: settings.recordingConsentPolicyVersion,
      });
      await settings.update({
        learnerId: profile.id,
        anonymousLearnerId: profile.anonymous_id,
        recordingConsentGranted: granted,
        recordingConsentUpdatedIso: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setDataError(err instanceof Error ? err.message : "Could not save recording consent.");
    } finally {
      setSavingConsent(false);
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-muted block mb-1">{label}</div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
