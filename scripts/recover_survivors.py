"""Preserve every publicly listed file surviving in the club's old directories."""
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import json
from recover import ROOT, DEST, ORIGIN, download, Links, local_path, SOURCES


def main():
    manifest_path = ROOT / "recovery-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    directories = {p.split('/')[0] + '/' for p in SOURCES if '/' in p}
    seen_directories = set()
    seen_files = set()
    listings = ROOT / "recovery/directory-listings"
    listings.mkdir(parents=True, exist_ok=True)
    while directories:
        directory = sorted(directories)[0]
        directories.remove(directory)
        if directory in seen_directories:
            continue
        seen_directories.add(directory)
        try:
            data, content_type, final = download(urljoin(ORIGIN.replace('http:', 'https:'), directory))
        except Exception as error:
            print("DIRECTORY MISS", directory, error, flush=True)
            continue
        if b'Index of ' not in data:
            continue
        (listings / (directory.rstrip('/').replace('/', '__') + '.html')).write_bytes(data)
        parser = Links()
        parser.feed(data.decode('latin-1'))
        for reference in parser.urls:
            if reference.startswith(('?', '/', '../')):
                continue
            url = urljoin(ORIGIN + directory, reference)
            path = local_path(url)
            if not path or Path(path).name.startswith('.'):
                continue
            if urlparse(url).path.endswith('/'):
                directories.add(unquote(urlparse(url).path.split('/~pinetreerifle/', 1)[1]))
                continue
            if path in seen_files:
                continue
            seen_files.add(path)
            if path in manifest['recovered']:
                continue
            try:
                data, content_type, final = download(url.replace('http:', 'https:', 1))
                output = DEST / path
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(data)
                manifest['recovered'][path] = final
                manifest['missing'].pop(path, None)
                manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
                print("SAVE", path, len(data), flush=True)
            except Exception as error:
                print("FILE MISS", path, error, flush=True)
    print("Preserved", len(manifest['recovered']), "files across", len(seen_directories), "directories", flush=True)

if __name__ == '__main__':
    main()
