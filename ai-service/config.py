"""Central settings for the AI service, read from the project's .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parent.parent
# Loads MONGO_URI and GOOGLE_API_KEY from the repo-root .env (see .env.example)
load_dotenv(ROOT / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/timetableDB")
DB_NAME = os.getenv("MONGO_DB", "timetableDB")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
NER_MODEL_DIR = ROOT / "model" / "model-best"


def get_db():
    """Return the timetable database handle."""
    return MongoClient(MONGO_URI)[DB_NAME]
