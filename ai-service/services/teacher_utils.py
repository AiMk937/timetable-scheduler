# services/teacher_utils.py

from typing import Dict, Any, List, Optional
from collections import defaultdict

# Must match whatever you use in generator.py for DAYS and SLOTS_PER_DAY
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS_PER_DAY = 7

def build_professor_timetables(
    all_class_timetables: Dict[str, Dict[str, List[Optional[Any]]]],
    class_id_to_name: Dict[str, str] = None
) -> Dict[str, Dict[str, List[Optional[Dict[str, Any]]]]]:
    """
    Given:
      all_class_timetables = {
         "CLASS_ID_1": {
             "Monday":   [ slot0, slot1, ..., slot6 ],
             "Tuesday":  [ ... ],
             ...
             "Friday":   [ ... ]
         },
         "CLASS_ID_2": { ... },
         ...
      }
    where each 'slot' is either:
      - None
      - a single‐lecture dict:    { "subject":..., "teacher":..., "room":... }
      - a lab‐block list: [ { "batch":..., "subject":..., "teacher":..., "room":... }, … ]

    Returns:
      {
         "Prof Alice": {
             "Monday":   [ s0, s1, ..., s6 ],
             "Tuesday":  [ ... ],
             ...
         },
         "Prof Bob": { ... },
         ...
      }
    where each professor's slot is either None or a dict:
      {
        "class":   "<className>",
        "subject": "<course name>",
        "room":    "<room no>",
        (optional) "batch": "B1"   # only for labs
      }
    """
    # 1) Gather every professor’s name from all class timetables
    prof_names = set()
    for class_id, weekly_grid in all_class_timetables.items():
        for day in DAYS:
            for slot_cell in weekly_grid.get(day, []):
                if slot_cell is None:
                    continue
                # If it’s a single‐lecture dict
                if isinstance(slot_cell, dict) and slot_cell.get("teacher"):
                    prof_names.add(slot_cell["teacher"])
                # If it’s a lab block list
                elif isinstance(slot_cell, list):
                    for lab_entry in slot_cell:
                        if lab_entry.get("teacher"):
                            prof_names.add(lab_entry["teacher"])

    # 2) Create a blank 5×7 grid of None for each professor
    prof_to_grid: Dict[str, Dict[str, List[Optional[Dict[str, Any]]]]] = {}
    for prof in prof_names:
        prof_to_grid[prof] = { day: [None]*SLOTS_PER_DAY for day in DAYS }

    # 3) Walk through each class’s timetable and “stamp” onto each prof’s grid
    for class_id, weekly_grid in all_class_timetables.items():
        # Resolve the display name (className) if provided
        class_label = class_id_to_name.get(class_id, class_id) if class_id_to_name else class_id

        for day in DAYS:
            day_slots = weekly_grid.get(day, [])
            for idx, slot_cell in enumerate(day_slots):
                if slot_cell is None:
                    # empty slot for this class → no one to stamp
                    continue

                # ---- CASE A: Single‐lecture (Theory) ----
                if isinstance(slot_cell, dict) and slot_cell.get("teacher"):
                    prof_name = slot_cell["teacher"]
                    prof_to_grid[prof_name][day][idx] = {
                        "class":   class_label,
                        "subject": slot_cell["subject"],
                        "room":    slot_cell["room"]
                    }

                # ---- CASE B: Lab block (list of entries) ----
                elif isinstance(slot_cell, list):
                    # If the previous slot (idx-1) is exactly the same block object,
                    # skip stamping again (to avoid double‐writing the second half of the 2‐slot lab).
                    if idx > 0 and weekly_grid[day][idx - 1] is slot_cell:
                        continue

                    # Now stamp each lab‐entry into two consecutive slots: idx and idx+1
                    for lab_entry in slot_cell:
                        prof_name = lab_entry.get("teacher")
                        if not prof_name:
                            continue

                        payload = {
                            "class":   class_label,
                            "batch":   lab_entry.get("batch", ""),
                            "subject": lab_entry["subject"],
                            "room":    lab_entry["room"]
                        }

                        prof_to_grid[prof_name][day][idx] = payload

                        if idx + 1 < SLOTS_PER_DAY:
                            prof_to_grid[prof_name][day][idx + 1] = payload

    return prof_to_grid