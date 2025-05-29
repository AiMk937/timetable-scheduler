from pydantic import BaseModel

class UpdateTimetableRequest(BaseModel):
    day: str
    slot: int
    subject_name: str
    teacher_name: str
    room_no: str