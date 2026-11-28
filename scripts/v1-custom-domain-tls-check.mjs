#!/usr/bin/env node
/**
 * FAWRI V1 first-commercial read-only public-domain TLS preflight.
 * No credentials, production API calls, DNS mutations, or Render API writes.
 * Exit 0 accepts DNS+TLS only, NEVER commercial GO.
 */
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

const ROOT = 'fawrireply.com';
const WWW = 'www.' + ROOT;
const EXPECTED_A = '216.24.57.1';
const EXPECTED_CNAME = 'fawri-v1-commercial-gated-k9yj.onrender.com';

const clean = value => String(value || '').replace(/\.$/, '').toLowerCase();

export function assertPublicDns({ apexA, wwwCname, apexAaaa }) {
  if (!Array.isArray(apexA) || apexA.length !== 1 || apexA[0] !== EXPECTED_A) {
    throw new Error('V1_DOMAIN_APEX_A_NOT_EXACT_RENDER_TARGET');
  }
  if (!Array.isArray(wwwCname) || wwwCname.length !== 1 ||
      clean(wwwCname[0]) !== EXPECTED_CNAME) {
    throw new Error('V1_DOMAIN_WWW_CNAME_NOT_EXACT_RENDER_TARGET');
  }
  if (!Array.isArray(apexAaaa) || apexAaaa.length !== 0) {
    throw new Error('V1_DOMAIN_UNSUPPORTED_IPV6_RECORD');
  }
}

async function optionalIpv6(host) {
  try { return await dns.resolve6(host); }
  catch (error) {
    if (error?.code === 'ENODATA' || error?.code === 'ENOTFOUND') return [];
    throw error; // A DNS outage must not be mistaken for an absent AAAA record.
  }
}

async function readPublicDns() {
  // resolve6() follows CNAMEs. A legitimate Render target may have IPv6
  // even when the owner configured only a www CNAME; do not reject that.
  const [apexA, wwwCname, apexAaaa] = await Promise.all([
    dns.resolve4(ROOT), dns.resolveCname(WWW), optionalIpv6(ROOT),
  ]);
  return { apexA, wwwCname, apexAaaa };
}

function verifyTrustedTls(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host, port: 443, servername: host, rejectUnauthorized: true,
      timeout: 12000, minVersion: 'TLSv1.2',
    }, () => {
      try {
        if (!socket.authorized) throw new Error('TLS_CERTIFICATE_UNTRUSTED');
        const certificate = socket.getPeerCertificate();
        const expiresAt = Date.parse(certificate?.valid_to || '');
        if (!Number.isFinite(expiresAt) || expiresAt < Date.now() + 24 * 60 * 60 * 1000) {
          throw new Error('TLS_CERTIFICATE_MISSING_OR_EXPIRING');
        }
        resolve({ tls: 'trusted', expiresAt: new Date(expiresAt).toISOString() });
      } catch (error) { reject(error); }
      finally { socket.end(); }
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS_HANDSHAKE_TIMEOUT')));
    socket.once('error', reject);
  });
}

export function classifyDomainProbeFailure(error) {
  const code = String(error?.code || error?.message || 'UNKNOWN');
  // Local resolver/socket failures do NOT establish that DNS or TLS at Render
  // is broken. They mean this runner could not make a reliable observation.
  if (new Set(['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','EAI_AGAIN',
    'ETIMEOUT','ETIMEDOUT','ENOTIMP','ENOTFOUND','ESERVFAIL','EREFUSED',
    'TLS_HANDSHAKE_TIMEOUT']).has(code)) {
    return { state: 'INCONCLUSIVE_NETWORK', exitCode: 2 };
  }
  if (code.startsWith('V1_DOMAIN_') || code === 'ENODATA' || code === 'ENODOMAIN') {
    return { state: 'DNS_NOT_READY', exitCode: 1 };
  }
  return { state: 'TLS_NOT_READY_OR_UNKNOWN', exitCode: 1 };
}

async function main() {
  const dnsState = await readPublicDns();
  assertPublicDns(dnsState);
  const [apex, www] = await Promise.all([
    verifyTrustedTls(ROOT), verifyTrustedTls(WWW),
  ]);
  // Never log credentials, certificate bodies, merchant data or tokens.
  process.stdout.write(JSON.stringify({
    domain: ROOT, dns: 'exact_render_targets',
    apex, www, commercialGo: false,
  }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const { state, exitCode } = classifyDomainProbeFailure(error);
    const code = String(error?.code || error?.message || 'UNKNOWN')
      .replace(/[^A-Z0-9_]/gi, '_').slice(0, 80);
    console.error('V1_PUBLIC_DOMAIN_' + state + ':' + code);
    process.exitCode = exitCode;
  });
}
