from .scrapers.miso import MISOScraper
from .scrapers.ercot import ERCOTScraper
from .scrapers.caiso import CAISOScraper
from .scrapers.pjm import PJMScraper
from .scrapers.gem import GEMScraper
from .db import get_client, delete_withdrawn


def main():
    # Clean up existing withdrawn/suspended/cancelled projects
    client = get_client()
    deleted = delete_withdrawn(client)
    if deleted:
        print(f"Deleted {deleted} withdrawn/suspended/cancelled projects from DB")

    scrapers = [
        MISOScraper(),
        ERCOTScraper(),
        CAISOScraper(),
        PJMScraper(),
        GEMScraper(),
    ]

    results = []
    for scraper in scrapers:
        result = scraper.run()
        results.append(result)

    print("\n=== Summary ===")
    for r in results:
        if r["status"] == "success":
            print(f"  {r['iso_region']}: {r['found']} found, {r['upserted']} upserted")
        else:
            print(f"  {r['iso_region']}: ERROR - {r['error']}")


if __name__ == "__main__":
    main()
