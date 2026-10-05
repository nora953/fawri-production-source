import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { MetaFetchedVideo } from "./metaVideoUnderstandingService.js";

export const META_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const ALLOWED = new Set(["video/mp4", "video/webm"]);

type Address = { address: string; family: number };
type PinnedRequest = { url: string; hostname: string; address: string; family: number; signal: AbortSignal };
type Options = {
  timeoutMs?: number;
  resolveHost?: (hostname: string) => Promise<Address[]>;
  transportImpl?: (input: PinnedRequest) => Promise<Response>;
};

function error(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}
function forbidden4(ip: string) {
  const p=ip.split(".").map(Number); if(p.length!==4) return true;
  const [a,b]=p;
  return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168))||
    (a===198&&(b===18||b===19))||a>=224;
}
function forbidden6(ip: string) {
  const x=ip.toLowerCase().split("%",1)[0];
  if(x==="::"||x==="::1"||x.startsWith("fc")||x.startsWith("fd")||x.startsWith("ff")||
     /^fe[89ab]/.test(x)||/^fe[c-f]/.test(x)) return true;
  const m=x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if(m){const h=parseInt(m[1],16),l=parseInt(m[2],16);return forbidden4([h>>8,h&255,l>>8,l&255].join("."));}
  return false;
}
function forbidden(ip:string){const f=isIP(ip);return f===4?forbidden4(ip):f===6?forbidden6(ip):true;}
function validContainer(buffer:Buffer,mime:string){
  if(mime==="video/mp4") return buffer.length>=12&&buffer.subarray(4,8).toString("ascii")==="ftyp";
  if(mime==="video/webm") return buffer.length>=4&&buffer[0]===0x1a&&buffer[1]===0x45&&buffer[2]===0xdf&&buffer[3]===0xa3;
  return false;
}
function safeUrl(raw:string){
  try{const u=new URL(raw.trim());if(u.protocol!=="https:"||!u.hostname||u.username||u.password)throw 0;return u;}
  catch{throw error("META_VIDEO_URL_INVALID","Meta video URL is invalid");}
}

export class SecureMetaVideoFetcher {
  private readonly resolveHost:(hostname:string)=>Promise<Address[]>;
  private readonly transport:(input:PinnedRequest)=>Promise<Response>;
  private readonly timeoutMs:number;
  constructor(options:Options={}){
    this.resolveHost=options.resolveHost||((h)=>lookup(h,{all:true,verbatim:true}));
    this.timeoutMs=Number.isFinite(options.timeoutMs)&&Number(options.timeoutMs)>0?Math.min(Number(options.timeoutMs),60_000):DEFAULT_TIMEOUT_MS;
    this.transport=options.transportImpl||((input)=>new Promise<Response>((resolve,reject)=>{
      const u=new URL(input.url);
      const req=httpsRequest({protocol:"https:",hostname:input.address,family:input.family,
        port:u.port?Number(u.port):443,method:"GET",path:`${u.pathname}${u.search}`,
        servername:isIP(input.hostname)?undefined:input.hostname,headers:{host:u.host},signal:input.signal},res=>{
        const headers=new Headers();
        for(const [k,v] of Object.entries(res.headers)){if(Array.isArray(v))v.forEach(x=>headers.append(k,x));else if(v!==undefined)headers.set(k,String(v));}
        const status=res.statusCode||500;
        const body=status===204||status===205||status===304?null:Readable.toWeb(res) as ReadableStream<Uint8Array>;
        if(!body)res.resume();
        resolve(new Response(body,{status,statusText:res.statusMessage||"",headers}));
      });
      req.once("error",reject);req.end();
    }));
  }
  async fetchVideo(input:{url:string}):Promise<MetaFetchedVideo>{
    const u=safeUrl(input.url),host=u.hostname.replace(/^\[|\]$/g,"");
    const literal=isIP(host);
    let addresses:Address[];
    try{addresses=literal?[{address:host,family:literal}]:await this.resolveHost(host);}
    catch{throw error("META_VIDEO_DESTINATION_UNVERIFIED","Meta video destination could not be verified");}
    if(!addresses.length||addresses.some(x=>(x.family!==4&&x.family!==6)||isIP(x.address)!==x.family))
      throw error("META_VIDEO_DESTINATION_UNVERIFIED","Meta video destination could not be verified");
    if(addresses.some(x=>forbidden(x.address)))throw error("META_VIDEO_DESTINATION_FORBIDDEN","Meta video destination is forbidden");
    const verified=addresses[0],controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);timer.unref?.();
    try{
      let response:Response;
      try{response=await this.transport({url:u.toString(),hostname:host,address:verified.address,family:verified.family,signal:controller.signal});}
      catch{if(controller.signal.aborted)throw error("META_VIDEO_TIMEOUT","Meta video request timed out");throw error("META_VIDEO_FETCH_FAILED","Meta video request failed");}
      if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw error("META_VIDEO_REDIRECT_REJECTED","Meta video redirect rejected");}
      if(!response.ok)throw error("META_VIDEO_FETCH_FAILED","Meta video request failed");
      const mime=String(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();
      if(!ALLOWED.has(mime))throw error("META_VIDEO_MIME_INVALID","Meta video MIME is invalid");
      const raw=response.headers.get("content-length");
      if(raw!==null){if(!/^\d+$/.test(raw.trim()))throw error("META_VIDEO_FETCH_FAILED","Meta video length invalid");if(Number(raw)>META_VIDEO_MAX_BYTES)throw error("META_VIDEO_TOO_LARGE","Meta video too large");}
      if(!response.body)throw error("META_VIDEO_FETCH_FAILED","Meta video body unavailable");
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;size+=value.byteLength;if(size>META_VIDEO_MAX_BYTES){await reader.cancel().catch(()=>undefined);throw error("META_VIDEO_TOO_LARGE","Meta video too large");}chunks.push(value);}}
      finally{reader.releaseLock();}
      const buffer=Buffer.concat(chunks.map(x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength)),size);
      if(!size||!validContainer(buffer,mime))throw error("META_VIDEO_CONTENT_INVALID","Meta video content invalid");
      return {buffer,mimeType:mime,sizeBytes:size,sha256:createHash("sha256").update(buffer).digest("hex")};
    }finally{clearTimeout(timer);}
  }
}
