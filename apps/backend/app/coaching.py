from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models


CURRICULUM_SKILLS: list[dict[str, Any]] = [
    {
        "id": "setup-tuning",
        "title": "Tune and hold stable pitch",
        "area": "Foundations",
        "level": "beginner",
        "description": "Use the tuner, recognize cents, and get all six strings stable.",
        "required_skill_ids": [],
        "lesson_ids": ["tuning-basics"],
        "practice": {"route": "/tools/tuner", "label": "Tune the guitar"},
        "target_ids": ["tuning"],
    },
    {
        "id": "read-chord-diagrams",
        "title": "Read chord diagrams",
        "area": "Foundations",
        "level": "beginner",
        "description": "Understand frets, fingers, open strings, muted strings, and chord notes.",
        "required_skill_ids": ["setup-tuning"],
        "lesson_ids": ["reading-chord-diagrams"],
        "practice": {"route": "/chords", "label": "Open chord library"},
        "target_ids": ["fret", "string", "chord"],
    },
    {
        "id": "first-open-chords",
        "title": "First open chords",
        "area": "Chords",
        "level": "beginner",
        "description": "Build clean G, C, D, Em, Am, A, and E shapes.",
        "required_skill_ids": ["read-chord-diagrams"],
        "lesson_ids": ["open-chords-1"],
        "practice": {"route": "/practice/timed-chords", "label": "Timed chord practice"},
        "target_ids": ["G", "C", "D", "Em", "Am", "A", "E"],
    },
    {
        "id": "clean-chord-changes",
        "title": "Clean chord transitions",
        "area": "Chords",
        "level": "beginner",
        "description": "Move between common open chords with less hesitation and fewer muted strings.",
        "required_skill_ids": ["first-open-chords"],
        "lesson_ids": ["chord-transition-basics"],
        "practice": {"route": "/practice/chord-change", "label": "Chord-change drill"},
        "target_ids": ["G->C", "C->D", "G->D", "Am->C"],
    },
    {
        "id": "steady-eighth-strums",
        "title": "Steady strumming",
        "area": "Rhythm",
        "level": "beginner",
        "description": "Count beats, play down/up eighth-note patterns, and stay with the click.",
        "required_skill_ids": ["setup-tuning"],
        "lesson_ids": ["rhythm-and-tempo", "strumming-foundations"],
        "practice": {"route": "/practice/strumming", "label": "Strumming drill"},
        "target_ids": ["classic", "down8", "8th-alt", "folk"],
    },
    {
        "id": "first-song",
        "title": "First complete song form",
        "area": "Songs",
        "level": "beginner",
        "description": "Practice a verse/chorus form with open chords, section looping, and slow tempo.",
        "required_skill_ids": ["clean-chord-changes", "steady-eighth-strums"],
        "lesson_ids": ["song-practice-basics"],
        "practice": {"route": "/songs/open-road-study", "label": "Open Road Study"},
        "target_ids": ["open-road-study"],
    },
    {
        "id": "barre-prep",
        "title": "Barre chord preparation",
        "area": "Technique",
        "level": "late-beginner",
        "description": "Strengthen first-finger pressure, mini-F shapes, muting, and clean partial barres.",
        "required_skill_ids": ["first-open-chords"],
        "lesson_ids": ["barre-chord-prep"],
        "practice": {"route": "/practice/timed-chords?chords=F", "label": "Mini-F checks"},
        "target_ids": ["F", "pressure", "muting"],
    },
    {
        "id": "power-chords",
        "title": "Power chords and muting",
        "area": "Technique",
        "level": "late-beginner",
        "description": "Play two- and three-note power chords while controlling unused strings.",
        "required_skill_ids": ["steady-eighth-strums"],
        "lesson_ids": ["power-chords-muting"],
        "practice": {"route": "/chords?query=power", "label": "Power chord shapes"},
        "target_ids": ["E5", "A5", "D5"],
    },
    {
        "id": "pentatonic-scale",
        "title": "Minor pentatonic scale",
        "area": "Lead",
        "level": "early-intermediate",
        "description": "Learn the first-box pattern, alternate picking, and simple call-and-response phrases.",
        "required_skill_ids": ["power-chords"],
        "lesson_ids": ["pentatonic-scale"],
        "practice": {"route": "/learn/lessons/pentatonic-scale", "label": "Scale lesson"},
        "target_ids": ["A-minor-pentatonic"],
    },
    {
        "id": "lead-techniques",
        "title": "Lead techniques",
        "area": "Lead",
        "level": "early-intermediate",
        "description": "Introduce slides, hammer-ons, pull-offs, bends, and vibrato with conservative tracking.",
        "required_skill_ids": ["pentatonic-scale"],
        "lesson_ids": ["lead-techniques"],
        "practice": {"route": "/learn/lessons/lead-techniques", "label": "Technique lesson"},
        "target_ids": ["slide", "bend", "vibrato", "hammer-on", "pull-off"],
    },
    {
        "id": "fingerstyle-basics",
        "title": "Fingerstyle basics",
        "area": "Technique",
        "level": "early-intermediate",
        "description": "Assign thumb and fingers, practice alternating bass, and play simple arpeggios.",
        "required_skill_ids": ["first-open-chords"],
        "lesson_ids": ["fingerstyle-intro"],
        "practice": {"route": "/learn/lessons/fingerstyle-intro", "label": "Fingerstyle intro"},
        "target_ids": ["PIMA", "alternating-bass"],
    },
    {
        "id": "fretboard-notes",
        "title": "Fretboard note knowledge",
        "area": "Fretboard",
        "level": "early-intermediate",
        "description": "Find notes across all six strings, then connect octave shapes.",
        "required_skill_ids": ["read-chord-diagrams"],
        "lesson_ids": ["fretboard-notes"],
        "practice": {"route": "/progress?focus=fretboard", "label": "Fretboard trainer"},
        "target_ids": [
            "low-e-notes",
            "a-string-notes",
            "d-string-notes",
            "g-string-notes",
            "b-string-notes",
            "high-e-notes",
            "octaves",
        ],
    },
    {
        "id": "ear-training",
        "title": "Ear training fundamentals",
        "area": "Ear",
        "level": "early-intermediate",
        "description": "Hear intervals, chord qualities, and simple I-IV-V movement.",
        "required_skill_ids": ["first-open-chords"],
        "lesson_ids": ["ear-training-basics"],
        "practice": {"route": "/progress?focus=ear", "label": "Ear trainer"},
        "target_ids": ["intervals", "major-minor", "chord-quality", "I-IV-V"],
    },
    {
        "id": "theory-for-guitar",
        "title": "Theory for guitarists",
        "area": "Theory",
        "level": "early-intermediate",
        "description": "Connect keys, scale degrees, chord families, and common progressions.",
        "required_skill_ids": ["fretboard-notes", "ear-training"],
        "lesson_ids": ["music-theory-basics"],
        "practice": {"route": "/learn/lessons/music-theory-basics", "label": "Theory lesson"},
        "target_ids": ["key", "scale-degree", "progression"],
    },
]


SEED_SONGS: list[dict[str, Any]] = [
    {
        "id": "open-road-study",
        "title": "Open Road Study",
        "origin": "App-authored original",
        "difficulty": "Beginner",
        "required_skill_ids": ["first-open-chords", "steady-eighth-strums"],
        "chords": ["G", "C", "D", "Em"],
        "tempo": 76,
        "strumming_pattern": "D D U U D U",
        "sections": [
            {"id": "verse", "name": "Verse", "bars": 8, "chords": ["G", "C", "G", "D"]},
            {"id": "chorus", "name": "Chorus", "bars": 8, "chords": ["Em", "C", "G", "D"]},
        ],
        "recommendation": "Best first song once G-C-D changes are mostly clean around 70 BPM.",
    },
    {
        "id": "steady-rain-waltz",
        "title": "Steady Rain Waltz",
        "origin": "App-authored original",
        "difficulty": "Beginner",
        "required_skill_ids": ["first-open-chords", "steady-eighth-strums"],
        "chords": ["C", "G", "Am", "F"],
        "tempo": 68,
        "strumming_pattern": "3/4: D - U D - U",
        "sections": [
            {"id": "a", "name": "A section", "bars": 8, "chords": ["C", "G", "Am", "F"]},
            {"id": "b", "name": "B section", "bars": 8, "chords": ["F", "C", "G", "C"]},
        ],
        "recommendation": "Use the mini-F shape and keep the waltz count relaxed.",
    },
    {
        "id": "twelve-bar-e",
        "title": "Twelve-Bar in E",
        "origin": "Traditional public-domain form",
        "difficulty": "Late beginner",
        "required_skill_ids": ["power-chords", "steady-eighth-strums"],
        "chords": ["E", "A", "B7", "E7", "A7"],
        "tempo": 84,
        "strumming_pattern": "Shuffle eighths",
        "sections": [
            {"id": "form", "name": "12-bar form", "bars": 12, "chords": ["E", "E", "E", "E7", "A", "A", "E", "E", "B7", "A7", "E", "B7"]},
        ],
        "recommendation": "Great for dominant 7ths, steady rhythm, and first blues vocabulary.",
    },
]


def build_skill_states(db: Session, learner_id: str) -> list[dict[str, Any]]:
    progress_items = list(
        db.scalars(select(models.LearnerProgressItem).where(models.LearnerProgressItem.learner_id == learner_id))
    )
    progress = {(item.item_type, item.item_id): item for item in progress_items}
    states: list[dict[str, Any]] = []
    state_by_id: dict[str, str] = {}
    for skill in CURRICULUM_SKILLS:
        item = progress.get(("skill", skill["id"]))
        lesson_items = [
            progress[("lesson", lesson_id)]
            for lesson_id in skill["lesson_ids"]
            if ("lesson", lesson_id) in progress
        ]
        lesson_mastery = (
            sum(clamp(lesson.mastery) for lesson in lesson_items) / len(skill["lesson_ids"])
            if skill["lesson_ids"]
            else 0
        )
        target_ids = skill.get("target_ids", [])
        target_items = target_progress_items(progress, target_ids)
        target_mastery = (
            sum(clamp(target.mastery) for target in target_items) / len(target_ids)
            if target_ids
            else 0
        )
        mastery = clamp(max(item.mastery if item else 0, lesson_mastery, target_mastery))
        explicit_status = normalize_status(item.status) if item else None
        requirements_met = all(state_by_id.get(req) == "mastered" for req in skill["required_skill_ids"])
        if mastery >= 85:
            status = "mastered"
        elif explicit_status in {"ready", "in_progress", "review", "mastered"}:
            status = explicit_status
        elif any(normalize_status(target.status) == "review" for target in target_items):
            status = "review"
        elif (item and item.attempts > 0) or lesson_items or target_items:
            status = (
                "review"
                if item and item.due_at and as_aware(item.due_at) <= datetime.now(timezone.utc)
                else "in_progress"
            )
        elif not skill["required_skill_ids"] or requirements_met:
            status = "ready"
        else:
            status = "locked"
        state_by_id[skill["id"]] = "mastered" if status == "mastered" else status
        states.append({**skill, "status": status, "mastery": mastery})
    return states


TARGET_PROGRESS_TYPES = [
    "chord",
    "transition",
    "rhythm",
    "technique",
    "scale",
    "theory",
    "song",
    "song-section",
    "ear-training",
    "fretboard",
    "challenge",
]


def target_progress_items(
    progress: dict[tuple[str, str], models.LearnerProgressItem],
    target_ids: list[str],
) -> list[models.LearnerProgressItem]:
    items: list[models.LearnerProgressItem] = []
    for target_id in target_ids:
        for item_type in TARGET_PROGRESS_TYPES:
            item = progress.get((item_type, target_id))
            if item is not None:
                items.append(item)
    return items


def build_practice_plan(db: Session, learner_id: str) -> list[dict[str, Any]]:
    profile = db.scalar(select(models.LearnerProfile).where(models.LearnerProfile.learner_id == learner_id))
    skills = build_skill_states(db, learner_id)
    ready_or_review = [skill for skill in skills if skill["status"] in {"ready", "review", "in_progress"}]
    next_skill = ready_or_review[0] if ready_or_review else skills[0]
    weak = weak_chords_and_transitions(db, learner_id)
    focus_chord = weak["chords"][0] if weak["chords"] else "G"
    focus_transition = weak["transitions"][0] if weak["transitions"] else "G->C"
    song = recommended_song(skills)
    target_minutes = profile.daily_practice_target_minutes if profile else 20
    profile_reason = (
        f"Your local profile target is {target_minutes} minutes."
        if profile
        else "This plan uses the default 20-minute local target."
    )
    return [
        {
            "minutes": 10,
            "title": "Quick reset",
            "tasks": [
                task("tune", "Tune all strings", "tool", 2, "/tools/tuner", "Start every practice in tune."),
                task(
                    "focus-chord",
                    f"Clean up {focus_chord}",
                    "drill",
                    5,
                    f"/chords/{focus_chord}",
                    "Your recent evidence says this chord needs the most attention.",
                    [focus_chord],
                ),
                task("next-step", next_skill["title"], "lesson", 3, next_skill["practice"]["route"], "Move the next ready skill forward.", [next_skill["id"]]),
            ],
        },
        {
            "minutes": 20,
            "title": "Balanced practice",
            "tasks": [
                task("tune", "Tune and listen for stability", "tool", 3, "/tools/tuner", "Good tuning makes every score more trustworthy."),
                task("warmup", f"{focus_transition} transition ladder", "drill", 6, "/practice/chord-change", "Slow reps beat tense fast reps.", [focus_transition]),
                task("skill", next_skill["title"], "lesson", 5, next_skill["practice"]["route"], profile_reason, [next_skill["id"]]),
                task("song", f"Song section: {song['title']}", "song", 6, f"/songs/{song['id']}", "Apply today’s chord work in music.", [song["id"]]),
            ],
        },
        {
            "minutes": 45,
            "title": "Deep session",
            "tasks": [
                task("tune", "Tune, then check input level", "tool", 5, "/tools/tuner", "Calibrated sound keeps feedback honest."),
                task("warmup", "Finger independence warmup", "technique", 6, "/learn/lessons/barre-chord-prep", "Prepare clean fretting pressure before scoring."),
                task("drill", f"{focus_transition} tempo ladder", "drill", 12, "/practice/chord-change", "Use the adaptive BPM ceiling as the cap.", [focus_transition]),
                task("rhythm", "Strumming accuracy", "drill", 8, "/practice/strumming", "Timing confidence matters as much as chord identity."),
                task("song", f"Loop {song['title']}", "song", 10, f"/songs/{song['id']}", "Practice one section slowly, then one full pass.", [song["id"]]),
                task("review", "Journal best take and blocker", "review", 4, "/history", "A short note makes tomorrow’s plan smarter."),
            ],
        },
    ]


def dashboard(db: Session, learner_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    sessions = db.scalars(
        select(models.LearningSession)
        .where(models.LearningSession.learner_id == learner_id)
        .order_by(models.LearningSession.started_at.desc())
    ).all()
    progress_items = db.scalars(
        select(models.LearnerProgressItem).where(models.LearnerProgressItem.learner_id == learner_id)
    ).all()
    weak = weak_chords_and_transitions(db, learner_id)
    skills = build_skill_states(db, learner_id)
    mastered_count = sum(1 for skill in skills if skill["status"] == "mastered")
    review_count = sum(1 for skill in skills if skill["status"] == "review")
    ready_count = sum(1 for skill in skills if skill["status"] == "ready")
    minutes_7d = session_minutes(sessions, now - timedelta(days=7))
    minutes_30d = session_minutes(sessions, now - timedelta(days=30))
    streak = streak_days(sessions)
    highlights = []
    if sessions:
        highlights.append(f"{len(sessions)} saved local sessions")
    if mastered_count:
        highlights.append(f"{mastered_count} mastered items")
    if not highlights:
        highlights.append("Profile ready; first practice will create your baseline.")
    blockers = []
    if weak["chords"]:
        blockers.append(f"Chord to review: {weak['chords'][0]}")
    if weak["transitions"]:
        blockers.append(f"Transition to slow down: {weak['transitions'][0]}")
    if not blockers:
        blockers.append("No persistent blocker yet. Tune, play, and let the app collect evidence.")
    recommendations = [
        "Start with Today’s plan.",
        "Keep recording consent off unless you want local backend analysis.",
        "Prefer slower clean reps before raising tempo.",
    ]
    return {
        "practice_minutes_7d": minutes_7d,
        "practice_minutes_30d": minutes_30d,
        "streak_days": streak,
        "mastered_count": mastered_count,
        "review_count": review_count,
        "ready_count": ready_count,
        "weak_chords": weak["chords"],
        "weak_transitions": weak["transitions"],
        "highlights": highlights,
        "blockers": blockers,
        "recommendations": recommendations,
        "challenges": build_challenges(progress_items, sessions, mastered_count, streak),
        "recaps": build_recaps(sessions, progress_items, skills, weak, now),
    }


def build_recaps(
    sessions: list[models.LearningSession],
    progress_items: list[models.LearnerProgressItem],
    skills: list[dict[str, Any]],
    weak: dict[str, list[str]],
    now: datetime,
) -> dict[str, dict[str, Any]]:
    return {
        "weekly": build_recap(
            title="Weekly recap",
            period_days=7,
            sessions=sessions,
            progress_items=progress_items,
            skills=skills,
            weak=weak,
            now=now,
        ),
        "monthly": build_recap(
            title="Monthly recap",
            period_days=30,
            sessions=sessions,
            progress_items=progress_items,
            skills=skills,
            weak=weak,
            now=now,
        ),
    }


def build_recap(
    *,
    title: str,
    period_days: int,
    sessions: list[models.LearningSession],
    progress_items: list[models.LearnerProgressItem],
    skills: list[dict[str, Any]],
    weak: dict[str, list[str]],
    now: datetime,
) -> dict[str, Any]:
    since = now - timedelta(days=period_days)
    window_sessions = [
        session
        for session in sessions
        if session.ended_at is not None and as_aware(session.started_at) >= since
    ]
    practice_days = len({as_aware(session.started_at).date() for session in window_sessions})
    return {
        "title": title,
        "period_days": period_days,
        "practice_days": practice_days,
        "session_count": len(window_sessions),
        "practice_minutes": session_minutes(window_sessions, since),
        "consistency": consistency_summary(practice_days, period_days),
        "best_improvement": best_progress_evidence(progress_items, since)
        or best_session_evidence(window_sessions)
        or "No measured improvement yet.",
        "current_blocker": current_blocker(weak, skills),
        "suggested_focus": suggested_focus(weak, skills),
    }


def consistency_summary(practice_days: int, period_days: int) -> str:
    if practice_days == 0:
        return "No practice days logged in this window."
    target_days = 4 if period_days == 7 else 16
    pace = "on pace" if practice_days >= target_days else "building"
    return f"{practice_days}/{period_days} days practiced ({pace})."


def best_progress_evidence(
    progress_items: list[models.LearnerProgressItem],
    since: datetime,
) -> str | None:
    candidates = [
        item
        for item in progress_items
        if as_aware(item.last_practiced_at or item.updated_at) >= since
        and (item.attempts > 0 or item.mastery > 0)
    ]
    if not candidates:
        return None
    candidate = max(candidates, key=progress_evidence_score)
    return f"{progress_type_label(candidate.item_type)} {candidate.item_id}: {round(progress_evidence_score(candidate))}% evidence."


def progress_evidence_score(item: models.LearnerProgressItem) -> float:
    if item.last_score is not None:
        return item.last_score
    if item.best_score is not None:
        return item.best_score
    return item.mastery


def best_session_evidence(sessions: list[models.LearningSession]) -> str | None:
    scored_sessions = [
        session for session in sessions if metadata_score(session.client_metadata or {}) is not None
    ]
    if not scored_sessions:
        return None
    session = max(scored_sessions, key=lambda item: metadata_score(item.client_metadata or {}) or 0)
    score = metadata_score(session.client_metadata or {}) or 0
    return f"{activity_label(session.activity_type)}: {score:.1f}/10."


def current_blocker(weak: dict[str, list[str]], skills: list[dict[str, Any]]) -> str:
    if weak["chords"]:
        return f"Chord cleanliness: {weak['chords'][0]}"
    if weak["transitions"]:
        return f"Transition control: {weak['transitions'][0]}"
    review_skill = next((skill for skill in skills if skill["status"] == "review"), None)
    if review_skill:
        return f"Review skill: {review_skill['title']}"
    return "No clear blocker yet."


def suggested_focus(weak: dict[str, list[str]], skills: list[dict[str, Any]]) -> str:
    if weak["transitions"]:
        return f"Slow tempo ladder for {weak['transitions'][0]}."
    if weak["chords"]:
        return f"Five clean checks of {weak['chords'][0]} before speed work."
    next_skill = next(
        (skill for skill in skills if skill["status"] in {"review", "in_progress", "ready"}),
        None,
    )
    return next_skill["title"] if next_skill else "Choose a song section and record a short review note."


def progress_type_label(item_type: str) -> str:
    labels = {
        "song-section": "Song section",
        "ear-training": "Ear training",
    }
    return labels.get(item_type, item_type[:1].upper() + item_type[1:])


def activity_label(activity_type: str) -> str:
    labels = {
        "chord_check": "Chord check",
        "practice_drill": "Practice drill",
        "song_practice": "Song practice",
        "ear_training": "Ear training",
        "fretboard_trainer": "Fretboard trainer",
        "technique_drill": "Technique practice",
    }
    return labels.get(activity_type, activity_type[:1].upper() + activity_type[1:])


def weak_chords_and_transitions(db: Session, learner_id: str) -> dict[str, list[str]]:
    sessions = db.scalars(
        select(models.LearningSession)
        .where(models.LearningSession.learner_id == learner_id)
        .order_by(models.LearningSession.started_at.desc())
        .limit(40)
    ).all()
    chord_scores: dict[str, list[float]] = {}
    transition_scores: dict[str, list[float]] = {}
    for session in sessions:
        metadata = session.client_metadata or {}
        attempts = metadata.get("attempts")
        if not isinstance(attempts, list):
            continue
        previous: str | None = None
        for attempt in attempts:
            if not isinstance(attempt, dict):
                continue
            chord_id = string_value(attempt.get("expectedChordId")) or string_value(attempt.get("chordId"))
            score = score_value(attempt)
            if chord_id and score is not None:
                chord_scores.setdefault(chord_id, []).append(score)
                if previous and previous != chord_id:
                    transition_scores.setdefault(f"{previous}->{chord_id}", []).append(score)
                previous = chord_id
    weak_chords = sorted(chord_scores, key=lambda key: sum(chord_scores[key]) / len(chord_scores[key]))[:4]
    weak_transitions = sorted(
        transition_scores,
        key=lambda key: sum(transition_scores[key]) / len(transition_scores[key]),
    )[:4]
    if not weak_chords or not weak_transitions:
        for item in db.scalars(
            select(models.LearnerProgressItem).where(
                models.LearnerProgressItem.learner_id == learner_id,
                models.LearnerProgressItem.item_type.in_(["chord", "transition"]),
            )
        ):
            if item.item_type == "chord" and item.last_score is not None:
                chord_scores.setdefault(item.item_id, []).append(item.last_score / 10)
            if item.item_type == "transition" and item.last_score is not None:
                transition_scores.setdefault(item.item_id, []).append(item.last_score / 10)
        weak_chords = sorted(chord_scores, key=lambda key: sum(chord_scores[key]) / len(chord_scores[key]))[:4]
        weak_transitions = sorted(
            transition_scores,
            key=lambda key: sum(transition_scores[key]) / len(transition_scores[key]),
        )[:4]
    return {"chords": weak_chords, "transitions": weak_transitions}


def recent_session_count(db: Session, learner_id: str) -> int:
    return db.scalar(
        select(func.count()).select_from(models.LearningSession).where(models.LearningSession.learner_id == learner_id)
    ) or 0


def pending_job_count(db: Session, learner_id: str) -> int:
    return db.scalar(
        select(func.count())
        .select_from(models.AnalysisJob)
        .join(models.AudioRecording)
        .where(
            models.AudioRecording.learner_id == learner_id,
            models.AnalysisJob.status.in_(["queued", "running"]),
        )
    ) or 0


def task(
    task_id: str,
    title: str,
    kind: str,
    minutes: int,
    route: str,
    reason: str,
    target_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": task_id,
        "title": title,
        "kind": kind,
        "minutes": minutes,
        "route": route,
        "reason": reason,
        "target_ids": target_ids or [],
    }


def session_minutes(sessions: list[models.LearningSession], since: datetime) -> int:
    total = 0
    for session in sessions:
        if as_aware(session.started_at) < since or session.ended_at is None:
            continue
        total += max(1, round((session.ended_at - session.started_at).total_seconds() / 60))
    return total


def streak_days(sessions: list[models.LearningSession]) -> int:
    days = {as_aware(session.started_at).date() for session in sessions if session.ended_at is not None}
    if not days:
        return 0
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    if today in days:
        current = today
    elif yesterday in days:
        current = yesterday
    else:
        return 0
    streak = 0
    while current in days:
        streak += 1
        current -= timedelta(days=1)
    return streak


def score_value(attempt: dict[str, Any]) -> float | None:
    raw = attempt.get("score")
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw)
    if isinstance(raw, dict):
        nested = raw.get("score")
        if isinstance(nested, (int, float)) and not isinstance(nested, bool):
            return float(nested)
    return None


def metadata_score(metadata: dict[str, Any]) -> float | None:
    raw = metadata.get("score")
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw)
    summary = metadata.get("scoreSummary")
    if isinstance(summary, dict):
        average = summary.get("averageScore")
        if isinstance(average, (int, float)) and not isinstance(average, bool):
            return float(average)
    return None


def string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def recommended_song(skills: list[dict[str, Any]]) -> dict[str, Any]:
    status_by_id = {skill["id"]: skill["status"] for skill in skills}
    for song in SEED_SONGS:
        if all(status_by_id.get(skill_id) in {"ready", "in_progress", "review", "mastered"} for skill_id in song["required_skill_ids"]):
            return song
    return SEED_SONGS[0]


def build_challenges(
    progress_items: list[models.LearnerProgressItem],
    sessions: list[models.LearningSession],
    mastered_count: int,
    streak: int,
) -> list[dict[str, Any]]:
    clean_chord_count = sum(
        1
        for item in progress_items
        if item.item_type == "chord" and (item.mastery >= 80 or (item.best_score or 0) >= 80)
    )
    mastered_song_count = sum(
        1 for item in progress_items if item.item_type == "song" and (item.mastery >= 85 or item.status == "mastered")
    )
    return [
        challenge("first-clean-chord", "First clean chord", clean_chord_count, 1),
        challenge("seven-day-transition", "7-day chord transition challenge", streak, 7),
        challenge("beginner-path", "30-day beginner path", max(mastered_count, len(sessions)), 30),
        challenge("first-song", "First complete song", mastered_song_count, 1),
    ]


def challenge(challenge_id: str, title: str, value: int, target: int) -> dict[str, Any]:
    progress = min(1.0, value / target) if target else 0
    return {
        "id": challenge_id,
        "title": title,
        "status": "complete" if progress >= 1 else "active",
        "progress": progress,
    }


def normalize_status(value: str | None) -> str | None:
    if value is None:
        return None
    return value.replace("-", "_")


def clamp(value: float) -> float:
    return max(0, min(100, value))


def as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
