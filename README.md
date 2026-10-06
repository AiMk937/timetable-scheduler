# :calendar: AI-Powered Timetable Scheduler

A web app that generates **conflict-free academic timetables** for every class in a department, and lets staff **edit them in plain English** - for example *"Swap the NLP lecture in slot 1 on Tuesday with the BC lecture in slot 2"*.

:page_facing_up: **Published research:** *AI-Powered Timetable Scheduler and Management* - JETIR, Vol. 11, Issue 10, October 2024 - [Read paper](https://www.jetir.org/view?paper=JETIR2410528)

![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![spaCy](https://img.shields.io/badge/spaCy-09A3D5?logo=spacy&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## :sparkles: Features

- **Data management** - departments, academic years, classes, subjects, teachers, and rooms/labs (CRUD pages)
- **Conflict-free generation** - schedules every class in a department at once, with no teacher or room double-booked across classes
- **Lab handling** - labs take two consecutive slots and are split into batches (B1-B3)
- **Teacher timetables** - per-teacher weekly views built from the class schedules
- **Excel export** - one workbook with a sheet per class and per teacher
- **Natural-language edits** - a custom spaCy NER model extracts subjects, days, slots, teachers and rooms from typed commands; Gemini handles general chat and fallback

---

## :building_construction: Architecture

```
Browser (EJS pages)
      │
      ▼
Node.js + Express  (port 5001) ──────────────► MongoDB
      │        │                                   ▲
      │        └─ runs parse_command.py ──► spaCy NER model (model/model-best)
      ▼                                            │
FastAPI AI service (port 8000) ─────────────────────┘
  • services/generator.py   - constraint-based scheduler
  • services/teacher_utils.py - teacher timetables
  • /export-timetables      - Excel export
```

**How the scheduler works:** it loads subjects, teachers, classes and rooms from MongoDB, then places labs first (two consecutive slots, batch-wise) and theory lectures next. A shared teacher-and-room occupancy grid is checked before every placement, so the same teacher or room is never booked twice in a slot across the whole department. Placement order is randomised, so regenerating gives alternative valid timetables.

> The JETIR paper describes the project's first design (a Random Forest + Genetic Algorithm hybrid). The code has since moved to the constraint-based scheduler above, which handles multi-class conflicts directly. An experimental U-Net model (`services/timetable_generator.py`, PyTorch) is also included.

---

## :brain: NLP command parser

| Entity | Example |
| --- | --- |
| `SUBJECT1`, `SUBJECT2` | "NLP", "BC" |
| `DAY_SOURCE`, `DAY_TARGET` | "Tuesday" |
| `SLOT_SOURCE`, `SLOT_TARGET` | "1", "2" |
| `TEACHER`, `BUSY_DAY`, `TARGET_DAY` | "Prof. Shah", "Monday" |
| `ROOM_SOURCE`, `ROOM_TARGET` | "Lab 3", "Room 402" |

Trained on 700 annotated commands (`train.spacy`, built from `ai-service/prompts/` plus generated examples). The saved model reports **entity F1 0.92** (precision 0.94, recall 0.91). Note this score is measured on the training data, so real-world accuracy will be lower - a held-out evaluation set is on the roadmap. Regex fallbacks fill in slot numbers and dates the model misses.

---

## :rocket: Getting started

**Prerequisites:** Node.js 18+, Python 3.10+, and MongoDB (local or a free [Atlas](https://www.mongodb.com/atlas) cluster).

```bash
git clone https://github.com/AiMk937/timetable-scheduler.git
cd timetable-scheduler

# 1. Configuration
cp .env.example .env          # then add your MONGO_URI and GOOGLE_API_KEY

# 2. Web app
npm install

# 3. AI service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Run the two services in separate terminals:

```bash
npm run ai-service    # FastAPI on http://localhost:8000
npm start             # Web app on http://localhost:5001
```

Then add a department, academic year, classes, subjects, teachers and rooms, and click **Generate Timetable**.

---

## :file_folder: Project structure

```
timetable-scheduler/
├── server.js                 # Express entry point
├── routes/                   # CRUD, timetable and chatbot routes
├── models/                   # Mongoose schemas
├── pages/                    # EJS views
├── public/                   # CSS
├── ai-service/
│   ├── main.py               # FastAPI: generate, export, update
│   ├── config.py             # settings loaded from .env
│   ├── parse_command.py      # NER parser called by the web app
│   ├── nlp_trainer.py        # builds training data and trains the NER model
│   ├── services/             # scheduler, teacher views, experimental U-Net
│   └── prompts/              # NER training commands
├── model/model-best/         # trained spaCy NER model
├── config.cfg, train.spacy   # spaCy training config and data
└── .env.example
```

---

## :crystal_ball: Roadmap

- Held-out test set for the NER model
- Soft constraints (teacher preferences, balanced daily load)
- Screenshots and a hosted demo
- Authentication for admin pages

---

## :busts_in_silhouette: Team

- **Aimaan Khan** (team lead) - [@AiMk937](https://github.com/AiMk937)
- **Mariyum Siddique** - [@Mariyum008](https://github.com/Mariyum008)

B.E. Computer Engineering Major Project, University of Mumbai (2024-25). Paper co-authors: Siddharth Pallar, Shiburaj Pappu, Dr. Anupam Choudhary.

## :page_with_curl: License

[MIT](LICENSE)
