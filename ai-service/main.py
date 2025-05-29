# main.py
from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
from services.generator import generate_timetables

app = FastAPI()

# MongoDB connection settings
MONGO_URI = "mongodb+srv://aimaanjkhaan:Arshee2597@cluster1.1ycsg.mongodb.net/timetableDB?retryWrites=true&w=majority&appName=Cluster1"
client = MongoClient(MONGO_URI)
db = client["test"]
timetables_col = db["timetables"]

@app.post("/generate-timetable")
def generate_and_store_timetable(payload: dict):
    """
    Expects JSON payload with:
      - departmentId (ObjectId string)
      - academicYearId (ObjectId string)

    Generates timetables for all classes in that department and academic year,
    saves each under its classId, and returns the collection of schedules.
    """
    dept_id = payload.get("departmentId")
    acad_year_id = payload.get("academicYearId")

    # Validate batch parameters
    if not dept_id or not acad_year_id:
        raise HTTPException(
            status_code=400,
            detail="Both departmentId and academicYearId are required for batch generation."
        )

    # Generate timetables for the entire batch
    schedules = generate_timetables(dept_id, acad_year_id)

    # Persist each class's timetable
    for cid, schedule in schedules.items():
        timetables_col.update_one(
            { "classId": cid, "departmentId": dept_id, "academicYearId": acad_year_id },
            { "$set": { "timetable": schedule } },
            upsert=True
        )

    return {
        "message": "Batch timetables generated and stored successfully",
        "timetables": schedules
    }

@app.get("/get-timetable/{class_id}")
def get_timetable(class_id: str):
    """Retrieve a timetable by classId."""
    doc = timetables_col.find_one({ "classId": class_id })
    if not doc or "timetable" not in doc:
        raise HTTPException(status_code=404, detail="Timetable not found")
    return doc["timetable"]

@app.put("/update-timetable/{class_id}")
def update_timetable(class_id: str, day: str, slot: int, subject_name: str, teacher_name: str, room_no: str):
    """Update a specific slot within an existing class timetable."""
    doc = timetables_col.find_one({ "classId": class_id })
    if not doc or "timetable" not in doc:
        raise HTTPException(status_code=404, detail="Timetable not found")

    timetable = doc["timetable"]
    if day not in timetable or slot < 0 or slot >= len(timetable[day]):
        raise HTTPException(status_code=400, detail="Invalid day or slot index")

    timetable[day][slot] = {
        "subject": subject_name,
        "teacher": teacher_name,
        "room": room_no
    }

    timetables_col.update_one(
        { "_id": doc["_id"] },
        { "$set": { "timetable": timetable } }
    )
    return { "message": "Timetable updated successfully" }
