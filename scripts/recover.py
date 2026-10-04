"""Preserve club pages/assets from recorded captures and surviving original files.

Run manually with Python 3 and curl. Normal Eleventy builds never use the network.
The raw originals and provenance are kept outside the published site.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlparse
import json
import subprocess
import tempfile
import time
import sys

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "recovery/originals"
ORIGIN = "http://www.frontiernet.net/~pinetreerifle/"
WAYBACK = "https://web.archive.org/web/20260625075302id_/"
MAX_FILES = 800

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("href", "src", "background") and value:
                self.urls.append(value)

def local_path(url, base=ORIGIN):
    if url.startswith(("mailto:", "tel:", "javascript:", "data:", "#")):
        return None
    parsed = urlparse(urljoin(base, url))
    path = unquote(parsed.path)
    if parsed.hostname in ("www.pinetreerifleclub.org", "pinetreerifleclub.org"):
        relative = path.lstrip("/")
    elif parsed.hostname in ("www.frontiernet.net", "frontiernet.net") and path.lower().startswith("/~pinetreerifle/"):
        relative = path[len("/~pinetreerifle/"):]
    else:
        return None
    relative = relative or "index.html"
    if relative.endswith("/"):
        relative += "index.html"
    if ".." in Path(relative).parts or Path(relative).is_absolute():
        return None
    return relative

captures = json.loads((ROOT / "recovery/captures.json").read_text())[1:]
SOURCES = {}
for row in captures:
    path = local_path(row[1])
    if path and (path not in SOURCES or row[0] > SOURCES[path][0]):
        SOURCES[path] = row


def download(url):
    with tempfile.TemporaryDirectory() as temporary:
        body = Path(temporary) / "body"
        result = subprocess.run(["curl", "-sSL", "--fail", "--max-time", "20", "-o", str(body),
                                 "-w", "%{content_type}\n%{url_effective}", url], capture_output=True, text=True)
        if result.returncode:
            raise ValueError(result.stderr.strip())
        data = body.read_bytes()
        content_type, final_url = result.stdout.split("\n", 1)
    if not data or b"Internet Archive services are temporarily offline" in data:
        raise ValueError("Empty response or service temporarily offline")
    return data, content_type, final_url


def fetch(path):
    original = ORIGIN + ("" if path == "index.html" else quote(path, safe="/()'!,-_."))
    source = SOURCES.get(path)
    archive_url = "https://web.archive.org/web/" + source[0] + "id_/" + source[1] if source else None
    errors = []
    time.sleep(0.5)
    if archive_url:
        for attempt in range(2):
            try:
                data, content_type, final_url = download(archive_url)
                return path, data, content_type, final_url, None
            except Exception as error:
                errors.append(str(error))
                time.sleep(1)
    # Missing archive entries sometimes survive on the former host. Save them,
    # never link the published site back to that host.
    try:
        data, content_type, final_url = download(original.replace("http:", "https:", 1))
        return path, data, content_type, final_url, None
    except Exception as error:
        errors.append(str(error))
    return path, None, None, None, " | ".join(errors)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = ROOT / "recovery-manifest.json"
    previous = json.loads(manifest.read_text()) if manifest.exists() else {}
    recovered = previous.get("recovered", {})
    pending = set(SOURCES)
    if "--retry-captured-only" not in sys.argv:
        pending |= set(previous.get("missing", {})) | {"admin/app2026.pdf"}
    seen = set(recovered)
    failed = previous.get("missing", {})
    def follow(path, data):
        if path.lower().endswith((".html", ".htm")):
            page = Links()
            page.feed(data.decode("latin-1", errors="replace"))
            for link in page.urls:
                found = local_path(link, ORIGIN + path)
                if found and found not in seen and ("--retry-captured-only" not in sys.argv or found in SOURCES):
                    pending.add(found)
    for path in recovered:
        follow(path, (DEST / path).read_bytes())
    def checkpoint():
        manifest.write_text(json.dumps({"source": WAYBACK + ORIGIN, "recovered": recovered,
                                       "missing": failed, "not_attempted": sorted(pending - seen)}, indent=2) + "\n")
    with ThreadPoolExecutor(max_workers=2) as pool:
        while pending and len(seen) < MAX_FILES:
            batch = sorted(pending - seen)[:min(20, MAX_FILES - len(seen))]
            if not batch:
                break
            pending.difference_update(batch)
            seen.update(batch)
            for future in as_completed([pool.submit(fetch, path) for path in batch]):
                path, data, content_type, final_url, error = future.result()
                if error:
                    failed[path] = error
                    print("MISS", path, error, flush=True)
                else:
                    output = DEST / path
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(data)
                    recovered[path] = final_url
                    failed.pop(path, None)
                    follow(path, data)
                    print("SAVE", path, len(data), flush=True)
                checkpoint()
    checkpoint()
    print(f"Recovered {len(recovered)} files; missing {len(failed)}; unattempted {len(pending - seen)}", flush=True)

if __name__ == "__main__":
    main()
