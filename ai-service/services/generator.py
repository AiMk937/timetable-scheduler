#!/usr/bin/env python3
# generator.py
# Multi-class CSP-based timetable generator with global teacher and room conflict prevention.

import random
import time
from pymongo import MongoClient
from typing import List, Dict, Any, Optional
from bson.objectid import ObjectId
from collections import defaultdict

# Constants for days and number of slots per day
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS_PER_DAY = 7
# Only these slots can start a lab session (ensuring 2 consecutive slots)
LAB_CANDIDATE_SLOTS = [0, 1, 2, 4, 5]
# Batches for lab sessions
BATCHES = ["B1", "B2", "B3"]

random.seed(time.time())

class TimetableScheduler:
    def __init__(self):
        # ------------------------- Global conflict state -------------------------
        # teacher_schedule[teacher_name][day_index][slot_index] == True if occupied
        self.teacher_schedule = defaultdict(lambda: [[False] * SLOTS_PER_DAY for _ in DAYS])
        self.room_schedule    = defaultdict(lambda: [[False] * SLOTS_PER_DAY for _ in DAYS])

        # MongoDB setup
        self.client = MongoClient(
            'mongodb+srv://aimaanjkhaan:Arshee2597@cluster1.1ycsg.mongodb.net/'
            'timetableDB?retryWrites=true&w=majority&appName=Cluster1'
        )
        self.db = self.client['timetableDB']
        self.subjects_col       = self.db['subjects']
        self.teachers_col       = self.db['teachers']
        self.classes_col        = self.db['classes']
        self.infrastructure_col = self.db['infrastructures']

    def fetch_data(self,
                   selected_class_id: Optional[str] = None,
                   department_id:    Optional[str] = None,
                   academic_year_id: Optional[str] = None
                   ) -> (List[Dict[str, Any]],
                         List[Dict[str, Any]],
                         List[Dict[str, Any]],
                         List[Dict[str, Any]]):
        subjects = list(self.subjects_col.find())
        teachers = list(self.teachers_col.find())

        # Build class query
        query: Dict[str, Any] = {}
        if selected_class_id:
            query['_id'] = ObjectId(selected_class_id)
        if department_id:
            query['departmentId'] = ObjectId(department_id)
        if academic_year_id:
            # field is `academicYear` in your Class schema
            query['academicYear'] = ObjectId(academic_year_id)

        classes = list(self.classes_col.find(query))
        infrastructures = list(self.infrastructure_col.find())

        print(f"DEBUG: Fetched {len(subjects)} subjects, "
              f"{len(teachers)} teachers, "
              f"{len(classes)} classes, "
              f"{len(infrastructures)} infrastructures")
        return subjects, teachers, classes, infrastructures

    def initialize_timetable(self) -> Dict[str, List[Optional[Any]]]:
        return { day: [None] * SLOTS_PER_DAY for day in DAYS }

    # ------------------------- LAB SCHEDULING -------------------------
    def schedule_labs(self,
                      timetable:           Dict[str, List[Optional[Any]]],
                      lab_subjects:        List[Dict[str, Any]],
                      subject_teacher_map: Dict[str, str],
                      lab_room_map:        Dict[str, str]) -> None:
        regular = [l for l in lab_subjects if l.get('category','Regular') == 'Regular']
        honours = [l for l in lab_subjects if l.get('category') == 'Honours/Minor']

        self.schedule_regular_labs(timetable, regular, subject_teacher_map, lab_room_map)
        self.schedule_honours_labs(timetable, honours, subject_teacher_map, lab_room_map)

    def schedule_regular_labs(self,
                              timetable:           Dict[str, List[Optional[Any]]],
                              regular_labs:        List[Dict[str, Any]],
                              subject_teacher_map: Dict[str, str],
                              lab_room_map:        Dict[str, str]) -> None:
        # Build need counts: (lab_id, batch) -> how many 2-slot blocks are needed
        lab_needed: Dict[tuple, int] = {}
        lab_info:   Dict[str, Dict[str, Any]] = {}

        for lab in regular_labs:
            lid = str(lab['_id'])
            lab_info[lid] = lab
            # contactHours // 2 = number of 2-slot blocks needed
            cnt = lab.get('contactHours', 0) // 2
            for b in BATCHES:
                lab_needed[(lid, b)] = cnt

        # Shuffle candidate day/slot pairs
        candidates = [
            (d, s)
            for d in DAYS
            for s in LAB_CANDIDATE_SLOTS
            if s + 1 < SLOTS_PER_DAY
        ]
        random.shuffle(candidates)

        for day, slot in candidates:
            # Skip if either slot is already occupied
            if timetable[day][slot] is not None or timetable[day][slot + 1] is not None:
                continue

            # For each batch, pick exactly one distinct lab that still needs placement
            assignment: Dict[str, str] = {}
            for batch in BATCHES:
                opts = [
                    lid for ((lid, b2), rem) in lab_needed.items()
                    if b2 == batch and rem > 0 and lid not in assignment.values()
                ]
                if opts:
                    assignment[batch] = random.choice(opts)

            if not assignment:
                continue

            day_i = DAYS.index(day)
            # Global conflict check (teacher & room) for both slots
            conflict = False
            for lid in assignment.values():
                tch = subject_teacher_map.get(lid, "")   # default="" not "UNKNOWN"
                rm  = lab_room_map.get(lid, "")           # default=""
                for s in (slot, slot + 1):
                    if self.teacher_schedule[tch][day_i][s] or self.room_schedule[rm][day_i][s]:
                        conflict = True
                        break
                if conflict:
                    break
            if conflict:
                continue

            # Commit this 2-slot block for each batch
            block = []
            for batch, lid in assignment.items():
                sub = lab_info[lid]
                tch = subject_teacher_map.get(lid, "")
                rm  = lab_room_map.get(lid, "")
                block.append({
                    'batch':   batch,
                    'subject': sub['subjectName'],
                    'teacher': tch,
                    'room':    rm
                })
                lab_needed[(lid, batch)] -= 1
                for s in (slot, slot + 1):
                    self.teacher_schedule[tch][day_i][s] = True
                    self.room_schedule[rm][day_i][s]      = True

            timetable[day][slot]   = block
            timetable[day][slot + 1] = block

        # Report any leftover (lab,batch) that still needed blocks
        for (lid, batch), rem in lab_needed.items():
            if rem > 0:
                print(f"❌ Unsatisfied regular lab {lab_info[lid]['subjectName']} batch {batch}: {rem}")

    def schedule_honours_labs(self,
                              timetable:           Dict[str, List[Optional[Any]]],
                              honours_labs:        List[Dict[str, Any]],
                              subject_teacher_map: Dict[str, str],
                              lab_room_map:        Dict[str, str]) -> None:
        needed: Dict[str, int] = {}
        info:   Dict[str, Dict[str, Any]] = {}
        for lab in honours_labs:
            lid = str(lab['_id'])
            needed[lid] = lab.get('contactHours', 0) // 2
            info[lid]   = lab

        candidates = [
            (d, s)
            for d in DAYS
            for s in LAB_CANDIDATE_SLOTS
            if s + 1 < SLOTS_PER_DAY
        ]
        random.shuffle(candidates)

        # Keep scheduling until all honours labs are placed or we cannot place anymore
        while any(cnt > 0 for cnt in needed.values()):
            placed = False
            for day, slot in candidates:
                if timetable[day][slot] is not None or timetable[day][slot + 1] is not None:
                    continue
                day_i = DAYS.index(day)

                # Check global conflicts for all remaining honours labs
                conflict = False
                for lid, cnt in needed.items():
                    if cnt > 0:
                        tch = subject_teacher_map.get(lid, "")
                        rm  = lab_room_map.get(lid, "")
                        for s in (slot, slot + 1):
                            if self.teacher_schedule[tch][day_i][s] or self.room_schedule[rm][day_i][s]:
                                conflict = True
                                break
                        if conflict:
                            break
                if conflict:
                    continue

                # Schedule all outstanding honours labs here (one 2-slot per lab)
                block = []
                for lid, cnt in list(needed.items()):
                    if cnt > 0:
                        sub = info[lid]
                        tch = subject_teacher_map.get(lid, "")
                        rm  = lab_room_map.get(lid, "")
                        block.append({
                            'subject':  sub['subjectName'],
                            'teacher':  tch,
                            'room':     rm,
                            'category': 'Honours/Minor'
                        })
                        needed[lid] -= 1
                        for s in (slot, slot + 1):
                            self.teacher_schedule[tch][day_i][s] = True
                            self.room_schedule[rm][day_i][s]      = True

                timetable[day][slot]   = block
                timetable[day][slot + 1] = block
                placed = True
                break

            if not placed:
                print("❌ Unable to place remaining honours/minor labs.")
                break

    # -----------------------------------------------------------------------------------------------------
    # LECTURE SCHEDULING FUNCTION with global conflict checks
    # -----------------------------------------------------------------------------------------------------
    def schedule_lectures(self,
                          timetable:           Dict[str, List[Optional[Any]]],
                          lecture_subjects:    List[Dict[str, Any]],
                          subject_teacher_map: Dict[str, str],
                          classrooms:         List[str]) -> None:
        # Categorize lectures
        inst = [s for s in lecture_subjects if s.get('category') == 'Institute Level Elective']
        dept = [s for s in lecture_subjects if s.get('category') == 'Department Level Elective']
        hon  = [s for s in lecture_subjects if s.get('category') == 'Honours/Minor']
        reg  = [s for s in lecture_subjects if s.get('category','Regular') == 'Regular']
        groups = []
        if inst:  groups.append(inst)
        if dept:  groups.append(dept)
        if hon:   groups.append(hon)

        # How many lectures needed per subject (one slot = 1 contact hour)
        need: Dict[str, int] = { str(s['_id']): s.get('contactHours', 0) for s in lecture_subjects }

        # Build a list of all currently-free (day,slot) pairs
        free = [
            (d, i)
            for d in DAYS
            for i, e in enumerate(timetable[d])
            if e is None
        ]
        random.shuffle(free)

        # First, place any grouped electives/honours (as a block of distinct lectures)
        for grp in groups:
            while any(need[str(s['_id'])] > 0 for s in grp):
                if not free:
                    print("❌ Not enough free slots for grouped elective/honours theory sessions.")
                    break
                placed = False
                for idx_fs, (day, slot) in enumerate(free):
                    day_i = DAYS.index(day)
                    # Check if any teacher in this group is busy at (day,slot)
                    if any(
                        self.teacher_schedule[ subject_teacher_map.get(str(s['_id']), "") ][day_i][slot]
                        for s in grp
                        if need[str(s['_id'])] > 0
                    ):
                        continue

                    # Try to assign each subject in grp that still needs placement
                    block: Dict[str, Dict[str, str]] = {}
                    conflict = False
                    for s in grp:
                        sid = str(s['_id'])
                        if need[sid] <= 0:
                            continue
                        teacher = subject_teacher_map.get(sid, "")  # default=""
                        # find a free classroom
                        room = None
                        for r in classrooms:
                            if not self.room_schedule[r][day_i][slot]:
                                room = r
                                break
                        if room is None:
                            conflict = True
                            break
                        block[sid] = {
                            'subject': s['subjectName'],
                            'teacher': teacher,
                            'room':    room
                        }

                    if conflict:
                        continue

                    # Actually commit all of them
                    for sid, data in block.items():
                        self.teacher_schedule[data['teacher']][day_i][slot] = True
                        self.room_schedule[data['room']][day_i][slot]       = True
                        need[sid] -= 1

                    timetable[day][slot] = block
                    free.pop(idx_fs)
                    placed = True
                    break

                if not placed:
                    print("❌ Could not place grouped lecture for subjects:", [s['subjectName'] for s in grp])
                    break

        # Next, place all remaining individual regular lectures one-by-one
        queue: List[str] = []
        for sid, cnt in need.items():
            queue += [sid] * cnt
        random.shuffle(queue)

        for sid in queue:
            placed = False
            for idx_fs, (day, slot) in enumerate(free):
                day_i = DAYS.index(day)
                teacher = subject_teacher_map.get(sid, "")  # default=""

                # If teacher is busy at (day,slot), skip
                if self.teacher_schedule[teacher][day_i][slot]:
                    continue

                # Find an available classroom for this slot
                room = None
                for r in classrooms:
                    if not self.room_schedule[r][day_i][slot]:
                        room = r
                        break
                if room is None:
                    continue

                # Commit this lecture
                subj_obj = next((s for s in lecture_subjects if str(s['_id']) == sid), None)
                timetable[day][slot] = {
                    'subject': subj_obj['subjectName'] if subj_obj else sid,
                    'teacher': teacher,
                    'room':    room
                }
                self.teacher_schedule[teacher][day_i][slot] = True
                self.room_schedule[room][day_i][slot]       = True
                free.pop(idx_fs)
                placed = True
                break

            if not placed:
                print(f"❌ Could not place lecture session for subject {sid}")

        # ── NEW: Replace any remaining None with “NPTEL/MOOC” placeholder ──
        for day in DAYS:
            for idx in range(SLOTS_PER_DAY):
                if timetable[day][idx] is None:
                    timetable[day][idx] = {
                        'subject': "NPTEL/MOOC",
                        'teacher': "",
                        'room':    "lab"
                    }

    # ---------------------------
    # CLASS SCHEDULING FUNCTION
    # ---------------------------
    def schedule_class(self,
                       class_data:       Dict[str, Any],
                       subjects:         List[Dict[str, Any]],
                       teachers:         List[Dict[str, Any]],
                       infrastructures:  List[Dict[str, Any]]) -> Dict[str, List[Optional[Any]]]:
        timetable = self.initialize_timetable()

        # Build mappings: subject_id -> teacher name
        subject_teacher_map: Dict[str, str] = {}
        for t in teachers:
            for sid in t.get('subjects', []):
                subject_teacher_map[str(sid)] = t.get('name', "")

        # Build mapping: lab_subject_id -> lab room number
        lab_room_map: Dict[str, str] = {}
        for infra in infrastructures:
            if infra.get('type') == 'lab':
                for sid in infra.get('labSubjectId', []):
                    lab_room_map[str(sid)] = infra.get('roomNo', "")

        # List of all classrooms
        classrooms: List[str] = [
            i.get('roomNo', "")
            for i in infrastructures
            if i.get('type') == 'classroom'
        ]

        # Filter this class’s subject IDs
        class_sids = set(map(str, class_data.get('subjects', [])))
        lab_subjs = [
            s for s in subjects
            if str(s['_id']) in class_sids and s.get('subjectType') == 'Lab'
        ]
        lec_subjs = [
            s for s in subjects
            if str(s['_id']) in class_sids and s.get('subjectType') == 'Theory'
        ]

        # Schedule labs then lectures
        self.schedule_labs(timetable, lab_subjs, subject_teacher_map, lab_room_map)
        self.schedule_lectures(timetable, lec_subjs, subject_teacher_map, classrooms)

        return timetable

    # -------------------------
    # MULTI-CLASS ENTRY POINT
    # -------------------------
    def generate_for_department(self,
                                department_id:    str,
                                academic_year_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Generate timetables for ALL classes in the given department & academic year,
        ensuring no teacher or room clashes across the entire batch.
        """
        subjects, teachers, classes, infrastructures = self.fetch_data(
            department_id=department_id,
            academic_year_id=academic_year_id
        )

        all_timetables: Dict[str, Any] = {}
        for cls in classes:
            cid = str(cls['_id'])
            print(f"Scheduling class: {cls.get('className', cid)}")
            all_timetables[cid] = self.schedule_class(
                cls, subjects, teachers, infrastructures
            )
        return all_timetables

    # --------------------------------------------------------
    # PUBLIC SINGLE-CLASS ENTRY POINT (unchanged)
    # --------------------------------------------------------
    def generate_timetable(self, selected_class_id: Optional[str] = None) -> Dict[str, Any]:
        subjects, teachers, classes, infrastructures = self.fetch_data(selected_class_id)
        return self.csp_solver(subjects, teachers, classes, infrastructures, selected_class_id)

# Public convenience for multi-class generation
def generate_timetables(department_id: str, academic_year_id: str) -> Dict[str, Dict[str, Any]]:
    """Convenience wrapper for multi-class generation."""
    return TimetableScheduler().generate_for_department(department_id, academic_year_id)

# -------------------------
# COMPATIBILITY WRAPPER
# -------------------------
def generate_timetable(*,
                       selected_class_id:    Optional[str] = None,
                       department_id:        Optional[str] = None,
                       academic_year_id:     Optional[str] = None):
    """
    - For single-class: pass selected_class_id
    - For department batch: pass department_id and academic_year_id
    """
    if selected_class_id and not department_id and not academic_year_id:
        return TimetableScheduler().generate_timetable(selected_class_id)
    if department_id and academic_year_id and not selected_class_id:
        return generate_timetables(department_id, academic_year_id)
    raise ValueError("Invalid parameters: provide either selected_class_id or both department_id and academic_year_id")


if __name__=='__main__':
    # Example usage:
    dept = 'YOUR_DEPARTMENT_ID_HERE'
    acad = 'YOUR_ACADEMIC_YEAR_ID_HERE'
    combined = generate_timetable(department_id=dept, academic_year_id=acad)
    print(combined)