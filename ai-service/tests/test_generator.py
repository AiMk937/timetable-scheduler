"""Runs the scheduler on a simulated department (mongomock) and checks for clashes.

Run from the repo root:  pytest ai-service/tests -q
"""
import collections
import sys
from pathlib import Path

import mongomock
import pytest
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

THEORY = ["ML", "CNS", "DS", "BC", "NLP"]
LABS = ["ML Lab", "CNS Lab", "DS Lab"]
TEACHERS = {"Prof A": ["ML", "ML Lab"], "Prof B": ["CNS", "CNS Lab"], "Prof C": ["DS", "DS Lab"],
            "Prof D": ["BC"], "Prof E": ["NLP"]}


@pytest.fixture()
def generated(monkeypatch):
    # Builds two classes that share teachers, then generates both timetables
    db = mongomock.MongoClient()["timetableDB"]
    monkeypatch.setattr(config, "get_db", lambda: db)
    dept, year = ObjectId(), ObjectId()
    ids = {}
    for n in THEORY:
        ids[n] = db.subjects.insert_one({"subjectName": n, "subjectType": "Theory", "contactHours": 3, "category": "Regular"}).inserted_id
    for n in LABS:
        ids[n] = db.subjects.insert_one({"subjectName": n, "subjectType": "Lab", "contactHours": 2, "category": "Regular"}).inserted_id
    for t, subs in TEACHERS.items():
        db.teachers.insert_one({"name": t, "subjects": [ids[s] for s in subs]})
    for c in ["BE-A", "BE-B"]:
        db.classes.insert_one({"className": c, "departmentId": dept, "academicYear": year, "subjects": list(ids.values())})
    for r in ["401", "402", "403"]:
        db.infrastructures.insert_one({"roomNo": r, "type": "classroom"})
    for i, n in enumerate(LABS):
        db.infrastructures.insert_one({"roomNo": f"Lab{i + 1}", "type": "lab", "labSubjectIds": [ids[n]]})

    from services.generator import TimetableScheduler
    return TimetableScheduler().generate_for_department(str(dept), str(year))


def _entries(out):
    # Yields (class_id, day, slot, entry) for every scheduled session
    for cid, tt in out.items():
        for day, slots in tt.items():
            for i, cell in enumerate(slots):
                for e in (cell if isinstance(cell, list) else [cell]):
                    if e["subject"] != "NPTEL/MOOC":
                        yield cid, day, i, e


def test_no_teacher_or_room_clashes(generated):
    teachers, rooms = collections.Counter(), collections.Counter()
    for _, day, i, e in _entries(generated):
        teachers[(e["teacher"], day, i)] += 1
        rooms[(e["room"], day, i)] += 1
    assert max(teachers.values()) == 1
    assert max(rooms.values()) == 1


def test_all_theory_hours_placed_and_labs_have_rooms(generated):
    for cid in generated:
        hours = collections.Counter(e["subject"] for c, _, _, e in _entries(generated) if c == cid and e["subject"] in THEORY)
        assert all(hours[s] == 3 for s in THEORY)
    assert all(e["room"] for _, _, _, e in _entries(generated) if "batch" in e)
