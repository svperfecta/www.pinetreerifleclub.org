"""Check the built site for broken URLs, remote assets, and basic SEO/accessibility."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
import json
import re
import sys

SITE = Path(sys.argv[1] if len(sys.argv) > 1 else "_site").resolve()
BASE = "https://svperfecta.github.io/www.pinetreerifleclub.org/"
ERRORS = []

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.ids = set()
        self.lang = False
        self.main = 0
        self.h1 = 0
        self.description = False
        self.canonical = False
        self.title = False
        self.viewport = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a" and attrs.get("name"):
            self.ids.add(attrs["name"])
        if tag == "html": self.lang = bool(attrs.get("lang"))
        if tag == "main": self.main += 1
        if tag == "h1": self.h1 += 1
        if tag == "title": self.title = True
        if tag == "meta" and attrs.get("name") == "description": self.description = bool(attrs.get("content"))
        if tag == "meta" and attrs.get("name") == "viewport": self.viewport = True
        if tag == "link" and attrs.get("rel") == "canonical": self.canonical = True
        if tag == "img" and "alt" not in attrs: ERRORS.append("Image lacks alt attribute")
        for key in ("href", "src", "background", "poster"):
            if attrs.get(key):
                resource = key != "href" or tag == "link" and attrs.get("rel") != "canonical"
                self.references.append((attrs[key], resource))
        if attrs.get("srcset"):
            self.references.extend((part.strip().split()[0], True) for part in attrs["srcset"].split(","))

pages = {}
for file in SITE.rglob("*"):
    if file.suffix.lower() not in (".html", ".htm"):
        continue
    text = file.read_text()
    relative = file.relative_to(SITE).as_posix()
    if re.search(r'web\.archive\.org|frontiernet\.net/(?:%7[eE]|~)pinetreerifle', text, re.I):
        ERRORS.append(f"{relative}: retired hosting/archive reference")
    page = Page()
    page.feed(text)
    pages[relative] = page
    for field in ("lang", "title", "description", "canonical", "viewport"):
        if not getattr(page, field): ERRORS.append(f"{relative}: missing {field}")
    if page.main != 1: ERRORS.append(f"{relative}: expected one main landmark")
    if not page.h1: ERRORS.append(f"{relative}: missing h1")

for path, page in pages.items():
    for reference, resource in page.references:
        parsed = urlparse(reference)
        if parsed.scheme in ("mailto", "tel", "data"):
            continue
        if parsed.scheme == "javascript":
            ERRORS.append(f"{path}: javascript URL")
            continue
        if parsed.netloc:
            if reference.startswith(BASE):
                target = unquote(parsed.path[len(urlparse(BASE).path):]) or "index.html"
            else:
                if resource: ERRORS.append(f"{path}: remote asset {reference}")
                continue
        else:
            if reference.startswith("/"):
                reference = reference.lstrip("/")
                joined = urlparse(urljoin("https://local/", reference))
                target = unquote(joined.path.lstrip("/")) or "index.html"
                if target.endswith("/"): target += "index.html"
            else:
                joined = urlparse(urljoin("https://local/" + path, reference))
                target = unquote(joined.path.lstrip("/")) or "index.html"
                if target.endswith("/"): target += "index.html"
        if not (SITE / target).is_file():
            ERRORS.append(f"{path}: missing local file {reference} ({target})")
        elif parsed.fragment and target in pages and unquote(parsed.fragment) not in pages[target].ids:
            ERRORS.append(f"{path}: missing fragment {reference}")

for file in SITE.rglob("*.css"):
    for reference in re.findall(r'url\([\s\x27\"]*([^\)\s\x27\"]+)', file.read_text(), re.I):
        if reference.startswith("data:"): continue
        if urlparse(reference).scheme or reference.startswith("//"):
            ERRORS.append(f"{file.relative_to(SITE)}: remote CSS resource {reference}")
        elif not ((SITE if reference.startswith("/") else file.parent) / unquote(urlparse(reference).path).lstrip("/")).is_file():
            ERRORS.append(f"{file.relative_to(SITE)}: missing CSS resource {reference}")

expected = json.loads(Path("src/data/recovered.json").read_text())
for item in expected["pages"]:
    if item["path"] not in pages: ERRORS.append(f"Missing recovered page {item['path']}")
for asset in expected["assets"]:
    if not (SITE / asset).is_file(): ERRORS.append(f"Missing recovered asset {asset}")
if ERRORS:
    print("\n".join(sorted(set(ERRORS))))
    print(f"FAILED: {len(set(ERRORS))} issues")
    sys.exit(1)
print(f"PASS: {len(pages)} HTML pages, {len(expected['assets'])} recovered assets; local links, fragments, asset dependencies, and SEO/landmark checks")
