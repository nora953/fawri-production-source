import { withMerchantOperationalTransaction } from "./operationalPostgresAuthority.js";
import { getMetaVideoUnderstandingService } from "./metaVideoUnderstandingRuntime.js";
import { TrustedMediaCatalogMatcher } from "./mediaCatalogMatcher.js";

const matcher = new TrustedMediaCatalogMatcher();
type Alternative = { productId: string; variantId?: string; confidence: number };
export type TrustedVideoReplyGrounding = {
  text: string | null; understood: boolean; matchedRecordId: string | null; alternatives: Alternative[];
};
const empty = (): TrustedVideoReplyGrounding => ({ text:null, understood:false, matchedRecordId:null, alternatives:[] });

export async function understandTrustedMetaVideoForReply(input:{
  merchantId:string; conversationId:string; sourceCustomerMessageId:string;
  videoUrl:string|null; contentIdentityHash:string|null;
}):Promise<TrustedVideoReplyGrounding>{
  if(!input.videoUrl)return empty();
  const persisted=await withMerchantOperationalTransaction(input.merchantId,async client=>{
    const result=await client.query<{metadata:Record<string,unknown>|null}>(
      `SELECT metadata FROM messages WHERE merchant_id=$1 AND id=$2 AND conversation_id=$3 AND sender='customer' LIMIT 1`,
      [input.merchantId,input.sourceCustomerMessageId,input.conversationId]);
    const metadata=result.rows[0]?.metadata;
    const media=metadata&&typeof metadata==="object"&&!Array.isArray(metadata)&&metadata.media&&typeof metadata.media==="object"&&!Array.isArray(metadata.media)?metadata.media as Record<string,unknown>:null;
    const summary=typeof media?.video_observation==="string"?media.video_observation.trim():"";
    const sha=typeof media?.video_sha256==="string"?media.video_sha256.trim():"";
    const providerId=typeof media?.video_vision_provider_id==="string"?media.video_vision_provider_id.trim():"";
    const model=typeof media?.video_vision_model==="string"?media.video_vision_model.trim():"";
    const frameCount=Number(media?.video_frame_count);
    if(media?.content_identity_hash!==input.contentIdentityHash||!summary||summary.length>2000||!/^[a-f0-9]{64}$/i.test(sha)||!providerId||providerId.length>160||!model||model.length>160||!Number.isInteger(frameCount)||frameCount<1||frameCount>6)return null;
    const matchedRecordId=typeof metadata?.matched_record_id==="string"?metadata.matched_record_id.trim():"";
    const alternatives:Array<Alternative>=Array.isArray(media?.video_visual_alternatives)?media.video_visual_alternatives.flatMap(value=>{
      if(!value||typeof value!=="object"||Array.isArray(value))return [];
      const item=value as Record<string,unknown>,productId=typeof item.product_id==="string"?item.product_id.trim():"",variantId=typeof item.variant_id==="string"?item.variant_id.trim():"",confidence=Number(item.confidence);
      return productId&&Number.isFinite(confidence)&&confidence>=0&&confidence<=1?[{productId,...(variantId?{variantId}:{}),confidence}]:[];
    }):[];
    return {summary,matchedRecordId,alternatives};
  });
  if(persisted){
    let matchedRecordId:string|null=null;
    const product=/^catalog-product:([^:]+)$/.exec(persisted.matchedRecordId),variant=/^catalog-variant:([^:]+):([^:]+)$/.exec(persisted.matchedRecordId);
    const candidate=product?{productId:product[1],confidence:1}:variant?{productId:variant[1],variantId:variant[2],confidence:1}:null;
    const exact=candidate?await matcher.resolve({merchantId:input.merchantId,candidates:[candidate]}):null;
    if(exact?.matchedRecordId===persisted.matchedRecordId)matchedRecordId=exact.matchedRecordId;
    const alternatives=!matchedRecordId&&persisted.alternatives.length?await matcher.resolveAlternatives({merchantId:input.merchantId,candidates:persisted.alternatives}):[];
    return {text:persisted.summary,understood:true,matchedRecordId,alternatives};
  }
  const service=getMetaVideoUnderstandingService();
  let understood=null;
  if(service){
    try{
      understood=await service.understand({merchantId:input.merchantId,videoUrl:input.videoUrl});
    }catch{
      // Provider/network/decoder failure is not trusted visual evidence.
      // Return the empty grounding while preserving integrity/DB errors below.
      return empty();
    }
  }
  if(!understood?.observation||understood.observation.confidence<0.5||!/^[a-f0-9]{64}$/i.test(understood.videoSha256)||!Number.isInteger(understood.frameCount)||understood.frameCount<1||understood.frameCount>6)return empty();
  const observation=understood.observation;
  const summary=[
    observation.productType?`نوع المنتج الظاهر: ${observation.productType}`:"",
    observation.colors.length?`الألوان الظاهرة: ${observation.colors.join(", ")}`:"",
    observation.attributes.length?`الصفات الظاهرة: ${observation.attributes.join(", ")}`:"",
    observation.description?`الوصف المرئي: ${observation.description}`:"",
  ].filter(Boolean).join(". ").slice(0,2000);
  if(!summary)return empty();
  const exact=understood.exactMatch?await matcher.resolve({merchantId:input.merchantId,candidates:[{
    productId:understood.exactMatch.productId,...(understood.exactMatch.variantId?{variantId:understood.exactMatch.variantId}:{}),confidence:understood.exactMatch.confidence,
  }]}):null;
  const alternatives=!exact&&understood.alternatives.length?await matcher.resolveAlternatives({merchantId:input.merchantId,candidates:understood.alternatives}):[];
  await withMerchantOperationalTransaction(input.merchantId,async client=>{
    const locked=await client.query<{metadata:Record<string,unknown>|null}>(`SELECT metadata FROM messages WHERE merchant_id=$1 AND id=$2 AND conversation_id=$3 AND sender='customer' FOR UPDATE`,[input.merchantId,input.sourceCustomerMessageId,input.conversationId]);
    const metadata=locked.rows[0]?.metadata,media=metadata&&typeof metadata==="object"&&!Array.isArray(metadata)&&metadata.media&&typeof metadata.media==="object"&&!Array.isArray(metadata.media)?metadata.media as Record<string,unknown>:null;
    if(!media||media.content_identity_hash!==input.contentIdentityHash)throw Object.assign(new Error("Meta video content identity changed"),{code:"META_MESSAGE_IDENTITY_COLLISION"});
    const next={...metadata,...(exact?{matched_record_id:exact.matchedRecordId}:{}),media:{...media,video_observation:summary,video_sha256:understood.videoSha256,video_frame_count:understood.frameCount,video_vision_provider_id:observation.providerId,video_vision_model:observation.model,...(alternatives.length?{video_visual_alternatives:alternatives.map(a=>({product_id:a.productId,...(a.variantId?{variant_id:a.variantId}:{}),confidence:a.confidence}))}:{})}};
    await client.query(`UPDATE messages SET metadata=$4::jsonb WHERE merchant_id=$1 AND id=$2 AND conversation_id=$3`,[input.merchantId,input.sourceCustomerMessageId,input.conversationId,JSON.stringify(next)]);
  });
  return {text:summary,understood:true,matchedRecordId:exact?.matchedRecordId??null,alternatives};
}
