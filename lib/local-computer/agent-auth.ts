import { verifyLocalAgentSignature } from "./device-auth.ts";
import { createSupabaseDeviceNonceStore, hashLocalDeviceToken } from "./device-session.ts";
import type { createServerDependencies } from "../server/dependencies.ts";

type Dependencies = ReturnType<typeof createServerDependencies>;

export async function authenticateLocalAgentRequest(request: Request, body: string, dependencies: Dependencies) {
  if (!dependencies.localComputerConfig.configured || !dependencies.localComputerConfig.deviceTokenSecret) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
  const deviceId = request.headers.get("x-jeffrey-device-id") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const sessionToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const device = await dependencies.localComputerRepository.getDeviceById(deviceId);
  if (!device || device.revokedAt || !device.tokenHash || !device.tokenExpiresAt || Date.parse(device.tokenExpiresAt) < Date.now()) throw new Error("LOCAL_AGENT_UNAUTHORIZED");
  if (device.tokenHash !== await hashLocalDeviceToken(dependencies.localComputerConfig.deviceTokenSecret, sessionToken)) throw new Error("LOCAL_AGENT_UNAUTHORIZED");
  let publicKey: JsonWebKey;
  try { publicKey = JSON.parse(device.publicKey) as JsonWebKey; } catch { throw new Error("LOCAL_AGENT_UNAUTHORIZED"); }
  const timestamp = Number(request.headers.get("x-jeffrey-timestamp"));
  const nonce = request.headers.get("x-jeffrey-nonce") ?? "";
  const signature = request.headers.get("x-jeffrey-signature") ?? "";
  const valid = await verifyLocalAgentSignature({ method: request.method, path: new URL(request.url).pathname, body, timestamp, nonce, signature, publicKey, nonces: createSupabaseDeviceNonceStore(dependencies.supabase, device.id) });
  if (!valid) throw new Error("LOCAL_AGENT_UNAUTHORIZED");
  return device;
}
