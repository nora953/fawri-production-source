/**
 * G4 review-only risk triage for first-commercial Google merchants.
 * SOURCE CANDIDATE ONLY: not mounted by HTTP routes or entitlement writers.
 * All input MUST be sourced from signed Google identity, trusted server
 * verification, or RLS-protected authoritative tables -- never request JSON.
 * This classifier cannot activate trials, issue sessions or reserve evidence.
 */
export type TrustedTrialRiskSnapshot = Readonly<{
  googleSubjectAuthenticated: boolean;
  merchantAccountActive: boolean;
  trialHistory: "unused" | "used" | "unknown";
  evidenceCollision: "none" | "conflict" | "unknown";
  antiAutomation: "passed" | "failed" | "unknown";
  independentBusinessProof: "verified_domain" | "verified_registration" | "none" | "unknown";
  businessProofUniqueness: "unique" | "conflict" | "unknown";
  signupVelocity: "normal" | "elevated" | "unknown";
  linkedAccountRisk: "none" | "elevated" | "unknown";
  // IP/device anomalies alone can trigger review, never automatic denial.
  networkDeviceSignal: "normal" | "anomalous" | "unknown";
  approvedWhatsAppAuthenticationAvailable: boolean;
}>;

export type TrialRiskTriageDecision = Readonly<{
  action: "review_without_phone" | "whatsapp_auth_required" | "manual_review" | "already_used";
  reason:
    | "LOW_RISK_VERIFIED_BUSINESS"
    | "PHONE_PROOF_REQUIRED"
    | "ELEVATED_RISK"
    | "RISK_SIGNAL_UNAVAILABLE"
    | "EVIDENCE_CONFLICT"
    | "ANTIAUTOMATION_NOT_VERIFIED"
    | "IDENTITY_NOT_VERIFIED"
    | "PRIOR_TRIAL_CONSUMED";
  trialActivated: false;
  subscriptionActivated: false;
}>;

function decision(
  action: TrialRiskTriageDecision["action"],
  reason: TrialRiskTriageDecision["reason"],
): TrialRiskTriageDecision {
  return Object.freeze({ action, reason, trialActivated: false, subscriptionActivated: false });
}

/** Review planning only. Must never be used in place of atomic ledger acceptance. */
export function triagePendingGoogleMerchantTrialRisk(
  snapshot: TrustedTrialRiskSnapshot,
): TrialRiskTriageDecision {
  if (!snapshot || snapshot.googleSubjectAuthenticated !== true ||
      snapshot.merchantAccountActive !== true) {
    return decision("manual_review", "IDENTITY_NOT_VERIFIED");
  }
  if (snapshot.trialHistory === "used") {
    // An out-of-band review/appeal can examine mistaken historical matches.
    return decision("already_used", "PRIOR_TRIAL_CONSUMED");
  }
  if (snapshot.trialHistory !== "unused" ||
      snapshot.evidenceCollision === "unknown" ||
      snapshot.businessProofUniqueness === "unknown" ||
      snapshot.independentBusinessProof === "unknown" ||
      snapshot.signupVelocity === "unknown" ||
      snapshot.linkedAccountRisk === "unknown" ||
      snapshot.networkDeviceSignal === "unknown") {
    return decision("manual_review", "RISK_SIGNAL_UNAVAILABLE");
  }
  if (snapshot.evidenceCollision !== "none" ||
      snapshot.businessProofUniqueness === "conflict") {
    return decision("manual_review", "EVIDENCE_CONFLICT");
  }
  if (snapshot.antiAutomation !== "passed") {
    return decision("manual_review", "ANTIAUTOMATION_NOT_VERIFIED");
  }
  if (snapshot.networkDeviceSignal !== "normal") {
    return decision("manual_review", "ELEVATED_RISK");
  }
  if (snapshot.signupVelocity === "elevated" ||
      snapshot.linkedAccountRisk === "elevated") {
    return snapshot.approvedWhatsAppAuthenticationAvailable === true
      ? decision("whatsapp_auth_required", "ELEVATED_RISK")
      : decision("manual_review", "ELEVATED_RISK");
  }
  if (snapshot.signupVelocity !== "normal" ||
      snapshot.linkedAccountRisk !== "none") {
    return decision("manual_review", "RISK_SIGNAL_UNAVAILABLE");
  }
  // Unique independently verified business evidence allows NO-PHONE REVIEW,
  // not entitlement. A fresh Google account alone is never sufficient proof.
  if (snapshot.businessProofUniqueness === "unique" &&
      (snapshot.independentBusinessProof === "verified_domain" ||
       snapshot.independentBusinessProof === "verified_registration")) {
    return decision("review_without_phone", "LOW_RISK_VERIFIED_BUSINESS");
  }
  if (snapshot.independentBusinessProof !== "none") {
    return decision("manual_review", "RISK_SIGNAL_UNAVAILABLE");
  }
  return snapshot.approvedWhatsAppAuthenticationAvailable === true
    ? decision("whatsapp_auth_required", "PHONE_PROOF_REQUIRED")
    : decision("manual_review", "PHONE_PROOF_REQUIRED");
}
