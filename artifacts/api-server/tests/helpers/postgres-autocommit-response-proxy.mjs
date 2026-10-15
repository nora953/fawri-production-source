import net from 'node:net';
import assert from 'node:assert/strict';

// Arm only after the owned pg connection completes startup. The single next
// command is the parameterized inbox admission SELECT. Never deliver any of
// that command's response before observing idle ReadyForQuery: SELECT's
// CommandComplete alone precedes implicit transaction completion.
export function autocommitResponseFilter() {
  let pending=Buffer.alloc(0),held=[],complete=false,failed=false,dropped=false;
  return chunk=>{
    if(dropped)return {forward:Buffer.alloc(0),newDrop:false};
    pending=Buffer.concat([pending,chunk]);
    while(pending.length>=5){
      const length=pending.readUInt32BE(1);
      assert.ok(length>=4&&length<=16*1024*1024,'invalid backend frame length');
      if(pending.length<length+1)break;
      const frame=pending.subarray(0,length+1);pending=pending.subarray(length+1);held.push(frame);
      if(frame[0]===69)failed=true;
      if(frame[0]===67){assert.ok(frame.subarray(5).equals(Buffer.from('SELECT 1\0')),'unexpected owned admission command');complete=true;}
      if(frame[0]===90){
        assert.equal(frame.length,6);assert.equal(frame[5],73,'admission did not finish idle');
        assert.ok(complete&&!failed,'admission did not complete successfully');
        dropped=true;held=[];pending=Buffer.alloc(0);
        return {forward:Buffer.alloc(0),newDrop:true};
      }
    }
    return {forward:Buffer.alloc(0),newDrop:false};
  };
}
export async function startOwnedAutocommitResponseProxy(onDrop){
  let armed=false,notice=Promise.resolve();const sockets=new Set();
  const server=net.createServer(downstream=>{
    const upstream=net.createConnection({host:'127.0.0.1',port:5432}),filter=autocommitResponseFilter();
    sockets.add(downstream);sockets.add(upstream);
    const destroy=()=>{downstream.destroy();upstream.destroy();};
    for(const socket of [downstream,upstream]){socket.on('error',destroy);socket.on('close',()=>{sockets.delete(socket);destroy();});socket.setTimeout(30000,destroy);}
    downstream.pipe(upstream);
    upstream.on('data',chunk=>{try{
      if(!armed){downstream.write(chunk);return;}
      const result=filter(chunk);
      if(result.newDrop){notice=Promise.resolve().then(onDrop);notice.then(destroy,destroy);}
    }catch{destroy();}});
    upstream.on('end',()=>downstream.end());
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  return {port:server.address().port,arm(){armed=true;},async close(){for(const socket of sockets)socket.destroy();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await notice;}};
}
