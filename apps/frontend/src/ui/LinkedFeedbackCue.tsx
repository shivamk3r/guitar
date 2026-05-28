import { LearnTermLink } from "./LearnTermLink";

const STRING_NAMES = ["low E", "high E", "A", "D", "G", "B"] as const;

export function LinkedFeedbackCue({ cue }: { cue: string }) {
  if (cue === "no chord detected") {
    return (
      <>
        no <LearnTermLink termId="chord">chord</LearnTermLink> detected
      </>
    );
  }

  if (cue.includes("pitch")) {
    return (
      <>
        {cue.replace("pitch", "")}
        <LearnTermLink termId="pitch">pitch</LearnTermLink>
      </>
    );
  }

  if (cue.startsWith("late by ") || cue.startsWith("early by ")) {
    return (
      <>
        {cue} from the <LearnTermLink termId="beat">beat</LearnTermLink>
      </>
    );
  }

  const stringName = STRING_NAMES.find((name) => cue.startsWith(`${name} `));
  if (stringName) {
    return (
      <>
        <LearnTermLink termId="string">{stringName}</LearnTermLink>
        {cue.slice(stringName.length)}
      </>
    );
  }

  return <>{cue}</>;
}
