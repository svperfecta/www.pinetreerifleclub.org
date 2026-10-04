"""Verify preserved recovery bytes independently of the generated website."""
from pathlib import Path
import hashlib
import sys

root = Path(__file__).resolve().parents[1] / "recovery"
expected = {}
for line in (root / "SHA256SUMS").read_text().splitlines():
    digest, name = line.split("  ", 1)
    expected[name] = digest
errors = []
for name, digest in expected.items():
    file = root / name
    if not file.is_file():
        errors.append(f"Missing: {name}")
    elif hashlib.sha256(file.read_bytes()).hexdigest() != digest:
        errors.append(f"Modified: {name}")
actual = {p.relative_to(root).as_posix() for folder in ("originals", "image-captures") for p in (root / folder).rglob("*") if p.is_file()}
for name in actual - expected.keys():
    errors.append(f"Unrecorded: {name}")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"PASS: {len(expected)} preserved files match their archival SHA-256 checksums")
