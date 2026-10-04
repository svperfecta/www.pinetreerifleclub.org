"""Save every inventoried historical image capture, including older versions."""
import hashlib
import json
import time
from pathlib import Path
from recover import ROOT, captures, download, local_path

report = []
for row in captures:
    if not row[2].startswith('image/'):
        continue
    relative = local_path(row[1])
    output = ROOT / 'recovery/image-captures' / row[0] / relative
    url = 'https://web.archive.org/web/' + row[0] + 'id_/' + row[1]
    entry = {'timestamp': row[0], 'original': row[1], 'file': str(output.relative_to(ROOT))}
    try:
        if not output.exists():
            time.sleep(.5)
            data, content_type, final_url = download(url)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(data)
        data = output.read_bytes()
        entry.update({'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        print('SAVE', entry['file'], flush=True)
    except Exception as error:
        entry['error'] = str(error)
        print('MISS', entry['file'], str(error), flush=True)
    report.append(entry)
(ROOT / 'recovery/image-versions.json').write_text(json.dumps(report, indent=2) + '\n')
print('Preserved', sum('sha256' in row for row in report), 'of', len(report), 'image captures', flush=True)
