from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

DEFAULT_TUNING_MIDI = [40, 45, 50, 55, 59, 64]


@dataclass(frozen=True)
class ChordDef:
    id: str
    name: str
    root: str
    quality: str
    frets: tuple[int, int, int, int, int, int]
    played_midi: tuple[int | None, ...]
    chroma: NDArray[np.float64]


CHORD_INPUTS: tuple[tuple[str, str, str, str, tuple[int, int, int, int, int, int]], ...] = (
    ("C", "C", "C", "major", (-1, 3, 2, 0, 1, 0)),
    ("G", "G", "G", "major", (3, 2, 0, 0, 0, 3)),
    ("D", "D", "D", "major", (-1, -1, 0, 2, 3, 2)),
    ("A", "A", "A", "major", (-1, 0, 2, 2, 2, 0)),
    ("E", "E", "E", "major", (0, 2, 2, 1, 0, 0)),
    ("F", "F (mini)", "F", "major", (-1, -1, 3, 2, 1, 1)),
    ("Am", "A minor", "A", "minor", (-1, 0, 2, 2, 1, 0)),
    ("Em", "E minor", "E", "minor", (0, 2, 2, 0, 0, 0)),
    ("Dm", "D minor", "D", "minor", (-1, -1, 0, 2, 3, 1)),
    ("G7", "G7", "G", "dom7", (3, 2, 0, 0, 0, 1)),
    ("D7", "D7", "D", "dom7", (-1, -1, 0, 2, 1, 2)),
    ("E7", "E7", "E", "dom7", (0, 2, 0, 1, 0, 0)),
    ("A7", "A7", "A", "dom7", (-1, 0, 2, 0, 2, 0)),
    ("B7", "B7", "B", "dom7", (-1, 2, 1, 2, 0, 2)),
    ("E5", "E5", "E", "power", (0, 2, 2, -1, -1, -1)),
    ("A5", "A5", "A", "power", (-1, 0, 2, 2, -1, -1)),
    ("D5", "D5", "D", "power", (-1, -1, 0, 2, 3, -1)),
)


def midi_for_frets(frets: tuple[int, int, int, int, int, int]) -> tuple[int | None, ...]:
    return tuple(None if fret < 0 else DEFAULT_TUNING_MIDI[index] + fret for index, fret in enumerate(frets))


def chroma_from_midi(midis: tuple[int | None, ...]) -> NDArray[np.float64]:
    chroma = np.zeros(12, dtype=np.float64)
    root_weight = 2.0
    for midi in midis:
        if midi is None:
            continue
        chroma[midi % 12] += root_weight
        root_weight = 1.0
    norm = np.linalg.norm(chroma)
    if norm > 1e-8:
        chroma /= norm
    return chroma


def make_chord(item: tuple[str, str, str, str, tuple[int, int, int, int, int, int]]) -> ChordDef:
    chord_id, name, root, quality, frets = item
    played_midi = midi_for_frets(frets)
    return ChordDef(
        id=chord_id,
        name=name,
        root=root,
        quality=quality,
        frets=frets,
        played_midi=played_midi,
        chroma=chroma_from_midi(played_midi),
    )


CHORDS = tuple(make_chord(item) for item in CHORD_INPUTS)
CHORDS_BY_ID = {chord.id: chord for chord in CHORDS}
SUPPORTED_CHORD_ID_LIST = sorted(CHORDS_BY_ID)
