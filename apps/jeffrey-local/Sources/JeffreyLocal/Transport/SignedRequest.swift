import CryptoKit
import Foundation

extension Data {
    init?(base64URLEncoded value: String) {
        var normalized = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        normalized += String(repeating: "=", count: (4 - normalized.count % 4) % 4)
        self.init(base64Encoded: normalized)
    }

    var base64URLEncodedString: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

struct SignedRequest: Sendable {
    let timestamp: Int64
    let nonce: String
    let signature: String
    let canonical: String

    init(method: String, path: String, body: Data, timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1_000), nonce: String = UUID().uuidString, privateKey: P256.Signing.PrivateKey) throws {
        let digest = Data(SHA256.hash(data: body)).base64URLEncodedString
        self.timestamp = timestamp
        self.nonce = nonce
        canonical = [method.uppercased(), path, String(timestamp), nonce, digest].joined(separator: "\n")
        signature = try privateKey.signature(for: Data(canonical.utf8)).rawRepresentation.base64URLEncodedString
    }
}
