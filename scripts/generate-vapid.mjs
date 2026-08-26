const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const [publicRaw, privateJwk] = await Promise.all([crypto.subtle.exportKey("raw", pair.publicKey), crypto.subtle.exportKey("jwk", pair.privateKey)]);
const base64url = (value) => Buffer.from(value).toString("base64url");
process.stdout.write(JSON.stringify({ publicKey: base64url(publicRaw), privateKey: privateJwk.d }));
