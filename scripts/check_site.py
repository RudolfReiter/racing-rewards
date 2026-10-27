"""Validate local resources, data consistency and the downloadable source."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import json
import zipfile

root=Path(__file__).resolve().parents[1];docs=root/'docs'
class Page(HTMLParser):
    def __init__(self): super().__init__();self.ids=[];self.refs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        for key in ['href','src']:
            if key in a:self.refs.append(a[key])
p=Page();p.feed((docs/'index.html').read_text())
assert len(set(p.ids))==len(p.ids),'Duplicate HTML ids'
for ref in p.refs:
    if ref.startswith('#'):
        assert ref=='#' or ref[1:] in p.ids,ref
    elif not urlparse(ref).scheme:
        assert (docs/ref).exists(),ref
payload=json.loads((docs/'data/experiment.json').read_text())
assert json.loads((docs/'data/experiment.js').read_text().removeprefix('window.EXPERIMENT=').strip().removesuffix(';'))==payload
summary=json.loads((docs/'data/summary.json').read_text())
assert summary==[dict(scenario=s['id'],method=r['id'],**r['metrics']) for s in payload['scenarios'] for r in s['runs']]
with zipfile.ZipFile(docs/'assets/source.zip') as z:
    assert z.testzip() is None
    names=z.namelist();assert any(n.endswith('pyproject.toml') for n in names)
    assert not any('/.venv/' in n or '/.git/' in n for n in names)
print(f'Static checks passed: {len(p.ids)} unique ids, local references, matching exports, valid source archive.')
