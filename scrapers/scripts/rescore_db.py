"""One-off script: prune withdrawn projects and re-score all remaining."""

import pandas as pd
import numpy as np

from scrapers.src.db import get_client, delete_withdrawn, upsert_projects
from scrapers.src.scoring import score_lead


def main():
    client = get_client()

    # 1. Delete withdrawn/suspended/cancelled projects
    #    First, find their IDs so we can clean up FK references
    withdrawn_statuses = ["Withdrawn", "WITHDRAWN", "Suspended", "SUSPENDED", "Cancelled", "CANCELLED"]
    withdrawn_ids = []
    offset = 0
    while True:
        batch = (
            client.table("projects")
            .select("id")
            .in_("status", withdrawn_statuses)
            .range(offset, offset + 999)
            .execute()
        )
        withdrawn_ids.extend(r["id"] for r in batch.data)
        if len(batch.data) < 1000:
            break
        offset += 1000

    print(f"Found {len(withdrawn_ids):,} withdrawn/suspended/cancelled projects")

    if withdrawn_ids:
        # Delete FK references in batches
        fk_tables = ["research_attempts", "epc_engagements"]
        for table in fk_tables:
            for i in range(0, len(withdrawn_ids), 500):
                batch_ids = withdrawn_ids[i : i + 500]
                client.table(table).delete().in_("project_id", batch_ids).execute()

    deleted = delete_withdrawn(client)
    print(f"Deleted {deleted:,} withdrawn/suspended/cancelled projects")

    # 2. Fetch all remaining projects
    rows = []
    offset = 0
    page_size = 1000
    while True:
        batch = (
            client.table("projects")
            .select("*")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows.extend(batch.data)
        if len(batch.data) < page_size:
            break
        offset += page_size

    if not rows:
        print("No projects remaining.")
        return

    df = pd.DataFrame(rows)
    print(f"Fetched {len(df):,} remaining projects")

    # 3. Re-score
    df["lead_score"] = df.apply(score_lead, axis=1)

    # 4. Upsert in batches of 500 (only send score + conflict keys)
    total_upserted = 0
    batch_size = 500
    for i in range(0, len(df), batch_size):
        chunk = df.iloc[i : i + batch_size]
        records = [
            {
                "iso_region": row["iso_region"],
                "queue_id": row["queue_id"],
                "lead_score": int(row["lead_score"]),
            }
            for _, row in chunk.iterrows()
        ]
        upserted = upsert_projects(client, records)
        total_upserted += upserted

    print(f"Re-scored {total_upserted:,} projects")

    # 5. Summary
    scores = df["lead_score"]
    print(
        f"Score distribution: min={scores.min()}, "
        f"median={int(scores.median())}, max={scores.max()}"
    )


if __name__ == "__main__":
    main()
