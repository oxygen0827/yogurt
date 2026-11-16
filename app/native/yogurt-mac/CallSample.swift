import AppKit
import ApplicationServices

// MARK: names from calls (Accessibility)

/**
 * Who is in a call and who is talking, as the call app shows it: its meeting windows copied out of the accessibility
 * tree, read-only (nothing is clicked or changed in the app). Only the call app Yogurt was told about, the frontmost
 * one first. Yogurt reads the tree (src/main/callNames/parse.ts). Chromium and Electron build a page's tree only when
 * an assistive app asks, so they are asked the way screen readers do (AXManualAccessibility), and only for a call window.
 */
let axKeys = [kAXRoleAttribute, kAXSubroleAttribute, kAXDescriptionAttribute, kAXTitleAttribute, kAXValueAttribute, kAXIdentifierAttribute, "AXDOMClassList", kAXChildrenAttribute, kAXSizeAttribute] as [String]
let chromium: Set<String> = ["com.google.Chrome", "company.thebrowser.Browser", "com.brave.Browser", "com.microsoft.edgemac", "com.microsoft.teams", "com.microsoft.teams2", "com.bytedance.macos.feishu"]
var askedTree = Set<pid_t>()

func axAttr(_ e: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func axText(_ v: AnyObject?) -> String? {
  guard let s = v as? String, !s.isEmpty else { return nil }
  return s.count > 300 ? String(s.prefix(300)) : s
}

/** one element and what is under it, depth and element count bounded (Zoom's toolbar lists itself as its own child) */
func axCopy(_ e: AXUIElement, depth: Int, maxDepth: Int, budget: inout Int, zoom: Bool) -> [String: Any] {
  budget -= 1
  var raw: CFArray?
  AXUIElementCopyMultipleAttributeValues(e, axKeys as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &raw)
  let vals = (raw as? [AnyObject]) ?? []
  // a missing attribute comes back as an AXValue error: only real values count
  func at(_ i: Int) -> AnyObject? {
    guard i < vals.count else { return nil }
    let v = vals[i]
    if CFGetTypeID(v) == AXValueGetTypeID() && AXValueGetType(v as! AXValue) == .axError { return nil }
    return v
  }
  var n: [String: Any] = [:]
  let role = axText(at(0)) ?? ""
  n["r"] = role
  if let x = axText(at(1)) { n["s"] = x }
  if let x = axText(at(2)) { n["d"] = x }
  if let x = axText(at(3)) { n["t"] = x }
  // what someone types is never copied
  if role != "AXTextField" && role != "AXTextArea", let x = axText(at(4)) { n["v"] = x }
  if let x = axText(at(5)) { n["i"] = x }
  if let c = at(6) as? [String], !c.isEmpty { n["c"] = Array(c.prefix(20)) }
  if role == "AXTabGroup", let size = at(8), CFGetTypeID(size) == AXValueGetTypeID() {
    var sz = CGSize.zero
    if AXValueGetValue(size as! AXValue, .cgSize, &sz) { n["w"] = Int(sz.width); n["h"] = Int(sz.height) }
  }
  // a Zoom tile's description ("Name, Computer audio muted, …") says it all; its children are buttons.
  // The gallery around the tiles is also a tab group ("Gallery view"), so only a described list stops the walk.
  if zoom && role == "AXTabGroup", let d = n["d"] as? String, d.contains(",") { return n }
  guard depth < maxDepth, let kids = at(7) as? [AXUIElement], !kids.isEmpty else { return n }
  var out: [[String: Any]] = []
  for k in kids {
    if budget <= 0 { break }
    out.append(axCopy(k, depth: depth + 1, maxDepth: maxDepth, budget: &budget, zoom: zoom))
  }
  n["k"] = out
  return n
}

// A meeting may use its agenda as the window title. In that case check for the
// leave-call control without copying chat text or the rest of the window tree.
private func hasLeaveControl(_ node: AXUIElement, depth: Int, budget: inout Int) -> Bool {
  guard depth > 0, budget > 0 else { return false }
  budget -= 1
  if axText(axAttr(node, kAXRoleAttribute)) == "AXButton" {
    let leave = ["离开会议", "退出会议", "挂断", "Leave meeting", "Leave call", "End call"]
    if [kAXTitleAttribute, kAXDescriptionAttribute].contains(where: { key in
      guard let label = axText(axAttr(node, key)) else { return false }
      return leave.contains { label.caseInsensitiveCompare($0) == .orderedSame }
    }) { return true }
  }
  guard let children = axAttr(node, kAXChildrenAttribute) as? [AXUIElement] else { return false }
  for child in children where budget > 0 {
    if hasLeaveControl(child, depth: depth - 1, budget: &budget) { return true }
  }
  return false
}

/** the windows of a call app that hold the call */
func callWindows(_ app: AXUIElement, _ id: String, targeted: Bool) -> [AXUIElement] {
  let all = (axAttr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
  if id == "us.zoom.xos" {
    return all.filter { w in
      let ident = axText(axAttr(w, kAXIdentifierAttribute)) ?? "", title = axText(axAttr(w, kAXTitleAttribute)) ?? ""
      return ident.hasPrefix("zm.meeting") || title.hasPrefix("Zoom Meeting") || title.hasPrefix("Zoom Webinar")
    }
  }
  if id.hasPrefix("com.microsoft.teams") { return all }
  // Webex's meeting surfaces have stable accessibility identifiers; exclude its home window so it cannot hide another
  // call app when a recording was started by hand.
  if id == "Cisco-Systems.Spark" || id == "com.cisco.webexmeetingsapp" {
    return all.filter { w in
      let ident = axText(axAttr(w, kAXIdentifierAttribute)) ?? ""
      return ident == "FloatingMediaWindow" || ident == "PopOutWindow"
    }
  }
  if ["com.tencent.meeting", "com.bytedance.macos.feishu"].contains(id) {
    return all.filter { w in
      let title = axText(axAttr(w, kAXTitleAttribute)) ?? ""
      let identifier = axText(axAttr(w, kAXIdentifierAttribute)) ?? ""
      if identifier.range(of: #"in.?meeting|video.?conf|speaker.?view|byteview"#, options: [.regularExpression, .caseInsensitive]) != nil { return true }
      let home = ["腾讯会议", "Tencent Meeting", "VooV Meeting", "飞书", "Lark", "Feishu"].contains(title)
      if !home && title.range(of: #"会议|视频通话|语音通话|正在共享|Meeting|Video Call|Voice Call"#, options: [.regularExpression, .caseInsensitive]) != nil { return true }
      guard targeted else { return false }
      var budget = 180
      return hasLeaveControl(w, depth: 18, budget: &budget)

    }
  }
  // a browser: only windows whose front tab is a Meet call
  return all.filter { w in (axText(axAttr(w, kAXTitleAttribute)) ?? "").range(of: #"\bMeet\b"#, options: .regularExpression) != nil }
}

func callSample(ids: [String], t: Int) -> [String: Any] {
  if !AXIsProcessTrusted() {
    return ["t": t, "error": "not-trusted"]
  } else {
    // the frontmost of the apps asked about that shows a call, else the first one that does
    let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
    let running = ids.compactMap { NSRunningApplication.runningApplications(withBundleIdentifier: $0).first }
      .sorted { a, _ in a.processIdentifier == front }
    var found: (NSRunningApplication, AXUIElement, [AXUIElement])?
    for r in running {
      let app = AXUIElementCreateApplication(r.processIdentifier)
      AXUIElementSetMessagingTimeout(app, 0.3)
      let wins = callWindows(app, r.bundleIdentifier ?? "", targeted: ids.count == 1)
      if !wins.isEmpty { found = (r, app, wins); break }
    }
    if let (target, app, wins) = found, let id = target.bundleIdentifier {
      if chromium.contains(id) && !askedTree.contains(target.processIdentifier) {
        AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        askedTree.insert(target.processIdentifier)
      }
      let zoom = id == "us.zoom.xos"
      var budget = zoom ? 1500 : 4000
      let out = wins.prefix(4).map { w -> [String: Any] in
        var o: [String: Any] = ["tree": axCopy(w, depth: 0, maxDepth: zoom ? 14 : 40, budget: &budget, zoom: zoom)]
        if let x = axText(axAttr(w, kAXTitleAttribute)) { o["title"] = x }
        if let x = axText(axAttr(w, kAXIdentifierAttribute)) { o["id"] = x }
        return o
      }
      return ["t": t, "app": id, "windows": out]
    } else {
      return ["t": t, "error": running.isEmpty ? "not-running" : "no-call-window"]
    }
  }
}
