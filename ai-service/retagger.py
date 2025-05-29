#!/usr/bin/env python3
"""
Section: Imports and Setup
This section imports necessary modules and defines constants.
"""

import os
import json

# Set the file paths (adjust these paths if needed)
INPUT_FILE = os.path.join("ai-service", "prompts", "training_prompts.json")
OUTPUT_FILE = os.path.join("ai-service", "prompts", "training_prompts_retagged.json")

# Define a mapping dictionary from old tags to new tags.
# For example, we merge SUBJECT1 and SUBJECT2 into "SUBJECT", SLOT_SOURCE and SLOT_TARGET into "SLOT", etc.
TAG_MAPPING = {
    "SUBJECT1": "SUBJECT",
    "SUBJECT2": "SUBJECT",
    "SLOT_SOURCE": "SLOT",
    "SLOT_TARGET": "SLOT",
    "DAY_SOURCE": "DAY",
    "DAY_TARGET": "DAY",
    "ROOM_SOURCE": "ROOM",
    "ROOM_TARGET": "ROOM",
    "TEACHER": "TEACHER",
    "BUSY_DAY": "DAY",       # You can choose to keep BUSY_DAY if you wish
    "TARGET_DAY": "DAY",
    "SLOT_THRESHOLD": "SLOT",
    "TIME_SOURCE": "TIME",
    "TIME_TARGET": "TIME"
}

"""
Section: Function to Re-tag Entities
This function remaps entity labels in one training example.
"""

def retag_entities(example):
    # Expect example to be a tuple (text, {"entities": list_of_entities})
    text, annotations = example
    new_entities = []
    # Each entity is assumed to be a tuple: (start, end, label)
    for start, end, label in annotations.get("entities", []):
        # Use our mapping; if label is not in the mapping, keep it unchanged.
        new_label = TAG_MAPPING.get(label, label)
        new_entities.append((start, end, new_label))
    return (text, {"entities": new_entities})

"""
Section: Read Input and Process Data
This part reads the JSON file, processes each example, and applies re-tagging.
"""

def process_training_prompts(input_path):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")
    with open(input_path, "r", encoding="utf-8") as infile:
        data = json.load(infile)
    
    # Assume data is a list of documents where each document has at least a "command" field and an "entities" field.
    processed = []
    for doc in data:
        # Get the command text and the associated entities.
        text = doc.get("command", "")
        entities = doc.get("entities", [])
        # Here we support both a list of dicts or a list of lists.
        normalized_entities = []
        for ent in entities:
            if isinstance(ent, dict):
                normalized_entities.append((ent["start"], ent["end"], ent["label"]))
            elif isinstance(ent, list) and len(ent) >= 3:
                normalized_entities.append((ent[0], ent[1], ent[2]))
            else:
                # Skip if not in expected format.
                print(f"Skipping entity in: {text}")
        # Create a tuple for the example and re-tag entities.
        example = (text, {"entities": normalized_entities})
        retagged = retag_entities(example)
        processed.append(retagged)
    return processed

"""
Section: Write Processed Data to Output File
This function writes the re-tagged examples into a new JSON file.
"""

def write_retagged_data(processed_data, output_path):
    # We will output a list of dicts with "command" and "entities".
    output_list = []
    for text, annotations in processed_data:
        # Convert the tuple for each entity back into a dict for JSON output.
        entity_dicts = [{"start": start, "end": end, "label": label} for start, end, label in annotations.get("entities", [])]
        output_list.append({"command": text, "entities": entity_dicts})
    with open(output_path, "w", encoding="utf-8") as outfile:
        json.dump(output_list, outfile, indent=2)
    print(f"Re-tagged data saved to {output_path}")

"""
Section: Main Function
This section ties everything together.
"""

def main():
    try:
        processed_data = process_training_prompts(INPUT_FILE)
        print(f"Processed {len(processed_data)} examples.")
        write_retagged_data(processed_data, OUTPUT_FILE)
    except Exception as e:
        print(f"Error processing training prompts: {e}")

if __name__ == "__main__":
    main()