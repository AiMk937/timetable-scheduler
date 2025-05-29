#!/usr/bin/env python
# parse_command.py
import sys
import json
import re
import spacy

# Load a transformer-based spaCy model.
# Make sure you install it via: python -m spacy download en_core_web_trf
nlp = spacy.load("en_core_web_trf")

def fallback_extract_slots(command_text, existing_entities):
    """
    This function tries to find slot references in the text if the model didn't catch them.
    It uses a regex to look for patterns like "slot 1", "slot 2", etc.
    """
    # Check if we already have the necessary slot entities.
    slot_labels_in_entities = [ent["label"] for ent in existing_entities if ent["label"] in ["SLOT_SOURCE", "SLOT_TARGET"]]
    if slot_labels_in_entities.count("SLOT_SOURCE") > 0 and slot_labels_in_entities.count("SLOT_TARGET") > 0:
        return existing_entities

    # Regex to find "slot <number>"
    slot_pattern = re.compile(r"\bslot\s+(\d+)\b", re.IGNORECASE)
    found_slots = slot_pattern.findall(command_text)
    if len(found_slots) == 0:
        return existing_entities

    new_entities = existing_entities[:]  # Copy existing entities.
    used_labels = set(ent["label"] for ent in new_entities)

    for slot_num in found_slots:
        pattern_str = f"slot {slot_num}"
        match_idx = command_text.lower().find(pattern_str.lower())
        if match_idx == -1:
            continue
        start = match_idx
        end = start + len(pattern_str)
        if "SLOT_SOURCE" not in used_labels:
            label = "SLOT_SOURCE"
            used_labels.add("SLOT_SOURCE")
        elif "SLOT_TARGET" not in used_labels:
            label = "SLOT_TARGET"
            used_labels.add("SLOT_TARGET")
        else:
            continue

        new_entities.append({
            "text": command_text[start:end],
            "label": label,
            "start": start,
            "end": end
        })

    return new_entities

def fallback_extract_dates(command_text, existing_entities):
    """
    This function attempts to find day names (e.g., Monday, Tuesday, etc.)
    in the command if fewer than two DATE entities are detected.
    """
    # Count existing DATE entities.
    existing_dates = [ent for ent in existing_entities if ent["label"] == "DATE"]
    if len(existing_dates) >= 2:
        return existing_entities

    # Regex to match day names.
    day_pattern = re.compile(r"\b(Monday|Tuesday|Wednesday|Thursday|Friday)\b", re.IGNORECASE)
    new_entities = existing_entities[:]
    for match in day_pattern.finditer(command_text):
        text = match.group(0)
        # Only add if this day is not already present.
        if not any(ent["label"] == "DATE" and ent["text"].lower() == text.lower() for ent in new_entities):
            new_entities.append({
                "text": text,
                "label": "DATE",
                "start": match.start(),
                "end": match.end()
            })
            # If we've found two DATE entities, break out.
            if len([ent for ent in new_entities if ent["label"] == "DATE"]) >= 2:
                break
    return new_entities

def main():
    command_text = " ".join(sys.argv[1:])  # Read command from CLI arguments.
    if not command_text.strip():
        result = {"command": "", "entities": []}
        print(json.dumps(result))
        return

    # Process the command text using the transformer-based spaCy model.
    doc = nlp(command_text)
    entities = []
    for ent in doc.ents:
        entities.append({
            "text": ent.text,
            "label": ent.label_,
            "start": ent.start_char,
            "end": ent.end_char
        })

    # Apply fallback extraction for slot numbers.
    entities = fallback_extract_slots(command_text, entities)
    # Apply fallback extraction for dates.
    entities = fallback_extract_dates(command_text, entities)

    parsed_output = {
        "command": command_text,
        "entities": entities
    }
    print(json.dumps(parsed_output, indent=2))

if __name__ == "__main__":
    main()
