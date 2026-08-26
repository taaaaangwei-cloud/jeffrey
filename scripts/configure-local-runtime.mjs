import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes, webcrypto } from "node:crypto";
import { resolve } from "node:path";

const envPath = resolve(process.argv[2] ?? ".env.local");

function parseEnv(source) {
  return new Map(
    source
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function randomSecret() {
  return randomBytes(32).toString("hex");
}

async function generateVapidKeys() {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [publicRaw, privateJwk] = await Promise.all([
    webcrypto.subtle.exportKey("raw", pair.publicKey),
    webcrypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  return {
    publicKey: Buffer.from(publicRaw).toString("base64url"),
    privateKey: privateJwk.d,
  };
}

let source = "";
try {
  source = await readFile(envPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const values = parseEnv(source);
const setDefault = (key, value) => {
  if (!values.get(key)) values.set(key, value);
};

setDefault("AI_RUNTIME", "local_codex");
setDefault("PREVIEW_MODE", "false");
setDefault("DEVELOPMENT_AGENT_ENABLED", "false");
setDefault("LOCAL_COMPUTER_AGENT_ENABLED", "false");
setDefault("LOCAL_AGENT_PAIRING_SECRET", randomSecret());
setDefault("LOCAL_AGENT_DEVICE_TOKEN_SECRET", randomSecret());
setDefault("LOCAL_AGENT_APPROVAL_SECRET", randomSecret());
setDefault("LOCAL_AGENT_TASK_TTL_MINUTES", "15");
setDefault("LOCAL_AGENT_LEASE_SECONDS", "60");
setDefault("LOCAL_AGENT_MIN_VERSION", "0.1.0");
setDefault("PROACTIVE_CRON_SECRET", randomSecret());

if (!values.get("VAPID_PUBLIC_KEY") || !values.get("VAPID_PRIVATE_KEY")) {
  const vapid = await generateVapidKeys();
  values.set("VAPID_PUBLIC_KEY", vapid.publicKey);
  values.set("VAPID_PRIVATE_KEY", vapid.privateKey);
}
setDefault("VAPID_SUBJECT", "https://echo-chat-pwa.taaaaangwei.chatgpt.site");

const temporaryPath = `${envPath}.tmp`;
const output = `${[...values].map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
await writeFile(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
await rename(temporaryPath, envPath);
await chmod(envPath, 0o600);

process.stdout.write("Local runtime configuration is complete; secret values were not displayed.\n");
