# Preserved website archive

The user requires the recovered original website to remain unmodified for archival purposes.

- Never edit, normalize, rename, delete or overwrite existing files in `recovery/originals/` or `recovery/image-captures/`.
- Do not change existing entries in `recovery/SHA256SUMS` to accommodate modified archive bytes.
- Make all restoration, CMS, gallery, asset and design changes in separate working files. Copy archive assets when needed.
- Recovery download scripts must not overwrite preserved files. Save newly discovered versions to new paths and record their provenance and checksums.
- Run `python3 scripts/verify_recovery.py` when verifying changes.

The archive is the complete set of recovered files. It does not include files that were unavailable from the recovery sources; those gaps are recorded in the recovery reports.
