import AppKit
import CoreText
import Foundation

struct Face: Codable {
    let family: String
    let fullName: String
    let postscriptName: String
    let style: String
}

func supportsChinese(_ family: String) -> Bool {
    guard let font = NSFont(name: family, size: 14) else { return false }
    let characters: [UniChar] = "中文测试".unicodeScalars.map { UniChar($0.value) }
    var glyphs = [CGGlyph](repeating: 0, count: characters.count)
    return CTFontGetGlyphsForCharacters(font as CTFont, characters, &glyphs, characters.count)
}

let manager = NSFontManager.shared
let faces = manager.availableFontFamilies
    .filter(supportsChinese)
    .flatMap { family -> [Face] in
        let members = manager.availableMembers(ofFontFamily: family) ?? []
        return members.compactMap { member in
            guard let postscriptName = member.first as? String else { return nil }
            let style = (member.count > 1 ? member[1] as? String : nil) ?? postscriptName
            let fullName = NSFont(name: postscriptName, size: 14)?.displayName ?? style
            return Face(
                family: family,
                fullName: fullName,
                postscriptName: postscriptName,
                style: style
            )
        }
    }

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(faces))
