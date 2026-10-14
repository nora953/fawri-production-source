import {executeVerifiedReceiptReplay} from '../services/verifiedReceiptReplayExecution';
import {reviewVerifiedReceiptReplay,ReceiptReplayReviewError} from '../services/verifiedReceiptReplayReview';
import { Router } from "express";
import { getAuthContext, requireSecureAdminPermission, sendAuthError } from "../middleware/authSession";
import { adminAuthPostgresCutoverMode } from "../services/adminAuthPostgresCutover";
import { readVerifiedReceiptsForOperator, ReceiptOperatorReadError } from "../services/verifiedReceiptOperatorRead";

const router = Router();
router.get("/admin/billing/verified-receipts", (req,res,next) => {
  res.setHeader("Cache-Control","no-store, max-age=0");
  if (adminAuthPostgresCutoverMode() !== "postgres") {
    sendAuthError(res,503,"RECEIPT_OPERATOR_POSTGRES_REQUIRED","PostgreSQL operator authority is required"); return;
  }
  next();
}, requireSecureAdminPermission("manage_subscriptions"), async (req,res) => {
  try {
    const actor = getAuthContext(res)?.account.id;
    if (!actor) { sendAuthError(res,403,"RECEIPT_OPERATOR_PERMISSION_REQUIRED","operator permission is required"); return; }
    const result = await readVerifiedReceiptsForOperator(actor,req.query);
    res.json({ok:true,...result});
  } catch (error) {
    const failure = error instanceof ReceiptOperatorReadError ? error : new ReceiptOperatorReadError("RECEIPT_OPERATOR_READ_UNAVAILABLE",503);
    sendAuthError(res,failure.status,failure.code,"verified receipt read could not be completed");
  }
});
router.post('/admin/billing/verified-receipts/:eventId/replay-review', (req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(adminAuthPostgresCutoverMode()!=='postgres'){sendAuthError(res,503,'RECEIPT_REPLAY_REVIEW_UNAVAILABLE','receipt review unavailable');return;}
  next();
},requireSecureAdminPermission('manage_subscriptions'),async(req,res)=>{
  try {
    const actor=getAuthContext(res)?.account.id;
    if(!actor){sendAuthError(res,403,'RECEIPT_REPLAY_REVIEW_PERMISSION_REQUIRED','receipt review denied');return;}
    if(Object.keys(req.query).length||typeof req.params.eventId!=='string'){sendAuthError(res,400,'RECEIPT_REPLAY_REVIEW_INVALID','receipt review invalid');return;}
    const result=await reviewVerifiedReceiptReplay(actor,req.params.eventId,req.body);
    res.json({ok:true,...result});
  }catch(error){
    const failure=error instanceof ReceiptReplayReviewError?error:new ReceiptReplayReviewError('RECEIPT_REPLAY_REVIEW_UNAVAILABLE',503);
    sendAuthError(res,failure.status,failure.code,'receipt review could not be completed');
  }
});
router.post('/admin/billing/verified-receipts/:eventId/replay', (req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!req.headers.origin){sendAuthError(res,403,'AUTH_ORIGIN_FORBIDDEN','execution origin required');return;}
  if(adminAuthPostgresCutoverMode()!=='postgres'){sendAuthError(res,503,'RECEIPT_REPLAY_EXECUTION_UNAVAILABLE','receipt execution unavailable');return;}
  next();
},requireSecureAdminPermission('manage_subscriptions'),async(req,res)=>{
  try {
    const context=getAuthContext(res);
    if(!context?.session.device_hash){sendAuthError(res,403,'RECEIPT_REPLAY_EXECUTION_PERMISSION_REQUIRED','receipt execution denied');return;}
    if(Object.keys(req.query).length||typeof req.params.eventId!=='string'){sendAuthError(res,400,'RECEIPT_REPLAY_REVIEW_INVALID','receipt execution invalid');return;}
    const result=await executeVerifiedReceiptReplay({id:context.account.id,sessionId:context.session.id,deviceHash:context.session.device_hash},req.params.eventId,req.body);
    res.json({ok:true,...result});
  }catch(error){const failure=error instanceof ReceiptReplayReviewError?error:new ReceiptReplayReviewError('RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',503);sendAuthError(res,failure.status,failure.code,'receipt execution could not be completed');}
});
export default router;
