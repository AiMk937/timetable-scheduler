#!/usr/bin/env python3
"""
Script: inspect_retagged_data.py
Purpose: Load re‑tagged training data from a JSON file, tokenize each example with spaCy,
         and print detailed information about token boundaries and entity spans.
         This helps diagnose mis‑alignment issues that might cause low or zero NER scores.
Usage: python inspect_retagged_data.py
"""

import json
import os
import spacy
from spacy.util import filter_spans

# =======================
# Section 1: Configuration
# =======================
# Path to your re‑tagged training data JSON file.
DATA_FILE = os.path.join("ai-service", "prompts", "new_training_prompts.json")

# Create a blank spaCy English model for tokenization.
nlp = spacy.blank("en")

# =======================
# Section 2: Data Loading
# =======================
def load_training_data(filepath):
    """Load training data from a JSON file."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

# =======================
# Section 3: Inspection Function
# =======================
def inspect_examples(data):
    """
    For each training example, tokenize the text and try to create entity spans.
    The function prints tokenized output, details about each entity span, and indicates if any entity is skipped.
    """
    total = len(data)
    print(f"Total examples: {total}\n")
    for idx, item in enumerate(data):
        text = item.get("command", "")
        raw_entities = item.get("entities", [])
        
        doc = nlp(text)
        tokens = [token.text for token in doc]
        print(f"--- Example {idx+1} ---")
        print("Text:", text)
        print("Tokens:", tokens)
        
        valid_entities = []
        for ent in raw_entities:
            start, end, label = ent["start"], ent["end"], ent["label"]
            span = doc.char_span(start, end, label=label, alignment_mode="contract")
            if span is None:
                span = doc.char_span(start, end, label=label, alignment_mode="expand")
            if span is None:
                print(f"  -> Skipping entity: '{text[start:end]}' (label: {label}) with offsets ({start}, {end})")
            else:
                valid_entities.append(span)
                print(f"  -> Entity: '{span.text}' (label: {label}) covers tokens [{span.start}:{span.end}]")
        
        doc.ents = filter_spans(valid_entities)
        print("Final entity spans:", [(ent.text, ent.label_, ent.start, ent.end) for ent in doc.ents])
        print("")
    print("Inspection complete.")

# =======================
# Section 4: Main Execution
# =======================
def main():
    print("Loading re‑tagged training data...")
    data = load_training_data(DATA_FILE)
    print(f"Loaded {len(data)} examples from '{DATA_FILE}'.")
    inspect_examples(data)

if __name__ == "__main__":
    main()