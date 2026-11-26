import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DATA = Path(os.environ.get("FRAUD_DATA", Path(__file__).parent / "data"))

# ---------- load exported files ----------
cfg = json.load(open(DATA / "config.json"))
THRESHOLD = cfg["threshold"]
CATS = cfg["cats"]
MU = np.array(cfg["mu"], dtype=np.float64)
SD = np.array(cfg["sd"], dtype=np.float64)

tx = pd.read_csv(DATA / "transactions.csv")
gf = np.load(DATA / "graph_features.npz")
X, P = gf["X"], gf["P"]
wz = np.load(DATA / "weights.npz")
W = {k: wz[k] for k in wz.files}

by_uid = tx.groupby("uid").indices          # card -> positions (= ids, in time order)
test_df = tx[tx["split"] == "test"]
rng = np.random.default_rng(0)

app = FastAPI(title="Live Credit Card Fraud Detection API")

# Local dev origins + any extra origins from the ALLOWED_ORIGINS env variable
# (comma separated), e.g. https://fraud-ui.onrender.com
ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] + [
    o.strip().rstrip("/")
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TxIn(BaseModel):
    amount: float = Field(gt=0)
    product: str = "W"
    card1: int
    card4: str = ""
    card6: str = ""
    addr1: str = ""
    email: str = ""
    device: str = ""
    hour: int = Field(default=12, ge=0, le=23)


# ---------- feature engineering (mirrors the notebook) ----------
def norm(v) -> str:
    if v is None:
        return "unknown"
    s = str(v).strip().lower()
    return "unknown" if s in ("", "nan", "none") else s


def onehot(v, cats):
    s = norm(v)
    if s not in cats:
        s = "other"
    return [1.0 if s == c else 0.0 for c in cats]


def featurize(t: TxIn) -> np.ndarray:
    ang = 2 * np.pi * t.hour / 24
    raw = [np.log1p(t.amount), np.sin(ang), np.cos(ang)]
    raw += onehot(t.product, CATS["product"])
    raw += onehot(t.card4, CATS["card4"])
    raw += onehot(t.card6, CATS["card6"])
    raw += onehot(t.email, CATS["email"])
    raw += onehot(t.device, CATS["device"])
    return ((np.array(raw, dtype=np.float64) - MU) / SD).astype(np.float32)


def make_uid(t: TxIn) -> str:
    a = norm(t.addr1)
    try:
        a1 = "NA" if a == "unknown" else str(int(float(a)))
    except ValueError:
        a1 = "NA"
    return f"{t.card1}|{norm(t.card4)}|{norm(t.card6)}|{a1}"


# ---------- card lookup that ignores billing region ----------
# The UI no longer sends addr1, so exact uid matching rarely finds history.
# This second index matches on card1 + card4 + card6 only.
tx["card_key"] = (
    tx["card1"].astype("int64").astype(str)
    + "|" + tx["card4"].map(norm)
    + "|" + tx["card6"].map(norm)
)
by_card = tx.groupby("card_key").indices


def card_key(t: TxIn) -> str:
    return f"{t.card1}|{norm(t.card4)}|{norm(t.card6)}"


# ---------- GraphSAGE in NumPy (mirrors the notebook) ----------
def hidden1(x, nbr_ids):
    agg = X[nbr_ids].mean(axis=0) if len(nbr_ids) else np.zeros_like(x)
    return np.maximum(W["c1_lin_l_weight"] @ agg + W["c1_lin_l_bias"] + W["c1_lin_r_weight"] @ x, 0)


def valid_preds(i):
    row = P[i]
    return row[row >= 0]


def predict(x, pred_ids) -> float:
    h_self = hidden1(x, pred_ids)
    if len(pred_ids):
        agg2 = np.mean([hidden1(X[p], valid_preds(p)) for p in pred_ids], axis=0)
    else:
        agg2 = np.zeros_like(h_self)
    logits = W["c2_lin_l_weight"] @ agg2 + W["c2_lin_l_bias"] + W["c2_lin_r_weight"] @ h_self
    e = np.exp(logits - logits.max())
    return float(e[1] / e.sum())


def risk_level(prob: float) -> str:
    if prob < THRESHOLD:
        return "Low"
    return "High" if prob >= (1 + THRESHOLD) / 2 else "Medium"


def clean(v) -> str:
    return "" if pd.isna(v) else str(v)


def summarize(i: int) -> dict:
    r = tx.iloc[i]
    prob = float(r["prob"])
    return {
        "id": int(i),
        "amount": round(float(r["amount"]), 2),
        "probability": round(prob, 4),
        "status": "FLAGGED" if prob >= THRESHOLD else "OK",
        "risk": risk_level(prob),
        "actual": "fraud" if int(r["label"]) == 1 else "legit",
        "fields": {
            "amount": round(float(r["amount"]), 2),
            "product": clean(r["product"]).upper(),
            "card1": int(r["card1"]),
            "card4": clean(r["card4"]).lower(),
            "card6": clean(r["card6"]).lower(),
            "addr1": "" if pd.isna(r["addr1"]) else str(int(r["addr1"])),
            "email": clean(r["email"]).lower(),
            "device": clean(r["device"]).lower(),
            "hour": int((r["dt"] // 3600) % 24),
        },
    }


# ---------- endpoints ----------
@app.get("/")
def root():
    return {"status": "ok", "service": "fraud-detection-api"}


@app.get("/api/stats")
def stats():
    flagged = test_df[test_df["prob"] >= THRESHOLD]
    return {
        "model": cfg["model"],
        "test_transactions": int(len(test_df)),
        "flagged": int(len(flagged)),
        "flagged_amount": round(float(flagged["amount"].sum()), 2),
    }


@app.get("/api/alerts")
def alerts(limit: int = 20):
    df = test_df[test_df["prob"] >= THRESHOLD].sort_values("prob", ascending=False).head(limit)
    return [summarize(int(i)) for i in df.index]


@app.get("/api/example")
def example(kind: str = "fraud"):
    want = 1 if kind == "fraud" else 0
    pool = test_df[(test_df["label"] == want)].index.values
    with_history = np.array([i for i in pool if P[i, 0] >= 0])
    if len(with_history):
        pool = with_history
    return summarize(int(rng.choice(pool)))


@app.post("/api/check")
def check(t: TxIn):
    # Exact match first (includes billing region), then fall back to card only.
    ids = by_uid.get(make_uid(t))
    if ids is None or len(ids) == 0:
        ids = by_card.get(card_key(t), np.array([], dtype=int))
    pred_ids = ids[-3:]
    prob = predict(featurize(t), pred_ids)
    note = ""
    if len(ids) == 0:
        note = "No earlier transactions found for this card. The score uses this transaction's own details only."
    return {
        "probability": round(prob, 4),
        "status": "FLAGGED" if prob >= THRESHOLD else "OK",
        "risk": risk_level(prob),
        "card_history_count": int(len(ids)),
        "history": [summarize(int(i)) for i in pred_ids[::-1]],
        "note": note,
    }