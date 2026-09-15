import AppKit
import CoreGraphics
import Foundation
import ImageIO
import Network
import UniformTypeIdentifiers

private let port: NWEndpoint.Port = 43987
private let pngSignature = Data([137, 80, 78, 71, 13, 10, 26, 10])
private let allowedOrigins = [
  "https://qianduan.vercel.app",
  "https://qianduan-zeta.vercel.app",
  "https://qianduan-bingbingshow.vercel.app",
  "http://127.0.0.1:",
  "http://localhost:",
]

private func allowed(_ origin: String?) -> Bool {
  guard let origin, !origin.isEmpty else { return true }
  return allowedOrigins.contains { origin == $0 || ($0.hasSuffix(":") && origin.hasPrefix($0)) }
}

private func ffmpegPath() -> String? {
  let candidates = [
    Bundle.main.path(forResource: "ffmpeg", ofType: nil),
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ].compactMap { $0 }
  return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
}

private func u32(_ value: UInt32) -> Data {
  var big = value.bigEndian
  return Data(bytes: &big, count: 4)
}

private func u16(_ value: UInt16) -> Data {
  var big = value.bigEndian
  return Data(bytes: &big, count: 2)
}

private let crcTable: [UInt32] = (0..<256).map { index in
  var value = UInt32(index)
  for _ in 0..<8 { value = value & 1 == 1 ? 0xedb88320 ^ (value >> 1) : value >> 1 }
  return value
}

private func crc32(_ parts: [Data]) -> UInt32 {
  var crc = UInt32.max
  for part in parts { for byte in part { crc = crcTable[Int((crc ^ UInt32(byte)) & 0xff)] ^ (crc >> 8) } }
  return crc ^ UInt32.max
}

private func pngChunk(_ type: String, _ payload: Data) -> Data {
  let name = type.data(using: .ascii)!
  return u32(UInt32(payload.count)) + name + payload + u32(crc32([name, payload]))
}

private struct PngParts {
  let ihdr: Data
  let ancillary: [(String, Data)]
  let imageData: [Data]
}

private func inspectPng(_ data: Data) throws -> PngParts {
  guard data.count >= 8, data.prefix(8) == pngSignature else { throw HelperError.message("帧不是有效 PNG") }
  var ihdr: Data?
  var ancillary: [(String, Data)] = []
  var imageData: [Data] = []
  var reachedImage = false
  var offset = 8
  while offset + 12 <= data.count {
    let length = data[offset..<(offset + 4)].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    let end = offset + 12 + Int(length)
    guard end <= data.count else { throw HelperError.message("PNG 数据不完整") }
    let type = String(data: data[(offset + 4)..<(offset + 8)], encoding: .ascii) ?? ""
    let payload = Data(data[(offset + 8)..<(offset + 8 + Int(length))])
    if type == "IHDR" { ihdr = payload }
    else if type == "IDAT" { reachedImage = true; imageData.append(payload) }
    else if type != "IEND" && !reachedImage { ancillary.append((type, payload)) }
    offset = end
  }
  guard let ihdr, !imageData.isEmpty else { throw HelperError.message("PNG 帧缺少图像数据") }
  return PngParts(ihdr: ihdr, ancillary: ancillary, imageData: imageData)
}

private enum HelperError: Error { case message(String) }

private func pngFromRGBA(_ rgba: Data, width: Int, height: Int) throws -> Data {
  guard width > 0, height > 0, rgba.count == width * height * 4 else {
    throw HelperError.message("RGBA 帧尺寸不正确")
  }
  guard let provider = CGDataProvider(data: rgba as CFData),
        let image = CGImage(
          width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
          bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
          provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
        ) else { throw HelperError.message("无法创建 RGBA 图像") }
  let output = NSMutableData()
  guard let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil) else {
    throw HelperError.message("无法创建 PNG 编码器")
  }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { throw HelperError.message("PNG 编码失败") }
  return output as Data
}

private final class ExportJob: @unchecked Sendable {
  let id: String
  let format: String
  let outputName: String
  let outputURL: URL
  let fps: Int
  let expectedFrames: Int
  var frames = 0
  var sequence: UInt32 = 0
  var width: UInt32 = 0
  var height: UInt32 = 0
  var process: Process?
  var input: FileHandle?
  var output: FileHandle?

  init(id: String, format: String, outputName: String, outputURL: URL, fps: Int, expectedFrames: Int) {
    self.id = id; self.format = format; self.outputName = outputName; self.outputURL = outputURL
    self.fps = fps; self.expectedFrames = expectedFrames
  }

  func append(_ frame: Data, x: UInt32 = 0, y: UInt32 = 0, canvasWidth: UInt32? = nil, canvasHeight: UInt32? = nil, blendOver: Bool = false) throws {
    guard frames < expectedFrames else { throw HelperError.message("帧数超出预期") }
    if format == "mov" { try input?.write(contentsOf: frame) }
    else {
      let parsed = try inspectPng(frame)
      let w = parsed.ihdr.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
      let h = parsed.ihdr.dropFirst(4).prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
      let fullWidth = canvasWidth ?? w
      let fullHeight = canvasHeight ?? h
      if frames == 0 {
        width = fullWidth; height = fullHeight
        var header = parsed.ihdr
        header.replaceSubrange(0..<4, with: u32(fullWidth))
        header.replaceSubrange(4..<8, with: u32(fullHeight))
        try output?.write(contentsOf: pngChunk("IHDR", header))
        for (type, payload) in parsed.ancillary { try output?.write(contentsOf: pngChunk(type, payload)) }
        try output?.write(contentsOf: pngChunk("acTL", u32(UInt32(expectedFrames)) + u32(0)))
      } else if fullWidth != width || fullHeight != height { throw HelperError.message("PNG 动图的画布尺寸必须一致") }
      var control = Data()
      [u32(sequence), u32(w), u32(h), u32(x), u32(y), u16(1), u16(UInt16(fps)), Data([0, blendOver ? 1 : 0])].forEach { control.append($0) }
      sequence += 1
      try output?.write(contentsOf: pngChunk("fcTL", control))
      if frames == 0 { for payload in parsed.imageData { try output?.write(contentsOf: pngChunk("IDAT", payload)) } }
      else { for payload in parsed.imageData { try output?.write(contentsOf: pngChunk("fdAT", u32(sequence) + payload)); sequence += 1 } }
    }
    frames += 1
  }

  func finish() throws {
    guard frames == expectedFrames else { throw HelperError.message("导出帧不完整：\(frames)/\(expectedFrames)") }
    if format == "mov" {
      try input?.close()
      process?.waitUntilExit()
      guard process?.terminationStatus == 0 else { throw HelperError.message("本机 FFmpeg 编码失败") }
    } else {
      try output?.write(contentsOf: pngChunk("IEND", Data()))
      try output?.close()
    }
  }

  func cancel() {
    try? input?.close(); try? output?.close(); process?.terminate()
    try? FileManager.default.removeItem(at: outputURL)
  }
}

private struct Request {
  let method: String
  let path: String
  let headers: [String: String]
  let body: Data
  var origin: String? { headers["origin"] }
}

private final class HelperServer: @unchecked Sendable {
  private let queue = DispatchQueue(label: "com.bingbing.export-helper")
  private var listener: NWListener?
  private var jobs: [String: ExportJob] = [:]

  func start() throws {
    let listener = try NWListener(using: .tcp, on: port)
    listener.newConnectionHandler = { [weak self] in self?.receive($0) }
    listener.start(queue: queue)
    self.listener = listener
  }

  private func receive(_ connection: NWConnection) {
    connection.start(queue: queue)
    read(connection, Data())
  }

  private func read(_ connection: NWConnection, _ accumulated: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 2 * 1024 * 1024) { [weak self] data, _, complete, error in
      guard let self else { return }
      var buffer = accumulated
      if let data { buffer.append(data) }
      if let request = self.parse(buffer) { self.handle(request, connection) }
      else if error != nil || complete || buffer.count > 140 * 1024 * 1024 { connection.cancel() }
      else { self.read(connection, buffer) }
    }
  }

  private func parse(_ data: Data) -> Request? {
    let marker = Data("\r\n\r\n".utf8)
    guard let range = data.range(of: marker), let head = String(data: data[..<range.lowerBound], encoding: .utf8) else { return nil }
    let lines = head.components(separatedBy: "\r\n")
    guard let first = lines.first else { return nil }
    let parts = first.split(separator: " ")
    guard parts.count >= 2 else { return nil }
    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
      let pair = line.split(separator: ":", maxSplits: 1)
      if pair.count == 2 { headers[String(pair[0]).lowercased()] = pair[1].trimmingCharacters(in: .whitespaces) }
    }
    let bodyStart = range.upperBound
    let length = Int(headers["content-length"] ?? "0") ?? 0
    guard data.count >= bodyStart + length else { return nil }
    return Request(method: String(parts[0]), path: String(parts[1]), headers: headers, body: Data(data[bodyStart..<(bodyStart + length)]))
  }

  private func cors(_ origin: String?) -> [String: String] {
    guard let origin, allowed(origin) else { return [:] }
    return [
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Frame-X, X-Frame-Y, X-Frame-Width, X-Frame-Height, X-Canvas-Width, X-Canvas-Height, X-Frame-Blend, X-Frame-Encoding",
      "Access-Control-Allow-Private-Network": "true",
      "Vary": "Origin",
    ]
  }

  private func send(_ connection: NWConnection, status: Int = 200, type: String = "application/json; charset=utf-8", headers: [String: String] = [:], body: Data = Data()) {
    let reason = status == 200 ? "OK" : status == 201 ? "Created" : status == 204 ? "No Content" : status == 400 ? "Bad Request" : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : "Server Error"
    var values = headers
    values["Content-Type"] = type; values["Content-Length"] = String(body.count); values["Connection"] = "close"; values["Cache-Control"] = "no-store"
    let header = "HTTP/1.1 \(status) \(reason)\r\n" + values.map { "\($0.key): \($0.value)\r\n" }.joined() + "\r\n"
    connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
  }

  private func sendFile(_ connection: NWConnection, job: ExportJob, headers: [String: String]) throws {
    let attributes = try FileManager.default.attributesOfItem(atPath: job.outputURL.path)
    let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
    let type = job.format == "apng" ? "image/png" : "video/quicktime"
    var values = headers
    values["Content-Type"] = type
    values["Content-Length"] = String(size)
    values["Content-Disposition"] = "attachment; filename*=UTF-8''\(job.outputName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? job.outputName)"
    values["Connection"] = "close"
    values["Cache-Control"] = "no-store"
    let header = "HTTP/1.1 200 OK\r\n" + values.map { "\($0.key): \($0.value)\r\n" }.joined() + "\r\n"
    let file = try FileHandle(forReadingFrom: job.outputURL)
    connection.send(content: Data(header.utf8), completion: .contentProcessed { [weak self] error in
      guard error == nil else { try? file.close(); connection.cancel(); return }
      self?.sendNextFileChunk(connection, file: file, job: job)
    })
  }

  private func sendNextFileChunk(_ connection: NWConnection, file: FileHandle, job: ExportJob) {
    do {
      let chunk = try file.read(upToCount: 1024 * 1024) ?? Data()
      if chunk.isEmpty {
        try file.close()
        jobs.removeValue(forKey: job.id)
        try? FileManager.default.removeItem(at: job.outputURL)
        connection.cancel()
        return
      }
      connection.send(content: chunk, completion: .contentProcessed { [weak self] error in
        if error == nil { self?.sendNextFileChunk(connection, file: file, job: job) }
        else { try? file.close(); connection.cancel() }
      })
    } catch {
      try? file.close(); connection.cancel()
    }
  }

  private func json(_ value: Any) -> Data { (try? JSONSerialization.data(withJSONObject: value)) ?? Data("{}".utf8) }

  private func handle(_ request: Request, _ connection: NWConnection) {
    let headers = cors(request.origin)
    guard allowed(request.origin) else { return send(connection, status: 403, headers: headers, body: json(["error": "此网页未获本机助手授权"])) }
    if request.method == "OPTIONS" { return send(connection, status: 204, headers: headers) }
    do {
      if request.method == "GET" && request.path == "/v1/capabilities" {
        return send(connection, headers: headers, body: json(["available": true, "prores4444": ffmpegPath() != nil, "nativeApng": true, "helperVersion": "0.1.0"]))
      }
      if request.method == "POST" && request.path == "/v1/start" {
        let input = try JSONSerialization.jsonObject(with: request.body) as? [String: Any] ?? [:]
        let format = input["format"] as? String == "apng" ? "apng" : "mov"
        let fps = input["fps"] as? Int ?? 30
        let total = input["totalFrames"] as? Int ?? 0
        let width = input["width"] as? Int ?? 0
        let height = input["height"] as? Int ?? 0
        guard [24, 25, 30, 50, 60].contains(fps), (1...3600).contains(total), (1...8192).contains(width), (1...8192).contains(height) else { throw HelperError.message("导出参数超出安全范围") }
        let id = UUID().uuidString
        let ext = format == "apng" ? "png" : "mov"
        let requested = (input["outputName"] as? String)?.components(separatedBy: "/").last ?? "export.\(ext)"
        let name = requested.lowercased().hasSuffix(".\(ext)") ? requested : "\(requested).\(ext)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("BingBing-\(id)-\(name)")
        let job = ExportJob(id: id, format: format, outputName: name, outputURL: url, fps: fps, expectedFrames: total)
        if format == "mov" {
          guard let ffmpeg = ffmpegPath() else { throw HelperError.message("没有找到本机 FFmpeg") }
          let process = Process(); let pipe = Pipe()
          process.executableURL = URL(fileURLWithPath: ffmpeg)
          process.arguments = ["-y", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "\(width)x\(height)", "-framerate", String(fps), "-i", "pipe:0", "-c:v", "prores_ks", "-profile:v", "5", "-bits_per_mb", "8000", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", url.path]
          process.standardInput = pipe; process.standardError = Pipe(); try process.run()
          job.process = process; job.input = pipe.fileHandleForWriting
        } else {
          FileManager.default.createFile(atPath: url.path, contents: pngSignature)
          job.output = try FileHandle(forWritingTo: url); try job.output?.seekToEnd()
        }
        jobs[id] = job
        return send(connection, status: 201, headers: headers, body: json(["id": id, "outputName": name]))
      }
      let pieces = request.path.split(separator: "/").map(String.init)
      if pieces.count == 3, pieces[0] == "v1", let job = jobs[pieces[2]] {
        if request.method == "POST" && pieces[1] == "frame" {
          let x = UInt32(request.headers["x-frame-x"] ?? "0") ?? 0
          let y = UInt32(request.headers["x-frame-y"] ?? "0") ?? 0
          let canvasWidth = UInt32(request.headers["x-canvas-width"] ?? "")
          let canvasHeight = UInt32(request.headers["x-canvas-height"] ?? "")
          let frameWidth = Int(request.headers["x-frame-width"] ?? "") ?? 0
          let frameHeight = Int(request.headers["x-frame-height"] ?? "") ?? 0
          let frame = job.format == "apng" && request.headers["x-frame-encoding"] == "rgba"
            ? try pngFromRGBA(request.body, width: frameWidth, height: frameHeight)
            : request.body
          try job.append(frame, x: x, y: y, canvasWidth: canvasWidth, canvasHeight: canvasHeight, blendOver: request.headers["x-frame-blend"] == "over")
          return send(connection, headers: headers, body: json(["frame": job.frames]))
        }
        if request.method == "POST" && pieces[1] == "finish" { try job.finish(); return send(connection, headers: headers, body: json(["outputName": job.outputName, "downloadUrl": "http://127.0.0.1:\(port.rawValue)/v1/download/\(job.id)"])) }
        if request.method == "POST" && pieces[1] == "cancel" { job.cancel(); jobs.removeValue(forKey: job.id); return send(connection, headers: headers, body: json(["cancelled": true])) }
        if request.method == "GET" && pieces[1] == "download" {
          try sendFile(connection, job: job, headers: headers); return
        }
      }
      send(connection, status: 404, headers: headers, body: json(["error": "未知请求"]))
    } catch {
      let message = (error as? HelperError).map { if case let .message(text) = $0 { return text }; return "导出失败" } ?? error.localizedDescription
      send(connection, status: 500, headers: headers, body: json(["error": message]))
    }
  }
}

@MainActor private final class AppDelegate: NSObject, NSApplicationDelegate {
  private let server = HelperServer()
  private var statusItem: NSStatusItem?
  func applicationDidFinishLaunching(_ notification: Notification) {
    do { try server.start() } catch { NSApp.terminate(nil); return }
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    item.button?.title = "饼饼SHOW"
    let menu = NSMenu()
    let state = NSMenuItem(title: "高速导出助手运行中", action: nil, keyEquivalent: "")
    state.isEnabled = false; menu.addItem(state); menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "退出助手", action: #selector(quit), keyEquivalent: "q"))
    item.menu = menu; statusItem = item
  }
  @objc private func quit() { NSApp.terminate(nil) }
}

private let app = NSApplication.shared
private let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
