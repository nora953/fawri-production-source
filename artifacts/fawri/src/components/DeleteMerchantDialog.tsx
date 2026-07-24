import React, { useState } from "react";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import {
  Merchant,
  MerchantDeleteReason,
  MerchantDeletionRequest,
} from "@/lib/types";
import { getAdminAuthHeaders } from "@/lib/store";
import { getAdminText } from "@/lib/admin-translations";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type DeleteStep = "reason" | "review" | "password" | "final";

type MerchantWithRetention = Merchant & {
  retention_status?: string;
};

type DeleteMerchantDialogProps = {
  merchant: MerchantWithRetention;
  adminId: string;
  isOwner: boolean;
  deletionRequest?: MerchantDeletionRequest;
  onClose: () => void;
  onRequested: (request: MerchantDeletionRequest) => void;
  onRejected: (request: MerchantDeletionRequest) => void;
  onDeleted: (merchant: Merchant, result: unknown) => void;
};

export default function DeleteMerchantDialog({
  merchant,
  adminId,
  isOwner,
  deletionRequest,
  onClose,
  onRequested,
  onRejected,
  onDeleted,
}: DeleteMerchantDialogProps) {
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const [step, setStep] = useState<DeleteStep>(isOwner ? "review" : "reason");
  const [reason, setReason] = useState<MerchantDeleteReason>("policy_violation");
  const [details, setDetails] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const retentionEligible =
    merchant.retention_status === "eligible_for_deletion";

  const reasonLabel = (value: MerchantDeleteReason) =>
    value === "retention_expired"
      ? adminText.deletionReasonRetention
      : adminText.deletionReasonPolicy;

  const getErrorMessage = (error?: string, status?: number) => {
    if (status === 403) return adminText.permissionDenied;
    if (error?.includes("credentials")) return adminText.deletionWrongPassword;
    if (error?.includes("not eligible")) return adminText.deletionNotEligible;
    if (error?.includes("must be suspended")) return adminText.deletionMustBeSuspended;
    if (error?.includes("already exists")) return adminText.deletionRequestExists;
    return adminText.deletionOperationError;
  };

  const submitDeletionRequest = async () => {
    if (!details.trim() || isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/auth/merchants/${encodeURIComponent(merchant.id)}/deletion-requests`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAdminAuthHeaders(),
          },
          body: JSON.stringify({ reason, details: details.trim() }),
        },
      );
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.deletion_request) {
        toast.error(getErrorMessage(result?.error, response.status));
        return;
      }

      toast.success(adminText.deletionRequestSent);
      onRequested(result.deletion_request as MerchantDeletionRequest);
      onClose();
    } catch (error) {
      console.error("Deletion request failed:", error);
      toast.error(adminText.deletionConnectionError);
    } finally {
      setIsLoading(false);
    }
  };

  const rejectDeletionRequest = async () => {
    if (!deletionRequest || isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/auth/admin/deletion-requests/${encodeURIComponent(deletionRequest.id)}/reject`,
        {
          method: "POST",
          headers: getAdminAuthHeaders(),
        },
      );
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.deletion_request) {
        toast.error(getErrorMessage(result?.error, response.status));
        return;
      }

      toast.success(adminText.deletionRequestRejected);
      onRejected(result.deletion_request as MerchantDeletionRequest);
      onClose();
    } catch (error) {
      console.error("Deletion request rejection failed:", error);
      toast.error(adminText.deletionConnectionError);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOwnerPassword = async () => {
    if (!password.trim() || isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/admin/verify-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ adminId, adminPassword: password }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        toast.error(getErrorMessage(result?.error, response.status));
        return;
      }

      setStep("final");
    } catch (error) {
      console.error("Owner password verification failed:", error);
      toast.error(adminText.deletionConnectionError);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteMerchant = async () => {
    if (!deletionRequest || isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/auth/merchants/${encodeURIComponent(merchant.id)}/delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAdminAuthHeaders(),
          },
          body: JSON.stringify({
            adminId,
            adminPassword: password,
            deletionRequestId: deletionRequest.id,
          }),
        },
      );
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        toast.error(getErrorMessage(result?.error, response.status));
        return;
      }

      toast.success(adminText.deletionCompleted);
      onDeleted(merchant, result);
      onClose();
    } catch (error) {
      console.error("Merchant deletion failed:", error);
      toast.error(adminText.deletionConnectionError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="max-w-md" dir={adminText.dir}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {isOwner
              ? adminText.deletionReviewTitle
              : adminText.deletionRequestTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/40 p-4 text-sm">
          <p className="font-bold">{merchant.store_name}</p>
          <p className="mt-1 text-muted-foreground">
            {merchant.owner_name} · {merchant.phone}
          </p>
        </div>

        {step === "reason" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <Label>{adminText.deletionReasonLabel}</Label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                <input
                  type="radio"
                  name="delete-reason"
                  checked={reason === "policy_violation"}
                  onChange={() => setReason("policy_violation")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">
                    {adminText.deletionReasonPolicy}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {adminText.deletionReasonPolicyDescription}
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-3 rounded-xl border p-3 ${
                  retentionEligible
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50"
                }`}
              >
                <input
                  type="radio"
                  name="delete-reason"
                  checked={reason === "retention_expired"}
                  disabled={!retentionEligible}
                  onChange={() => setReason("retention_expired")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">
                    {adminText.deletionReasonRetention}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {adminText.deletionReasonRetentionDescription}
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deletion-request-details">
                {adminText.deletionDetailsLabel}
              </Label>
              <Textarea
                id="deletion-request-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={adminText.deletionDetailsPlaceholder}
                rows={4}
                maxLength={1000}
              />
            </div>
          </div>
        )}

        {step === "review" && deletionRequest && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">
                {adminText.deletionRequestedBy}
              </p>
              <p className="font-semibold">
                {deletionRequest.requested_by_admin_name} · {deletionRequest.requested_by_admin_phone}
              </p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">
                {adminText.deletionReasonLabel}
              </p>
              <p className="font-semibold">{reasonLabel(deletionRequest.reason)}</p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {deletionRequest.details}
              </p>
            </div>
          </div>
        )}

        {step === "password" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {adminText.deletionOwnerPasswordDescription}
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-owner-password">
                {adminText.deletionOwnerPasswordLabel}
              </Label>
              <Input
                id="delete-owner-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void verifyOwnerPassword();
                }}
                autoComplete="current-password"
                autoFocus
              />
            </div>
          </div>
        )}

        {step === "final" && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold text-destructive">
                  {adminText.deletionFinalWarningTitle}
                </p>
                <p className="mt-2 text-sm leading-6">
                  {adminText.deletionFinalWarningDescription}
                </p>
                <p className="mt-2 text-sm font-bold">
                  {adminText.deletionIrreversible}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          {step === "reason" && (
            <Button
              onClick={() => void submitDeletionRequest()}
              disabled={!details.trim() || isLoading}
            >
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {adminText.deletionSendRequest}
            </Button>
          )}

          {step === "review" && (
            <>
              <Button onClick={() => setStep("password")} disabled={isLoading}>
                {adminText.deletionApproveReview}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void rejectDeletionRequest()}
                disabled={isLoading}
              >
                {adminText.deletionRejectRequest}
              </Button>
            </>
          )}

          {step === "password" && (
            <Button
              onClick={() => void verifyOwnerPassword()}
              disabled={!password.trim() || isLoading}
            >
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {adminText.deletionVerifyContinue}
            </Button>
          )}

          {step === "final" && (
            <Button
              variant="destructive"
              onClick={() => void deleteMerchant()}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {adminText.deletionDeletePermanently}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={
              step === "reason" || step === "review"
                ? onClose
                : () => setStep(step === "final" ? "password" : "review")
            }
            disabled={isLoading}
          >
            {step === "reason" || step === "review"
              ? adminText.cancel
              : adminText.deletionBack}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
