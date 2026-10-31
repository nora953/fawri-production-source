import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootstrapCompleteSchemaSql} from './lib/complete-schema-bootstrap.mjs';
assert.equal(process.argv.length,4,'input and output paths required');
fs.writeFileSync(process.argv[3],bootstrapCompleteSchemaSql(fs.readFileSync(process.argv[2],'utf8')));
