// Decodes a QR code from a PNG with CoreImage. Usage: swift tests/qr-decode.swift <file.png>
import Foundation
import CoreImage

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = CIImage(contentsOf: url) else {
    FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
    exit(2)
}
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                          options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
let messages = detector.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
guard let first = messages.first else {
    FileHandle.standardError.write("no QR code found\n".data(using: .utf8)!)
    exit(1)
}
print(first)
