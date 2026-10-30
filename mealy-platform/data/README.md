# ThaliTrack sample data

`thalitrack-four-weeks.csv` contains 280 deterministic observations: 28 days across 10 dishes. Each row includes daily order count, quantity ordered/sold, leftover kilograms, portion weight, and a timetable-derived rush index.

Regenerate it from the repository root with:

```powershell
node tools/generate-thalitrack-dataset.mjs
```

The development SQL seed generates the same shape relative to the database's current date. This CSV is safe demonstration data and contains no personal information.
