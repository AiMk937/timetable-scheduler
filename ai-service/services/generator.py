import random
import time
from pymongo import MongoClient
from typing import List, Dict, Any, Optional
from bson.objectid import ObjectId  # Import ObjectId for queries

# Constants for days and number of slots per day
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS_PER_DAY = 6
# Only these slots can start a lab session (ensuring 2 consecutive slots)
LAB_CANDIDATE_SLOTS = [0, 2, 4]

random.seed(time.time())

class TimetableScheduler:
    def __init__(self):
        self.client = MongoClient('mongodb://localhost:27017/')
        self.db = self.client['test']
        self.subjects_col = self.db['subjects']
        self.teachers_col = self.db['teachers']
        self.classes_col = self.db['classes']
        self.infrastructure_col = self.db['infrastructures']

    # -------------------------
    # CHANGE: Modify fetch_data() to optionally fetch only the selected class.
    # -------------------------
    def fetch_data(self, selected_class_id: Optional[str] = None) -> (List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]):
        subjects = list(self.subjects_col.find())
        teachers = list(self.teachers_col.find())
        # If a specific class is selected, fetch only that one; otherwise, fetch all.
        if selected_class_id:
            # Convert the selected_class_id into an ObjectId and fetch one class document
            classes = [self.classes_col.find_one({"_id": ObjectId(selected_class_id)})]
        else:
            classes = list(self.classes_col.find())
        infrastructures = list(self.infrastructure_col.find())
        print(f"DEBUG: Fetched {len(subjects)} subjects, {len(teachers)} teachers, "
              f"{len(classes)} classes, {len(infrastructures)} infrastructures")
        return subjects, teachers, classes, infrastructures

    def initialize_timetable(self) -> Dict[str, List[Optional[Any]]]:
        """Initialize a timetable with each day having SLOTS_PER_DAY empty slots."""
        return {day: [None] * SLOTS_PER_DAY for day in DAYS}

    # -------------------------
    # LAB SCHEDULING FUNCTIONS
    # -------------------------
    def schedule_labs(self,
                      timetable: Dict[str, List[Optional[Any]]],
                      lab_subjects: List[Dict[str, Any]],
                      subject_teacher_map: Dict[str, str],
                      lab_room_map: Dict[str, str]) -> None:
        regular_labs = [lab for lab in lab_subjects if lab.get("category", "Regular") == "Regular"]
        honours_labs = [lab for lab in lab_subjects if lab.get("category") == "Honours/Minor"]
        days_with_lab = set()
        self.schedule_regular_labs(timetable, regular_labs, subject_teacher_map, lab_room_map, days_with_lab)
        self.schedule_honours_labs(timetable, honours_labs, subject_teacher_map, lab_room_map, days_with_lab)

    def schedule_regular_labs(self,
                              timetable: Dict[str, List[Optional[Any]]],
                              regular_labs: List[Dict[str, Any]],
                              subject_teacher_map: Dict[str, str],
                              lab_room_map: Dict[str, str],
                              days_with_lab: set) -> None:
        lab_needed = {}
        lab_info = {}
        for lab_subj in regular_labs:
            lab_id = str(lab_subj["_id"])
            lab_info[lab_id] = lab_subj
            required_sessions = lab_subj.get("contactHours", 0) // 2
            for batch in ["B1", "B2", "B3"]:
                lab_needed[(lab_id, batch)] = required_sessions

        candidate_sessions = []
        for day in DAYS:
            for slot in LAB_CANDIDATE_SLOTS:
                if slot + 1 < SLOTS_PER_DAY:
                    candidate_sessions.append((day, slot))
        random.shuffle(candidate_sessions)

        for (day, slot) in candidate_sessions:
            if day in days_with_lab:
                continue
            if timetable[day][slot] is not None:
                continue

            session_assignment = {}
            for batch in ["B1", "B2", "B3"]:
                candidate_lab_ids = [
                    lab_id for ((lab_id, b), count) in lab_needed.items()
                    if b == batch and count > 0
                ]
                candidate_lab_ids = [lid for lid in candidate_lab_ids if lid not in list(session_assignment.values())]
                if candidate_lab_ids:
                    chosen_lab_id = random.choice(candidate_lab_ids)
                    session_assignment[batch] = chosen_lab_id

            if session_assignment:
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
                    lab_needed[(lab_id, batch)] -= 1
                timetable[day][slot] = lab_session
                timetable[day][slot + 1] = lab_session
                days_with_lab.add(day)

        for (lab_id, batch), count in lab_needed.items():
            if count > 0:
                lab_subj = lab_info[lab_id]
                print(f"❌ Unsatisfied regular lab session for {lab_subj['subjectName']} (batch {batch}): {count} session(s) missing")

    def schedule_honours_labs(self,
                              timetable: Dict[str, List[Optional[Any]]],
                              honours_labs: List[Dict[str, Any]],
                              subject_teacher_map: Dict[str, str],
                              lab_room_map: Dict[str, str],
                              days_with_lab: set) -> None:
        honours_needed = {}
        honours_info = {}
        for lab in honours_labs:
            lab_id = str(lab["_id"])
            honours_needed[lab_id] = lab.get("contactHours", 0) // 2
            honours_info[lab_id] = lab

        candidate_sessions = []
        for day in DAYS:
            for slot in LAB_CANDIDATE_SLOTS:
                if slot + 1 < SLOTS_PER_DAY:
                    candidate_sessions.append((day, slot))
        random.shuffle(candidate_sessions)

        while any(count > 0 for count in honours_needed.values()):
            placed = False
            for (day, slot) in candidate_sessions:
                if day in days_with_lab:
                    continue
                if timetable[day][slot] is not None:
                    continue

                group_session = {}
                for lab_id, count in honours_needed.items():
                    if count > 0:
                        lab_subj = honours_info[lab_id]
                        teacher_name = subject_teacher_map.get(lab_id, "UNKNOWN")
                        room_no = lab_room_map.get(lab_id, "UNKNOWN")
                        group_session[lab_id] = {
                            "subject": lab_subj["subjectName"],
                            "teacher": teacher_name,
                            "room": room_no,
                            "category": "Honours/Minor"
                        }
                        honours_needed[lab_id] -= 1
                if group_session:
                    timetable[day][slot] = group_session
                    timetable[day][slot + 1] = group_session
                    days_with_lab.add(day)
                    placed = True
                    break
            if not placed:
                print("❌ Not enough slots to schedule all honours/minor lab sessions.")
                break

    # -----------------------------------------------------------------------------------------------------
    # LECTURE SCHEDULING FUNCTION
    # -----------------------------------------------------------------------------------------------------
    def schedule_lectures(self,
                          timetable: Dict[str, List[Optional[Any]]],
                          lecture_subjects: List[Dict[str, Any]],
                          subject_teacher_map: Dict[str, str],
                          classrooms: List[str]) -> None:
        electives_institute = [s for s in lecture_subjects if s.get("category") == "Institute Level Elective"]
        electives_dept = [s for s in lecture_subjects if s.get("category") == "Department Level Elective"]
        honours_theory = [s for s in lecture_subjects if s.get("category") == "Honours/Minor"]
        regular_theory = [s for s in lecture_subjects if s.get("category", "Regular") == "Regular"]

        elective_groups = []
        if electives_institute:
            elective_groups.append(electives_institute)
        if electives_dept:
            elective_groups.append(electives_dept)
        honours_group = []
        if honours_theory:
            honours_group.append(honours_theory)

        subject_lecture_needed = {}
        for s in lecture_subjects:
            sid = str(s["_id"])
            subject_lecture_needed[sid] = s.get("contactHours", 0)

        free_slots = []
        for day, slots in timetable.items():
            for i, slot_val in enumerate(slots):
                if slot_val is None:
                    free_slots.append((day, i))
        random.shuffle(free_slots)

        # Group-schedule electives/honours
        for group in elective_groups + honours_group:
            while any(subject_lecture_needed[str(sub["_id"])] > 0 for sub in group):
                if not free_slots:
                    print("❌ Not enough free slots for grouped elective/honours theory sessions.")
                    break
                day, idx = free_slots.pop()
                group_session = {}
                for sub in group:
                    sid = str(sub["_id"])
                    if subject_lecture_needed[sid] > 0:
                        teacher_name = subject_teacher_map.get(sid, "UNKNOWN")
                        room = random.choice(classrooms) if classrooms else "UNKNOWN"
                        group_session[sid] = {
                            "subject": sub["subjectName"],
                            "teacher": teacher_name,
                            "room": room
                        }
                        subject_lecture_needed[sid] -= 1
                if group_session:
                    timetable[day][idx] = group_session

        # Schedule remaining regular theory lectures individually.
        lecture_queue = []
        for subj in regular_theory:
            sid = str(subj["_id"])
            needed = subject_lecture_needed[sid]
            lecture_queue.extend([sid] * needed)
        random.shuffle(lecture_queue)

        for sid in lecture_queue:
            if not free_slots:
                print("❌ Not enough free slots for all lecture sessions.")
                break
            day, idx = free_slots.pop()
            the_subj = next((x for x in lecture_subjects if str(x["_id"]) == sid), None)
            if not the_subj:
                continue
            teacher_name = subject_teacher_map.get(sid, "UNKNOWN")
            room = random.choice(classrooms) if classrooms else "UNKNOWN"
            timetable[day][idx] = {
                "subject": the_subj["subjectName"],
                "teacher": teacher_name,
                "room": room
            }

        for (day, idx) in free_slots:
            timetable[day][idx] = {
                "subject": "Free slot",
                "teacher": "",
                "room": ""
            }

    # ---------------------------
    # CLASS SCHEDULING FUNCTION
    # ---------------------------
    def schedule_class(self, class_data: Dict[str, Any],
                       subjects: List[Dict[str, Any]],
                       teachers: List[Dict[str, Any]],
                       infrastructures: List[Dict[str, Any]]) -> Dict[str, List[Optional[Any]]]:
        timetable = self.initialize_timetable()

        # Build teacher-subject mapping.
        subject_teacher_map: Dict[str, str] = {}
        for t in teachers:
            for sub_id in t.get("subjects", []):
                subject_teacher_map[str(sub_id)] = t["name"]

        # Build lab_room_map from infrastructures.
        lab_room_map = {}
        for infra in infrastructures:
            if infra["type"] == "lab":
                for sub_id in infra.get("labSubjectId", []):
                    lab_room_map[str(sub_id)] = infra["roomNo"]

        # Collect all classrooms.
        classrooms = [infra["roomNo"] for infra in infrastructures if infra["type"] == "classroom"]

        # Filter subjects for this class.
        class_subject_ids = set(map(str, class_data.get("subjects", [])))
        class_subjects = [s for s in subjects if str(s["_id"]) in class_subject_ids]

        lab_subjects = [s for s in class_subjects if s["subjectType"] == "Lab"]
        lecture_subjects = [s for s in class_subjects if s["subjectType"] == "Theory"]

        self.schedule_labs(timetable, lab_subjects, subject_teacher_map, lab_room_map)
        self.schedule_lectures(timetable, lecture_subjects, subject_teacher_map, classrooms)

        return timetable

    # --------------------------------------------------------
    #  >>> MINIMAL CHANGE: ADDED selected_class_id PARAM <<<
    # --------------------------------------------------------
    def csp_solver(self,
                   subjects: List[Dict[str, Any]],
                   teachers: List[Dict[str, Any]],
                   classes: List[Dict[str, Any]],
                   infrastructures: List[Dict[str, Any]],
                   selected_class_id: Optional[str] = None
                   ) -> Dict[str, Any]:
        all_timetables: Dict[str, Any] = {}
        for class_data in classes:
            class_id = str(class_data["_id"])
            # Only schedule the chosen class if selected_class_id is provided.
            if selected_class_id and class_id != selected_class_id:
                continue
            print(f"Scheduling class: {class_data.get('className', class_id)}")
            timetable = self.schedule_class(class_data, subjects, teachers, infrastructures)
            all_timetables[class_id] = timetable
        return all_timetables

    # ---------------------------
    # PUBLIC ENTRY POINT
    # ---------------------------
    def generate_timetable(self, selected_class_id: Optional[str] = None) -> Dict[str, Any]:
        subjects, teachers, classes, infrastructures = self.fetch_data(selected_class_id)
        # Only the selected class is scheduled if selected_class_id is provided.
        return self.csp_solver(subjects, teachers, classes, infrastructures, selected_class_id)

def generate_timetable(selected_class_id: Optional[str] = None) -> Dict[str, Any]:
    scheduler = TimetableScheduler()
    return scheduler.generate_timetable(selected_class_id)

if __name__ == "__main__":
    # For example, generate timetable for only a specific class.
    single_class_id = "66e91ee86d5f16bbb171c326"  # Replace with desired class ID.
    final_timetable = generate_timetable(selected_class_id=single_class_id)
    print(final_timetable)