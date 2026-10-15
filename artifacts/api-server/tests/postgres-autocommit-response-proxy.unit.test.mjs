import assert from 'node:assert/strict';
import test from 'node:test';
import {autocommitResponseFilter} from './helpers/postgres-autocommit-response-proxy.mjs';
const frame=(tag,payload)=>{const body=Buffer.from(payload);const header=Buffer.alloc(5);header[0]=tag.charCodeAt(0);header.writeUInt32BE(body.length+4,1);return Buffer.concat([header,body]);};
const response=Buffer.concat([frame('T','synthetic row description'),frame('D','synthetic timestamp'),frame('C','SELECT 1\0'),frame('Z','I')]);
test('admission response stays entirely withheld across every possible TCP split until idle ready',()=>{
  for(let split=0;split<=response.length;split++){
    const filter=autocommitResponseFilter(),first=filter(response.subarray(0,split));
    assert.equal(first.forward.length,0);assert.equal(first.newDrop,split===response.length);
    const last=filter(response.subarray(split));assert.equal(last.forward.length,0);assert.equal(last.newDrop,split!==response.length);
    assert.equal(filter(response).newDrop,false);
  }
});
test('command completion alone cannot prove implicit commit; transaction/error/unexpected command is rejected',()=>{
  const filter=autocommitResponseFilter();assert.equal(filter(frame('C','SELECT 1\0')).newDrop,false);
  assert.throws(()=>filter(frame('Z','T')),/did not finish idle/);
  assert.throws(()=>autocommitResponseFilter()(Buffer.concat([frame('E','error'),frame('Z','I')])),/did not complete successfully/);
  assert.throws(()=>autocommitResponseFilter()(frame('C','UPDATE 1\0')),/unexpected owned admission command/);
});
