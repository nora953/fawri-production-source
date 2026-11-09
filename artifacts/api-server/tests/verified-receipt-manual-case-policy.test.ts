import assert from "node:assert/strict";
import test from "node:test";
import {
  heldReceiptCaseIntake, parseManualCaseTransition, ManualReceiptCasePolicyError
} from "../src/services/verifiedReceiptManualCasePolicy";

const hash = "a".repeat(64);
const base = {
  caseId: "case:42", receiptEventId: "provider:event-22", actorId: "reviewer:1",
  independentlyApprovedBy: null, providerEvidenceHash: null,
  action: "ESCALATE_TO_PROVIDER", expectedState: "UNRESOLVED_HOLD",
  nextState: "PROVIDER_REVIEW",
};

test("R-OWN-5: verified unmatched receipt stays unassigned and non-applying", () => {
  const item = heldReceiptCaseIntake({
    provider_event_id: "provider:event-22",
    first_received_at: "2026-11-09T12:00:00.123Z",
    order_id: null,
  }, "case:42");
  assert.deepEqual(item, {case_id:"case:42",receipt_event_id:"provider:event-22",status:"UNRESOLVED_HOLD",applied:false});
  assert.ok(Object.isFrozen(item));
  for (const order of ["invented-order", "", undefined]) {
    assert.throws(() => heldReceiptCaseIntake({
      provider_event_id:"provider:event-22",first_received_at:"2026-11-09T12:00:00Z",order_id:order,
    },"case:42"), ManualReceiptCasePolicyError);
  }
});

test("R-OWN-5: only provider escalation and independently approved evidence transitions", () => {
  assert.deepEqual(parseManualCaseTransition(base),base);
  assert.equal(parseManualCaseTransition({...base,action:"RECORD_PROVIDER_DISPUTE",expectedState:"PROVIDER_REVIEW",nextState:"PROVIDER_DISPUTE",providerEvidenceHash:hash}).nextState,"PROVIDER_DISPUTE");
  assert.equal(parseManualCaseTransition({...base,action:"RECORD_PROVIDER_OUTCOME",expectedState:"PROVIDER_DISPUTE",nextState:"PROVIDER_OUTCOME_VERIFIED",providerEvidenceHash:hash,independentlyApprovedBy:"reviewer:2"}).nextState,"PROVIDER_OUTCOME_VERIFIED");
});

test("R-OWN-5: forged assignment, money movement, privilege, and ambiguous evidence fail closed", () => {
  const mutations: Record<string,unknown>[] = [
    {...base,order_id:"other-order"}, {...base,merchant_id:"foreign"},
    {...base,amount_iqd:49000}, {...base,refund:true}, {...base,approved:true},
    {...base,action:"APPLY_PAYMENT"}, {...base,action:"REFUND"},
    {...base,action:"REASSIGN"}, {...base,expectedState:"PROVIDER_OUTCOME_VERIFIED"},
    {...base,nextState:"PROVIDER_OUTCOME_VERIFIED"},
    {...base,providerEvidenceHash:hash},
    {...base,independentlyApprovedBy:"reviewer:2"},
    {...base,caseId:"../secret"}, {...base,receiptEventId:""},
    {...base,actorId:"\nraw"}, {...base,caseId:42},
    {...base,action:"RECORD_PROVIDER_OUTCOME",expectedState:"PROVIDER_REVIEW",nextState:"PROVIDER_OUTCOME_VERIFIED",providerEvidenceHash:hash,independentlyApprovedBy:"reviewer:1"},
    {...base,action:"RECORD_PROVIDER_OUTCOME",expectedState:"PROVIDER_REVIEW",nextState:"PROVIDER_OUTCOME_VERIFIED",providerEvidenceHash:hash,independentlyApprovedBy:null},
    {...base,action:"RECORD_PROVIDER_OUTCOME",expectedState:"PROVIDER_REVIEW",nextState:"PROVIDER_OUTCOME_VERIFIED",providerEvidenceHash:"bad",independentlyApprovedBy:"reviewer:2"},
    {...base,action:"RECORD_PROVIDER_DISPUTE",expectedState:"UNRESOLVED_HOLD",nextState:"PROVIDER_DISPUTE",providerEvidenceHash:hash},
    {...base,action:"RECORD_PROVIDER_DISPUTE",expectedState:"PROVIDER_REVIEW",nextState:"PROVIDER_DISPUTE",providerEvidenceHash:null},
  ];
  for (const value of mutations) assert.throws(() => parseManualCaseTransition(value),ManualReceiptCasePolicyError,JSON.stringify(value));
  for (const value of [null,[],{},true,"x"])assert.throws(() => parseManualCaseTransition(value),ManualReceiptCasePolicyError);
});
