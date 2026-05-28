import { GLOSSARY_CATEGORIES, type GlossaryCategory, filterGlossaryTerms } from "@/data/glossary";
import { clsx } from "@/ui/clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type CategoryFilter = GlossaryCategory | "All";

export function LearnPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const terms = useMemo(() => filterGlossaryTerms({ query, category }), [query, category]);

  return (
    <section>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Learn</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Beginner-friendly guitar words with tiny browser-only lessons, animations, and audio
            examples.
          </p>
        </div>
        <label className="text-sm text-muted">
          <span className="sr-only">Search glossary terms</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pitch, chord, tempo..."
            className="w-full rounded border border-white/10 bg-panel px-3 py-1.5 text-ink sm:w-72"
          />
        </label>
      </header>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Glossary categories">
        {(["All", ...GLOSSARY_CATEGORIES] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={category === option}
            onClick={() => setCategory(option)}
            className={clsx(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              category === option
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-white/10 bg-panel text-muted hover:text-ink",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {terms.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {terms.map((term) => (
            <Link
              key={term.id}
              to={`/learn/${term.id}`}
              className="flex min-h-40 flex-col rounded-lg border border-white/5 bg-panel p-4 transition-colors hover:border-white/15"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{term.term}</h2>
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs text-muted">
                  {term.category}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{term.shortDefinition}</p>
              <div className="mt-auto pt-4 text-sm text-accent">Open lesson</div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-white/5 bg-panel p-6 text-sm text-muted">
          No glossary terms match that search.
        </div>
      )}
    </section>
  );
}
