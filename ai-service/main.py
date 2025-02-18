from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
from services.timetable_generator import generate_timetable

app = FastAPI()

# MongoDB Connection
MONGO_URI = "mongodb://localhost:27017/"
client = MongoClient(MONGO_URI)
db = client["test"]

# Collections
timetables_col = db["timetables"]

@app.post("/generate-timetable")
def generate_and_store_timetable():
    timetable = generate_timetable()
    timetables_col.insert_one({"timetable": timetable})
    return {"message": "Timetable generated and stored successfully", "timetable": timetable}

@app.get("/get-timetable/{class_id}")
def get_timetable(class_id: str):
    result = timetables_col.find_one()
    if not result or "timetable" not in result:
        raise HTTPException(status_code=404, detail="Timetable not found")
    return result["timetable"].get(class_id, {})

@app.put("/update-timetable/{class_id}")
def update_timetable(class_id: str, day: str, slot: int, subject_name: str, teacher_name: str, room_no: str):
    result = timetables_col.find_one()
    if not result or "timetable" not in result:
        raise HTTPException(status_code=404, detail="Timetable not found")

    if class_id not in result["timetable"]:
        raise HTTPException(status_code=404, detail="Class timetable not found")

    result["timetable"][class_id][day][slot] = {"subject": subject_name, "teacher": teacher_name, "room": room_no}
    timetables_col.update_one({}, {"$set": {"timetable": result["timetable"]}})
    return {"message": "Timetable updated successfully"}
