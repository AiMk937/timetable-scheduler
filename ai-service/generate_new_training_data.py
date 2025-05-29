#!/usr/bin/env python3
"""
Script: generate_new_training_data.py
Purpose: Generate synthetic re‑tagged training examples for a timetabling domain.
         Four types of examples are generated:
           1) Subject-switch commands.
           2) Teacher schedule adjustment commands.
           3) Teacher swap (assignment) commands.
           4) Room change commands.
Output: A JSON file ("new_training_prompts.json") containing the new training data.
Usage: python generate_new_training_data.py
"""

import json
import random
import os

# =======================
# Section 1: Configuration and Data Lists
# =======================
SUBJECTS = [
    "Engineering Mathematics I & II", "Engineering Physics I & II", "Engineering Chemistry I & II",
    "Basic Electrical Engineering", "Basic Electronics Engineering", "Environmental Studies",
    "Engineering Graphics", "Structured Programming Approach", "Communication Skills",
    "Discrete Mathematics", "Digital Logic Design and Analysis", "Electronic Circuits and Communication",
    "Data Structures", "Object Oriented Programming Methodologies", "Applied Mathematics",
    "Microprocessors", "Theory of Computer Science", "Database Management Systems",
    "Computer Networks", "Operating Systems", "Software Engineering", "System Security",
    "Software Testing and Quality Assurance", "Advanced Internet Technology", "Mobile Computing",
    "Artificial Intelligence", "Robotics", "Cyber Law", "Digital Signal Processing"
]

TEACHERS = [
    "Professor Smith", "Professor Johnson", "Professor Williams", "Professor Davis",
    "Professor Miller", "Professor Brown", "Professor Taylor", "Professor Anderson",
    "Professor Wilson", "Professor Martinez"
]

ROOMS = ["101", "102", "205", "207", "303", "305", "150", "152", "110", "112", "210", "212", "310", "312", "220", "222", "307", "115", "117", "330", "332"]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS = [str(i) for i in range(1, 7)]  # Slots "1" to "6"

# Number of examples to generate for each type:
NUM_SUBJECT_SWITCH = 300
NUM_TEACHER_ADJUST = 200
NUM_TEACHER_SWAP   = 100
NUM_ROOM_CHANGE    = 100

# =======================
# Section 2: Template Definitions
# =======================
# Templates for subject-switch commands:
SUBJECT_SWITCH_TEMPLATES = [
    "switch the subject {subj1} in slot {slot1} on {day} with subject {subj2} in slot {slot2} on {day}",
    "swap subject {subj1} from slot {slot1} on {day} with subject {subj2} from slot {slot2} on {day}",
    "exchange {subj1} in slot {slot1} on {day} for {subj2} in slot {slot2} on {day}"
]

# Templates for teacher schedule adjustment commands:
TEACHER_ADJUST_TEMPLATES = [
    "{teacher} in classroom {room1} is busy on {day1}. Please shift his lectures to {day2} in classroom {room2}.",
    "Due to a schedule conflict, {teacher} (classroom {room1}) is unavailable on {day1}; reschedule his classes to {day2} in classroom {room2}.",
    "{teacher} (room {room1}) is not available on {day1}. Kindly move his lectures to {day2} in classroom {room2}."
]

# Templates for teacher swap (assignment) commands:
TEACHER_SWAP_TEMPLATES = [
    "switch the teacher for subject {subj} in slot {slot} on {day} from {teacher1} to {teacher2}",
    "swap teachers for {subj} in slot {slot} on {day}: change from {teacher1} to {teacher2}"
]

# Templates for room change commands:
ROOM_CHANGE_TEMPLATES = [
    "switch the classroom for subject {subj} in slot {slot} on {day} from classroom {room1} to classroom {room2}",
    "move {subj} from classroom {room1} to classroom {room2} in slot {slot} on {day}",
    "change the room for {subj} scheduled in slot {slot} on {day} from {room1} to {room2}"
]

# =======================
# Section 3: Functions to Compute Offsets and Generate Examples
# =======================
def compute_offsets(command, substring, label, occurrence="first"):
    """
    Compute character offsets for the given substring in the command.
    Use command.find() for first occurrence and command.rfind() for last.
    Returns a dictionary with keys "start", "end", and "label" or None if not found.
    """
    if occurrence == "first":
        start = command.find(substring)
    else:
        start = command.rfind(substring)
    if start == -1:
        return None
    return {"start": start, "end": start + len(substring), "label": label}

def generate_subject_switch_example():
    """Generate a subject-switch example."""
    template = random.choice(SUBJECT_SWITCH_TEMPLATES)
    subj1, subj2 = random.sample(SUBJECTS, 2)
    slot1, slot2 = random.sample(SLOTS, 2)
    day = random.choice(DAYS)
    command = template.format(subj1=subj1, subj2=subj2, slot1=slot1, slot2=slot2, day=day)
    entities = []
    # SUBJECT 1 (first occurrence)
    ent = compute_offsets(command, subj1, "SUBJECT", "first")
    if ent: entities.append(ent)
    # SLOT 1: find phrase "slot {slot1}" and tag only the number part
    slot1_phrase = f"slot {slot1}"
    pos = command.find(slot1_phrase)
    if pos != -1:
        num_start = pos + len("slot ")
        entities.append({"start": num_start, "end": num_start + len(slot1), "label": "SLOT"})
    # DAY (first occurrence)
    ent = compute_offsets(command, day, "DAY", "first")
    if ent: entities.append(ent)
    # SUBJECT 2 (last occurrence)
    ent = compute_offsets(command, subj2, "SUBJECT", "last")
    if ent: entities.append(ent)
    # SLOT 2 (last occurrence)
    slot2_phrase = f"slot {slot2}"
    pos = command.rfind(slot2_phrase)
    if pos != -1:
        num_start = pos + len("slot ")
        entities.append({"start": num_start, "end": num_start + len(slot2), "label": "SLOT"})
    # DAY (last occurrence)
    ent = compute_offsets(command, day, "DAY", "last")
    if ent: entities.append(ent)
    return {"command": command, "entities": entities}

def generate_teacher_adjust_example():
    """Generate a teacher schedule adjustment example."""
    template = random.choice(TEACHER_ADJUST_TEMPLATES)
    teacher = random.choice(TEACHERS)
    room1 = random.choice(ROOMS)
    room2 = random.choice([r for r in ROOMS if r != room1])
    day1 = random.choice(DAYS)
    day2 = random.choice([d for d in DAYS if d != day1])
    command = template.format(teacher=teacher, room1=room1, room2=room2, day1=day1, day2=day2)
    entities = []
    # TEACHER (first occurrence)
    ent = compute_offsets(command, teacher, "TEACHER", "first")
    if ent: entities.append(ent)
    # ROOM (first occurrence)
    room1_phrase = f"classroom {room1}"
    pos = command.find(room1_phrase)
    if pos != -1:
        num_start = pos + len("classroom ")
        entities.append({"start": num_start, "end": num_start + len(room1), "label": "ROOM"})
    # DAY (busy day, first occurrence)
    ent = compute_offsets(command, day1, "DAY", "first")
    if ent: entities.append(ent)
    # DAY (target day, last occurrence)
    ent = compute_offsets(command, day2, "DAY", "last")
    if ent: entities.append(ent)
    # ROOM (target room, last occurrence)
    room2_phrase = f"classroom {room2}"
    pos = command.rfind(room2_phrase)
    if pos != -1:
        num_start = pos + len("classroom ")
        entities.append({"start": num_start, "end": num_start + len(room2), "label": "ROOM"})
    return {"command": command, "entities": entities}

def generate_teacher_swap_example():
    """Generate a teacher swap (assignment) example.
    Format: "switch the teacher for subject {subj} in slot {slot} on {day} from {teacher1} to {teacher2}"
    """
    template = random.choice(TEACHER_SWAP_TEMPLATES)
    subj = random.choice(SUBJECTS)
    slot = random.choice(SLOTS)
    day = random.choice(DAYS)
    teacher1, teacher2 = random.sample(TEACHERS, 2)
    command = template.format(subj=subj, slot=slot, day=day, teacher1=teacher1, teacher2=teacher2)
    entities = []
    # SUBJECT
    ent = compute_offsets(command, subj, "SUBJECT", "first")
    if ent: entities.append(ent)
    # SLOT
    slot_phrase = f"slot {slot}"
    pos = command.find(slot_phrase)
    if pos != -1:
        num_start = pos + len("slot ")
        entities.append({"start": num_start, "end": num_start + len(slot), "label": "SLOT"})
    # DAY
    ent = compute_offsets(command, day, "DAY", "first")
    if ent: entities.append(ent)
    # TEACHER 1 (first occurrence)
    ent = compute_offsets(command, teacher1, "TEACHER", "first")
    if ent: entities.append(ent)
    # TEACHER 2 (last occurrence)
    ent = compute_offsets(command, teacher2, "TEACHER", "last")
    if ent: entities.append(ent)
    return {"command": command, "entities": entities}

def generate_room_change_example():
    """Generate a room change command.
    Format: "switch the classroom for subject {subj} in slot {slot} on {day} from classroom {room1} to classroom {room2}"
    """
    template = random.choice(ROOM_CHANGE_TEMPLATES)
    subj = random.choice(SUBJECTS)
    slot = random.choice(SLOTS)
    day = random.choice(DAYS)
    room1 = random.choice(ROOMS)
    room2 = random.choice([r for r in ROOMS if r != room1])
    command = template.format(subj=subj, slot=slot, day=day, room1=room1, room2=room2)
    entities = []
    # SUBJECT
    ent = compute_offsets(command, subj, "SUBJECT", "first")
    if ent: entities.append(ent)
    # SLOT
    slot_phrase = f"slot {slot}"
    pos = command.find(slot_phrase)
    if pos != -1:
        num_start = pos + len("slot ")
        entities.append({"start": num_start, "end": num_start + len(slot), "label": "SLOT"})
    # DAY (first occurrence; assuming day appears only once)
    ent = compute_offsets(command, day, "DAY", "first")
    if ent: entities.append(ent)
    # ROOM 1 (first occurrence)
    room1_phrase = f"classroom {room1}"
    pos = command.find(room1_phrase)
    if pos != -1:
        num_start = pos + len("classroom ")
        entities.append({"start": num_start, "end": num_start + len(room1), "label": "ROOM"})
    # ROOM 2 (last occurrence)
    room2_phrase = f"classroom {room2}"
    pos = command.rfind(room2_phrase)
    if pos != -1:
        num_start = pos + len("classroom ")
        entities.append({"start": num_start, "end": num_start + len(room2), "label": "ROOM"})
    return {"command": command, "entities": entities}

# =======================
# Section 4: Generate and Save Training Data
# =======================
def generate_training_data():
    data = []
    for _ in range(NUM_SUBJECT_SWITCH):
        data.append(generate_subject_switch_example())
    for _ in range(NUM_TEACHER_ADJUST):
        data.append(generate_teacher_adjust_example())
    for _ in range(NUM_TEACHER_SWAP):
        data.append(generate_teacher_swap_example())
    for _ in range(NUM_ROOM_CHANGE):
        data.append(generate_room_change_example())
    random.shuffle(data)
    return data

def main():
    new_data = generate_training_data()
    output_file = os.path.join("ai-service", "prompts", "new_training_prompts.json")
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(new_data, f, indent=2)
    print(f"Generated {len(new_data)} training examples and saved to '{output_file}'.")

if __name__ == "__main__":
    # Set a random seed for reproducibility.
    random.seed(42)
    main()