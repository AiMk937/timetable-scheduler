#!/usr/bin/env python3
import json
from timetable_generator import generate_timetable

if __name__ == "__main__":
    # replace with one of your CSV keys, e.g. "Even_2024_BE"
    class_id = "Even_2024_BE"
    try:
        tt = generate_timetable(class_id)
        print(json.dumps(tt, indent=2))
    except Exception as e:
        print("Error:", e)