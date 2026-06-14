import { exec } from 'node:child_process';
import { writeConfig, readConfig } from './config.mjs';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {}); // best-effort; the URL is also printed for manual use
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * RFC 8628 device-authorization grant against the Appo backend.
 *   1. POST /api/oauth/device/code      → device_code + user_code + verification URL
 *   2. user opens the link, registers/logs in, approves
 *   3. poll POST /api/oauth/device/token → access_token once approved
 */
export async function login(apiBase) {
  const codeRes = await fetch(`${apiBase}/api/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_name: 'Appo CLI' }),
  });

  if (!codeRes.ok) {
    throw new Error(`Could not start login (${codeRes.status}) against ${apiBase}. Is the service reachable?`);
  }

  const { device_code, user_code, verification_uri, verification_uri_complete, interval, expires_in } =
    await codeRes.json();

  console.log('');
  console.log('  To authenticate, open this link and confirm the code:');
  console.log('');
  console.log(`    ${verification_uri_complete}`);
  console.log('');
  console.log(`  Your code:  ${user_code}`);
  console.log(`  (link: ${verification_uri} — expires in ${Math.round(expires_in / 60)} min)`);
  console.log('');
  console.log('  Opening your browser… register or sign in, then approve the connection.');
  console.log('  Waiting for approval…');
  openBrowser(verification_uri_complete);

  let pollMs = (interval || 5) * 1000;
  const deadline = Date.now() + (expires_in || 600) * 1000;

  while (Date.now() < deadline) {
    await sleep(pollMs);

    const tokenRes = await fetch(`${apiBase}/api/oauth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
    });
    const payload = await tokenRes.json().catch(() => ({}));

    if (tokenRes.ok && payload.access_token) {
      writeConfig({ ...readConfig(), api_base: apiBase, token: payload.access_token });
      return { apiBase };
    }

    switch (payload.error) {
      case 'authorization_pending':
        break; // keep polling
      case 'slow_down':
        pollMs += 5000;
        break;
      case 'access_denied':
        throw new Error('Authorization was denied in the browser.');
      case 'expired_token':
        throw new Error('The login request expired. Run `appo login` again.');
      default:
        throw new Error(payload.error_description || payload.error || `Login failed (${tokenRes.status}).`);
    }
  }

  throw new Error('Timed out waiting for browser approval. Run `appo login` again.');
}
