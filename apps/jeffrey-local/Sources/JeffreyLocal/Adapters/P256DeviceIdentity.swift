import CryptoKit
import Foundation

struct P256DeviceIdentity: Sendable {
    private let privateKey: P256.Signing.PrivateKey

    init(store: any SecureStore, account: String = "device-signing-key") throws {
        if let existing = try store.read(account: account) {
            privateKey = try P256.Signing.PrivateKey(rawRepresentation: existing)
        } else {
            let generated = P256.Signing.PrivateKey()
            try store.save(generated.rawRepresentation, account: account)
            privateKey = generated
        }
    }

    var publicKeyJWK: String {
        get throws {
            let point = privateKey.publicKey.x963Representation
            let x = Data(point[1..<33]).base64URLEncodedString
            let y = Data(point[33..<65]).base64URLEncodedString
            let object = ["kty": "EC", "crv": "P-256", "x": x, "y": y, "ext": true] as [String: Any]
            return String(decoding: try JSONSerialization.data(withJSONObject: object), as: UTF8.self)
        }
    }

    func sign(method: String, path: String, body: Data) throws -> SignedRequest {
        try SignedRequest(method: method, path: path, body: body, privateKey: privateKey)
    }
}
