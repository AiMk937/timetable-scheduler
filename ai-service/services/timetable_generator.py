import random
import time
from pymongo import MongoClient
from typing import List, Dict, Any, Optional

# Constants for days and number of slots per day
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS_PER_DAY = 6
LAB_CANDIDATE_SLOTS = [0, 2, 4]  # Only these slots can start a lab session (to ensure two consecutive slots)

random.seed(time.time())

class TimetableScheduler:
    def __init__(self):
        self.client = MongoClient('mongodb://localhost:27017/')
        self.db = self.client['test']
        self.subjects_col = self.db['subjects']
        self.teachers_col = self.db['teachers']
        self.classes_col = self.db['classes']
        self.infrastructure_col = self.db['infrastructures']

    def fetch_data(self) -> (List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]):
        subjects = list(self.subjects_col.find())
        teachers = list(self.teachers_col.find())
        classes = list(self.classes_col.find())
        infrastructures = list(self.infrastructure_col.find())
        print(f"DEBUG: Fetched {len(subjects)} subjects, {len(teachers)} teachers, "
              f"{len(classes)} classes, {len(infrastructures)} infrastructures")
        return subjects, teachers, classes, infrastructures

    def initialize_timetable(self) -> Dict[str, List[Optional[Any]]]:
        """Initialize a timetable with each day having SLOTS_PER_DAY empty slots."""
        return {day: [None] * SLOTS_PER_DAY for day in DAYS}

    def schedule_labs(self,
                      timetable: Dict[str, List[Optional[Any]]],
                      lab_subjects: List[Dict[str, Any]],
                      subject_teacher_map: Dict[str, str],
                      lab_room_map: Dict[str, str]) -> None:
        """
        Schedule lab sessions in candidate slots with the constraint that each day gets at most one lab session.
        For each lab subject and for each batch (B1, B2, B3), enforce that the number of sessions scheduled
        equals the required sessions. Here, required sessions is calculated as contactHours // 2,
        because one session of two consecutive slots meets a 2-hour requirement.
        Candidate lab session slots are (day, slot) where slot is in LAB_CANDIDATE_SLOTS.
        """
        # Build a dictionary for required lab sessions.
        # Key: (lab_id, batch) -> required sessions.
        lab_needed = {}
        # Also store lab information keyed by lab_id.
        lab_info = {}
        for lab_subj in lab_subjects:
            needed = lab_subj.get("contactHours", 0)
            # Each lab subject needs 2 hours per week per batch, and 1 session = 2 consecutive slots
            required_sessions = needed // 2  # e.g. if contactHours is 2, then required_sessions = 1
            lab_id = str(lab_subj["_id"])
            lab_info[lab_id] = lab_subj
            for batch in ["B1", "B2", "B3"]:
                lab_needed[(lab_id, batch)] = required_sessions

        # Collect candidate lab session slots (day and starting slot)
        candidate_sessions = []
        for day in DAYS:
            for slot in LAB_CANDIDATE_SLOTS:
                if slot + 1 < SLOTS_PER_DAY:
                    candidate_sessions.append((day, slot))
        random.shuffle(candidate_sessions)

        # Track days that already have a lab session scheduled.
        days_with_lab = set()

        # For each candidate session, try to assign lab subjects for each batch.
        for (day, slot) in candidate_sessions:
            # Enforce "at most one lab session per day"
            if day in days_with_lab:
                continue
            # Skip if the candidate slot is already occupied (e.g. by a lecture assignment).
            if timetable[day][slot] is not None:
                continue

            session_assignment = {}  # key: batch -> lab_id chosen for this session
            for batch in ["B1", "B2", "B3"]:
                # Get all lab subjects that still need sessions for this batch.
                candidate_lab_ids = [
                    lab_id for ((lab_id, b), count) in lab_needed.items() 
                    if b == batch and count > 0
                ]
                # Enforce that within this session, batches get distinct lab subjects.
                candidate_lab_ids = [lab_id for lab_id in candidate_lab_ids if lab_id not in session_assignment.values()]
                if candidate_lab_ids:
                    chosen_lab_id = random.choice(candidate_lab_ids)
                    session_assignment[batch] = chosen_lab_id

            if session_assignment:
                # Create a lab session dictionary that will be used for both consecutive slots.
                lab_session = {}
                for batch, lab_id in session_assignment.items():
                    lab_subj = lab_info[lab_id]
                    teacher_name = subject_teacher_map.get(lab_id, "UNKNOWN")
                    room_no = lab_room_map.get(lab_id, "UNKNOWN")
                    lab_entry = {
                        "subject": lab_subj["subjectName"],
                        "teacher": teacher_name,
                        "room": room_no,
                        "batch": batch
                    }
                    lab_session[batch] = lab_entry
                    # Decrement the required sessions for this (lab, batch).
                    lab_needed[(lab_id, batch)] -= 1
                # Assign the same lab session dictionary to both consecutive slots.
                timetable[day][slot] = lab_session
                timetable[day][slot + 1] = lab_session
                # Mark this day as having a lab session.
                days_with_lab.add(day)

        # Report any unsatisfied lab sessions.
        for (lab_id, batch), count in lab_needed.items():
            if count > 0:
                lab_subj = lab_info[lab_id]
                print(f"❌ Unsatisfied lab session for {lab_subj['subjectName']} for batch {batch}: {count} session(s) missing")

    def fill_leftover_slots_with_lectures(self,
                                          timetable: Dict[str, List[Optional[Any]]],
                                          lecture_subjects: List[Dict[str, Any]],
                                          subject_teacher_map: Dict[str, str],
                                          classrooms: List[str]) -> None:
        """Fill any empty slot with a lecture assignment."""
        for day, slots in timetable.items():
            for i in range(len(slots)):
                if slots[i] is None:
                    if not lecture_subjects:
                        continue
                    choice_subj = random.choice(lecture_subjects)
                    subj_id = str(choice_subj["_id"])
                    teacher_name = subject_teacher_map.get(subj_id, "UNKNOWN")
                    room = random.choice(classrooms) if classrooms else "UNKNOWN"
                    slots[i] = {
                        "subject": choice_subj["subjectName"],
                        "teacher": teacher_name,
                        "room": room
                    }

    def schedule_class(self, class_data: Dict[str, Any],
                       subjects: List[Dict[str, Any]],
                       teachers: List[Dict[str, Any]],
                       infrastructures: List[Dict[str, Any]]) -> Dict[str, List[Optional[Any]]]:
        """
        Schedule a single class by first scheduling lab sessions (to strictly enforce lab contact hours)
        and then filling any remaining slots with lectures.
        """
        timetable = self.initialize_timetable()

        # Build lookup maps.
        subject_teacher_map: Dict[str, str] = {}
        for t in teachers:
            for sub in t.get("subjects", []):
                subject_teacher_map[str(sub)] = t["name"]

        lab_room_map = {str(infra["labSubjectId"]): infra["roomNo"]
                        for infra in infrastructures if infra["type"] == "lab"}
        classrooms = [infra["roomNo"] for infra in infrastructures if infra["type"] == "classroom"]

        # Filter subjects for this class.
        class_subjects = [s for s in subjects if str(s["_id"]) in map(str, class_data.get("subjects", []))]
        lab_subjects = [s for s in class_subjects if s["subjectType"] == "Lab"]
        lecture_subjects = [s for s in class_subjects if s["subjectType"] == "Theory"]

        # Schedule labs first (meeting lab contact hours as a hard constraint).
        self.schedule_labs(timetable, lab_subjects, subject_teacher_map, lab_room_map)
        # Then fill remaining free slots with lecture assignments.
        self.fill_leftover_slots_with_lectures(timetable, lecture_subjects, subject_teacher_map, classrooms)
        return timetable

    def csp_solver(self, subjects: List[Dict[str, Any]],
                   teachers: List[Dict[str, Any]],
                   classes: List[Dict[str, Any]],
                   infrastructures: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate timetables for all classes."""
        all_timetables: Dict[str, Any] = {}
        for class_data in classes:
            class_id = str(class_data["_id"])
            print(f"Scheduling class: {class_data.get('className', class_id)}")
            timetable = self.schedule_class(class_data, subjects, teachers, infrastructures)
            all_timetables[class_id] = timetable
        return all_timetables

    def generate_timetable(self) -> Dict[str, Any]:
        subjects, teachers, classes, infrastructures = self.fetch_data()
        return self.csp_solver(subjects, teachers, classes, infrastructures)

def generate_timetable() -> Dict[str, Any]:
    scheduler = TimetableScheduler()
    return scheduler.generate_timetable()

if __name__ == "__main__":
    final_timetable = generate_timetable()
    print(final_timetable)
