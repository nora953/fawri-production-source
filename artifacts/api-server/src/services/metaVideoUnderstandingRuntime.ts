import { MetaVideoUnderstandingService, type MetaVideoUnderstandingResult } from "./metaVideoUnderstandingService.js";
import { SecureMetaVideoFetcher } from "./metaVideoFetcher.js";
import { FfmpegMetaVideoFrameExtractor } from "./metaVideoFrameExtractor.js";
import { OpenAiMediaVisionProvider } from "./ai/openAiMediaVisionProvider.js";
import { OpenAiMediaCatalogRanker } from "./ai/openAiMediaCatalogRanker.js";
import { MediaCatalogCandidateResolver } from "./mediaCatalogCandidateResolver.js";
import { TrustedMediaCatalogMatcher } from "./mediaCatalogMatcher.js";

export interface MetaVideoUnderstandingRuntimeService {
  understand(input:{merchantId:string;videoUrl:string}):Promise<MetaVideoUnderstandingResult|null>;
}
let configured:MetaVideoUnderstandingRuntimeService|null=null;

export function createOpenAiMetaVideoUnderstandingService(options:{apiKey?:string;model?:string}={}):MetaVideoUnderstandingRuntimeService{
  const apiKey=String(options.apiKey||"").trim(),model=String(options.model||"").trim();
  if(!apiKey||!model) throw Object.assign(new Error("Meta video provider configuration is invalid"),{code:"META_VIDEO_PROVIDER_CONFIG_INVALID"});
  const fetcher=new SecureMetaVideoFetcher();
  const extractor=new FfmpegMetaVideoFrameExtractor();
  const vision=new OpenAiMediaVisionProvider({apiKey,model});
  const ranker=new OpenAiMediaCatalogRanker({apiKey,model});
  const resolver=new MediaCatalogCandidateResolver({rankCandidates:(input)=>ranker.rank(input)});
  const matcher=new TrustedMediaCatalogMatcher();
  return new MetaVideoUnderstandingService({
    fetchVideo:url=>fetcher.fetchVideo({url}),
    extractFrames:video=>extractor.extract(video),
    analyzeFrame:input=>vision.analyze(input),
    resolveCandidates:input=>resolver.resolve(input),
    matchCatalog:input=>matcher.resolve(input),
    resolveAlternatives:input=>matcher.resolveAlternatives(input),
  });
}
export function configureMetaVideoUnderstandingService(service:MetaVideoUnderstandingRuntimeService){
  if(!service||typeof service.understand!=="function")throw new Error("Meta video understanding service is invalid");
  if(configured)throw new Error("Meta video understanding service is already configured");
  configured=service;
}
export function getMetaVideoUnderstandingService(){return configured;}
export function releaseMetaVideoUnderstandingService(service:MetaVideoUnderstandingRuntimeService){
  if(configured!==service)return false;configured=null;return true;
}
export function resetMetaVideoUnderstandingServiceForTests(){configured=null;}
