from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017/timetableDB"

def get_db():
    """Return MongoDB client."""
    client = MongoClient(MONGO_URI)
    return client["timetableDB"]
