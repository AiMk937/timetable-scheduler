#!/usr/bin/env python3
# services/timetable_generator.py

import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
import logging
import random

# ─────── 0. Logging setup ───────
logger = logging.getLogger("services.timetable_generator")
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.DEBUG)

# ─────── 1. Device ───────
device = torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
logger.debug(f"Using device: {device}")

# ─────── 2. Paths ───────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR  = BASE_DIR / "data"
TT_CSV    = DATA_DIR / "tt_in_csv.csv"
MAP_CSV   = DATA_DIR / "teachermap.csv"
CKPT      = DATA_DIR / "timetable_unet.pth"

# ─────── 3. Load & preprocess CSVs ───────
tt_df  = pd.read_csv(TT_CSV, encoding="ISO-8859-1")
map_df = pd.read_csv(MAP_CSV, encoding="ISO-8859-1")
tt_df.columns  = [c.strip().lower() for c in tt_df.columns]
map_df.columns = [c.strip().lower() for c in map_df.columns]
for col in ["day","type","batch","infrastructure","subject"]:
    tt_df[col] = tt_df[col].fillna("None").astype(str).str.title()
tt_df["slot"]         = pd.to_numeric(tt_df["slot"], errors="coerce").fillna(0).astype(int)
tt_df["type_flag"]    = tt_df["type"].str.lower().str.startswith("lab").astype(int)
tt_df["timetable_id"] = tt_df["classid"].astype(str)
map_df["subject"]     = map_df["subject"].astype(str).str.title()
map_df["teachers"]    = map_df["teachers"].astype(str).str.strip()

# ─────── 4. Day & slot dims ───────
PREF        = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
unique_days = tt_df["day"].unique().tolist()
days        = [d for d in PREF if d in unique_days] + [d for d in unique_days if d not in PREF]
H           = len(days)
W           = int(tt_df["slot"].max())

# ─────── 5. Schedule constants ───────
DAYS               = days
SLOTS_PER_DAY      = W
# allow labs to start at slots 1,2,3,5,6 (1-indexed) => zero-based [0,1,2,4,5]
LAB_CANDIDATE_SLOTS = [s for s in range(SLOTS_PER_DAY-1) if s in [0,1,2,4,5]]

# ─────── 6. Subject ↔ teacher maps ───────
subjects    = sorted(map_df["subject"].unique())
subject_map = {s:i for i,s in enumerate(subjects)}
teachers    = sorted(map_df["teachers"].unique())
teacher_map = {t:i for i,t in enumerate(teachers)}

# precompute teacher_for_subject and mask
tensor_tf = torch.tensor(
    [ teacher_map[ map_df[map_df["subject"]==s]["teachers"].iloc[0] ] for s in subjects ],
    dtype=torch.long, device=device
)
num_teachers, num_subjects = len(teachers), len(subjects)
teacher_mask = torch.zeros((num_teachers, num_subjects), device=device)
for s,t in enumerate(tensor_tf): teacher_mask[t,s] = 1.0

# ─────── 7. Dataset ───────
feature_maps = {
    feat: {v:i for i,v in enumerate(sorted(tt_df[feat].astype(str).unique()))}
    for feat in ["classid","batch","infrastructure"]
}
class TimetableDataset(Dataset):
    def __init__(self, df, fmap, smap, days, W):
        self.df, self.fmap, self.smap = df, fmap, smap
        self.days, self.H, self.W      = days, len(days), W
        self.C                         = sum(len(v) for v in fmap.values())
        self.tids                      = df["timetable_id"].unique()
    def __len__(self):
        return len(self.tids)
    def __getitem__(self, idx):
        tid = self.tids[idx]
        sub = self.df[self.df["timetable_id"]==tid]
        X   = torch.zeros(self.C, self.H, self.W, device=device)
        Y   = torch.zeros(self.H, self.W, dtype=torch.long, device=device)
        tm  = torch.zeros(self.H, self.W, dtype=torch.int, device=device)
        for _,r in sub.iterrows():
            d   = self.days.index(r["day"])
            w   = int(r["slot"]) - 1
            off = 0
            for feat,m in self.fmap.items():
                val = str(r[feat])
                if val in m:
                    X[off + m[val], d, w] = 1.0
                off += len(m)
            Y[d, w]  = self.smap[r["subject"]]
            tm[d, w] = int(r["type_flag"])
        return X, Y, tm

# ─────── 8. U-Net definition ───────
class DoubleConv(nn.Module):
    def __init__(self,in_ch,out_ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch,out_ch,3,padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(out_ch,out_ch,3,padding=1), nn.ReLU(inplace=True),
        )
    def forward(self,x): return self.net(x)

class UNet(nn.Module):
    def __init__(self,in_ch,out_ch):
        super().__init__()
        self.enc1       = DoubleConv(in_ch,64)
        self.enc2       = DoubleConv(64,128)
        self.pool       = nn.MaxPool2d(2)
        self.bottleneck = DoubleConv(128,256)
        self.dec2       = DoubleConv(256+128,128)
        self.dec1       = DoubleConv(128+64,64)
        self.outc       = nn.Conv2d(64,out_ch,1)
    def forward(self,x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        b  = self.bottleneck(self.pool(e2))
        d2 = F.interpolate(b,size=e2.shape[2:],mode="nearest")
        d2 = self.dec2(torch.cat([d2,e2],dim=1))
        d1 = F.interpolate(d2,size=e1.shape[2:],mode="nearest")
        d1 = self.dec1(torch.cat([d1,e1],dim=1))
        return self.outc(d1)

# ─────── 9. Load trained model ───────
fmap_sum = sum(len(v) for v in feature_maps.values())
model     = UNet(in_ch=fmap_sum, out_ch=len(subjects)).to(device)
if not CKPT.exists():
    logger.error(f"Missing checkpoint at {CKPT}")
    raise FileNotFoundError(f"Missing checkpoint at {CKPT}")
model.load_state_dict(torch.load(CKPT, map_location=device))
model.eval()
logger.debug("Model loaded successfully.")

# ─────── 10. Lab Scheduler (CSP-style) ───────
class LabScheduler:
    def __init__(self):
        self.days  = DAYS
        self.slots = LAB_CANDIDATE_SLOTS
    def schedule(self, timetable, tm_grid):
        days_with_lab = set()
        needed       = {}  # subj_idx -> count
        info         = {}
        # collect all lab subjects (by index) & mark needed sessions
        for idx, subj in enumerate(subjects):
            if subj.lower().endswith("lab"):
                needed[idx] = 1     # one 2-slot block per lab
                info[idx]   = subj
        # candidate (day,slot) pairs
        cand = [(d,s) for d in self.days for s in self.slots if s+1 < SLOTS_PER_DAY]
        random.shuffle(cand)
        for day,slot in cand:
            if all(v==0 for v in needed.values()):
                break
            if day in days_with_lab:      continue
            if timetable[day][slot] is not None: continue
            for idx,count in list(needed.items()):
                if count > 0:
                    entry = {
                        "subject": info[idx],
                        "teacher": "<auto>",
                        "room":    "<lab>"
                    }
                    # book two consecutive slots
                    timetable[day][slot]   = entry
                    timetable[day][slot+1] = entry
                    needed[idx] -= 1
                    days_with_lab.add(day)
                    break
        return timetable

# ─────── 11. Inference & post-process ───────
def build_input(class_id: str):
    logger.debug(f"build_input called with class_id={class_id!r}")
    sub = tt_df[tt_df["timetable_id"] == class_id]
    if sub.empty:
        available = tt_df["timetable_id"].unique().tolist()
        msg = f"No rows for class_id={class_id!r}. CSV IDs={available}"
        logger.error(msg)
        raise ValueError(msg)
    X  = torch.zeros((1,fmap_sum,H,W), device=device)
    tm = torch.zeros((H,W), dtype=torch.int, device=device)
    for _,r in sub.iterrows():
        d = days.index(r["day"])
        w = int(r["slot"])-1
        off = 0
        for feat,m in feature_maps.items():
            val = str(r[feat])
            if val in m:
                X[0, off + m[val], d, w] = 1.0
            off += len(m)
        tm[d,w] = int(r["type_flag"])
    return X, tm

def repair_schedule(logits: torch.Tensor, tm: torch.Tensor):
    p    = F.softmax(logits, dim=1)
    grid = torch.argmax(p, dim=1)[0].cpu().numpy()
    return grid

def generate_timetable1(selected_class_id: str):
    logger.info(f"generate_timetable called with class_id={selected_class_id!r}")
    X, tm = build_input(selected_class_id)
    with torch.no_grad():
        logits = model(X)
    grid = repair_schedule(logits, tm)
    # assemble base timetable
    out = {d: [None]*W for d in days}
    for i,d in enumerate(days):
        for w in range(W):
            out[d][w] = subjects[int(grid[i,w])]
    # overlay lab blocks
    sched = LabScheduler()
    final = sched.schedule(out, tm)
    logger.info("Timetable generation successful.")
    return final

# ─────── 12. Training entrypoint ───────
if __name__=='__main__':
    ds    = TimetableDataset(tt_df, feature_maps, subject_map, days, W)
    dl    = DataLoader(ds, batch_size=2, shuffle=True)
    optim = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.CrossEntropyLoss()
    for ep in range(1, 11):
        total = 0.0
        for X, Y, tm in dl:
            optim.zero_grad()
            logits = model(X)
            loss   = loss_fn(logits, Y)
            loss.backward()
            optim.step()
            total += loss.item()
        logger.info(f"Epoch {ep}/10 loss={total/len(dl):.4f}")
    torch.save(model.state_dict(), CKPT)
    logger.info(f"Saved retrained model to {CKPT}")