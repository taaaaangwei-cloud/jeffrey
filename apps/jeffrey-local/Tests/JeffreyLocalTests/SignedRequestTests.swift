import CryptoKit
import Foundation
import Testing
@testable import JeffreyLocal

@Test func signedRequestUsesTheServerCanonicalFormatAndFreshNonce() throws {
    let key = P256.Signing.PrivateKey()
    let body = Data("{}".utf8)
    let first = try SignedRequest(method: "POST", path: "/api/local-agent/heartbeat", body: body, timestamp: 1_700_000_000_000, nonce: "nonce-1", privateKey: key)
    #expect(first.canonical.split(separator: "\n").count == 5)
    #expect(first.canonical.hasPrefix("POST\n/api/local-agent/heartbeat\n1700000000000\nnonce-1\n"))
    let signature = try P256.Signing.ECDSASignature(rawRepresentation: Data(base64URLEncoded: first.signature)!)
    #expect(key.publicKey.isValidSignature(signature, for: Data(first.canonical.utf8)))
}
