import net from 'node:net';
import tls from 'node:tls';

// Exact previously verified clone endpoint; no credentials, SQL or application imports.
const host='ep-soft-wildflower-b1i4j4xu.c-5.eu-central-1.aws.neon.tech';
const socket=net.connect({host,port:5432});
let secure,finished=false;
const finish=(ok,code)=>{
  if(finished)return;
  finished=true;
  clearTimeout(timer);
  console.log(ok?'FIELD002_CLONE_TLS_OK':'FIELD002_CLONE_TLS_FAILED '+code);
  process.exitCode=ok?0:1;
  secure?.destroy();
  socket.destroy();
};
const timer=setTimeout(()=>finish(false,'TIMEOUT'),10000);
socket.once('error',e=>finish(false,/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'TRANSPORT_ERROR'));
socket.once('connect',()=>{
  const request=Buffer.alloc(8);
  request.writeInt32BE(8,0);
  request.writeInt32BE(80877103,4);
  socket.write(request);
});
socket.once('data',data=>{
  if(data.length!==1||data[0]!==83)return finish(false,'SSL_REFUSED');
  secure=tls.connect({socket,servername:host,rejectUnauthorized:true});
  secure.once('error',e=>finish(false,/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'TLS_ERROR'));
  secure.once('secureConnect',()=>finish(secure.authorized,secure.authorized?'OK':'UNAUTHORIZED'));
});
