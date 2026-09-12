import { describe, expect, it } from "vitest";
import { fontFamilyStack, localFontFaces, matchingFontFace } from "./font-catalog";

describe("local font faces", () => {
  it("lists every distinct face in the selected family by stable PostScript name", () => {
    const faces = localFontFaces([
      { family: "Demo", fullName: "Demo Bold Round", postscriptName: "Demo-Bold-Round", style: "Bold Round" },
      { family: "Other", fullName: "Other Regular", postscriptName: "Other-Regular", style: "Regular" },
      { family: "Demo", fullName: "Demo Bold Square", postscriptName: "Demo-Bold-Square", style: "Bold Square" },
    ], "Demo");

    expect(faces).toEqual([
      { id: "Demo-Bold-Round", label: "Bold Round", family: "Demo", weight: 700 },
      { id: "Demo-Bold-Square", label: "Bold Square", family: "Demo", weight: 700 },
    ]);
  });

  it("changes weight inside the selected face style instead of changing its shape", () => {
    const faces = localFontFaces([
      { family: "Demo", postscriptName: "Demo-Light-Round", style: "Light Round" },
      { family: "Demo", postscriptName: "Demo-Bold-Round", style: "Bold Round" },
      { family: "Demo", postscriptName: "Demo-Bold-Square", style: "Bold Square" },
    ], "Demo");

    expect(matchingFontFace(faces, "Demo-Bold-Round", 300)).toBe("Demo-Light-Round");
    expect(matchingFontFace(faces, "Demo-Bold-Square", 300)).toBe("Demo-Bold-Square");
  });

  it("places the selected face before its family fallback", () => {
    expect(fontFamilyStack("Demo", "Demo-Bold-Round"))
      .toBe("'Demo-Bold-Round', 'Demo', ui-sans-serif, system-ui, sans-serif");
  });
});
