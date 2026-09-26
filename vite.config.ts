import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFileSync } from "node:fs"
import { nativeExportBridge } from "./scripts/native-export-bridge.mjs"

const run = promisify(execFile)

function buildVersion() {
  const version = readFileSync(new URL("./app-version.txt", import.meta.url), "utf8").trim()
  if (!/^\d{6}X[1-9]\d*$/.test(version)) {
    throw new Error(`无效的网页版本号：${version}`)
  }
  return version
}

function localFontsBridge(): Plugin {
  let catalog: Promise<string> | undefined
  return {
    name: "local-fonts-bridge",
    configureServer(server) {
      server.middlewares.use("/__local-fonts", (_request, response) => {
        catalog ??= run("xcrun", ["swift", "scripts/list-local-fonts.swift"], {
          cwd: process.cwd(),
          maxBuffer: 16 * 1024 * 1024,
        }).then(({ stdout }) => stdout);
        void catalog.then((body) => {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(body);
        }).catch((error: unknown) => {
          catalog = undefined;
          response.statusCode = 500;
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "无法读取本机字体" }));
        });
      });
    },
  }
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(buildVersion()),
  },
  plugins: [react(), localFontsBridge(), {
    name: "native-export-bridge",
    configureServer(server) {
      server.middlewares.use(nativeExportBridge())
    },
  }],
})
