function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyBytes(pem: string) {
  const content = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu, "");
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createAppJwt(appId: string, privateKey: string, nowMs: number) {
  const now = Math.floor(nowMs / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({ iat: now - 60, exp: now + 540, iss: appId });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export function createGitHubAppInstallationTokenProvider(dependencies: {
  appId: string;
  installationId: string;
  privateKey: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}) {
  const request = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;

  return async function installationToken() {
    if (cached && cached.expiresAt - now() > 60_000) return cached.token;
    const jwt = await createAppJwt(dependencies.appId, dependencies.privateKey, now());
    const response = await request(`https://api.github.com/app/installations/${dependencies.installationId}/access_tokens`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error("GITHUB_APP_AUTH_FAILED");
    const body = await response.json() as { token?: string; expires_at?: string };
    if (!body.token || !body.expires_at) throw new Error("GITHUB_APP_AUTH_FAILED");
    cached = { token: body.token, expiresAt: Date.parse(body.expires_at) };
    return body.token;
  };
}
