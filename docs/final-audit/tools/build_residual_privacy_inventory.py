#!/usr/bin/env python3
"""Reproduce bounded source observations, never grant privacy acceptance.

Run from any directory; --check verifies committed JSON/Markdown without writes.
Lexical SQL references identify review candidates, not a complete dataflow graph.
"""
import argparse
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / 'docs/final-audit'
CURATION = AUDIT / 'evidence/P0-RESIDUAL-PRIVACY-CURATION-20261024.json'
JSON_OUT = AUDIT / 'evidence/P0-RESIDUAL-FIELD-INVENTORY-20261024.json'
MD_OUT = AUDIT / 'P0-RESIDUAL-FIELD-INVENTORY-20261024.md'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def locate(ref):
    text = (ROOT / ref['path']).read_text()
    assert ref['anchor'] in text, f"Missing reviewed anchor: {ref}"
    return {**ref, 'line': text[:text.index(ref['anchor'])].count('\n') + 1,
            'sha256': digest(text.encode())}


def build():
    curated = json.loads(CURATION.read_text())
    revision = curated['sourceRevision']
    result = subprocess.run(['git', 'diff', '--exit-code', '--quiet', revision, '--',
                             'artifacts/api-server/src', 'lib/db/src/schema', curated['snapshot']],
                            cwd=ROOT, capture_output=True)
    assert result.returncode == 0, 'Runtime/schema differs from curated source revision; review curation first'
    snapshot_path = ROOT / curated['snapshot']
    snapshot = json.loads(snapshot_path.read_text())
    source_files = sorted(p for p in (ROOT / 'artifacts/api-server/src').rglob('*')
                          if p.is_file() and p.suffix in {'.ts', '.tsx', '.js', '.mjs'})
    source_text = {str(p.relative_to(ROOT)): p.read_text() for p in source_files}
    table_records = []
    field_count = 0
    for table, config in curated['tables'].items():
        columns = snapshot['tables']['public.' + table]['columns']
        assert set(columns) == set(config['fieldObservations']), f'Unclassified/missing columns: {table}'
        schema = (ROOT / config['schemaPath']).read_text()
        assert f'export const {config["ormSymbol"]} = pgTable(' in schema
        references = []
        pattern = re.compile(r'\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE|FROM|JOIN)\s+"?'
                             + re.escape(table) + r'"?\b', re.IGNORECASE)
        for path, text in source_text.items():
            for hit in pattern.finditer(text):
                previous = list(re.finditer(r'\bfunction\s+(\w+)\s*\(', text[:hit.start()]))
                references.append({'path': path, 'line': text[:hit.start()].count('\n') + 1,
                                   'operation': ' '.join(hit.group(1).upper().split()),
                                   'nearestNamedFunctionHeuristic': previous[-1].group(1) if previous else None})
        fields = []
        for name, column in columns.items():
            fields.append({'column': name, 'sqlType': column['type'],
                           'nullable': not column.get('notNull', False),
                           'primaryKey': column.get('primaryKey', False),
                           'sourceObservation': config['fieldObservations'][name],
                           'fieldPrivacyAccepted': False})
        producer_candidates = {}
        for ref in references:
            if ref['operation'] not in {'INSERT INTO', 'UPDATE', 'DELETE FROM'}:
                continue
            key = (ref['path'], ref['nearestNamedFunctionHeuristic'])
            group = producer_candidates.setdefault(key, {'path': ref['path'],
                'nearestNamedFunctionHeuristic': ref['nearestNamedFunctionHeuristic'],
                'operations': [], 'lines': []})
            if ref['operation'] not in group['operations']:
                group['operations'].append(ref['operation'])
            group['lines'].append(ref['line'])
        record = {'table': table, 'schemaPath': config['schemaPath'],
                  'schemaSha256': digest(schema.encode()), 'columnCount': len(fields),
                  'fields': fields, 'literalSqlReferences': references,
                  'sqlWriteProducerCandidates': list(producer_candidates.values()),
                  'reviewedConsumers': [locate(r) for r in config['reviewedConsumers']],
                  'routes': config['routes'], 'actorPolicyObserved': config['actorPolicyObserved'],
                  'boundedEvidence': config['boundedEvidence'], 'notes': config['notes']}
        for route in record['routes']:
            assert (ROOT / route['source']).is_file(), route
        for evidence in record['boundedEvidence']:
            assert (AUDIT / evidence).is_file(), evidence
        field_count += len(fields)
        table_records.append(record)
    assert len(table_records) == 8 and field_count == curated['expectedColumns']
    counts = Counter(f['sourceObservation'] for t in table_records for f in t['fields'])
    inventory = {'schemaVersion': 1, 'date': curated['date'], 'sourceRevision': revision,
                 'lastAcceptedExecutable': curated['lastAcceptedExecutable'],
                 'status': curated['status'], 'release': 'NO-GO',
                 'boundedTableEnumerationComplete': True, 'boundedColumnEnumerationComplete': True,
                 'fullActorFieldProducerConsumerAcceptance': False, 'completeP0Inventory': False,
                 'counts': {'tables': 8, 'columns': field_count,
                            'reviewedRouteRows': sum(len(t['routes']) for t in table_records),
                            'literalSqlReferences': sum(len(t['literalSqlReferences']) for t in table_records),
                            'selectedOpenCells': sum(g['status'] != 'BOUNDED_HTTP_ACCEPTED' for g in curated['gaps']),
                            'selectedAcceptedCells': sum(g['status'] == 'BOUNDED_HTTP_ACCEPTED' for g in curated['gaps']),
                            'fieldObservationClasses': dict(sorted(counts.items()))},
                 'inputs': {'snapshot': curated['snapshot'], 'snapshotSha256': digest(snapshot_path.read_bytes()),
                            'curationSha256': digest(CURATION.read_bytes()),
                            'generatorSha256': digest(Path(__file__).read_bytes()),
                            'scannedRuntimeFileCount': len(source_files),
                            'scannedRuntimeTreeSha256': digest(json.dumps(
                                {p: digest(t.encode()) for p, t in source_text.items()}, sort_keys=True).encode())},
                 'methodLimits': ['Snapshot columns are exact; field/role observations are manually reviewed source mappings.',
                                  'Literal SQL scan and nearest function heuristic are not an AST, call graph or dynamic SQL proof.',
                                  'Reviewed route rows are not an exhaustive endpoint/actor denominator.',
                                  'No same-name legacy JSON store is treated as the SQL table.',
                                  'Nested JSON keys and producer/input provenance remain explicit open work.',
                                  'Existing runtime acceptance is bounded by its original evidence; no new runtime PASS from this inventory.'],
                 'tables': table_records, 'reviewCells': curated['gaps'],
                 'openCells': [g for g in curated['gaps'] if g['status'] != 'BOUNDED_HTTP_ACCEPTED'],
                 'acceptedCells': [g for g in curated['gaps'] if g['status'] == 'BOUNDED_HTTP_ACCEPTED']}
    markdown = render(inventory)
    return json.dumps(inventory, indent=2) + '\n', markdown


def render(data):
    lines = ['# Bounded residual privacy field inventory — 2026-10-24', '',
             f"Source revision `{data['sourceRevision']}`; last accepted executable `{data['lastAcceptedExecutable']}`.", '',
             '**8 tables / 86 schema columns enumerated. This is source inventory, not field privacy or release acceptance.**', '',
             'All fieldPrivacyAccepted flags remain false: existing bounded runtime proofs remain valid, but do not individually accept every field/producer/actor cell. Full HTTP and role/field gates stay OPEN; NO-GO.', '',
             'Reproduce: `python docs/final-audit/tools/build_residual_privacy_inventory.py --check`.', '',
             '| Table | Columns | Reviewed route rows | Literal SQL references |', '| --- | ---: | ---: | ---: |']
    for table in data['tables']:
        lines.append(f"| {table['table']} | {table['columnCount']} | {len(table['routes'])} | {len(table['literalSqlReferences'])} |")
    if data['acceptedCells']:
        lines += ['', '## Bounded accepted cells', '']
        for cell in data['acceptedCells']:
            lines.append(f"- **{cell['id']}** ({cell['status']}): {cell['gap']} Evidence: [{Path(cell['evidence']).name}]({cell['evidence']}). This accepts only the named runtime contract, not every field or the whole HTTP gate.")
    lines += ['', '## Selected open cells', '']
    for gap in data['openCells']:
        lines += [f"- **{gap['id']}** ({gap['table']}, {gap['status']}): {gap['gap']} Next: {gap['next']} Existing gate: `{gap['existingGate']}`."]
    for table in data['tables']:
        lines += ['', f"## {table['table']}", '', f"Schema: `{table['schemaPath']}`.", '',
                  '| Column | SQL type | Nullable | Observed source exposure; not acceptance |',
                  '| --- | --- | --- | --- |']
        for field in table['fields']:
            lines.append(f"| {field['column']} | {field['sqlType']} | {field['nullable']} | {field['sourceObservation']} |")
        lines += ['', 'Observed actor policy:', '']
        lines += [f'- {actor}: {policy}.' for actor, policy in table['actorPolicyObserved'].items()]
        lines += ['', 'Reviewed consumers:', '']
        for ref in table['reviewedConsumers']:
            lines.append(f"- `{ref['path']}:{ref['line']}` — `{ref['anchor']}`: {ref['note']}")
        lines += ['', 'SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):', '']
        for ref in table['sqlWriteProducerCandidates']:
            lines.append(f"- `{ref['path']}` / `{ref['nearestNamedFunctionHeuristic']}`: {', '.join(ref['operations'])}; lines {', '.join(map(str, ref['lines']))}.")
        if table['routes']:
            lines += ['', '| Method | Route | Current guard | Reachability / evidence status |', '| --- | --- | --- | --- |']
            for route in table['routes']:
                lines.append(f"| {route['method']} | {route['path']} | {route['guard']} | {route['reachability']} / {route['evidenceStatus']} |")
        lines += ['', 'Existing evidence: ' + ', '.join(f'[{Path(p).name}]({p})' for p in table['boundedEvidence']) + '.', '']
        lines += ['- ' + note for note in table['notes']]
    lines += ['', '## Verification and limits', '']
    lines += ['- ' + limit for limit in data['methodLimits']]
    lines += ['', 'No application/schema/grant/policy change. No hosted access, deployment, merge or P1/P2 work.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    generated = build()
    for path, text in zip((JSON_OUT, MD_OUT), generated):
        if args.check:
            assert path.is_file() and path.read_text() == text, f'Inventory drift: {path.relative_to(ROOT)}'
        else:
            path.write_text(text)
    print(json.dumps({'tables': 8, 'columns': 86, 'deterministicCheck': args.check,
                      'runtimeAcceptance': False, 'release': 'NO-GO'}))


if __name__ == '__main__':
    main()
