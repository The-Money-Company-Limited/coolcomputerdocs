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
const repositoryFiles = await walk(root)
const assetPaths = new Set(repositoryFiles.map((file) => `/${relative(root, file).replaceAll("\\", "/")}`))
const files = repositoryFiles.filter((file) => file.endsWith(".mdx") && !isIgnored(relative(root, file)))
const routes = new Map(files.map((file) => [routeFor(file), file]))
const sourceByFile = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])))
const failures = []
const setupSentence = "Read cool.computer/setup.md and make me a welcome page"
const chatTask = "make me a welcome page and put it on cool.computer"

const vaguePatterns = [
  /\bserves as\b/i,
  /\bstands as\b/i,
  /\btestament to\b/i,
  /\bunderscores?\b/i,
  /\bhighlights? the importance\b/i,
  /\breflects? broader\b/i,
  /\bevolving landscape\b/i,
  /^(additionally|furthermore|moreover|notably),/im,
  /\bplays? (an? |the )?(key|important|significant) role\b/i,
  /\bvaluable insights?\b/i,
  /\b(rich|intricate) tapestry\b/i,
  /\bboasts? (an? |the )\b/i,
  /\b(pivotal|crucial|vital|groundbreaking|cutting-edge|seamless|robust|comprehensive|vibrant|profound)\b/i,
  /\bdelve\b/i,
  /\bunlock\b/i,
  /\belevate\b/i,
  /\bnot (just|only|merely)\b/i,
  /\bwhether you(?:'re| are)\b/i,
  /\bin today(?:'s|s)\b/i,
  /\bit(?:'s| is) important to note\b/i,
  /\bat its core\b/i,
  /\b(in conclusion|in summary)\b/i,
  /\b(experts say|many believe)\b/i,
  /^#{1,6}\s+(why it matters|key takeaways|looking ahead|challenges and future)\s*$/im,
  /generated (with|by)|ai-assisted|written by (chatgpt|claude)/i,
]

assert.match(findVaguePattern("This is a robust platform.").source, /robust/)
assert.match(findVaguePattern("Additionally, it has an API.").source, /additionally/)
assert.match(findVaguePattern("It plays a key role.").source, /plays/)
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
  checkIcons(name, source)
  checkCommands(name, source)
  checkMcpServerName(name, source)
  checkAgentLinks(name, source)
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

const agentPages = [
  "agents/overview",
  "agents/claude-code",
  "agents/codex",
  "agents/cursor",
  "agents/pi",
  "agents/hermes",
  "agents/openclaw",
  "agents/claude",
  "agents/chatgpt",
  "agents/other-mcp-clients",
  "agents/cli",
  "agents/ssh",
]
const agentGroup = (config.navigation?.pages ?? []).find((item) => item?.group === "Connect your agent")
if (JSON.stringify(agentGroup?.pages) !== JSON.stringify(agentPages)) {
  fail("docs.json", `the "Connect your agent" group must list, in order: ${agentPages.join(", ")}`)
}
for (const page of agentPages) {
  const source = sourceByFile.get(routes.get(`/${page}`)) ?? ""
  if (!/^icon:\s+"[^"\n]+"$/m.test(frontmatter(source))) fail(page, "a Connect your agent page needs an icon")
  await assertContract(page, /^title: "[^"\n]*Cool Computers[^"\n]*"$/m)
}
for (const page of ["agents/claude-code", "agents/codex", "agents/cursor", "agents/pi", "agents/hermes", "agents/openclaw", "agents/other-mcp-clients", "getting-started/quickstart"]) {
  await assertContract(page, new RegExp(escapeRegExp(setupSentence)))
}
for (const page of ["agents/claude", "agents/chatgpt"]) {
  await assertContract(page, new RegExp(escapeRegExp(chatTask)))
}
await assertContract("", /href="\/agents\/overview"/)
await assertContract("agents/overview", /https:\/\/api\.cool\.computer\/mcp/)
await assertContract("agents/claude-code", /claude plugin install cool-computers --marketplace The-Money-Company-Limited\/cool-computers/)
await assertContract("agents/claude-code", /claude mcp add --scope user --transport http cool-computers https:\/\/api\.cool\.computer\/mcp/)
await assertContract("agents/codex", /codex plugin marketplace add The-Money-Company-Limited\/cool-computers && codex plugin add cool-computers@cool-computers/)
await assertContract("agents/codex", /codex mcp add cool-computers --url https:\/\/api\.cool\.computer\/mcp/)
await assertContract("agents/codex", /required = true/)
await assertContract("agents/cursor", /cursor\.com\/en\/install-mcp\?name=cool-computers&config=/)
await assertContract("agents/pi", /pi mcp add cool-computers --url https:\/\/api\.cool\.computer\/mcp && pi mcp login cool-computers/)
await assertContract("agents/hermes", /hermes mcp add cool-computers --url https:\/\/api\.cool\.computer\/mcp --auth oauth/)
await assertContract("agents/openclaw", /openclaw mcp set cool-computers '\{"url":"https:\/\/api\.cool\.computer\/mcp","transport":"streamable-http","auth":"oauth"\}' && openclaw mcp login cool-computers/)
await assertContract("agents/claude", /claude\.ai\/customize\/connectors\?modal=add-custom-connector/)
await assertContract("agents/chatgpt", /https:\/\/chatgpt\.com\/plugins/)
await assertContract("agents/cli", /curl -fsSL https:\/\/cool\.computer\/install\.sh \| sh/)
await assertContract("agents/cli", /irm https:\/\/cool\.computer\/install\.ps1 \| iex/)
await assertContract("agents/cli", /brew install the-money-company-limited\/tap\/cool/)
await assertContract("agents/cli", /rm -f ~\/\.local\/bin\/cool/)
await assertContract("agents/cli", /Remove-Item -LiteralPath \$executable -ErrorAction Stop/)
await assertContract("agents/cli", /RegistryValueOptions\]::DoNotExpandEnvironmentNames/)
await assertContract("agents/ssh", /ssh cool\.computer/)
await assertContract("api-reference/authentication", /same email-code flow for new and existing/)
await assertContract("getting-started/quickstart", /cool publish \.\/site --name bakery/)

const redirects = config.redirects ?? []
for (const { source, destination } of redirects) {
  if (routes.has(source)) fail("docs.json", `redirect source ${source} is still a page`)
  if (!routes.has(destination)) fail("docs.json", `redirect destination ${destination} has no page`)
}
for (const moved of ["/use/mcp", "/use/agents", "/use/ssh", "/getting-started/install"]) {
  if (!redirects.some((redirect) => redirect.source === moved)) fail("docs.json", `moved page ${moved} needs a redirect`)
}
for (const option of ["mcp", "cursor", "vscode"]) {
  if (config.contextual?.options?.includes(option)) fail("docs.json", `contextual option ${option} installs the documentation search server, not Cool Computers`)
}
for (const [file, source] of sourceByFile) {
  if (/\bruntime_(?:whoami|list_computers)\b|MCP preview|(?:npm|pnpm|npx|pipx?|uv)\b[^\n]*\bcoolcomputer\b/.test(source)) {
    fail(relative(root, file), "obsolete MCP or package-install instructions remain")
  }
  const prose = withoutFencedCode(source)
  if (
    /signup is paused|account creation is temporarily paused|invite[- ]only/i.test(prose)
    || /cold storage|computers?[^.!?\n]*\b(?:sleep|wake)s?\b|\b(?:sleep|wake)s?\b[^.!?\n]*computers?/i.test(prose)
    || /\bcool goal\b/.test(source)
  ) {
    fail(relative(root, file), "retired signup, lifecycle, or goal instructions remain")
  }
  if (/\bruntime-env\b|\bcool (?:run|capabilities)\b|\/api\/capabilities\b|creation opens|\bcool create\b[^.\n]*\bopens (?:a|the|its) (?:shell|terminal)/.test(source)) {
    fail(relative(root, file), "retired runtime-env, cool run, capabilities, or create-opens-a-shell instructions remain")
  }
}
for (const route of ["", "use/cli", "api-reference/overview", "api-reference/authentication"]) {
  await assertContract(route, /^title: "[^"\n]*Cool Computers[^"\n]*"$/m)
}
await assertContract("agents/ssh", /SHA256:x\/Yv91AEM680Eq8RtKQEPQXoBLMbczOAS6kZX77AwyI/)
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

function frontmatter(source) {
  return source.match(/^---\n([\s\S]*?)\n---\n/)?.[1]
}

function checkFrontmatter(name, source) {
  const fields = frontmatter(source)
  if (fields === undefined) return fail(name, "missing YAML frontmatter")
  if (!/^title:\s+"[^"\n]+"$/m.test(fields)) fail(name, "frontmatter needs a quoted title")
  if (!/^description:\s+"[^"\n]+"$/m.test(fields)) fail(name, "frontmatter needs a quoted description")
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
  if (/^cool login\s*$/m.test(source)) fail(name, "login examples require --email")
  const known = new Set([
    "--help", "agents", "api-keys", "billing", "browse", "browser", "chat", "claim", "comments", "completion", "copy", "create",
    "db", "delete", "docs", "domain", "email", "enter", "exec", "expose", "feedback", "files", "help", "info", "integrations",
    "list", "login", "logout", "logs", "network", "proxy", "publish", "releases", "secrets", "service", "share", "signup",
    "skill", "ssh", "ssh-keys", "stats", "switch", "terminal", "unexpose", "update", "url", "usage", "vm", "whoami",
  ])
  for (const match of source.matchAll(/^cool[ \t]+(\S+)/gm)) {
    if (!known.has(match[1])) fail(name, `unknown cool command in example: ${match[1]}`)
  }
}

function checkIcons(name, source) {
  const icons = [
    ...[...(frontmatter(source) ?? "").matchAll(/^icon:\s+"([^"\n]+)"$/gm)].map((match) => match[1]),
    ...[...source.matchAll(/\bicon="([^"]+)"/g)].map((match) => match[1]),
  ]
  for (const icon of icons) {
    if (icon.startsWith("/") && !assetPaths.has(icon)) fail(name, `icon file does not exist: ${icon}`)
  }
}

function checkMcpServerName(name, source) {
  for (const line of source.split("\n")) {
    if (/\bmcp (?:add|set)\b/.test(line) && !line.includes("cool-computers")) fail(name, `name the MCP server cool-computers: ${line.trim()}`)
  }
  if (/"cool"\s*:/.test(source)) fail(name, "name the MCP server cool-computers, not cool")
}

// Every prefilled prompt or install link must decode to the exact sentence, task, or server it promises.
function checkAgentLinks(name, source) {
  for (const [, href] of source.matchAll(/\bhref="([^"]+)"/g)) {
    let url
    try {
      url = new URL(href)
    } catch {
      continue
    }
    const [param, expected] = {
      "claude-cli:": ["q", setupSentence],
      "codex:": ["prompt", setupSentence],
    }[url.protocol] ?? {
      "cursor.com/link/prompt": ["text", setupSentence],
      "claude.ai/new": ["q", chatTask],
      "chatgpt.com/": ["q", chatTask],
    }[`${url.host}${url.pathname}`] ?? []
    if (param && url.searchParams.get(param) !== expected) fail(name, `prompt link must carry "${expected}": ${href}`)
    if (url.host === "cursor.com" && url.pathname.endsWith("/install-mcp")) {
      const config = Buffer.from(url.searchParams.get("config") ?? "", "base64").toString("utf8")
      if (url.searchParams.get("name") !== "cool-computers" || config !== '{"url":"https://api.cool.computer/mcp"}') fail(name, `Cursor install link does not add cool-computers: ${href}`)
    }
    if (url.searchParams.get("modal") === "add-custom-connector" && url.searchParams.get("connectorUrl") !== "https://api.cool.computer/mcp") {
      fail(name, `Claude connector link does not carry the MCP server: ${href}`)
    }
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function assertContract(route, pattern) {
  const file = routes.get(`/${route}`)
  if (!file || !pattern.test(await readFile(file, "utf8"))) fail(route, `missing required fact ${pattern}`)
}

function fail(name, message) {
  failures.push(`${name}: ${message}`)
}
