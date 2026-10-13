// Decode the actual HEVC Alpha export with Apple's alpha-aware decoder.
import Foundation
import AVFoundation
import CoreVideo
import ImageIO

let input=URL(fileURLWithPath:CommandLine.arguments[1])
let output=URL(fileURLWithPath:CommandLine.arguments[2],isDirectory:true)
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
let asset=AVURLAsset(url:input)
guard let track=asset.tracks(withMediaType:.video).first else {fatalError("No video track")}
let reader=try AVAssetReader(asset:asset)
let decoder=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
decoder.alwaysCopiesSampleData=false;reader.add(decoder)
guard reader.startReading() else {fatalError(String(describing:reader.error))}
var frame=0;var selected:[[String:Any]]=[];var times:[Double]=[]
let defaultFrames=[0,64,72,78,90,102,108,116,132,179]
let chosen=Set(CommandLine.arguments.count>3 ? CommandLine.arguments[3].split(separator:",").map{Int($0)!}:defaultFrames)
precondition(chosen.allSatisfy{$0>=0},"Invalid selected frame")
while let sample=decoder.copyNextSampleBuffer(){
 times.append(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)))
 if chosen.contains(frame),let pixels=CMSampleBufferGetImageBuffer(sample){
  CVPixelBufferLockBaseAddress(pixels,.readOnly)
  let width=CVPixelBufferGetWidth(pixels),height=CVPixelBufferGetHeight(pixels),stride=CVPixelBufferGetBytesPerRow(pixels)
  let base=CVPixelBufferGetBaseAddress(pixels)!.assumingMemoryBound(to:UInt8.self)
  var transparent=0,partial=0,opaque=0
  for y in 0..<height{for x in 0..<width{let a=base[y*stride+x*4+3];if a==0{transparent+=1}else if a==255{opaque+=1}else{partial+=1}}}
  let data=Data(bytes:base,count:stride*height)
  CVPixelBufferUnlockBaseAddress(pixels,.readOnly)
  let provider=CGDataProvider(data:data as CFData)!
  let info=CGBitmapInfo.byteOrder32Little.union(CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedFirst.rawValue))
  let image=CGImage(width:width,height:height,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:stride,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:info,provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent)!
  let destination=CGImageDestinationCreateWithURL(output.appendingPathComponent("hevc-frame-\(frame).png") as CFURL,"public.png" as CFString,1,nil)!
  CGImageDestinationAddImage(destination,image,nil)
  guard CGImageDestinationFinalize(destination) else {fatalError("PNG write failed")}
  selected.append(["frame":frame,"width":width,"height":height,"transparent":transparent,"partial":partial,"opaque":opaque])
 }
 frame+=1
}
guard reader.status == .completed else {fatalError(String(describing:reader.error))}
let intervals=zip(times.dropFirst(),times).map{$0-$1}
let descriptions=track.formatDescriptions.map{String(describing:CMFormatDescriptionGetExtensions($0 as! CMFormatDescription))}
let containsAlpha=track.hasMediaCharacteristic(.containsAlphaChannel)
let report:[String:Any]=["containsAlphaChannel":containsAlpha,"frames":frame,"fps":track.nominalFrameRate,"duration":CMTimeGetSeconds(asset.duration),"frameIntervalMin":intervals.min() ?? 0,"frameIntervalMax":intervals.max() ?? 0,"formatExtensions":descriptions,"selectedFrames":selected]
let reportData=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
try reportData.write(to:output.appendingPathComponent("hevc-alpha-audit.json"))
print(String(data:reportData,encoding:.utf8)!)
