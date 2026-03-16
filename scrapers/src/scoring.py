import pandas as pd
from datetime import date

STATUS_SCORES = {
    # Under construction — actively building, need robots NOW
    "construction": 40,
    "under construction": 40,
    "engineering and procurement": 40,
    "partially in service - under construction": 40,
    "under_construction": 40,
    # Active / pre-construction — in queue, planning
    "active": 30,
    "pre-construction": 30,
    "pre_construction": 30,
    "announced": 25,
    # Completed / operating — too late
    "completed": 10,
    "done": 10,
    "in service": 10,
    "partially in service": 10,
    "operating": 10,
}


def score_lead(row: pd.Series) -> int:
    """Score a solar lead 0-100 based on status, timeline, capacity, and storage."""
    score = 0

    # Status (0-40): dominant signal
    status = str(row.get("status", "")).strip().lower()
    score += STATUS_SCORES.get(status, 5)

    # Timeline (0-25): near-term COD is higher value
    cod = row.get("expected_cod")
    if cod and not pd.isna(cod):
        try:
            if isinstance(cod, str):
                cod = pd.to_datetime(cod).date()
            elif isinstance(cod, pd.Timestamp):
                cod = cod.date()
            years_out = (cod - date.today()).days / 365
            if years_out <= 0:
                score -= 20  # past COD — likely completed or stale
            elif 0 < years_out <= 2:
                score += 25
            elif 2 < years_out <= 3:
                score += 15
            elif 3 < years_out <= 5:
                score += 5
        except (ValueError, TypeError):
            pass

    # Capacity (5-20): bigger projects are higher value
    mw = row.get("mw_capacity") or 0
    if mw >= 500:
        score += 20
    elif mw >= 200:
        score += 15
    elif mw >= 100:
        score += 12
    elif mw >= 50:
        score += 8
    else:
        score += 5

    # Solar+Storage bonus (0-15)
    if row.get("fuel_type") == "Solar+Storage":
        score += 15

    return min(score, 100)


def score_projects(df: pd.DataFrame) -> pd.DataFrame:
    """Add lead_score column to DataFrame."""
    df["lead_score"] = df.apply(score_lead, axis=1)
    return df
