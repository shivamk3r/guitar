import {
  type GlossaryAudioExample,
  getGlossaryTerm,
  getRelatedGlossaryTerms,
} from "@/data/glossary";
import { Button } from "@/ui/Button";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConceptAnimation } from "./ConceptAnimation";
import { playGlossaryExample } from "./concept-audio";

export function ConceptPage() {
  const { id } = useParams<{ id: string }>();
  const term = getGlossaryTerm(id);

  if (!term) {
    return (
      <section>
        <h1 className="text-xl font-semibold">Lesson not found</h1>
        <Link to="/learn" className="mt-3 inline-block text-accent underline">
          Back to Learn
        </Link>
      </section>
    );
  }

  const related = getRelatedGlossaryTerms(term);

  return (
    <section>
      <Link to="/learn" className="text-sm text-muted hover:text-ink">
        Back to Learn
      </Link>
      <header className="mt-3 mb-6">
        <div className="mb-2 text-sm text-accent">{term.category}</div>
        <h1 className="text-3xl font-semibold">{term.term}</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-muted">{term.shortDefinition}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-white/5 bg-panel p-5">
            <h2 className="text-lg font-semibold">What it means</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted">
              {term.detail.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/5 bg-panel p-5">
            <h2 className="text-lg font-semibold">Inside Guitar Coach</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{term.encounter}</p>
            <p className="mt-3 text-xs leading-5 text-muted">
              This lesson runs entirely in the browser. It does not use the microphone or upload
              recordings.
            </p>
          </section>

          <section className="rounded-lg border border-white/5 bg-panel p-5">
            <h2 className="text-lg font-semibold">Related terms</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((relatedTerm) => (
                <Link
                  key={relatedTerm.id}
                  to={`/learn/${relatedTerm.id}`}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-muted hover:text-ink"
                >
                  {relatedTerm.term}
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <ConceptAnimation term={term} />
          <AudioExamples examples={term.audioExamples} />
        </div>
      </div>
    </section>
  );
}

function AudioExamples({ examples }: { examples: readonly GlossaryAudioExample[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePlay(example: GlossaryAudioExample) {
    setError(null);
    setPlayingId(example.id);
    try {
      await playGlossaryExample(example);
    } catch (err) {
      console.error("glossary audio failed", err);
      setError(err instanceof Error ? err.message : "Could not play the example.");
    } finally {
      setPlayingId(null);
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-panel p-4">
      <h2 className="text-lg font-semibold">Audio examples</h2>
      <div className="mt-3 space-y-2">
        {examples.map((example) => (
          <Button
            key={example.id}
            type="button"
            variant="secondary"
            className="w-full justify-between"
            onClick={() => handlePlay(example)}
            disabled={playingId != null}
          >
            <span>{example.label}</span>
            <span className="text-xs text-muted">
              {playingId === example.id ? "Playing" : "Play"}
            </span>
          </Button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </section>
  );
}
