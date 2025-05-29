# main.py
from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
from services.test import generate_timetable

app = FastAPI()

# MongoDB connection settings
MONGO_URI = "mongodb://localhost:27017/"
client = MongoClient(MONGO_URI)
db = client["test"]

# Collection for timetables
timetables_col = db["timetables"]

@app.post("/generate-timetable")
def generate_and_store_timetable(payload: dict):
    """
    Expects a JSON payload with the following structure:
    {
      "academicYearId": "...",  // (optional)
      "classId": "...",         // MUST be provided to generate for a specific class
      "departmentId": "..."      // (optional)
    }
    
    This endpoint calls the timetable generator with the selected class ID,
    saves the resulting timetable in the database (under the selected class key),
    and returns the generated timetable.
    """
    # Check that classId is provided
    if "classId" not in payload or not payload["classId"]:
        raise HTTPException(status_code=400, detail="classId is required.")

    # Generate timetable for only the selected class
    final_timetable = generate_timetable(selected_class_id=payload["classId"])


    # Save the timetable in the DB under its own document.
    timetables_col.insert_one({
        "classId": payload["classId"],
        "academicYearId": payload.get("academicYearId", None),
        "departmentId": payload.get("departmentId", None),
        "timetable": final_timetable
    })

    return {
        "message": "Timetable generated and stored successfully",
        "timetable": final_timetable
    }

@app.get("/get-timetable/{class_id}")
def get_timetable(class_id: str):
    result = timetables_col.find_one({"classId": class_id})
    if not result or "timetable" not in result:
        raise HTTPException(status_code=404, detail="Timetable not found")
    return result["timetable"]

@app.put("/update-timetable/{class_id}")
def update_timetable(class_id: str, day: str, slot: int, subject_name: str, teacher_name: str, room_no: str):
    result = timetables_col.find_one({"classId": class_id})
    if not result or "timetable" not in result:
        raise HTTPException(status_code=404, detail="Timetable not found")
    if day not in result["timetable"]:
        raise HTTPException(status_code=404, detail="Day not found in timetable")
    result["timetable"][day][slot] = {
        "subject": subject_name,
        "teacher": teacher_name,
        "room": room_no
    }
    timetables_col.update_one({"_id": result["_id"]}, {"$set": {"timetable": result["timetable"]}})
    return {"message": "Timetable updated successfully"}