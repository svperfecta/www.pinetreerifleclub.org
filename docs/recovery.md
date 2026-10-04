# Recovery record

The recovery combines the June 25, 2026 captures with older captures and files surviving on the original underlying hosting account. Untouched source bytes and capture inventories are retained under `recovery/`; the published website has no dependencies on either source host.

- 278 files recovered.
- All 179 unique paths in the archive inventory recovered.
- All 16 indexed historical image captures preserved with timestamps and hashes.
- 122 original HTML pages converted into valid fragments, plus a directory, missing-content page and 404 page.
- 155 original non-HTML assets published locally, plus compatibility styles and a recovered external CMP logo.
- 45 referenced source paths could not be recovered; see `recovery/import-report.json` and the public missing-content page.

Tracking pixels, broken stylesheets, obsolete scripts and references to local Windows temporary files were removed. Known broken target-frame and merchandise-form links were corrected to recovered documents. External destination links and public contact addresses were retained.

## Reproduce the content conversion

```sh
python3 scripts/import_content.py
node scripts/normalize_content.mjs
node scripts/migrate-emdash.mjs
```

Run these in order. They rebuild the recovered snapshot and seed, and overwrite generated compatibility styles and content. They do not export production CMS changes. Raw files remain untouched.

Recovery download tools are `scripts/recover.py`, `scripts/recover_survivors.py` and `scripts/preserve_image_captures.py`. Their inventories record provenance and failures. Network sources may no longer respond; the repository preserves the downloaded bytes so rebuilding does not require them.
