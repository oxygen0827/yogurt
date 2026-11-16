import AppKit

// Called on a Node worker thread in Yogurt's process, under the identity granted in System Settings.
private let readerLock = NSLock()

@_cdecl("yogurt_call_snapshot")
public func snapshot(_ input: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
  readerLock.lock()
  defer { readerLock.unlock() }
  return autoreleasepool {
    let ids = String(cString: input).components(separatedBy: "\n")
    let sample = callSample(ids: ids, t: Int(Date().timeIntervalSince1970 * 1000))
    guard let data = try? JSONSerialization.data(withJSONObject: sample),
          let json = String(data: data, encoding: .utf8) else { return nil }
    return strdup(json)
  }
}
