import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const config = JSON.parse(await readFile(join(root, "docs.json"), "utf8"))
const ignoredPatterns = (await readFile(join(root, ".mintignore"), "utf8"))
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
const files = (await walk(root)).filter((file) => file.endsWith(".mdx") && !isIgnored(relative(root, file)))
const routes = new Map(files.map((file) => [routeFor(file), file]))
const sourceByFile = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])))
const failures = []

const vaguePatterns = [
  /\bserves as\b/i,
  /\bstands as\b/i,
  /\btestament to\b/i,
  /\bunderscores?\b/i,
  /\bhighlights? the importance\b/i,
  /\breflects? broader\b/i,
  /\bevolving landscape\b/i,
  /\b(pivotal|crucial|vital|groundbreaking|cutting-edge|seamless|robust|comprehensive|vibrant|profound)\b/i,
  /\bdelve\b/i,
  /\bunlock\b/i,
  /\belevate\b/i,
  /\bnot (just|only|merely)\b/i,
  /\bwhether you(?:'re| are)\b/i,
  /\bin today(?:'s|s)\b/i,
  /\bit(?:'s| is) important to note\b/i,
  /\bat its core\b/i,
  /\b(experts say|many believe)\b/i,
  /^#{1,6}\s+(why it matters|key takeaways|looking ahead|challenges and future)\s*$/im,
  /generated (with|by)|ai-assisted|written by (chatgpt|claude)/i,
]

assert.match(findVaguePattern("This is a robust platform.").source, /robust/)
assert.equal(findVaguePattern("Run the command once."), undefined)
assert.equal(withoutFencedCode("  ```sh\n  robust\n  ```").includes("robust"), false)
assert.equal(isIgnored("drafts/example.mdx"), true)
assert.equal(isIgnored("example.draft.mdx"), true)
assert.equal(isIgnored("index.mdx"), false)

for (const file of files) {
  const source = sourceByFile.get(file)
  const prose = withoutFencedCode(source)
  const name = relative(root, file)
  checkFrontmatter(name, source)
  checkHeadings(name, prose)
  checkWriting(name, prose)
  checkLinks(name, routeFor(file), prose)
  checkCommands(name, source)
}

const navRoutes = collectNavRoutes(config.navigation?.pages ?? [])
for (const route of navRoutes) {
  if (!routes.has(route)) fail("docs.json", `navigation page ${route} has no MDX file`)
}
for (const route of routes.keys()) {
  if (!navRoutes.has(route)) fail(relative(root, routes.get(route)), "page is missing from navigation")
}

const visibleContent = [JSON.stringify(config), ...sourceByFile.values()].join("\n")
for (const placeholder of ["hi@mintlify.com", "app.mintlify.com", "x.com/mintlify", "github.com/mintlify", "Starter Kit"]) {
  if (visibleContent.includes(placeholder)) fail("published guide", `starter placeholder remains: ${placeholder}`)
}

await assertContractTerms("use/agents", /\bcool_[a-z0-9_]+\b/g, ["cool_create_computer", "cool_list_computers", "cool_read_email", "cool_run_service", "cool_send_email", "cool_whoami"])
await assertContract("use/agents", /One-shot command execution and file transfer require the CLI or HTTP API/)
await assertContract("use/agents", /explicitly approved durable commands/)
await assertContract("api-reference/authentication", /New account creation is temporarily paused/)
await assertContract("getting-started/quickstart", /New account creation is temporarily paused/)
for (const [file, source] of sourceByFile) {
  if (/\bruntime_(?:whoami|list_computers)\b|MCP preview|(?:npm|pnpm|npx|pipx?|uv)\b[^\n]*\bcoolcomputer\b/.test(source)) {
    fail(relative(root, file), "obsolete MCP or package-install instructions remain")
  }
}
for (const route of ["", "getting-started/install", "use/cli", "api-reference/overview", "api-reference/authentication"]) {
  await assertContract(route, /^title: "[^"\n]*Cool Computers[^"\n]*"$/m)
}
await assertContract("use/ssh", /SHA256:x\/Yv91AEM680Eq8RtKQEPQXoBLMbczOAS6kZX77AwyI/)
await assertContract("api-reference/overview", /https:\/\/www\.cool\.computer\/openapi\.json/)
assert.deepEqual(collectOpenApiSources(config.navigation?.pages ?? []), ["https://www.cool.computer/openapi.json"])
if (config.name !== "Cool Computer Services") fail("docs.json", "site name must be Cool Computer Services")
if (JSON.stringify(config.colors) !== JSON.stringify({ primary: "#155DFF", light: "#6AA0FF", dark: "#1D69FF" })) fail("docs.json", "use the Cool Computers accent colors")
if (JSON.stringify(config.background?.color) !== JSON.stringify({ light: "#F3F4F6", dark: "#0E0F11" })) fail("docs.json", "use the Cool Computers page backgrounds")
if (JSON.stringify(config.logo) !== JSON.stringify({ light: "/logo-light.png", dark: "/logo-dark.png" })) fail("docs.json", "use the approved light and dark logos")
if (config.favicon !== "/favicon.png") fail("docs.json", "use the approved favicon")
if (config.icons?.library !== "lucide") fail("docs.json", "use the product icon library")

const brandImages = [
  ["logo-light.png", 848, 176, "c1266469ab084389388c37203279fba9a173c62f0c8490f1a018ef1018c057c7"],
  ["logo-dark.png", 848, 176, "b00144f9582866176e373fb553d4abc83854b95cc0d0c4d38d7dacd1767c7334"],
  ["favicon.png", 32, 32, "e283690f1fbcc23b34f35910f0eef008f5273b43e3537fc6895a18d62b2900b0"],
]
for (const [name, width, height, expectedHash] of brandImages) {
  const image = await readFile(join(root, name))
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail(name, "must be a PNG")
  if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) fail(name, `must be ${width}x${height}`)
  if (createHash("sha256").update(image).digest("hex") !== expectedHash) fail(name, "does not match the approved brand asset")
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"))
  process.exit(1)
}

console.log(`Checked ${files.length} guide pages, navigation, links, facts, commands, and writing rules.`)

async function walk(directory) {
  const entries = await readdir(directory)
  const nested = await Promise.all(entries.filter((entry) => !entry.startsWith(".") && entry !== "node_modules").map(async (entry) => {
    const path = join(directory, entry)
    return (await stat(path)).isDirectory() ? walk(path) : [path]
  }))
  return nested.flat()
}

function routeFor(file) {
  const route = relative(root, file).replace(/\.mdx$/, "").replaceAll("\\", "/")
  return route === "index" ? "/" : `/${route}`
}

function isIgnored(name) {
  const path = name.replaceAll("\\", "/")
  return ignoredPatterns.some((pattern) => {
    if (pattern.endsWith("/")) return path.startsWith(pattern)
    if (pattern.startsWith("*.") && !pattern.includes("/")) return path.endsWith(pattern.slice(1))
    return path === pattern
  })
}

function withoutFencedCode(source) {
  return source.replace(/^[ \t]*(?:```|~~~)[^\n]*\n[\s\S]*?^[ \t]*(?:```|~~~)\s*$/gm, "")
}

function collectNavRoutes(items, found = new Set()) {
  for (const item of items) {
    if (typeof item === "string") found.add(item === "index" ? "/" : `/${item}`)
    else if (item?.pages) collectNavRoutes(item.pages, found)
  }
  return found
}

function collectOpenApiSources(items, found = []) {
  for (const item of items) {
    if (typeof item !== "object" || !item) continue
    if (typeof item.openapi === "string") found.push(item.openapi)
    if (item.pages) collectOpenApiSources(item.pages, found)
  }
  return found
}

function checkFrontmatter(name, source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return fail(name, "missing YAML frontmatter")
  if (!/^title:\s+"[^"\n]+"$/m.test(match[1])) fail(name, "frontmatter needs a quoted title")
  if (!/^description:\s+"[^"\n]+"$/m.test(match[1])) fail(name, "frontmatter needs a quoted description")
}

function checkHeadings(name, source) {
  const headings = [...source.matchAll(/^(#{1,6})\s+(.+)$/gm)]
  if (headings.some((match) => match[1].length === 1)) fail(name, "use the frontmatter title instead of an H1")
  let previous = 1
  for (const heading of headings) {
    const level = heading[1].length
    if (level > previous + 1) fail(name, `heading level jumps before: ${heading[2]}`)
    previous = level
  }
}

function checkWriting(name, source) {
  if (source.includes("—")) fail(name, "replace the em dash with ordinary punctuation")
  const pattern = findVaguePattern(source)
  if (pattern) fail(name, `remove vague or canned wording matched by ${pattern}`)
}

function findVaguePattern(source) {
  return vaguePatterns.find((pattern) => pattern.test(source))
}

function checkLinks(name, currentRoute, source) {
  const links = [
    ...[...source.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].trim().split(/\s+/, 1)[0]),
    ...[...source.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]),
  ]
  for (const href of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) continue
    const target = new URL(href, `https://guide.local${currentRoute}`)
    const route = target.pathname.replace(/\/$/, "") || "/"
    if (!routes.has(route)) fail(name, `local link does not resolve: ${href}`)
    if (!target.hash || !routes.has(route)) continue
    const targetSource = sourceByFile.get(routes.get(route)) ?? ""
    const anchor = decodeURIComponent(target.hash.slice(1))
    if (!headingAnchors(withoutFencedCode(targetSource)).has(anchor)) fail(name, `local heading does not resolve: ${href}`)
  }
}

function headingAnchors(source) {
  return new Set([...source.matchAll(/^#{2,6}\s+(.+)$/gm)].map((match) => match[1]
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")))
}

function checkCommands(name, source) {
  const known = new Set(["--help", "api-keys", "capabilities", "create", "delete", "enter", "exec", "files", "goal", "info", "list", "login", "logout", "network", "run", "service", "signup", "ssh", "start", "stop", "whoami"])
  for (const match of source.matchAll(/^cool\s+(\S+)/gm)) {
    if (!known.has(match[1])) fail(name, `unknown cool command in example: ${match[1]}`)
  }
}

async function assertContract(route, pattern) {
  const file = routes.get(`/${route}`)
  if (!file || !pattern.test(await readFile(file, "utf8"))) fail(route, `missing required fact ${pattern}`)
}

async function assertContractTerms(route, pattern, expected) {
  const file = routes.get(`/${route}`)
  const source = file ? await readFile(file, "utf8") : ""
  const actual = [...new Set([...source.matchAll(pattern)].map((match) => match[0]))].sort()
  if (!file || actual.join("\n") !== expected.join("\n")) fail(route, `documented terms must equal ${expected.join(", ")}`)
}

function fail(name, message) {
  failures.push(`${name}: ${message}`)
}
