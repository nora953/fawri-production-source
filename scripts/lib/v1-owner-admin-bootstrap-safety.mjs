/**
 * One-shot commercial owner-admin action admission. Pure offline checks;
 * NEVER a deployment permission or source of account credentials.
 */
export const V1_OWNER_ADMIN_TARGET=Object.freeze({
  project:"crimson-cherry-65705041",
  branch:"br-holy-waterfall-b993zglb",
  database:"fawri",
  host:"ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech",
  owner:"fawri_owner",
});
export const V1_OWNER_ADMIN_COMMIT="FAWRI_V1_OWNER_AUTHORIZED_OWNER_ADMIN_BOOTSTRAP";
function fail(code){const error=new Error(code);error.code=code;throw error;}
export function assertV1OwnerAdminBootstrapJob(env=process.env){
  if(env.GITHUB_ACTIONS!=="true" ||
     env.GITHUB_REPOSITORY!=="nora953/fawri-production-source" ||
     env.GITHUB_ACTOR!=="nora953" ||
     env.GITHUB_EVENT_NAME!=="push" ||
     env.GITHUB_REF!=="refs/heads/fix/p0-provider-receipt-order-discovery-20261015" ||
     env.FAWRI_V1_OWNER_ADMIN_BOOTSTRAP_ENABLED!=="1" ||
     env.FAWRI_V1_OWNER_ADMIN_BOOTSTRAP_COMMIT!==V1_OWNER_ADMIN_COMMIT ||
     env.FAWRI_V1_G2B_RECEIPT!=="G2B-20261116-SCHEMA54-43852308674" ||
     env.FAWRI_V1_G2C_RECEIPT!=="G2C-20261116-THREE-LOGIN-43917539519"){
    fail("V1_OWNER_BOOTSTRAP_NOT_AUTHORIZED");
  }
  return true;
}
export function validateV1OwnerUrl(raw) {
  let url;
  try {url=new URL(raw??"");} catch {fail("V1_OWNER_BOOTSTRAP_OWNER_URL_INVALID");}
  if(!["postgres:","postgresql:"].includes(url.protocol) ||
      url.hostname!==V1_OWNER_ADMIN_TARGET.host ||
      !["","5432"].includes(url.port) ||
      decodeURIComponent(url.username)!==V1_OWNER_ADMIN_TARGET.owner ||
      decodeURIComponent(url.pathname)!=="/"+V1_OWNER_ADMIN_TARGET.database ||
      !url.password || url.hash || url.href.length>2048){
    fail("V1_OWNER_BOOTSTRAP_OWNER_TARGET_DENIED");
  }
  const keys=[...url.searchParams.keys()];
  if(keys.length!==new Set(keys).size ||
      keys.some(key=>!["sslmode","channel_binding"].includes(key)) ||
      !["require","verify-full"].includes(url.searchParams.get("sslmode")) ||
      (url.searchParams.has("channel_binding") && url.searchParams.get("channel_binding")!=="require")){
    fail("V1_OWNER_BOOTSTRAP_OWNER_TLS_DENIED");
  }
  return url;
}
export function deriveV1RoleUrl(ownerUrl,role,password){
  const permitted=new Set(["fawri_restricted_runtime","fawri_auth_issuer"]);
  if(!permitted.has(role) || !password || password.length<12){
    fail("V1_OWNER_BOOTSTRAP_ROLE_SECRET_INVALID");
  }
  const base=validateV1OwnerUrl(ownerUrl);
  base.username=role;
  base.password=password;
  return base.toString();
}
export function assertV1OwnerSecretInputs(env=process.env){
  const phone=String(env.FAWRI_V1_OWNER_ADMIN_PHONE||"").trim();
  const pwd=String(env.FAWRI_V1_OWNER_ADMIN_PASSWORD||"");
  const salt=String(env.FAWRI_V1_OWNER_ADMIN_PASSWORD_SALT||"");
  // Only a non-sensitive field CODE is emitted. Never print actual values,
  // whether present/absent, approximate length, characters or masks.
  if(!/^\+[1-9]\d{7,14}$/.test(phone)) {
    fail("V1_OWNER_BOOTSTRAP_PHONE_INVALID");
  }
  if(pwd.length<12||pwd.length>128 ||
    !/^[A-Za-z0-9@#$%&!_-]+$/.test(pwd)||
    !/[A-Z]/.test(pwd)||!/[0-9]/.test(pwd)) {
    fail("V1_OWNER_BOOTSTRAP_PASSWORD_INVALID");
  }
  if(salt.length<32||salt.length>256||phone===pwd||pwd===salt) {
    fail("V1_OWNER_BOOTSTRAP_PEPPER_INVALID");
  }
  if(!env.FAWRI_V1_G2_TENANT_LOGIN_PASSWORD ||
     !env.FAWRI_V1_G2_AUTH_LOGIN_PASSWORD ||
     env.FAWRI_V1_G2_TENANT_LOGIN_PASSWORD===env.FAWRI_V1_G2_AUTH_LOGIN_PASSWORD){
    fail("V1_OWNER_BOOTSTRAP_ROLE_CREDENTIALS_MISSING");
  }
  return Object.freeze({phone,password:pwd,salt});
}
