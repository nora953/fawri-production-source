import assert from 'node:assert/strict';
import test from 'node:test';
import { commitResponseFilter } from '../../artifacts/api-server/tests/helpers/postgres-commit-response-proxy.mjs';

function frame(type,payload) {
  const data=Buffer.from(payload),header=Buffer.alloc(5);
  header[0]=type.charCodeAt(0); header.writeUInt32BE(data.length+4,1);
  return Buffer.concat([header,data]);
}
const commit=frame('C','COMMIT\0'),ready=frame('Z','I');

test('fragmented backend frame drops complete COMMIT without leaking acknowledgment bytes',() => {
  const filter=commitResponseFilter(1);
  for (const byte of commit.subarray(0,commit.length-1)) {
    const result=filter(Buffer.from([byte]));
    assert.equal(result.forward.length,0); assert.equal(result.newDrop,false);
  }
  const result=filter(Buffer.concat([commit.subarray(-1),ready]));
  assert.equal(result.newDrop,true); assert.equal(result.forward.length,0);
  assert.equal(filter(ready).forward.length,0);
});

test('second boundary forwards the first COMMIT and ReadyForQuery but drops coalesced second response',() => {
  const filter=commitResponseFilter(2);
  const select=frame('C','SELECT 1\0');
  const result=filter(Buffer.concat([select,commit,ready,commit,ready]));
  assert.equal(result.newDrop,true);
  assert.deepEqual(result.forward,Buffer.concat([select,commit,ready]));
});

test('COMMIT text in row data or a different command tag never triggers a drop',() => {
  const filter=commitResponseFilter(1);
  const response=Buffer.concat([frame('D','COMMIT\0'),frame('C','COMMIT PREPARED\0'),ready]);
  const result=filter(response);
  assert.equal(result.newDrop,false); assert.deepEqual(result.forward,response);
});

test('invalid framing and unsupported boundaries fail closed',() => {
  assert.throws(() => commitResponseFilter(3));
  const invalid=Buffer.alloc(5); invalid[0]=67; invalid.writeUInt32BE(3,1);
  assert.throws(() => commitResponseFilter(1)(invalid));
});
