"""Read-only executable-source selection census; never import application/tests."""
import csv,hashlib,json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[3]
out=pathlib.Path(__file__).resolve().parent
tracked=subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
source_paths=[p for p in tracked if (not p.startswith('docs/') or (p.startswith('docs/final-audit/evidence/') and ('execute-' in p or 'run-owned-' in p))) and '/tests/' not in p and '.test.' not in p]
sources={p:(root/p).read_text(errors='replace') for p in source_paths if (root/p).is_file() and p.endswith(('.yml','.yaml','.mjs','.js','.ts','.tsx','.py','.sh','package.json'))}
old=list(csv.DictReader((out/'seq225-expanded-selection.csv').open()))
remaining=[r for r in old if r['type']!='integration' and not r['literal_references_expanded']]
rows=[]
for r in remaining:
 name=pathlib.Path(r['path']).name
 refs=[f'{p}:{n}' for p,s in sources.items() for n,line in enumerate(s.splitlines(),1) if name in line]
 content=(root/r['path']).read_bytes()
 rows.append({'path':r['path'],'status':'REFERENCE_REQUIRES_TRACE' if refs else 'NO_EXECUTABLE_REFERENCE_IN_BOUNDED_CENSUS','references':'|'.join(refs),'sha256':hashlib.sha256(content).hexdigest(),'unchanged_since_seq225':hashlib.sha256(content).hexdigest()==r['sha256'],'local_execution':'REUSE_SEQ226_NO_RERUN'})
with (out/'seq294-unselected-contracts.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n");w.writeheader();w.writerows(rows)
summary={'baseline':'27f0f6274189ec588ac1a8f4235d3cbaa53662aa','source_files':len(sources),'top_level_api_test_files':sum(p.startswith('artifacts/api-server/tests/') and p.count('/')==3 and '.test.' in p for p in tracked),'reviewed_remaining_contracts':len(rows),'no_reference':sum(not r['references'] for r in rows),'unchanged':sum(r['unchanged_since_seq225'] for r in rows),'runtime':'priorSEQ226 reused; no tests rerun','limits':'Bounded tracked workflow/script/package and audit executor census. Filename absence plus manual glob/caller review; external/untracked CI unknown. Not statement/branch/runtime coverage.'}
(out/'seq294-selector-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
