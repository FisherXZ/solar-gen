# 06 — Geocoding Cascade

**Status:** Draft

---

## The Problem

Every project in our database has `latitude: NULL, longitude: NULL`. We know county and state from the ISO queue, but not precise coordinates. Filling in coordinates enables a map view, proximity analysis, and territory planning.

There is no single source that provides coordinates for every project. Instead, we use a tiered cascade — each source covers a different stage of the project lifecycle and offers different accuracy.

## The 4 Tiers Explained

### Tier 1: EIA Form 860 — Exact Site Coordinates

**What it is:** The Energy Information Administration requires all planned and operating generators >1MW to report their location. The "Plant" file in Form 860 includes latitude/longitude for each facility.

**Accuracy:** Exact site location (within the project boundary). EIA requires coordinates of the facility, not just the county.

**When it's available:** Only after the project has been reported to EIA — typically 1-2 years before construction. Projects in early ISO queue stages (feasibility study, system impact study) usually have NOT yet filed with EIA.

**How we access it:**
- Bulk download: https://www.eia.gov/electricity/data/eia860/
- Files: `2___Plant_Yxxxx.xlsx` contains lat/lng for all plants
- Match to our projects by: state + county + developer name + capacity (fuzzy)
- Free, no API key needed

**When to use:** Whenever a project in our database can be matched to an EIA-860 record. This is the gold standard.

**Limitation:** Doesn't cover early-stage queue projects that haven't filed with EIA yet.

### Tier 2: USPVDB (US Photovoltaic Database) — Site Polygons

**What it is:** A USGS-maintained database of all large-scale (>1MW) solar photovoltaic installations in the US. Includes GIS polygon boundaries (not just a point, but the actual footprint of the solar farm).

**Accuracy:** Very high — actual site boundaries derived from satellite imagery.

**When it's available:** Only after the project is operational or under construction and visible in satellite imagery. This means it's typically available AFTER construction, not before.

**How we access it:**
- Download: https://doi.org/10.5066/P9TXS4GE (USGS ScienceBase)
- Formats: GeoJSON, Shapefile, GeoPackage
- Match to our projects by: state + county + capacity + proximity
- Free, no API key needed

**When to use:** Two use cases:
1. **Retroactive geocoding** — for projects that are now operational but entered our system during queue stage
2. **Knowledge graph enrichment** — USPVDB tells us which developers built in which locations, even for projects we didn't track from queue stage

**Limitation:** Doesn't help with pre-construction projects (which are our primary focus). Best used as a validation/enrichment layer.

### Tier 3: Census Gazetteer — County Centroids

**What it is:** The US Census Bureau publishes a gazetteer file with the geographic center (centroid) of every county in the US.

**Accuracy:** Low — places the project at the center of the county. For a small county (e.g., 20 miles across), this is ~10 miles off. For a large county (e.g., San Bernardino County at 150 miles across), this is practically useless for navigation but still useful for map clustering.

**When it's available:** Always — every project in our database has county + state from the ISO queue.

**How we access it:**
- Download: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
- File: `2024_Gaz_counties_national.txt` (tab-delimited, ~3,200 rows)
- Match: exact match on county name + state FIPS code
- Free, static file (updated annually but county centroids rarely change)

**When to use:** As the **default fallback** for any project without a better coordinate source. Every project gets at least county-centroid precision on day one.

**Limitation:** Low precision. Multiple projects in the same county will stack on the same point. Good enough for a state/regional map view, not for site-level analysis.

### Tier 4: State-Specific GIS / Permitting Data

**What it is:** Some states maintain GIS databases of permitted or proposed solar projects with parcel-level coordinates.

**Accuracy:** High — often parcel-level (the actual land where the project will be built).

**When it's available:** After state/county permit approval, which varies by state (typically 1-3 years before construction).

**Key states with known data availability:**
- **California:** CEC (California Energy Commission) maintains an open data portal with renewable project siting
- **Texas:** ERCOT + county-level permitting (no centralized state database)
- **North Carolina:** NC DEQ has a solar facility database
- [TBD: investigate AZ, NV, FL, GA, IN, OH]

**How we access it:** Varies wildly per state. Some have APIs, some are downloadable shapefiles, some are PDF documents requiring manual extraction.

**When to use:** Only when available for a specific state and the engineering cost of integration is justified by the number of projects in that state.

**Limitation:** High engineering cost per state, inconsistent data quality, many states don't have this at all.

## Decision Tree

```
For a given project, which geocoding tier do we use?

1. Can we match to EIA-860?
   └── YES → Use EIA-860 coordinates (Tier 1) ✓
   └── NO ↓

2. Can we match to USPVDB?
   └── YES → Use USPVDB centroid/polygon (Tier 2) ✓
   └── NO ↓

3. Do we have state-specific GIS data for this state?
   └── YES → Use state GIS coordinates (Tier 4) ✓
   └── NO ↓

4. Do we have county + state?
   └── YES → Use Census county centroid (Tier 3) ✓
   └── NO → No geocoding possible (should not happen — ISO queue always has county/state)
```

**Note:** Tier 4 is checked after Tier 2 because USPVDB is more standardized and reliable, even though state GIS might be more precise. In practice, Tier 4 will only matter for projects that are permitted at the state level but haven't reached EIA or USPVDB.

## Implementation Plan

### Step 1: Census Gazetteer (immediate)

Load the county centroid file into Supabase as a lookup table. On every scrape run, auto-fill `latitude`/`longitude` for any project that currently has NULL coordinates. This gives every project a map pin on day one.

**Schema addition:** Add `geocode_source` column to `projects` table to track which tier provided the coordinates:

```sql
ALTER TABLE projects ADD COLUMN geocode_source TEXT;
-- Values: 'eia_860', 'uspvdb', 'state_gis', 'county_centroid', null
```

### Step 2: EIA-860 Cross-Reference (with Phase 5)

When we ingest EIA-860 data (see [02-project-lifecycle-map.md](02-project-lifecycle-map.md)), matched projects get upgraded from county centroid to exact EIA coordinates. The `geocode_source` field updates accordingly.

### Step 3: USPVDB Enrichment (lower priority)

Periodic USPVDB import to backfill coordinates for operational projects and validate existing coordinates.

### Step 4: State GIS (opportunistic)

Add state-specific sources only when a particular state has enough projects to justify the engineering effort. Start with CA (CEC data is well-structured).

## Open Questions

- [TBD] Do we need a `geocode_accuracy` field (exact / approximate / centroid) in addition to `geocode_source`?
- [TBD] For the map view, should county-centroid projects be visually distinguished from precisely located projects? (e.g., different pin style, or a radius circle instead of a pin)
- [TBD] How do we handle county name mismatches between ISO queue data and Census data? (e.g., "St. Louis" vs "Saint Louis", "DeWitt" vs "De Witt")
