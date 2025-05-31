#!/usr/bin/env python3
# ai-service/main.py

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List
from pymongo import MongoClient
from bson.objectid import ObjectId

import pandas as pd
import io

from services.generator import generate_timetables
from services.teacher_utils import build_professor_timetables

# Styling imports for Excel formatting
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

app = FastAPI()

# ── MongoDB setup ─────────────────────────────────────────────────────
MONGO_URI = (
    "mongodb+srv://aimaanjkhaan:Arshee2597@cluster1.1ycsg.mongodb.net/"
    "timetableDB?retryWrites=true&w=majority&appName=Cluster1"
)
client = MongoClient(MONGO_URI)
db = client["timetableDB"]
timetables_col = db["timetables"]
classes_col    = db["classes"]
teachers_col   = db["teachers"]

# ── Constants ─────────────────────────────────────────────────────────
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS_PER_DAY = 7

# ── Pydantic models ───────────────────────────────────────────────────
class GeneratePayload(BaseModel):
    departmentId: str
    academicYearId: str

# ── Helper: build a DataFrame from a weekly‐grid ───────────────────────
def _build_df_from_grid(weekly_grid: Dict[str, List[Any]]) -> pd.DataFrame:
    data_rows = []
    for slot_idx in range(SLOTS_PER_DAY):
        row: List[str] = []
        for day in DAYS:
            cell = weekly_grid.get(day, [None]*SLOTS_PER_DAY)[slot_idx]
            if cell is None:
                row.append("")
                continue

            if isinstance(cell, dict):
                subj = cell.get("subject", "")
                cls  = cell.get("class", "")
                room = cell.get("room", "")
                batch = cell.get("batch", "")
                line1 = subj
                line2 = f"Class: {cls}" if cls else ""
                if batch:
                    line2 += f" (Batch: {batch})"
                line3 = f"Room: {room}" if room else ""
                parts = [p for p in (line1, line2, line3) if p]
                row.append("\n".join(parts))
                continue

            if isinstance(cell, list):
                block_lines: List[str] = []
                for lab_entry in cell:
                    subj = lab_entry.get("subject", "")
                    cls  = lab_entry.get("class", "")
                    room = lab_entry.get("room", "")
                    batch = lab_entry.get("batch", "")
                    lines = []
                    if subj:
                        lines.append(subj)
                    if cls:
                        text = f"Class: {cls}"
                        if batch:
                            text += f" (Batch: {batch})"
                        lines.append(text)
                    if room:
                        lines.append(f"Room: {room}")
                    block_lines.append("\n".join(lines))
                row.append("\n---\n".join(block_lines))
                continue

            row.append(str(cell))
        data_rows.append(row)

    df = pd.DataFrame(
        data_rows,
        index=[f"Slot {i+1}" for i in range(SLOTS_PER_DAY)],
        columns=DAYS
    )
    return df

# ── Endpoint: generate & store timetables ────────────────────────────
@app.post("/generate-timetable")
def generate_and_store_timetable(payload: GeneratePayload) -> Dict[str, Any]:
    dept_id      = payload.departmentId
    acad_year_id = payload.academicYearId

    if not dept_id or not acad_year_id:
        raise HTTPException(status_code=400, detail="Both departmentId and academicYearId are required.")

    raw_schedules = generate_timetables(dept_id, acad_year_id)
    if not raw_schedules:
        raise HTTPException(status_code=404, detail="No timetables generated.")

    schedules_list: List[Dict[str, Any]] = []
    class_id_to_name: Dict[str, str] = {}

    for class_id_str, schedule_obj in raw_schedules.items():
        try:
            cls_doc = classes_col.find_one({"_id": ObjectId(class_id_str)})
            class_name = cls_doc.get("className", class_id_str) if cls_doc else class_id_str
        except:
            class_name = class_id_str

        timetables_col.update_one(
            {"classId": class_id_str, "departmentId": dept_id, "academicYearId": acad_year_id},
            {"$set": {"timetable": schedule_obj}},
            upsert=True
        )

        schedules_list.append({"className": class_name, "schedule": schedule_obj})
        class_id_to_name[class_id_str] = class_name

    prof_temp_dict = build_professor_timetables(raw_schedules, class_id_to_name)
    prof_tables_list: List[Dict[str, Any]] = [
        {"profName": prof_name, "schedule": prof_schedule}
        for prof_name, prof_schedule in prof_temp_dict.items()
    ]

    return {"schedules": schedules_list, "profTables": prof_tables_list}

# ── Endpoint: export all timetables to a single .xlsx ───────────────
@app.get("/export-timetables")
def export_timetables(
    departmentId: str = Query(...),
    academicYearId: str = Query(...)
) -> StreamingResponse:
    """
    1) Calls generate_timetables(dept_id, acad_year_id) → raw_schedules.
    2) If raw_schedules is empty, raise 404.
    3) Build class_id → className map.
    4) Build professor timetables via build_professor_timetables(...).
    5) Create a single in‐memory .xlsx with pandas+openpyxl:
          • One sheet per class (named ≤31 chars).
          • One sheet per professor (named ≤31 chars).
       Each sheet is a tight DataFrame (no “free space” rows).
    6) Stream that .xlsx back to the browser.
    """
    dept_id      = departmentId
    acad_year_id = academicYearId

    if not dept_id or not acad_year_id:
        raise HTTPException(
            status_code=400,
            detail="Both departmentId and academicYearId are required."
        )

    # 1) Regenerate raw timetables:
    raw_schedules: Dict[str, Dict[str, Any]] = generate_timetables(dept_id, acad_year_id)

    # 2) If nothing came back, 404:
    if not raw_schedules:
        raise HTTPException(status_code=404, detail="No timetables found for that department/year.")

    # 3) Build class_id → className map
    class_id_to_name: Dict[str, str] = {}
    for class_id_str in raw_schedules.keys():
        try:
            cls_doc = classes_col.find_one({"_id": ObjectId(class_id_str)})
            if cls_doc and cls_doc.get("className"):
                class_name = cls_doc["className"]
            else:
                class_name = class_id_str
        except:
            class_name = class_id_str
        # Trim to 31 chars (Excel sheet‐name limit)
        class_id_to_name[class_id_str] = class_name[:31]

    # 4) Build per‐professor timetables
    prof_schedules: Dict[str, Dict[str, List[Any]]] = build_professor_timetables(
        raw_schedules, class_id_to_name
    )

    # 5) Write everything to an in‐memory Excel workbook:
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        # 5a) One sheet per class
        for class_id_str, weekly_grid in raw_schedules.items():
            sheet_name = class_id_to_name[class_id_str]
            df_class = _build_df_from_grid(weekly_grid)
            # Write the DataFrame with its index‐column labeled “Slot”
            df_class.to_excel(
                writer,
                sheet_name=sheet_name,
                index_label="Slot",
                # We do not need index=False; we want “Slot 1…Slot 7” in column A
            )
            # Grab the newly‐written worksheet object so we can apply wrap‐text
            ws = writer.book[sheet_name]
            # Freeze top row so headers stay visible
            ws.freeze_panes = "A2"
            # Wrap text and auto‐size columns
            for row in ws.iter_rows(min_row=1, max_row=SLOTS_PER_DAY + 1, min_col=1, max_col=len(DAYS) + 1):
                for cell in row:
                    cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
            # Auto‐adjust column widths to a reasonable fixed width
            for col_letter, max_len in zip(
                    ["A","B","C","D","E","F"],  # Up to 5 weekdays + 1 “Slot” column
                    [10, 30, 30, 30, 30, 30]    # You can tweak these numbers
                ):
                ws.column_dimensions[col_letter].width = max_len

        # 5b) One sheet per professor
        for prof_name, weekly_grid in prof_schedules.items():
            sheet_name = prof_name[:31]  # ensure ≤31 chars
            df_prof = _build_df_from_grid(weekly_grid)
            df_prof.to_excel(
                writer,
                sheet_name=sheet_name,
                index_label="Slot"
            )
            ws = writer.book[sheet_name]
            ws.freeze_panes = "A2"
            for row in ws.iter_rows(min_row=1, max_row=SLOTS_PER_DAY + 1, min_col=1, max_col=len(DAYS) + 1):
                for cell in row:
                    cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
            for col_letter, max_len in zip(
                    ["A","B","C","D","E","F"],
                    [10, 30, 30, 30, 30, 30]
                ):
                ws.column_dimensions[col_letter].width = max_len

        # No need to call writer.save() explicitly; the “with” block will handle it.

    output.seek(0)
    headers = {
        "Content-Disposition": 'attachment; filename="timetables.xlsx"'
    }
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )

# ── Endpoint: retrieve a saved timetable by classId ────────────────
@app.get("/get-timetable/{class_id}")
def get_timetable(class_id: str):
    doc = timetables_col.find_one({"classId": class_id})
    if not doc or "timetable" not in doc:
        raise HTTPException(status_code=404, detail="Timetable not found")
    return doc["timetable"]

# ── Endpoint: update a single slot inside an existing timetable ─────
@app.put("/update-timetable/{class_id}")
def update_timetable(class_id: str, day: str, slot: int, subject_name: str, teacher_name: str, room_no: str):
    doc = timetables_col.find_one({"classId": class_id})
    if not doc or "timetable" not in doc:
        raise HTTPException(status_code=404, detail="Timetable not found")

    timetable = doc["timetable"]
    if day not in timetable or slot < 0 or slot >= len(timetable[day]):
        raise HTTPException(status_code=400, detail="Invalid day or slot index")

    timetable[day][slot] = {"subject": subject_name, "teacher": teacher_name, "room": room_no}
    timetables_col.update_one({"_id": doc["_id"]}, {"$set": {"timetable": timetable}})
    return {"message": "Timetable updated successfully"}