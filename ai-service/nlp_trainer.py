#!/usr/bin/env python3
"""
============================================
Full Pipeline: Data Generation and Model Training
============================================

This script:
  1. Loads manual re‑tagged training prompts from a JSON file.
     If none exist, it generates synthetic examples.
  2. Filters examples for proper entity alignment and saves a DocBin training corpus.
  3. Writes a spaCy config file for a transformer+NER pipeline.
  4. Trains the model using GPU/MPS if available (e.g. on Mac M2).
  5. Evaluates the trained model.

Usage:
    python full_pipeline.py
"""

import os
import sys
import json
import random
import subprocess
import re
import spacy
from spacy.tokens import DocBin
from spacy.util import filter_spans
from spacy.training import Example
import pymongo

# Global MongoDB settings (for synthetic examples)
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "test"  # Adjust as needed

# File paths for training prompts and generated DocBin
MANUAL_PROMPTS_PATH = os.path.join("ai-service", "prompts", "new_training_prompts.json")
TRAIN_DOCBIN_PATH = "train.spacy"
CONFIG_PATH = "config.cfg"

# Constants for synthetic generation
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOT_NUMBERS = list(range(1, 7))  # slots 1 to 6

# ---------------------------
# Section 1: Synthetic Data Generation Helpers
# ---------------------------
def fetch_subjects():
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]
    subjects = list(db["subjects"].find({}))
    client.close()
    return subjects

def fetch_teachers():
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]
    teachers = list(db["teachers"].find({}))
    client.close()
    return teachers

def fetch_classrooms():
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]
    classrooms = list(db["infrastructures"].find({"type": "classroom"}))
    client.close()
    return classrooms

def compute_offset(text, entity_text):
    pattern = r'\b' + re.escape(entity_text) + r'\b'
    match = re.search(pattern, text)
    if match:
        return match.start(), match.end()
    return None, None

def generate_switch_command_examples(num_examples=20):
    subjects = fetch_subjects()
    if not subjects or len(subjects) < 2:
        raise ValueError("Not enough subjects available for synthetic generation.")
    
    examples = []
    for _ in range(num_examples):
        sub1, sub2 = random.sample(subjects, 2)
        sub1_name = sub1.get("subjectName", "UnknownSubject")
        sub2_name = sub2.get("subjectName", "UnknownSubject")
        day = random.choice(DAYS)
        src = random.choice(SLOT_NUMBERS)
        tgt = random.choice([n for n in SLOT_NUMBERS if n != src])
        text = f"switch the subject {sub1_name} in slot {src} on {day} with subject {sub2_name} in slot {tgt} on {day}"
        entities = []
        s1_start, s1_end = compute_offset(text, sub1_name)
        s2_start, s2_end = compute_offset(text, sub2_name)
        slot_src_start, _ = compute_offset(text, f"slot {src}")
        slot_tgt_start, _ = compute_offset(text, f"slot {tgt}")
        day_matches = list(re.finditer(r'\b' + re.escape(day) + r'\b', text))
        if day_matches and len(day_matches) >= 2:
            day1 = day_matches[0]
            day2 = day_matches[-1]
            entities.append({"start": s1_start, "end": s1_end, "label": "SUBJECT"})
            entities.append({"start": slot_src_start + len("slot "), "end": slot_src_start + len("slot ") + len(str(src)), "label": "SLOT"})
            entities.append({"start": day1.start(), "end": day1.end(), "label": "DAY"})
            entities.append({"start": s2_start, "end": s2_end, "label": "SUBJECT"})
            entities.append({"start": slot_tgt_start + len("slot "), "end": slot_tgt_start + len("slot ") + len(str(tgt)), "label": "SLOT"})
            entities.append({"start": day2.start(), "end": day2.end(), "label": "DAY"})
        else:
            print(f"Warning: Could not find two distinct occurrences of day '{day}' in: {text}")
        examples.append((text, {"entities": entities}))
    return examples

def generate_teacher_busy_examples(num_examples=10):
    teachers = fetch_teachers()
    classrooms = fetch_classrooms()
    if not teachers or not classrooms:
        raise ValueError("Insufficient teacher or classroom data for synthetic generation.")
    
    examples = []
    for _ in range(num_examples):
        teacher = random.choice(teachers)
        classroom = random.choice(classrooms)
        other_classrooms = [c for c in classrooms if c.get("roomNo") != classroom.get("roomNo")]
        if not other_classrooms:
            continue
        target_classroom = random.choice(other_classrooms)
        teacher_name = teacher.get("name", "UnknownTeacher")
        room1 = classroom.get("roomNo", "UnknownRoom")
        room2 = target_classroom.get("roomNo", "UnknownRoom")
        day_busy = random.choice(DAYS)
        target_day = random.choice([d for d in DAYS if d != day_busy])
        
        text = f"Professor {teacher_name} in classroom {room1} is busy on {day_busy}. Please shift his lectures to {target_day} in classroom {room2}."
        entities = []
        for label, ent_text in [
            ("TEACHER", teacher_name),
            ("ROOM", room1),
            ("DAY", day_busy),
            ("DAY", target_day),
            ("ROOM", room2)
        ]:
            start, end = compute_offset(text, ent_text)
            if start is None:
                print(f"Warning: Could not compute offset for {label} in: {text}")
            else:
                entities.append({"start": start, "end": end, "label": label})
        examples.append((text, {"entities": entities}))
    return examples

def generate_classroom_shift_examples(num_examples=5):
    classrooms = fetch_classrooms()
    if not classrooms or len(classrooms) < 2:
        print("Not enough classroom data for synthetic classroom shift examples.")
        return []
    
    examples = []
    for _ in range(num_examples):
        room1, room2 = random.sample(classrooms, 2)
        room1_no = room1.get("roomNo", "UnknownRoom")
        room2_no = room2.get("roomNo", "UnknownRoom")
        day = random.choice(DAYS)
        target_day = random.choice([d for d in DAYS if d != day])
        text = f"Classroom {room1_no} is under maintenance on {day}. Please move all lectures from there to classroom {room2_no} on {target_day}."
        entities = []
        for label, ent_text in [
            ("ROOM", room1_no),
            ("DAY", day),
            ("ROOM", room2_no),
            ("DAY", target_day)
        ]:
            start, end = compute_offset(text, ent_text)
            if start is None:
                print(f"Warning: Could not compute offset for {label} in: {text}")
            else:
                entities.append({"start": start, "end": end, "label": label})
        examples.append((text, {"entities": entities}))
    return examples

# ---------------------------------------------
# Section 4: Loading Manual Prompts (if available)
# ---------------------------------------------
def load_manual_prompts():
    prompts = []
    if os.path.exists(MANUAL_PROMPTS_PATH):
        try:
            with open(MANUAL_PROMPTS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            for item in data:
                text = item.get("command", "")
                ents = item.get("entities", [])
                extracted = []
                for e in ents:
                    try:
                        extracted.append((e["start"], e["end"], e["label"]))
                    except Exception as ex:
                        print(f"Skipping entity: {e} in example: {text}")
                prompts.append((text, {"entities": extracted}))
        except Exception as ex:
            print(f"Error reading manual training prompts from {MANUAL_PROMPTS_PATH}: {ex}")
    else:
        print(f"Manual training prompts file not found at {MANUAL_PROMPTS_PATH}")
    return prompts

# ---------------------------------------------
# Section 5: Filtering and Creating the Training Corpus
# ---------------------------------------------
def filter_training_examples(training_examples):
    nlp_blank = spacy.blank("en")
    filtered = []
    total = len(training_examples)
    for text, annotations in training_examples:
        doc = nlp_blank(text)
        valid = True
        new_entities = []
        for start, end, label in annotations["entities"]:
            span = doc.char_span(start, end, label=label, alignment_mode="expand")
            if span is None:
                print(f"Preprocessing failed for example: {text}")
                valid = False
                break
            new_entities.append((span.start_char, span.end_char, label))
        if valid:
            filtered.append((text, {"entities": new_entities}))
    print(f"Preprocessed {len(filtered)} out of {total} examples.")
    return filtered

def create_training_corpus(training_data):
    nlp = spacy.blank("en")
    doc_bin = DocBin()
    for text, annotations in training_data:
        doc = nlp.make_doc(text)
        ents = []
        for start, end, label in annotations["entities"]:
            span = doc.char_span(start, end, label=label, alignment_mode="expand")
            if span is None:
                print(f"Skipping span in: {text}")
            else:
                ents.append(span)
        doc.ents = filter_spans(ents)
        doc_bin.add(doc)
    return doc_bin

# ---------------------------------------------
# Section 6: Model Evaluation Function
# ---------------------------------------------
def evaluate_model(model_dir, dev_path=TRAIN_DOCBIN_PATH):
    print("Evaluating model on dev set...")
    nlp = spacy.load(model_dir)
    doc_bin = DocBin().from_disk(dev_path)
    gold_docs = list(doc_bin.get_docs(nlp.vocab))
    examples = [Example(nlp.make_doc(doc.text), doc) for doc in gold_docs]
    scores = nlp.evaluate(examples)
    
    print("\nEvaluation scores:")
    print("=" * 40)
    print("{:<15}{:>10}".format("Metric", "Score"))
    print("-" * 40)
    for metric, score in scores.items():
        if score is None:
            print(f"  {metric}: None")
        elif isinstance(score, dict):
            print(f"{metric}:")
            for sub_metric, sub_score in score.items():
                if sub_score is None:
                    print(f"  {sub_metric}: None")
                else:
                    print(f"  {sub_metric:<10}{sub_score:>10.4f}")
        else:
            print("{:<15}{:>10.4f}".format(metric, score))
    print("=" * 40)
    return scores

# ---------------------------------------------
# Section 7: Main Training Function
# ---------------------------------------------
def train_spacy_model():
    # Load manual prompts if available, otherwise generate synthetic examples.
    manual_prompts = load_manual_prompts()
    if manual_prompts:
        training_data = manual_prompts
        print(f"Using {len(training_data)} manually re-tagged training examples.")
    else:
        synthetic_switch = generate_switch_command_examples(num_examples=300)
        synthetic_teacher_busy = generate_teacher_busy_examples(num_examples=200)
        synthetic_classroom_shift = generate_classroom_shift_examples(num_examples=50)
        training_data = synthetic_switch + synthetic_teacher_busy + synthetic_classroom_shift
        print("Using synthetic training examples.")
    
    # Filter examples
    training_data = filter_training_examples(training_data)
    
    # Create and save DocBin training corpus.
    doc_bin = create_training_corpus(training_data)
    doc_bin.to_disk(TRAIN_DOCBIN_PATH)
    print(f"Training data saved to {TRAIN_DOCBIN_PATH}")
    
    # Write spaCy config file.
    config_text = """
[paths]
train = "./train.spacy"
dev = "./train.spacy"

[system]
gpu_allocator = null
seed = 0

[nlp]
lang = "en"
pipeline = ["transformer", "ner"]
batch_size = 8
tokenizer = {"@tokenizers": "spacy.Tokenizer.v1"}
disabled = []
before_creation = null
after_creation = null
after_pipeline_creation = null

[components]

[components.transformer]
factory = "transformer"
max_batch_items = 4096
set_extra_annotations = {"@annotation_setters": "spacy-transformers.null_annotation_setter.v1"}

[components.transformer.model]
@architectures = "spacy-transformers.TransformerModel.v3"
name = "roberta-base"
mixed_precision = false

[components.transformer.model.get_spans]
@span_getters = "spacy-transformers.strided_spans.v1"
window = 128
stride = 96

[components.transformer.model.grad_scaler_config]

[components.transformer.model.tokenizer_config]
use_fast = true

[components.transformer.model.transformer_config]

[components.ner]
factory = "ner"

[training]
seed = 0
max_steps = 100
dropout = 0.2
accumulate_gradient = 1
optimizer = {"@optimizers": "Adam.v1", "learn_rate": 0.0001}
batch_size = 8
patience = 1000
eval_frequency = 50
"""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        f.write(config_text.strip())
    print(f"Config file written to {CONFIG_PATH}")
    
    # Fill in missing config defaults.
    fill_result = subprocess.run([sys.executable, "-m", "spacy", "init", "fill-config", CONFIG_PATH, CONFIG_PATH])
    if fill_result.returncode != 0:
        print("Failed to fill config defaults.")
        sys.exit(1)
    
    # Check GPU/MPS availability.
    gpu_flag = []
    if spacy.prefer_gpu():
        gpu_flag = ["--gpu-id", "0"]
        print("Using GPU id: 0 (MPS available: True)")
    else:
        print("GPU/MPS not available; using CPU.")
    
    # Train the model.
    train_cmd = [
        sys.executable, "-m", "spacy", "train", CONFIG_PATH, "--output", "model",
        "--paths.train", TRAIN_DOCBIN_PATH, "--paths.dev", TRAIN_DOCBIN_PATH
    ] + gpu_flag
    result = subprocess.run(train_cmd)
    if result.returncode == 0:
        print("Training complete. Model saved in 'model' directory.")
        evaluate_model("model/model-last", dev_path=TRAIN_DOCBIN_PATH)
    else:
        print("Training failed.")
        sys.exit(1)

# ---------------------------------------------
# Section 8: Run Training if Executed
# ---------------------------------------------
if __name__ == "__main__":
    train_spacy_model()