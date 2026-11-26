#!/usr/bin/env bash
# Owner-private, one-shot, offline local recovery diagnostic.
# Do not run in CI, Render, or as root. No Neon credentials required.
set +x
set -euo pipefail
umask 077
if [[ $# -ne 3 || $EUID -eq 0 || -n "${CI:-}" || -n "${GITHUB_ACTIONS:-}" || ! -t 0 ]]; then
  printf '%s\n' 'G5_LOCAL_PRIVATE_LAUNCHER_REFUSED' >&2
  exit 1
fi
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ ! -f "$1" || ! -f "$2" || ! "$3" =~ ^[a-f0-9]{64}$ ]]; then
  printf '%s\n' 'G5_LOCAL_PRIVATE_INPUTS_REQUIRED' >&2
  exit 1
fi
# Exact reviewed dependency graph; any later change requires a new pin review.
node --input-type=module - <<'JS'
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const files={
  'scripts/v1-g5-private-detached-recovery.mjs':'8d7ca81eb965655f6f7fc618240c84c2ef2bda4a',
  'scripts/lib/v1-g5-detached-acl-recovery.mjs':'9ec2efd92feddef8133ea36d39c697c1b49f4a88',
  'scripts/v1-g5-private-acl-capture.mjs':'37cae2122b3b9c06a0b6cc9995b5c6c989e0a158',
  'scripts/v1-postg4-offsite-restore.mjs':'5a4d47b6b367a09a3d1247fd09bc8000008c77ce',
  'scripts/lib/v1-isolated-neon-dump-safety.mjs':'b669abf4950bc9e65da24d21010ab0dc46341fe0',
  'docs/final-audit/evidence/sql/P0-V1-G5-POSTG4-ACL-RECOVERY-CATALOG-HELD.sql':'25ddef2fe539c7b840288e15e943bfbb4ee6210b'
};
try{
  for(const [file,expected] of Object.entries(files)){
    const bytes=fs.readFileSync(file);
    const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    if(actual!==expected)throw Error();
  }
  console.log('G5_LOCAL_SOURCE_PINS_VERIFIED');
}catch{console.error('G5_LOCAL_SOURCE_PIN_REFUSED');process.exit(1);}
JS
trap 'unset FAWRI_G5_OFFSITE_PASSPHRASE FAWRI_G5_PRIVATE_ACL_PASSPHRASE FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256 FAWRI_G5_PRIVATE_RECOVERY_APPROVED' EXIT
read -r -s -p 'Original database archive passphrase: ' FAWRI_G5_OFFSITE_PASSPHRASE
printf '\n'
read -r -s -p 'Separate ACL sidecar passphrase: ' FAWRI_G5_PRIVATE_ACL_PASSPHRASE
printf '\n'
if [[ ${#FAWRI_G5_OFFSITE_PASSPHRASE} -lt 24 || ${#FAWRI_G5_PRIVATE_ACL_PASSPHRASE} -lt 24 ]]; then
  printf '%s\n' 'G5_LOCAL_PASSPHRASE_LENGTH_REFUSED' >&2
  exit 1
fi
export FAWRI_G5_OFFSITE_PASSPHRASE FAWRI_G5_PRIVATE_ACL_PASSPHRASE
export FAWRI_G5_PRIVATE_ACL_EXPECTED_SHA256="$3"
export FAWRI_G5_PRIVATE_RECOVERY_APPROVED=1
node scripts/v1-g5-private-detached-recovery.mjs "$1" "$2"
