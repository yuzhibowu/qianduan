import AVFoundation
import CoreImage
import Foundation
import VideoToolbox

final class HEVCAlphaEncoder {
  private let writer: AVAssetWriter
  private let input: AVAssetWriterInput
  private let adaptor: AVAssetWriterInputPixelBufferAdaptor
  private let context = CIContext()
  private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
  private let width: Int
  private let height: Int
  private let fps: Int
  private var frameIndex = 0

  static func outputSettings(width: Int, height: Int, fps: Int) -> [String: Any] {
    let bitRate = max(500_000, Int(Double(width * height * fps) * 0.18))
    return [
      AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitRate,
        AVVideoExpectedSourceFrameRateKey: fps,
        kVTCompressionPropertyKey_TargetQualityForAlpha as String: 0.95,
      ],
    ]
  }

  static func isAvailable() -> Bool {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("hevc-alpha-check-\(UUID().uuidString).mov")
    guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else { return false }
    let settings = outputSettings(width: 1280, height: 720, fps: 30)
    return writer.canApply(outputSettings: settings, forMediaType: .video)
      && writer.canAdd(AVAssetWriterInput(mediaType: .video, outputSettings: settings))
  }

  init(outputURL: URL, width: Int, height: Int, fps: Int) throws {
    guard width > 0, height > 0, width % 2 == 0, height % 2 == 0 else {
      throw HEVCAlphaError.message("HEVC Alpha 输出宽高必须为偶数")
    }
    self.width = width
    self.height = height
    self.fps = fps
    writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
    let settings = Self.outputSettings(width: width, height: height, fps: fps)
    guard writer.canApply(outputSettings: settings, forMediaType: .video) else {
      throw HEVCAlphaError.message("此 Mac 不支持 HEVC Alpha 编码")
    }
    input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    guard writer.canAdd(input) else { throw HEVCAlphaError.message("无法创建 HEVC Alpha 视频轨道") }
    writer.add(input)
    adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
      ],
    )
    guard writer.startWriting() else {
      throw HEVCAlphaError.message(writer.error?.localizedDescription ?? "无法启动 HEVC Alpha 编码")
    }
    writer.startSession(atSourceTime: .zero)
  }

  func append(png: Data) throws {
    guard let image = CIImage(data: png), Int(image.extent.width) == width, Int(image.extent.height) == height else {
      throw HEVCAlphaError.message("HEVC Alpha 的每帧必须是相同尺寸的 PNG")
    }
    guard let pool = adaptor.pixelBufferPool else { throw HEVCAlphaError.message("无法创建 HEVC Alpha 像素缓冲池") }
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
    guard status == kCVReturnSuccess, let buffer else { throw HEVCAlphaError.message("无法分配 HEVC Alpha 像素缓冲") }
    context.render(image, to: buffer, bounds: CGRect(x: 0, y: 0, width: width, height: height), colorSpace: colorSpace)
    let deadline = Date().addingTimeInterval(30)
    while !input.isReadyForMoreMediaData && Date() < deadline && writer.status == .writing {
      Thread.sleep(forTimeInterval: 0.005)
    }
    guard input.isReadyForMoreMediaData, writer.status == .writing else {
      throw HEVCAlphaError.message(writer.error?.localizedDescription ?? "HEVC Alpha 编码器未能接收视频帧")
    }
    guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frameIndex), timescale: Int32(fps))) else {
      throw HEVCAlphaError.message(writer.error?.localizedDescription ?? "HEVC Alpha 视频帧写入失败")
    }
    frameIndex += 1
  }

  func finish() throws {
    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    guard done.wait(timeout: .now() + 120) == .success, writer.status == .completed else {
      throw HEVCAlphaError.message(writer.error?.localizedDescription ?? "HEVC Alpha 视频封装失败")
    }
  }

  func cancel() { writer.cancelWriting() }
}

enum HEVCAlphaError: Error { case message(String) }
