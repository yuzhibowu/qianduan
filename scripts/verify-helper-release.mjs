import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const run = promisify(execFile);
const site = process.argv[2] ?? "http://127.0.0.1:4173";
const output = resolve(process.argv[3] ?? "artifacts/helper-release");
const downloadUrl = "https://3d-sticker-lab.vercel.app/helper/BingBing-Export-Helper-macOS.zip?v=0.7.0";
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const ffprobe = process.env.FFPROBE ?? "ffprobe";
const selected = process.env.VERIFY_CASES?.split(",");
await mkdir(output, { recursive: true });
const report = { site, selectedCases: selected ?? "all", checks: [], exports: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
// This permission is granted only to the isolated test context, just as a user
// grants local network access to the production page to connect their helper.
await context.grantPermissions(["local-network-access"]);
const errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
const unavailable = async route => route.abort("connectionrefused");
const helperPattern = "http://127.0.0.1:43987/v1/**";

async function releaseResponse(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await context.request.get(url, { timeout: 30_000 });
      assert(response.ok(), `下载资产请求失败：${response.status()}`);
      return response;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolveWait => setTimeout(resolveWait, 500));
    }
  }
}

function alphaCounts(bytes) {
  const png = PNG.sync.read(bytes);
  const counts = { transparent: 0, partial: 0, opaque: 0 };
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] === 0) counts.transparent++;
    else if (png.data[i] === 255) counts.opaque++;
    else counts.partial++;
  }
  assert(counts.transparent > 0 && counts.partial > 0 && counts.opaque > 0, "透明、半透明与不透明像素必须同时存在");
  return counts;
}

async function inspectFile(path, format, fps, frames) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames,nb_read_frames,duration:stream_tags=vendor_id", "-of", "json", path]);
  const stream = JSON.parse(stdout).streams[0];
  assert.equal(Number(stream.nb_read_frames), frames);
  if (format === "hevc-alpha") {
    assert.equal(stream.codec_name, "hevc");
    assert.equal(stream.r_frame_rate, `${fps}/1`);
    const directory = `${path}-apple-decoded`;
    await run("xcrun", ["swift", "-module-cache-path", resolve(output, "swift-cache"), resolve(import.meta.dirname, "inspect-hevc-alpha.swift"), path, directory, `0,${Math.floor(frames / 2)},${frames - 1}`], { maxBuffer: 8 * 1024 * 1024 });
    const apple = JSON.parse(await readFile(resolve(directory, "hevc-alpha-audit.json"), "utf8"));
    assert.equal(apple.containsAlphaChannel, true);
    assert.equal(apple.frames, frames);
    assert(Math.abs(apple.duration - frames / fps) < 0.00001);
    for (const sample of apple.selectedFrames) assert(sample.transparent > 0 && sample.partial > 0 && sample.opaque > 0);
    assert(Math.abs(apple.frameIntervalMin - 1 / fps) < 0.000001);
    assert(Math.abs(apple.frameIntervalMax - 1 / fps) < 0.000001);
    return { ...stream, apple };
  }
  if (format === "mov") {
    assert.equal(stream.r_frame_rate, `${fps}/1`);
    assert.equal(stream.codec_name, "prores");
    assert.equal(stream.profile, "XQ");
    assert.match(stream.pix_fmt, /^yuva444p/);
    assert.equal(stream.tags.vendor_id, "apl0");
    assert(Math.abs(Number(stream.duration) - frames / fps) < 0.00001);
  } else {
    const bytes = await readFile(path);
    let controls = 0;
    for (let p = 8; p < bytes.length; p += 12 + bytes.readUInt32BE(p)) {
      const type = bytes.toString("ascii", p + 4, p + 8);
      if (type === "acTL") {
        assert.equal(bytes.readUInt32BE(p + 8), frames);
        assert.equal(bytes.readUInt32BE(p + 12), 0);
      }
      if (type === "fcTL") {
        controls++;
        assert.equal(bytes.readUInt32BE(p + 12), stream.width);
        assert.equal(bytes.readUInt32BE(p + 16), stream.height);
        assert.equal(bytes.readUInt32BE(p + 20), 0);
        assert.equal(bytes.readUInt32BE(p + 24), 0);
        assert.equal(bytes.readUInt16BE(p + 30) / bytes.readUInt16BE(p + 28), fps);
      }
    }
    assert.equal(controls, frames);
  }
  const decoded = `${path}.png`;
  await run(ffmpeg, ["-y", "-v", "error", "-i", path, "-frames:v", "1", "-pix_fmt", "rgba", decoded]);
  return { ...stream, alpha: alphaCounts(await readFile(decoded)) };
}

async function exportCase({ name, component = "coin-loader", width = 1280, height = 720, duration, fps = 30, fallback = false, formats = ["mov"], adaptive = true }) {
  if (selected && !selected.includes(name)) return;
  console.log(`开始 ${name}`);
  const page = await context.newPage();
  const encoderLogs = [];
  page.on("console", message => { if (message.text().startsWith("[X FFmpeg]")) encoderLogs.push(message.text()); });
  const requests = [];
  page.on("request", request => { if (request.url().includes("43987/v1/start")) requests.push(request.postDataJSON()); });
  if (fallback) await page.route(helperPattern, unavailable);
  await page.goto(`${site}/?${new URLSearchParams({ component, width, height, ...(duration ? { duration } : {}), fps })}`, { waitUntil: "domcontentloaded" });
  if (component === "paper-image") {
    const png = new PNG({ width: 128, height: 128 });
    for (let y = 16; y < 112; y++) for (let x = 16; x < 112; x++) {
      const p = (y * 128 + x) * 4;
      png.data.set([200, 80, 120, x < 32 || x >= 96 || y < 32 || y >= 96 ? 128 : 255], p);
    }
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "alpha-test.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  }
  await page.evaluate(() => localStorage.setItem("bingbing-helper-browser-fallback", "accepted"));
  if (!adaptive) await page.getByRole("button", { name: "16:9", exact: true }).click();
  const actualDuration = Number(await page.getByLabel("完整周期", { exact: true }).inputValue());
  const expected = Math.round(actualDuration * fps);
  const downloads = [];
  page.on("download", download => downloads.push(download));
  for (const format of formats) {
    await page.getByRole("button", { name: format === "mov" ? "导出ProRes4444" : format === "hevc-alpha" ? "导出 HEVC Alpha" : "导出 PNG 动图", exact: true }).click();
    if (formats.length === 1) {
      assert.equal(await page.getByRole("button", { name: format === "mov" ? "导出 PNG 动图" : "导出ProRes4444", exact: true }).isEnabled(), true);
    }
  }
  const deadline = Date.now() + 300_000;
  let nextProgress = Date.now() + 30_000;
  while (downloads.length < formats.length && Date.now() < deadline) {
    if (await page.locator(".error").count()) await writeFile(resolve(output, `${name}-encoder.log`), encoderLogs.join("\n"));
    assert.equal(await page.locator(".error").count(), 0, await page.locator(".error").allTextContents());
    if (Date.now() >= nextProgress) {
      console.log(name, await page.locator(".status").allTextContents());
      await page.screenshot({ path: resolve(output, `${name}-progress.jpg`) });
      nextProgress = Date.now() + 30_000;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  if (downloads.length !== formats.length) {
    console.log(name, await page.locator(".status").allTextContents());
    await page.screenshot({ path: resolve(output, `${name}-timeout.jpg`) });
    for (const button of await page.getByRole("button", { name: /^取消.+导出$/ }).all()) await button.click();
  }
  assert.equal(downloads.length, formats.length, `${name} 导出超时`);
  assert.equal(requests.length, fallback ? 0 : formats.length, "助手路径必须实际启动本机编码任务");
  if (encoderLogs.length) await writeFile(resolve(output, `${name}-encoder.log`), encoderLogs.join("\n"));
  for (const download of downloads) {
    const format = download.suggestedFilename().endsWith("-hevc-alpha.mov") ? "hevc-alpha" : download.suggestedFilename().endsWith(".mov") ? "mov" : "apng";
    const path = resolve(output, `${name}.${format === "apng" ? "png" : "mov"}`);
    await download.saveAs(path);
    const inspection = await inspectFile(path, format, fps, expected);
    report.exports.push({ name, format, encoder: fallback ? "browser" : "helper", frames: expected, ...inspection });
    console.log(`通过 ${name} ${format} ${inspection.width}×${inspection.height} ${expected} 帧`);
  }
  await page.screenshot({ path: resolve(output, `${name}.jpg`) });
  await page.close();
}

try {
  if (!selected || selected.includes("download")) {
  const manifest = await (await releaseResponse("https://3d-sticker-lab.vercel.app/helper/latest.json")).json();
  assert.equal(manifest.version, "0.7.0");
  const page = await context.newPage();
  await page.route(helperPattern, unavailable);
  await page.goto(site, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("bingbing-helper-browser-fallback"));
  await page.getByRole("button", { name: "导出ProRes4444", exact: true }).click();
  const link = page.getByRole("link", { name: "下载统一助手 0.7", exact: true });
  assert.equal(await link.getAttribute("href"), downloadUrl);
  await page.getByRole("button", { name: "重新检测", exact: true }).click();
  await page.getByText("尚未检测到助手，请确认安装后已经打开。", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "download-prompt.jpg") });
  await page.getByRole("button", { name: "导出 HEVC Alpha", exact: true }).click();
  await page.getByText("透明 HEVC 需要统一饼饼导出助手 0.7，以及支持 HEVC Alpha 的 Mac。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "继续浏览器导出", exact: true }).count(), 0);
  assert.equal(await link.getAttribute("href"), downloadUrl);
  await page.screenshot({ path: resolve(output, "hevc-download-prompt.jpg") });
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await link.click();
  const zip = await downloadPromise;
  const zipPath = resolve(output, "helper-0.7.zip");
  await zip.saveAs(zipPath);
  const sha256 = createHash("sha256").update(await readFile(zipPath)).digest("hex");
  const sums = await (await releaseResponse("https://3d-sticker-lab.vercel.app/helper/SHA256SUMS")).text();
  const entry = sums.trim().split(/\r?\n/).map(line => line.trim().split(/\s+/))
    .find(([, file]) => file.replace(/^\*/, "").split("/").at(-1) === "BingBing-Export-Helper-macOS.zip");
  assert.equal(entry?.[0], sha256);
  report.checks.push({ name: "实际点击统一下载入口、缺失助手与重新检测", manifest, sha256 });
  await page.close();
  console.log("通过助手 0.7 下载和 SHA256 校验");
  }

  await exportCase({ name: "coin-native-full-cycle", formats: ["mov", "apng"] });
  await exportCase({ name: "neon-native", component: "neon-border", width: 320, height: 180, duration: 1, formats: ["mov", "apng"] });
  await exportCase({ name: "coin-browser-fallback", width: 320, height: 180, duration: 1, fallback: true, formats: ["mov", "apng"] });
  await exportCase({ name: "coin-native-4k", width: 3840, height: 2160, duration: 0.2, formats: ["mov"], adaptive: false });
  await exportCase({ name: "coin-native-hevc", width: 320, height: 180, duration: 1, formats: ["hevc-alpha"] });
  await exportCase({ name: "paper-image-alpha", component: "paper-image", width: 320, height: 180, duration: 0.2, formats: ["apng"] });
  assert.deepEqual(errors, []);
  report.checks.push({ name: "所选页面导出完成且无页面异常", passed: true });
  console.log("本轮真实页面发布检查通过");
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify({ ...report, pageErrors: errors }, null, 2));
  await browser.close();
}
