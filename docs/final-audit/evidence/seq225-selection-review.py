"""Read-only bounded selector/entrypoint review; not execution coverage."""
import csv, hashlib, json, pathlib, re, subprocess
root = pathlib.Path(__file__).resolve().parents[3]
evidence = pathlib.Path(__file__).resolve().parent
tracked = subprocess.check_output(['git','ls-files'], cwd=root, text=True).splitlines()
targets = [p for p in tracked if not p.startswith(('docs/','artifacts/api-server/tests/','artifacts/fawri/tests/'))
           and (p.endswith('package.json') or p.startswith(('.github/','scripts/','lib/db/scripts/')))]
sources = {p:(root/p).read_text(errors='replace') for p in targets if (root/p).is_file()}
rows = []
for old in csv.DictReader((evidence/'seq216-api-test-selection.csv').open()):
    if old['selection_evidence'] != 'UNRESOLVED_SELECTOR': continue
    path=old['path']; source=(root/path).read_text(); name=pathlib.Path(path).name
    refs=[f'{p}:{n}' for p,s in sources.items() for n,line in enumerate(s.splitlines(),1) if name in line]
    rows.append({'path':path,'type':old['type'],'literal_references_expanded':'|'.join(refs),
                 'disposable_attestation_literal':bool(re.search(r'assertDisposablePostgres|disposable-postgres-test-guard',source)),
                 'workspace_db_import_literal':'@workspace/db' in source,
                 'sha256':hashlib.sha256(source.encode()).hexdigest()})
with (evidence/'seq225-expanded-selection.csv').open('w') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
summary={'baseline':'1db2beb108aea0b507012428cce7ab5129f388be','reviewed_source_files':len(sources),
         'unresolved_queue':len(rows),'new_literal_references':sum(bool(r['literal_references_expanded']) for r in rows),
         'integration_queue':sum(r['type']=='integration' for r in rows),
         'limits':'Literal search, plus manual review of executable test selectors and package indirection. No historical execution or statement coverage inference. No runtime DB import.'}
(evidence/'seq225-expanded-selection.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
