import net from 'node:net';
import assert from 'node:assert/strict';

// Backend protocol frames can be split or coalesced by TCP. Never search raw
// chunks: only a complete CommandComplete with the exact COMMIT tag counts.
export function commitResponseFilter(boundary, shouldCount = () => true) {
  assert.equal(typeof shouldCount,'function');
  assert.ok([1,2].includes(boundary));
  let buffer = Buffer.alloc(0), commits = 0, dropped = false;
  return chunk => {
    if (dropped) return {forward:Buffer.alloc(0),dropped:true,newDrop:false};
    buffer = Buffer.concat([buffer,chunk]);
    const forward = [];
    while (buffer.length >= 5) {
      const length = buffer.readUInt32BE(1);
      assert.ok(length >= 4 && length <= 16 * 1024 * 1024, 'invalid backend frame length');
      if (buffer.length < length + 1) break;
      const frame = buffer.subarray(0,length+1);
      buffer = buffer.subarray(length+1);
      if (frame[0] === 67 && frame.subarray(5).equals(Buffer.from('COMMIT\0')) && shouldCount()) {
        commits++;
        if (commits === boundary) {
          dropped = true;
          buffer = Buffer.alloc(0);
          return {forward:Buffer.concat(forward),dropped:true,newDrop:true};
        }
      }
      forward.push(frame);
    }
    return {forward:Buffer.concat(forward),dropped:false,newDrop:false};
  };
}

// Caller has already attested the owned network-none PostgreSQL namespace.
// Destination is deliberately fixed; no host, credential or URL is logged.
export async function startOwnedCommitResponseProxy(boundary, onDrop, {deferUntilArmed = false} = {}) {
  assert.equal(typeof deferUntilArmed,'boolean');
  let armed = !deferUntilArmed;
  const sockets = new Set();
  let notice = Promise.resolve();
  const server = net.createServer(downstream => {
    const upstream = net.createConnection({host:'127.0.0.1',port:5432});
    const filter = commitResponseFilter(boundary, () => armed);
    sockets.add(downstream); sockets.add(upstream);
    const destroy = () => { downstream.destroy(); upstream.destroy(); };
    for (const socket of [downstream,upstream]) {
      socket.on('error',destroy);
      socket.on('close',() => { sockets.delete(socket); destroy(); });
      socket.setTimeout(30000,destroy);
    }
    downstream.pipe(upstream);
    upstream.on('data',chunk => {
      try {
        const result = filter(chunk);
        if (result.forward.length) downstream.write(result.forward);
        if (result.newDrop) {
          // The authority never receives COMMIT's CommandComplete or following
          // ReadyForQuery. IPC records the boundary before closing TCP.
          notice = Promise.resolve().then(onDrop);
          notice.then(destroy,destroy);
        }
      } catch { destroy(); }
    });
    upstream.on('end',() => downstream.end());
  });
  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(0,'127.0.0.1',() => { server.removeListener('error',reject); resolve(); });
  });
  return {
    port:server.address().port,
    arm() { armed = true; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
      await notice;
    },
  };
}
