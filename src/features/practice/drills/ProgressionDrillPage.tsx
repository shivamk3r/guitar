import { type ChordDef, getChord } from "@/data/chords";
import { getProgression } from "@/data/progressions";
import { Link, useParams } from "react-router-dom";
import { DrillShell } from "./DrillShell";
import { useDrillSession } from "./useDrillSession";

export function ProgressionDrillPage() {
  const { id } = useParams<{ id: string }>();
  const progression = id ? getProgression(id) : undefined;

  if (!progression) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Progression not found</h1>
        <Link to="/practice" className="text-accent underline">
          Back
        </Link>
      </div>
    );
  }

  const chords = progression.chords.map((cid) => getChord(cid)).filter((c): c is ChordDef => !!c);

  return <ProgressionInner chords={chords} title={progression.name} bpm={progression.defaultBpm} />;
}

function ProgressionInner({
  chords,
  title,
  bpm,
}: {
  chords: ChordDef[];
  title: string;
  bpm: number;
}) {
  const session = useDrillSession({ chords, beatsPerChange: 4, bpm });
  if (chords.length === 0) return <div>Progression has no valid chords.</div>;
  const currentChord = chords[session.currentIndex % chords.length]!;
  const upcoming = chords[(session.currentIndex + 1) % chords.length] ?? null;
  return (
    <DrillShell
      title={title}
      subtitle={`${chords.map((c) => c.name).join(" · ")} — one chord per bar`}
      session={session}
      currentChord={currentChord}
      upcomingChord={upcoming}
    />
  );
}
