import assert from "node:assert/strict"
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

assert.equal(findVaguePattern("This is a robust platform."), vaguePatterns[7])
assert.equal(findVaguePattern("Run the command once."), undefined)
assert.equal(isIgnored("drafts/example.mdx"), true)
assert.equal(isIgnored("example.draft.mdx"), true)
assert.equal(isIgnored("index.mdx"), false)

for (const file of files) {
  const source = await readFile(file, "utf8")
  const name = relative(root, file)
  checkFrontmatter(name, source)
  checkHeadings(name, source)
  checkWriting(name, source)
  checkLinks(name, source)
  checkCommands(name, source)
}

const navRoutes = collectNavRoutes(config.navigation?.pages ?? [])
for (const route of navRoutes) {
  if (!routes.has(route)) fail("docs.json", `navigation page ${route} has no MDX file`)
}
for (const route of routes.keys()) {
  if (!navRoutes.has(route)) fail(relative(root, routes.get(route)), "page is missing from navigation")
}

const visibleConfig = JSON.stringify(config)
for (const placeholder of ["hi@mintlify.com", "app.mintlify.com", "x.com/mintlify", "github.com/mintlify", "Starter Kit"]) {
  if (visibleConfig.includes(placeholder)) fail("docs.json", `starter placeholder remains: ${placeholder}`)
}

await assertContract("use/agents", /runtime_whoami/)
await assertContract("use/agents", /runtime_list_computers/)
await assertContract("use/agents", /MCP preview is read-only/)
await forbidContract("use/agents", /MCP can create|MCP.*run commands|MCP.*chang(?:e|ing) files/i)
await assertContract("use/ssh", /SHA256:x\/Yv91AEM680Eq8RtKQEPQXoBLMbczOAS6kZX77AwyI/)
await assertContract("api-reference/overview", /https:\/\/www\.cool\.computer\/openapi\.json/)
if (config.name !== "Cool Computers Guide") fail("docs.json", "site name must be Cool Computers Guide")

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

function collectNavRoutes(items, found = new Set()) {
  for (const item of items) {
    if (typeof item === "string") found.add(item === "index" ? "/" : `/${item}`)
    else if (item?.pages) collectNavRoutes(item.pages, found)
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

function checkLinks(name, source) {
  const links = [
    ...[...source.matchAll(/\]\((\/[^)]+)\)/g)].map((match) => match[1]),
    ...[...source.matchAll(/\bhref="(\/[^"#?]+(?:[?#][^"]*)?)"/g)].map((match) => match[1]),
  ]
  for (const href of links) {
    const route = href.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/"
    if (!routes.has(route)) fail(name, `local link does not resolve: ${href}`)
  }
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

async function forbidContract(route, pattern) {
  const file = routes.get(`/${route}`)
  if (file && pattern.test(await readFile(file, "utf8"))) fail(route, `unsupported claim matched by ${pattern}`)
}

function fail(name, message) {
  failures.push(`${name}: ${message}`)
}
