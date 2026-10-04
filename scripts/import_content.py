"""Convert preserved originals into Eleventy content fragments and local assets.

This is a one-time import tool. Produces intermediate recovery templates; edit production content through EmDash;
rerunning this script deliberately refreshes imported pages from the originals.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote, quote
import hashlib
import html
import json
import os
import re
import shutil
from recover import local_path, ORIGIN

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "recovery/originals"
PAGES = ROOT / "recovery/templates/pages"
ASSETS = ROOT / "src/assets"
MANIFEST = json.loads((ROOT / "recovery-manifest.json").read_text())
FILES = {p for p in MANIFEST["recovered"] if (RAW / p).is_file()}
ALIASES = {p.lower(): p for p in FILES}
LINK_CORRECTIONS = {
    "pics/FrameTarget.pdf": "rimfire/targeframe01.pdf",
    "store/FORM order club merch.pdf": "store/Form order merch.pdf",
}
EXTERNAL = json.loads((ROOT / "recovery/external-assets.json").read_text()) if (ROOT / "recovery/external-assets.json").exists() else {}
MISSING = {}
REMOVED = []
PAGE_DATA = []
ASSET_MAP = {}
ATTRS = {"bgcolor", "background", "text", "link", "vlink", "alink", "class", "style"}
HOME_SOURCE = (RAW / "index.html").read_bytes().decode("windows-1252", errors="replace")
NAV_TITLES = {}
for href, label in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', HOME_SOURCE, re.I):
    linked = local_path(href)
    if linked and linked != "index.html" and linked.lower().endswith((".html", ".htm")):
        NAV_TITLES.setdefault(linked, re.sub(r'<[^>]*>', '', html.unescape(label)).strip())


def decode(data):
    declaration = re.search(br'charset\s*=\s*["\']?([\w-]+)', data[:3000], re.I)
    encoding = declaration.group(1).decode() if declaration else "windows-1252"
    if encoding.lower() in ("iso-8859-1", "iso8859-1", "latin-1"):
        encoding = "windows-1252"
    try:
        return data.decode(encoding)
    except (LookupError, UnicodeDecodeError):
        return data.decode("windows-1252", errors="replace")


def slug(path):
    return hashlib.sha256(path.encode()).hexdigest()[:12]


def relative(target, page):
    result = os.path.relpath(target, str(Path(page).parent)).replace(os.sep, "/")
    return quote(result, safe="/._-#")


class Rewrite(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=False)
        self.path = path
        self.output = []
        self.ignore_script = False

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.ignore_script = True
            REMOVED.append({"page": self.path, "reason": "Legacy script omitted"})
            return
        if self.ignore_script:
            return
        values = dict(attrs)
        if tag == "img" and "simplehitcounter.com" in values.get("src", ""):
            REMOVED.append({"page": self.path, "reason": "Retired visitor counter omitted"})
            return
        for key in ("href", "src", "background"):
            value = values.get(key)
            if not value:
                continue
            parsed = urlparse(value)
            if parsed.scheme == "file" or re.match(r'^/?[A-Za-z]:[\\/]', value):
                REMOVED.append({"page": self.path, "reason": "Removed original editor's temporary file dependency"})
                if tag == "img":
                    label = value.replace("\\", "/").rsplit("/", 1)[-1]
                    found = "Original editor image: " + label
                    MISSING.setdefault(found, {"id": slug(found), "pages": set()})["pages"].add(self.path)
                    self.output.append('<span class="missing-image">Original image unavailable</span>')
                return
            found = local_path(value, ORIGIN + self.path)
            if found == "programs/Www.dec.ny.gov":
                values[key] = "https://dec.ny.gov/"
                REMOVED.append({"page": self.path, "file": found, "reason": "Corrected missing scheme on DEC website link"})
                continue
            if found:
                actual = found if found in FILES else ALIASES.get(found.lower()) or LINK_CORRECTIONS.get(found)
                if actual:
                    values[key] = relative(actual, self.path) + ("#" + parsed.fragment if parsed.fragment else "")
                elif tag == "link" and key == "href":
                    # A stylesheet returning 404 on the original site contributed no styles.
                    REMOVED.append({"page": self.path, "file": found, "reason": "Missing original stylesheet"})
                    return
                else:
                    MISSING.setdefault(found, {"id": slug(found), "pages": set()})["pages"].add(self.path)
                    if tag == "img":
                        if found.lower().endswith("bullet.bmp"):
                            self.output.append("Return to homepage")
                        else:
                            label = values.get("alt") or Path(found).name
                            self.output.append('<span class="missing-image">Image unavailable: ' + html.escape(label) + '</span>')
                        return
                    values[key] = relative("missing-content.html", self.path) + "#" + slug(found)
            elif value in EXTERNAL:
                values[key] = relative(EXTERNAL[value], self.path)
            elif parsed.scheme in ("http", "https") and key in ("src", "background"):
                raise ValueError(f"External asset must be downloaded before import: {self.path}: {value}")
            elif "archive.org" in value or "pinetreerifleclub.org" in value:
                raise ValueError(f"Unresolved retired URL: {self.path}: {value}")
        if tag == "img":
            values.setdefault("alt", "")
            if "clubhouse5.jpg" in values.get("src", ""):
                values["alt"] = "Pine Tree Rifle Club clubhouse in Johnstown, New York"
            if "NRA%20LOGO" in values.get("src", ""):
                values["alt"] = "National Rifle Association"
            if "nysrpa.jpg" in values.get("src", ""):
                values["alt"] = "New York State Rifle and Pistol Association"
            if "dtonme.jpg" in values.get("src", ""):
                values["alt"] = "Don't Tread on Me flag"
            if "bullet.bmp" in values.get("src", ""):
                values["alt"] = "Return to homepage"
        if tag == "a" and values.get("target") == "_blank":
            values["rel"] = "noopener noreferrer"
        if tag == "table" and not values.get("border", "0").strip("0"):
            values["role"] = "presentation"
        rendered = "".join(" " + key + ("=\"" + html.escape(str(value), quote=True) + "\"" if value is not None else "") for key, value in values.items())
        self.output.append("<" + tag + rendered + ">")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "script":
            self.ignore_script = False
        elif not self.ignore_script:
            self.output.append("</" + tag + ">")

    def handle_data(self, data):
        if not self.ignore_script:
            data = re.sub(r'https?://(?:www\.)?frontiernet\.net/~pinetreerifle/?', "Home", data, flags=re.I)
            data = re.sub(r'https?://(?:www\.)?pinetreerifleclub\.org/?', "Home", data, flags=re.I)
            self.output.append(data)

    def handle_entityref(self, name):
        self.output.append("&" + name + ";")

    def handle_charref(self, name):
        self.output.append("&#" + name + ";")


def plain(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", text))).strip()


def write_page(path, body, title, head="", body_attrs="", historical=False):
    title = plain(title) or "Pine Tree Rifle Club"
    if path in NAV_TITLES:
        title = NAV_TITLES[path]
    raffle = re.search(r'(20\d\d)raffle', path, re.I)
    classes = re.search(r'(20\d\d)classes', path, re.I)
    summer = re.search(r'(20\d\d)summerpistol', path, re.I)
    if raffle: title = raffle.group(1) + " Annual Raffle"
    if classes: title = classes.group(1) + " Training Classes"
    if summer: title = summer.group(1) + " Summer Pistol League"
    if "mcwebsoftware.com" in title.lower() or title.lower() == "untitled":
        title = Path(path).stem.replace("_", " ")
    if path == "index.html": title = "Pine Tree Rifle Club"
    if title.upper() in ("PINE TREE RIFLE CLUB", "PTRC") and path != "index.html":
        title = Path(path).stem.replace("_", " ") + " — Pine Tree Rifle Club"
    if path != "index.html" and "pine tree" not in title.lower():
        title += " — Pine Tree Rifle Club"
    description = plain(body)[:155]
    metadata = {"layout": "base.njk", "permalink": path, "title": title, "description": description,
                "legacyHead": head, "legacyBodyAttributes": body_attrs, "isHome": path == "index.html",
                "hasHeading": bool(re.search(r'<h1\b', body, re.I)), "historical": historical}
    section_map = {"admin": "administration", "centerfire": "competitions/centerfire", "rimfire": "competitions/rimfire", "pistol": "competitions/pistol", "travelleaguerifle": "competitions/travel-rifle", "fireside": "history/fireside"}
    original = Path(path)
    if path == "index.html":
        content_path = Path("home.njk")
    elif len(original.parts) == 1:
        content_path = Path("calendar.njk") if path == "calendar.html" else Path("history/legacy") / (original.stem + ".njk")
    else:
        section = section_map.get(original.parts[0], original.parts[0])
        parent = Path(section).joinpath(*original.parts[1:-1])
        suffix = "-htm" if original.suffix == ".htm" and str(original.with_suffix(".html")) in FILES else ""
        content_path = parent / (original.stem + suffix + ".njk")
    output = PAGES / content_path
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("---\n" + json.dumps(metadata, ensure_ascii=False, indent=2) + "\n---\n" + body + "\n")
    PAGE_DATA.append({"path": path, "title": title, "historical": historical, "source": str(content_path)})


def main():
    PAGES.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    for path in sorted(FILES):
        if not path.lower().endswith((".html", ".htm")):
            suffix = Path(path).suffix.lower()
            kind = "images" if suffix in (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp", ".tif", ".tiff") else "styles" if suffix == ".css" else "documents" if suffix in (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf") else "other"
            output = ASSETS / kind / path
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(RAW / path, output)
            if suffix == ".css":
                css = decode(output.read_bytes())
                if "<style" in css.lower():
                    styles = re.findall(r'<style\b[^>]*>([\s\S]*?)</style\s*>', css, re.I)
                    output.write_text("\n".join(styles) + "\n")
                    REMOVED.append({"file": path, "reason": "Extracted CSS rules from malformed original HTML stylesheet"})
            ASSET_MAP[path] = str(output.relative_to(ROOT))
            continue
        source = decode((RAW / path).read_bytes())
        source = re.sub(r'<!--[\s\S]*?-->', "", source)
        head_match = re.search(r'<head\b[^>]*>([\s\S]*?)</head\s*>', source, re.I)
        head = head_match.group(1) if head_match else ""
        titles = re.findall(r'<title\b[^>]*>([\s\S]*?)</title\s*>', head, re.I)
        if titles and "Index of /" in titles[-1]:
            REMOVED.append({"page": path, "reason": "Apache directory listing retained only in preservation files"})
            continue
        body_match = re.search(r'<body\b([^>]*)>([\s\S]*?)(?:</body\s*>|$)', source, re.I)
        if body_match:
            body = body_match.group(2)
            attr_parser = HTMLParser()
            attr_source = body_match.group(1)
            body_attrs = " ".join(re.findall(r'(?:bgcolor|background|text|link|vlink|alink|class|style)\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)', attr_source, re.I))
        else:
            body = source[head_match.end():] if head_match else source
            body_attrs = ""
        body = re.sub(r'</?html\b[^>]*>|<!DOCTYPE[^>]*>', "", body, flags=re.I)
        parser = Rewrite(path)
        parser.feed(body)
        body = "".join(parser.output)
        # Original pages used list elements as indentation-only containers.
        # Retain their visual spacing without exposing malformed lists to readers.
        def repair_list(match):
            tag, attributes, contents = match.groups()
            if re.search(r'<li\b|<(?:ul|ol)\b', contents, re.I):
                return match.group(0)
            return '<div class="legacy-list"' + attributes + '>' + contents + '</div>'
        body = re.sub(r'<(ol|ul)([^>]*)>([\s\S]*?)</\1>', repair_list, body, flags=re.I)
        if path == "admin/mr.html":
            body = re.sub(r'<ul style="text-align: left;">\s*<ul>\s*<ul>', '<ul style="text-align: left; padding-inline-start: 120px;">', body)
            body = re.sub(r'</ul>\s*</ul>\s*</ul>', '</ul>', body)
        if path == "admin/srr.html":
            body = re.sub(r'<dt\b([^>]*)>', '<div class="legacy-subitem"\\1>', body, flags=re.I)
            body = re.sub(r'</dt>', '</div>', body, flags=re.I)
        body = re.sub(r'<a\b(?=[^>]*href=)(?![^>]*(?:name|id)=)[^>]*>\s*</a>', '', body, flags=re.I)
        if path == "admin/feedback.html":
            for field, label in (("Name", "Name"), ("Email", "E-mail"), ("Comments", "Comments")):
                field_id = 'feedback-' + field.lower()
                body = body.replace('name="' + field + '"', 'name="' + field + '" id="' + field_id + '"')
                body = body.replace('>' + label + '</td>', '><label for="' + field_id + '">' + label + '</label></td>')
            body = body.replace('name="Email"', 'type="email" name="Email"')
            body = body.replace('method="POST"', 'method="POST" enctype="text/plain"')
        heading_number = 0
        def repair_heading(match):
            nonlocal heading_number
            heading_number += 1
            if heading_number == 1:
                return match.group(0)
            return '<h2 class="legacy-h1"' + match.group(1) + '>' + match.group(2) + '</h2>'
        body = re.sub(r'<h1\b([^>]*)>([\s\S]*?)</h1>', repair_heading, body, flags=re.I)
        useful_head = "\n".join(re.findall(r'<style\b[^>]*>[\s\S]*?</style\s*>|<link\b[^>]*>', head, re.I))
        parser = Rewrite(path)
        parser.feed(useful_head)
        useful_head = "".join(parser.output)
        heading = re.search(r'<h[12]\b[^>]*>([\s\S]*?)</h[12]\s*>', body, re.I)
        title = titles[-1] if titles else (heading.group(1) if heading else Path(path).stem)
        year = re.search(r'(?:19|20)\d{2}', Path(path).name)
        historical = bool(year and int(year.group()) < 2025) or ("/" not in path and path not in ("index.html", "calendar.html"))
        if path == "index.html":
            match = re.search(r'<table\b', body, re.I)
            if match:
                (ROOT / "recovery/templates/_includes/home-header.njk").write_text(body[:match.start()] + "\n")
                body = body[match.start():]
            navigation = re.search(r'(<td\b[^>]*rowspan="3"[^>]*>)([\s\S]*?)(</td>)', body, re.I)
            if navigation:
                sidebar = navigation.group(2)
                (ROOT / "recovery/templates/_includes/club-navigation.njk").write_text('<nav aria-label="Club sections">' + sidebar + '</nav>\n')
                body = body[:navigation.start(2)] + '{% include "club-navigation.njk" %}' + body[navigation.end(2):]
        write_page(path, body, title, useful_head, body_attrs, historical)
    missing = [{"file": path, "id": item["id"], "pages": sorted(item["pages"])} for path, item in sorted(MISSING.items())]
    (ROOT / "src/data/recovered.json").write_text(json.dumps({"pages": PAGE_DATA, "assets": sorted(p for p in FILES if not p.lower().endswith((".html", ".htm"))), "missing": missing}, indent=2) + "\n")
    (ROOT / "src/data/assetMap.json").write_text(json.dumps(ASSET_MAP, indent=2) + "\n")
    (ROOT / "recovery/import-report.json").write_text(json.dumps({"missing": missing, "omitted": REMOVED}, indent=2) + "\n")
    print(f"Imported {len(PAGE_DATA)} pages and {len(FILES) - len(PAGE_DATA)} assets; {len(missing)} unresolved original files")

if __name__ == "__main__":
    main()
