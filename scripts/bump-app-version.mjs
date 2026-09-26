import { readFileSync, writeFileSync } from "node:fs"

const versionUrl = new URL("../app-version.txt", import.meta.url)
const previous = readFileSync(versionUrl, "utf8").trim()
const match = /^(\d{6})X([1-9]\d*)$/.exec(previous)
if (!match) throw new Error(`无效的网页版本号：${previous}`)

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date())
const datePart = (type) => parts.find((part) => part.type === type)?.value
const today = `${datePart("year")}${datePart("month")}${datePart("day")}`
const next = `${today}X${match[1] === today ? Number(match[2]) + 1 : 1}`

writeFileSync(versionUrl, `${next}\n`)
console.log(next)
