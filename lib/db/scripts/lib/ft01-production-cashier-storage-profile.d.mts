/** Explicit first-commercial invoker selection; deployment/hosted approval is separate. */
export const FT01_CASHIER_STORAGE_PROFILE_ENV:"FAWRI_CASHIER_STORAGE_PROFILE";
export const FT01_INVOKER_0052_SHA_ENV:"FAWRI_FT01_REVIEWED_INVOKER_0052_SHA256";
export const FT01_ROLE_RESERVATION_SHA_ENV:"FAWRI_FT01_REVIEWED_FOUR_ROLE_SQL_SHA256";
export const FT01_INVOKER_PROFILE:"first-commercial-invoker-v1";
export const FT01_CANONICAL_PROFILE:"canonical-owner-v1";
export type Ft01CashierStorageProfile=Readonly<
  | {mode:"canonical";explicitOptIn:false}
  | {
      mode:"first-commercial-invoker";
      explicitOptIn:true;
      migrationOwnerRole:"fawri_owner";
      exactCandidateSha256:string;
      exactRoleReservationSha256:string;
      hostedTargetAttested:false;
      releaseAuthorized:false;
    }
>;
export function selectFt01CashierStorageProfile(
  env?:Record<string,string|undefined>,
):Ft01CashierStorageProfile;
