# insert_training_prompts.py
import pymongo
import json

MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "test"  # Change if necessary

client = pymongo.MongoClient(MONGO_URI)
db = client[DB_NAME]
training_prompts_collection = db["trainingPrompts"]

with open("ai-service/prompts/training_prompts_retagged.json", "r", encoding="utf-8") as f:
    prompts = json.load(f)

result = training_prompts_collection.insert_many(prompts)
print("Inserted document IDs:", result.inserted_ids)
client.close()