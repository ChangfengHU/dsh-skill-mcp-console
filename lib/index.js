// src/service.ts
import { readFile as readFile6, rm as rm3 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join6 } from "node:path";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/install.ts
import { spawn } from "node:child_process";
import { cp, mkdir as mkdir2, mkdtemp, readdir as readdir2, readFile as readFile2, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";

// src/skills.ts
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

// src/tokens.ts
var CJK = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/u;
function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  for (const char of text) if (CJK.test(char)) cjk++;
  const rest = [...text].length - cjk;
  return cjk + Math.ceil(rest / 4);
}
function estimateToolTokens(tool) {
  const schema = tool.parameters === void 0 ? "" : JSON.stringify(tool.parameters);
  return estimateTokens(tool.name) + estimateTokens(tool.description ?? "") + estimateTokens(schema) + 8;
}
function formatTokens(count) {
  return count < 1e3 ? String(count) : `${(count / 1e3).toFixed(1)}k`;
}

// src/skills.ts
var ROOTS = [
  { rel: ".agents/skills", origin: "agents", native: true },
  { rel: ".dsh/skills", origin: "dsh", native: true },
  { rel: ".claude/skills", origin: "claude", native: false },
  { rel: ".codex/skills", origin: "codex", native: false },
  { rel: ".gemini/skills", origin: "gemini", native: false },
  { rel: ".opencode/skills", origin: "opencode", native: false }
];
var IGNORED = /* @__PURE__ */ new Set(["node_modules", ".git", ".DS_Store", ".dps-backup"]);
var MAX_FILE_BYTES = 256 * 1024;
function tildify(path, home) {
  return path === home || path.startsWith(home + sep) ? "~" + path.slice(home.length) : path;
}
function rootsFor(home, workspace) {
  const list = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (path, origin, native) => {
    const key = resolve(path);
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ path, origin, native });
  };
  if (workspace) push(join(workspace, ".agents", "skills"), "workspace", true);
  for (const root of ROOTS) push(join(home, root.rel), root.origin, root.native);
  return list;
}
function parseFrontmatter(text) {
  const out = { name: "", description: "", disableModel: false, userInvocable: true, raw: "", bodyStart: -1 };
  if (!text.startsWith("---")) return out;
  const close = text.indexOf("\n---", 3);
  if (close === -1) return out;
  const open = text.indexOf("\n") + 1;
  out.raw = text.slice(open, close + 1);
  out.bodyStart = close + 4;
  let key = null;
  const buf = [];
  const flush = () => {
    if (key) out[key] = buf.join(" ").trim().replace(/^["']|["']$/g, "");
    buf.length = 0;
  };
  for (const line of out.raw.split("\n")) {
    const match = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
    if (match) {
      flush();
      const [, field, value] = match;
      key = field === "name" || field === "description" ? field : null;
      if (field === "disable-model-invocation") out.disableModel = /^true$/i.test(value.trim());
      if (field === "user-invocable") out.userInvocable = !/^false$/i.test(value.trim());
      if (key && value && !/^[|>]/.test(value)) buf.push(value);
      continue;
    }
    if (key && /^\s+\S/.test(line)) buf.push(line.trim());
  }
  flush();
  return out;
}
function stateOf(front) {
  if (front.disableModel && !front.userInvocable) return "off";
  if (front.disableModel) return "user-only";
  return "on";
}
async function listFiles(dir, limit = 200) {
  const found = [];
  const walk = async (current) => {
    if (found.length >= limit) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      if (IGNORED.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(relative(dir, full));
    }
  };
  await walk(dir);
  found.sort((a, b) => a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b));
  return found;
}
async function newestMtime(dir, files) {
  let newest = 0;
  for (const rel of files.slice(0, 40)) {
    try {
      const info = await stat(join(dir, rel));
      if (info.mtimeMs > newest) newest = info.mtimeMs;
    } catch {
    }
  }
  return newest;
}
async function scanSkills(home = homedir(), workspace) {
  const rows = [];
  const winner = /* @__PURE__ */ new Map();
  for (const root of rootsFor(home, workspace)) {
    let entries;
    try {
      entries = await readdir(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
      const dir = join(root.path, entry.name);
      const files = await listFiles(dir);
      let front = { name: entry.name, description: "", disableModel: false, userInvocable: true, raw: "", bodyStart: -1 };
      let problem = null;
      if (!files.includes("SKILL.md")) {
        problem = "noSkillMd";
      } else {
        try {
          front = parseFrontmatter(await readFile(join(dir, "SKILL.md"), "utf8"));
          if (!front.name) problem = "noName";
          else if (front.name !== entry.name) problem = "nameMismatch";
          else if (!front.description) problem = "noDescription";
        } catch {
          problem = "unreadable";
        }
      }
      const state = stateOf(front);
      const active = state !== "off" && problem !== "noSkillMd" && problem !== "unreadable";
      const shadowedBy = active ? winner.get(entry.name) ?? null : null;
      if (active && !winner.has(entry.name)) winner.set(entry.name, tildify(root.path, home));
      rows.push({
        id: entry.name,
        name: front.name || entry.name,
        description: front.description,
        dir,
        root: tildify(root.path, home),
        origin: root.origin,
        native: root.native,
        state,
        // A skill the model cannot see costs nothing, whatever its
        // description says.
        tokens: state === "on" ? estimateTokens(front.description) : 0,
        updatedAt: await newestMtime(dir, files),
        files,
        problem,
        shadowedBy
      });
    }
  }
  return rows;
}
async function readSkillFile(dir, relPath) {
  const base = resolve(dir);
  const full = resolve(base, relPath);
  if (full !== base && !full.startsWith(base + sep)) throw new Error("path escapes the skill directory");
  const info = await stat(full);
  if (info.size > MAX_FILE_BYTES) return `(${Math.round(info.size / 1024)} KB \u2014 too large to open here)`;
  return readFile(full, "utf8");
}
function setKey(raw, key, value) {
  const lines = raw.split("\n");
  const index = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
  if (value === void 0) return index === -1 ? raw : lines.filter((_, i) => i !== index).join("\n");
  if (index === -1) return raw.replace(/\n?$/, `
${key}: ${value}
`).replace(/\n\n+$/, "\n");
  lines[index] = `${key}: ${value}`;
  return lines.join("\n");
}
function backupDir(dir) {
  return join(dir, ".dps-backup");
}
async function setSkillState(_home, dir, state) {
  const file = join(dir, "SKILL.md");
  const text = await readFile(file, "utf8");
  const front = parseFrontmatter(text);
  if (front.bodyStart === -1) throw new Error("SKILL.md has no frontmatter block to edit");
  const backups = backupDir(dir);
  await mkdir(backups, { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  await writeFile(join(backups, `SKILL.md.${stamp}`), text, "utf8");
  let raw = front.raw;
  raw = setKey(raw, "disable-model-invocation", state === "user-only" || state === "off" ? "true" : void 0);
  raw = setKey(raw, "user-invocable", state === "off" ? "false" : void 0);
  const body = text.slice(front.bodyStart);
  await writeFile(file, `---
${raw.replace(/\n+$/, "\n")}---${body}`, "utf8");
}
async function removeSkill(home, dir) {
  const trash = join(home, ".dsh", "skill-trash");
  await mkdir(trash, { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const target = join(trash, `${dir.split(sep).pop()}.${stamp}`);
  await rename(dir, target);
  return target;
}

// src/install.ts
function isSafeSkillName(name2) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name2) && name2 !== "." && name2 !== "..";
}
var STEP_TIMEOUT_MS = 18e4;
var MAX_FETCH_BYTES = 40 * 1024 * 1024;
function run(command, args, cwd) {
  return new Promise((resolve2) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const take = (chunk) => {
      if (out.length < 2e5) out += chunk.toString("utf8");
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      out += `
(timed out after ${STEP_TIMEOUT_MS / 1e3}s)`;
    }, STEP_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve2({ code: -1, out: out + String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve2({ code: code ?? -1, out });
    });
  });
}
async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} \u2014 ${url}`);
  const text = await response.text();
  if (text.length > MAX_FETCH_BYTES) throw new Error("response too large");
  return text;
}
async function fetchFile(url, dest) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} \u2014 ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error("response too large");
  await writeFile2(dest, buffer);
  return buffer.byteLength;
}
function detect(input) {
  const text = input.trim();
  const gitClone = /^git\s+clone\s+(\S+)/.exec(text);
  if (gitClone) {
    const repo2 = parseRepo(gitClone[1]);
    return { kind: "git", label: `git clone \xB7 ${repo2 ? `${repo2.owner}/${repo2.repo}` : gitClone[1]}`, source: gitClone[1], plan: `git clone --depth 1 ${gitClone[1]} <tmp>`, candidates: [] };
  }
  const shell = /^(bash|sh|zsh)\s|^curl\s|\|\s*(bash|sh)\b|<\(/.test(text);
  if (shell) {
    const url = /(https?:\/\/[^\s'"()]+)/.exec(text);
    return { kind: "shell", label: "\u5B89\u88C5\u811A\u672C \xB7 install script", source: url?.[1] ?? "", plan: text, candidates: [] };
  }
  const repo = parseRepo(text);
  if (repo) {
    return {
      kind: "github",
      label: `GitHub \xB7 ${repo.owner}/${repo.repo}${repo.sub ? `/${repo.sub}` : ""}`,
      source: `${repo.owner}/${repo.repo}`,
      ref: repo.ref,
      sub: repo.sub,
      plan: `curl -fsSL https://codeload.github.com/${repo.owner}/${repo.repo}/tar.gz/${repo.ref ?? "HEAD"} | tar xz`,
      candidates: []
    };
  }
  if (/^https?:\/\//.test(text)) {
    const zip = /\.(zip|tgz|tar\.gz)(\?|$)/.test(text);
    return { kind: zip ? "archive" : "file", label: zip ? "\u538B\u7F29\u5305 \xB7 archive" : "SKILL.md \xB7 direct file", source: text, plan: `curl -fsSL ${text}`, candidates: [] };
  }
  return { kind: "shell", label: "\u672A\u8BC6\u522B,\u6309\u547D\u4EE4\u6267\u884C \xB7 unrecognised, run as a command", source: "", plan: text, candidates: [] };
}
function parseRepo(text) {
  const cleaned = text.replace(/^github:/, "").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  if (parts.length < 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+$/.test(parts[1])) return null;
  const ref = { owner: parts[0], repo: parts[1] };
  if (parts[2] === "tree" && parts[3]) {
    ref.ref = parts[3];
    if (parts.length > 4) ref.sub = parts.slice(4).join("/");
  } else if (parts.length > 2) {
    ref.sub = parts.slice(2).join("/");
  }
  return ref;
}
async function findSkills(root, depth = 4, limit = 300, repoName = "") {
  const found = [];
  const walk = async (dir, rel, left) => {
    if (found.length >= limit) return;
    let entries;
    try {
      entries = await readdir2(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      const front = parseFrontmatter(await readFile2(join2(dir, "SKILL.md"), "utf8").catch(() => ""));
      const name2 = front.name || rel.split("/").filter(Boolean).pop() || repoName || "";
      if (!isSafeSkillName(name2)) return;
      found.push({ path: rel || ".", name: name2, description: front.description });
      return;
    }
    if (left <= 0) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      await walk(join2(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name, left - 1);
    }
  };
  await walk(root, "", depth);
  found.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}
async function stage(plan) {
  const dir = await mkdtemp(join2(tmpdir(), "dps-install-"));
  let log = "";
  if (plan.kind === "github") {
    const url = `https://codeload.github.com/${plan.source}/tar.gz/${plan.ref ?? "HEAD"}`;
    const tarball = join2(dir, "src.tgz");
    log += `\u2192 fetch ${url}
`;
    const size = await fetchFile(url, tarball);
    log += `  ${Math.round(size / 1024)} KB
\u2192 extract
`;
    const extract = join2(dir, "src");
    await mkdir2(extract, { recursive: true });
    const result = await run("tar", ["xzf", tarball, "-C", extract, "--strip-components=1"]);
    log += result.out;
    if (result.code !== 0) throw new Error(`tar exited ${result.code}
${result.out}`);
    const base = plan.sub ? join2(extract, plan.sub) : extract;
    const repoName = (plan.sub || plan.source).split("/").pop() ?? "";
    return { dir, candidates: await findSkills(base, 4, 300, repoName.replace(/\.(skill|git)$/i, "")), log };
  }
  if (plan.kind === "git") {
    log += `\u2192 git clone --depth 1 ${plan.source}
`;
    const extract = join2(dir, "src");
    const result = await run("git", ["clone", "--depth", "1", plan.source, extract]);
    log += result.out;
    if (result.code !== 0) throw new Error(`git exited ${result.code}
${result.out}`);
    return { dir, candidates: await findSkills(extract, 4, 300, (plan.source.split("/").pop() ?? "").replace(/\.git$/i, "")), log };
  }
  if (plan.kind === "archive") {
    const archive = join2(dir, "src.tgz");
    log += `\u2192 fetch ${plan.source}
`;
    const size = await fetchFile(plan.source, archive);
    log += `  ${Math.round(size / 1024)} KB
\u2192 extract
`;
    const extract = join2(dir, "src");
    await mkdir2(extract, { recursive: true });
    const zip = /\.zip(\?|$)/.test(plan.source);
    const result = zip ? await run("unzip", ["-q", archive, "-d", extract]) : await run("tar", ["xzf", archive, "-C", extract]);
    log += result.out;
    if (result.code !== 0) throw new Error(`extract exited ${result.code}
${result.out}`);
    return { dir, candidates: await findSkills(extract), log };
  }
  if (plan.kind === "file") {
    log += `\u2192 fetch ${plan.source}
`;
    const text = await fetchText(plan.source);
    const front = parseFrontmatter(text);
    const name2 = front.name || "downloaded-skill";
    const skillDir = join2(dir, "src", name2);
    await mkdir2(skillDir, { recursive: true });
    await writeFile2(join2(skillDir, "SKILL.md"), text, "utf8");
    log += `  ${text.length} bytes \u2192 ${name2}/SKILL.md
`;
    return { dir, candidates: await findSkills(join2(dir, "src")), log };
  }
  return { dir, candidates: [], log };
}
async function peek(plan) {
  if (plan.kind === "shell" && plan.source) return fetchText(plan.source);
  if (plan.kind === "github") return plan.plan;
  return plan.plan;
}
async function place(stageDir, chosen, target) {
  let log = "";
  await mkdir2(target, { recursive: true });
  for (const candidate of chosen) {
    if (!isSafeSkillName(candidate.name)) throw new Error(`refusing to install under the name ${JSON.stringify(candidate.name)}`);
    const from = candidate.path === "." ? join2(stageDir, "src") : join2(stageDir, "src", candidate.path);
    const to = join2(target, candidate.name);
    await rm2(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true });
    log += `\u2192 ${candidate.name} \u2192 ${to}
`;
  }
  return log;
}
async function runShell(command, cwd) {
  return run("bash", ["-c", command], cwd);
}
async function cleanup(dir) {
  await rm2(dir, { recursive: true, force: true }).catch(() => {
  });
}
async function verify(dir, registryNames) {
  const checks = [];
  const name2 = dir.split("/").pop() ?? "";
  let text = "";
  try {
    text = await readFile2(join2(dir, "SKILL.md"), "utf8");
    checks.push({ key: "skillMd", ok: true, detail: "" });
  } catch {
    checks.push({ key: "skillMd", ok: false, detail: dir });
    return checks;
  }
  const front = parseFrontmatter(text);
  checks.push({
    key: "frontmatter",
    ok: Boolean(front.name && front.description),
    detail: front.name ? front.description ? "" : "description" : "name"
  });
  let scripts = 0;
  let executable = 0;
  try {
    const entries = await readdir2(join2(dir, "scripts"), { withFileTypes: true });
    const { stat: stat3 } = await import("node:fs/promises");
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(sh|py|mjs)$/.test(entry.name)) continue;
      scripts++;
      const info = await stat3(join2(dir, "scripts", entry.name));
      if (info.mode & 73) executable++;
    }
  } catch {
  }
  checks.push({ key: "executable", ok: scripts === 0 || executable === scripts, detail: scripts === 0 ? "none" : `${executable}/${scripts}` });
  const registered = registryNames.includes(name2);
  checks.push({
    key: "registry",
    ok: registered,
    detail: registered ? "" : front.name && front.name !== name2 ? `${front.name} \u2260 ${name2}` : name2
  });
  return checks;
}
async function createSkill(target, name2, description, instructions) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name2)) throw new Error("name must be kebab-case: lowercase letters, digits and hyphens");
  const dir = join2(target, name2);
  await mkdir2(dir, { recursive: true });
  const front = `---
name: ${name2}
description: ${description.replace(/\n+/g, " ").trim()}
---

`;
  await writeFile2(join2(dir, "SKILL.md"), front + instructions.trim() + "\n", "utf8");
  return dir;
}
async function uploadSkill(target, filename, base64) {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error("file too large");
  const dir = await mkdtemp(join2(tmpdir(), "dps-upload-"));
  try {
    if (/\.md$/i.test(filename)) {
      const text = buffer.toString("utf8");
      const front = parseFrontmatter(text);
      const name2 = front.name;
      if (!name2) throw new Error("the .md file needs `name` and `description` in its YAML frontmatter");
      const skillDir = join2(target, name2);
      await mkdir2(skillDir, { recursive: true });
      await writeFile2(join2(skillDir, "SKILL.md"), text, "utf8");
      return skillDir;
    }
    const archive = join2(dir, filename);
    await writeFile2(archive, buffer);
    const extract = join2(dir, "src");
    await mkdir2(extract, { recursive: true });
    const zip = /\.zip$/i.test(filename);
    const result = zip ? await run("unzip", ["-q", archive, "-d", extract]) : await run("tar", ["xzf", archive, "-C", extract]);
    if (result.code !== 0) throw new Error(`extract failed: ${result.out}`);
    const candidates = await findSkills(extract);
    if (candidates.length === 0) throw new Error("no SKILL.md found in the archive");
    const first = candidates[0];
    const from = first.path === "." ? extract : join2(extract, first.path);
    const to = join2(target, first.name);
    await rm2(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true });
    return to;
  } finally {
    await cleanup(dir);
  }
}

// src/mcpconfig.ts
import { copyFile, mkdir as mkdir3, readFile as readFile3, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname2, join as join3 } from "node:path";
import { isMap, isSeq, parseDocument, YAMLSeq } from "yaml";
var MCP_CLIENT_MODULE = "@deepseek-ai/dsh-mcp-client";
var FIBER_PHASE = {
  "0": "pending",
  "1": "loading",
  "2": "active",
  "3": "failed",
  "4": "disposed",
  "5": "unloading"
};
function phaseOf(fiber) {
  if (fiber === void 0 || fiber === null) return null;
  const phase = FIBER_PHASE[String(fiber.state)] ?? String(fiber.state);
  return phase === "active" ? null : phase;
}
var PASSTHROUGH = ["headers", "env", "toolCallTimeoutMs", "failOnStartupError", "cwd"];
async function loadPatch(file) {
  let text = "";
  try {
    text = await readFile3(file, "utf8");
  } catch {
    text = "[]\n";
  }
  const doc = parseDocument(text);
  if (!isSeq(doc.contents)) doc.contents = new YAMLSeq();
  return doc;
}
function mcpEntries(doc) {
  const found = [];
  const scan = (seq) => {
    for (const item of seq.items) {
      if (!isMap(item)) continue;
      const insert = item.get("insert", true);
      if (isSeq(insert)) {
        scan(insert);
        continue;
      }
      if (item.get("name") === MCP_CLIENT_MODULE) found.push({ node: item, owner: seq });
    }
  };
  scan(doc.contents);
  return found;
}
function nameOf(node) {
  const config = node.get("config", true);
  const serverName = isMap(config) ? config.get("serverName") : void 0;
  return typeof serverName === "string" ? serverName : String(node.get("id") ?? "");
}
async function toUniversal(file, mask = true) {
  const doc = await loadPatch(file);
  const servers = {};
  for (const { node } of mcpEntries(doc)) {
    const config = node.get("config", true);
    const plain = isMap(config) ? config.toJSON() : {};
    const out = {};
    if (typeof plain.url === "string") {
      out.type = "http";
      out.url = plain.url;
    } else {
      out.type = "stdio";
      if (plain.command !== void 0) out.command = plain.command;
      if (plain.args !== void 0) out.args = plain.args;
    }
    for (const key of PASSTHROUGH) {
      if (plain[key] === void 0) continue;
      const value = plain[key];
      out[key] = mask && (key === "headers" || key === "env") && value && typeof value === "object" ? Object.fromEntries(Object.keys(value).map((k) => [k, "\u2022\u2022\u2022\u2022\u2022\u2022"])) : value;
    }
    if (node.get("disabled") === true) out.disabled = true;
    servers[nameOf(node)] = out;
  }
  return servers;
}
function configFor(name2, server, previous) {
  const config = { serverName: name2 };
  if (server.url) {
    config.transport = "streamable-http";
    config.url = server.url;
  } else {
    if (server.command !== void 0) config.command = server.command;
    if (server.args !== void 0) config.args = server.args;
  }
  for (const key of PASSTHROUGH) {
    if (server[key] === void 0) continue;
    let value = server[key];
    if ((key === "headers" || key === "env") && value && typeof value === "object") {
      const previousBag = previous?.[key] ?? {};
      value = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^•+$/.test(v) && previousBag[k] !== void 0 ? previousBag[k] : v]));
    }
    config[key] = value;
  }
  return config;
}
async function backup(file) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const target = join3(dirname2(file), `cordis.patch.yml.dps-${stamp}`);
  await copyFile(file, target).catch(() => {
  });
  return target;
}
async function fromUniversal(file, servers) {
  const backupPath = await backup(file);
  const doc = await loadPatch(file);
  const existing = new Map(mcpEntries(doc).map((entry) => [nameOf(entry.node), entry]));
  const added = [];
  const updated = [];
  const removed = [];
  for (const [name2, server] of Object.entries(servers)) {
    const hit = existing.get(name2);
    if (hit) {
      const previousConfig = hit.node.get("config", true);
      const previous = isMap(previousConfig) ? previousConfig.toJSON() : void 0;
      hit.node.set("config", doc.createNode(configFor(name2, server, previous)));
      if (server.disabled) hit.node.set("disabled", true);
      else hit.node.delete("disabled");
      updated.push(name2);
      existing.delete(name2);
      continue;
    }
    const entry = {
      id: `mcp-${name2}`.replace(/[^A-Za-z0-9_-]/g, "-"),
      name: MCP_CLIENT_MODULE,
      config: configFor(name2, server)
    };
    if (server.disabled) entry.disabled = true;
    insertInto(doc, entry);
    added.push(name2);
  }
  for (const [name2, entry] of existing) {
    const index = entry.owner.items.indexOf(entry.node);
    if (index >= 0) entry.owner.items.splice(index, 1);
    removed.push(name2);
  }
  await writeFile3(file, doc.toString({ lineWidth: 0 }), "utf8");
  return { added, updated, removed, backup: backupPath };
}
function insertInto(doc, entry) {
  const root = doc.contents;
  for (const item of root.items) {
    if (!isMap(item)) continue;
    const insert = item.get("insert", true);
    if (isSeq(insert)) {
      insert.items.push(doc.createNode(entry));
      return;
    }
  }
  root.items.push(doc.createNode({ insert: [entry] }));
}
async function setDisabled(file, name2, disabled) {
  const backupPath = await backup(file);
  const doc = await loadPatch(file);
  for (const { node } of mcpEntries(doc)) {
    if (nameOf(node) !== name2) continue;
    if (disabled) node.set("disabled", true);
    else node.delete("disabled");
    await writeFile3(file, doc.toString({ lineWidth: 0 }), "utf8");
    return backupPath;
  }
  throw new Error(`no MCP entry named ${name2} in the patch layer`);
}
async function setEntryDisabled2(file, entryId, disabled) {
  const backupPath = await backup(file);
  const doc = await loadPatch(file);
  const found = findEntry(doc.contents, entryId);
  if (found) {
    if (disabled) found.set("disabled", true);
    else found.delete("disabled");
  } else if (disabled) {
    ;
    doc.contents.add(doc.createNode({ id: entryId, disabled: true }));
  } else {
    return backupPath;
  }
  await writeFile3(file, doc.toString({ lineWidth: 0 }), "utf8");
  return backupPath;
}
function findEntry(seq, entryId) {
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    const insert = item.get("insert", true);
    if (isSeq(insert)) {
      const nested = findEntry(insert, entryId);
      if (nested) return nested;
      continue;
    }
    if (String(item.get("id") ?? "") === entryId) return item;
  }
  return null;
}
function policyPath(home) {
  return join3(home, ".dsh", "plugin-station-tools.json");
}
async function readToolPolicy(home) {
  try {
    return JSON.parse(await readFile3(policyPath(home), "utf8"));
  } catch {
    return {};
  }
}
async function writeToolPolicy(home, policy) {
  await mkdir3(dirname2(policyPath(home)), { recursive: true });
  await writeFile3(policyPath(home), JSON.stringify(policy, null, 2), "utf8");
}

// src/service.ts
import { spawn as spawn2 } from "node:child_process";

// src/catalog.ts
import { mkdir as mkdir4, readFile as readFile4, stat as stat2, writeFile as writeFile4 } from "node:fs/promises";
import { dirname as dirname3, join as join4 } from "node:path";
var CATALOG_URL = "https://awesome-dsh-plugin.com/plugins.json";
var MAX_AGE_MS = 6 * 60 * 60 * 1e3;
var FEATURED = [
  { key: "dsh-plugin-station", why: "featuredStation" },
  { key: "dsh-codex-claude-cli", why: "featuredCodex" },
  { key: "dsh-better-sidebar", why: "featuredSidebar" },
  { key: "modlens", why: "featuredModlens" },
  { key: "dsh-context", why: "featuredContext" }
];
var OWN = [
  {
    name: "dsh-plugin-station",
    full: "ChangfengHU/dsh-plugin-station",
    repo: "ChangfengHU/dsh-plugin-station",
    owner: "ChangfengHU",
    url: "https://github.com/ChangfengHU/dsh-plugin-station",
    category: "market",
    description: "\u6280\u80FD\u3001MCP\u3001\u4EE3\u7801\u63D2\u4EF6\u4E0E\u63D2\u4EF6\u5E02\u573A\u56DB\u5408\u4E00\uFF1A\u5F71\u5B50\u6280\u80FD\u68C0\u6D4B\u3001MCP \u5DE5\u5177\u7EA7\u5F00\u5173\u3001\u6309\u5305\u5206\u7EC4\u7684\u63D2\u4EF6\u7BA1\u7406\u3001\u88C5\u5B8C\u4E00\u952E\u91CD\u542F\u751F\u6548\u3002",
    npm: null,
    tarball: null,
    stars: 0,
    adjusted: 0,
    siblings: 1,
    downloads: 0,
    added: "2026-08-27",
    spec: "github:ChangfengHU/dsh-plugin-station",
    installable: true,
    score: 100
  },
  {
    name: "dsh-codex-claude-cli",
    full: "ChangfengHU/dsh-codex-claude-cli",
    repo: "ChangfengHU/dsh-codex-claude-cli",
    owner: "ChangfengHU",
    url: "https://github.com/ChangfengHU/dsh-codex-claude-cli",
    category: "model",
    description: "\u628A\u672C\u673A\u5DF2\u767B\u5F55\u7684 codex CLI \u5F53\u4F5C Harness \u7684\u6A21\u578B\u8DEF\u7531\uFF1B\u4FEE\u597D\u4E86\u4E0E Codex \u4FDD\u7559\u524D\u7F00\u51B2\u7A81\u7684 MCP \u5DE5\u5177\u540D,\u5DE5\u5177\u8C03\u7528\u771F\u80FD\u7528\u3002",
    npm: null,
    tarball: null,
    stars: 0,
    adjusted: 0,
    siblings: 1,
    downloads: 0,
    added: "2026-08-27",
    spec: "github:ChangfengHU/dsh-codex-claude-cli",
    installable: true,
    score: 100
  }
];
var PAGE_SIZE = 24;
function cachePath(home) {
  return join4(home, ".dsh", "plugin-station-catalog.json");
}
function repoOf(name2) {
  return name2.split("#")[0] ?? name2;
}
function logScore(value, ceiling) {
  if (value <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(value + 1) / Math.log10(ceiling) * 100));
}
function normalize(raw) {
  const list = raw?.plugins;
  if (!Array.isArray(list)) return [];
  const siblings = /* @__PURE__ */ new Map();
  for (const item of list) {
    const name2 = typeof item.name === "string" ? item.name : "";
    if (!name2) continue;
    const repo = repoOf(name2);
    siblings.set(repo, (siblings.get(repo) ?? 0) + 1);
  }
  const rows = [];
  for (const item of list) {
    const name2 = typeof item.name === "string" ? item.name : "";
    if (!name2) continue;
    const repo = repoOf(name2);
    const family = siblings.get(repo) ?? 1;
    const stars = typeof item.stars === "number" ? item.stars : 0;
    const downloads = typeof item.downloads === "number" ? item.downloads : 0;
    const isExample = /(^|[/#])(examples?|demos?|samples?)\//i.test(name2);
    const adjusted = isExample ? 0 : Math.round(stars / family);
    const starScore = logScore(adjusted, 4e3);
    const downloadScore = logScore(downloads, 22e4);
    const install = typeof item.install === "string" ? item.install : "";
    rows.push({
      name: name2.split("#").pop()?.split("/").pop() || name2,
      full: name2,
      repo,
      owner: typeof item.owner === "string" ? item.owner : "",
      url: typeof item.url === "string" ? item.url : "",
      category: typeof item.category === "string" ? item.category : "",
      description: String(item.description?.zh || item.description?.en || ""),
      npm: typeof item.npm === "string" ? item.npm : null,
      tarball: typeof item.tarball === "string" ? item.tarball : null,
      stars,
      adjusted,
      siblings: family,
      downloads,
      added: typeof item.added === "string" ? item.added : "",
      // What a person would actually type. The upstream `install` line is
      // profile-specific text; the specifier is the part that transfers.
      spec: specOf(item),
      installable: Boolean(item.npm) || Boolean(item.url) || install !== "",
      // Downloads weigh most because they are the one signal a monorepo
      // cannot inflate; stars still count, adjusted, because 57% of entries
      // have no downloads at all and would otherwise be unrankable.
      score: Math.round(starScore * 0.4 + downloadScore * 0.6)
    });
  }
  return rows;
}
function specOf(item) {
  if (typeof item.npm === "string" && item.npm) return item.npm;
  const url = typeof item.url === "string" ? item.url : "";
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url);
  if (match) return `github:${match[1]}`;
  return "";
}
async function loadCatalog(home, fetchImpl = fetch) {
  const path = cachePath(home);
  try {
    const info = await stat2(path);
    if (Date.now() - info.mtimeMs < MAX_AGE_MS) {
      return JSON.parse(await readFile4(path, "utf8"));
    }
  } catch {
  }
  try {
    const response = await fetchImpl(CATALOG_URL, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const rows = normalize(await response.json());
    await mkdir4(dirname3(path), { recursive: true });
    await writeFile4(path, JSON.stringify(rows), "utf8");
    return rows;
  } catch (cause) {
    try {
      return JSON.parse(await readFile4(path, "utf8"));
    } catch {
      throw cause;
    }
  }
}
function page(rows, query, declared, live = declared) {
  const needle = (query.query ?? "").trim().toLowerCase();
  const known = new Set(rows.map((row) => row.name));
  const all = [...rows, ...OWN.filter((row) => !known.has(row.name))];
  if (query.featured) {
    const byName = new Map(all.map((row) => [row.npm ?? row.name, row]));
    const alsoByName = new Map(all.map((row) => [row.name, row]));
    const picks = [];
    for (const { key, why } of FEATURED) {
      const found = byName.get(key) ?? alsoByName.get(key);
      if (found) picks.push({ ...found, why });
    }
    return {
      entries: picks.map((row) => {
        const key = row.npm ?? row.name;
        const has = declared.has(key) || declared.has(row.name);
        return { ...row, installed: has, active: has && (live.has(key) || live.has(row.name)) };
      }),
      total: picks.length,
      page: 0,
      pages: 1,
      categories: [...new Set(all.map((row) => row.category).filter(Boolean))].sort(),
      catalogTotal: all.length
    };
  }
  let list = all.filter((row) => {
    if (query.category && query.category !== "all" && row.category !== query.category) return false;
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle) || row.owner.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle);
  });
  if (query.group !== false && !needle) {
    const kept = /* @__PURE__ */ new Map();
    list = list.slice().sort((a, b) => b.score - a.score).filter((row) => {
      if (row.siblings <= 1) return true;
      const count = kept.get(row.repo) ?? 0;
      if (count >= 2) return false;
      kept.set(row.repo, count + 1);
      return true;
    });
  }
  const sorters = {
    score: (a, b) => b.score - a.score,
    downloads: (a, b) => b.downloads - a.downloads,
    stars: (a, b) => b.adjusted - a.adjusted,
    recent: (a, b) => b.added.localeCompare(a.added)
  };
  list = list.slice().sort(sorters[query.sort ?? "score"]);
  const total = list.length;
  const pageIndex = Math.max(0, query.page ?? 0);
  const slice = list.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
  const categories = [...new Set(all.map((row) => row.category).filter(Boolean))].sort();
  return {
    entries: slice.map((row) => {
      const key = row.npm ?? row.name;
      const has = declared.has(key) || declared.has(row.name);
      return { ...row, installed: has, active: has && (live.has(key) || live.has(row.name)) };
    }),
    total,
    page: pageIndex,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    categories,
    catalogTotal: all.length
  };
}

// src/plugins.ts
import { readFile as readFile5 } from "node:fs/promises";
import { join as join5 } from "node:path";
var HOST_SCOPE = "@deepseek-ai/";
async function readJson(path) {
  try {
    return JSON.parse(await readFile5(path, "utf8"));
  } catch {
    return null;
  }
}
function packageOf(module) {
  const parts = module.split("/");
  if (module.startsWith("@")) return parts.slice(0, 2).join("/");
  return parts[0] ?? module;
}
async function collectPackages(profileDir2, entries) {
  const profile = await readJson(join5(profileDir2, "package.json"));
  const declared = Object.entries(profile?.dependencies ?? {}).filter(([name2]) => !name2.startsWith(HOST_SCOPE));
  const byPackage = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const owner = packageOf(entry.module);
    const list = byPackage.get(owner) ?? [];
    list.push(entry);
    byPackage.set(owner, list);
  }
  const installed = [];
  for (const [name2, spec] of declared) {
    const manifest = await readJson(join5(profileDir2, "node_modules", name2, "package.json"));
    const own = byPackage.get(name2) ?? [];
    installed.push({
      name: name2,
      version: typeof manifest?.version === "string" ? manifest.version : null,
      description: typeof manifest?.description === "string" ? manifest.description : "",
      // The dependency spec is the honest answer to "where did this come
      // from" — `github:owner/repo`, a tarball URL, `link:`, or a range.
      source: typeof spec === "string" ? spec : "",
      // A package with no `dsh.bundle` is a plain dependency someone added,
      // not a plugin, and saying so beats rendering it as a broken one.
      bundled: Boolean(manifest?.dsh?.bundle),
      hasClient: Boolean(manifest?.dsh?.client),
      entries: own.sort((a, b) => a.id.localeCompare(b.id))
    });
    byPackage.delete(name2);
  }
  let builtinEntries = 0;
  for (const list of byPackage.values()) builtinEntries += list.length;
  installed.sort((a, b) => a.name.localeCompare(b.name));
  return { installed, builtinEntries, builtinPackages: byPackage.size };
}

// src/service.ts
var TOOL_PREFIX = /^mcp__(.+?)__(.+)$/;
function defaultRoot(home) {
  return join6(home, ".agents", "skills");
}
function profileName(argv = process.argv) {
  const flag = argv.indexOf("--profile");
  const next = flag >= 0 ? argv[flag + 1] : void 0;
  if (next && !next.startsWith("-")) return next;
  const inline = argv.find((a) => a.startsWith("--profile="));
  return inline ? inline.slice("--profile=".length) : "web";
}
function profileDir(home, profile = profileName()) {
  return join6(home, ".dsh", "profiles", profile);
}
function patchFile(home, profile = profileName()) {
  return join6(profileDir(home, profile), "cordis.patch.yml");
}
var SAFE_PACKAGE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
function dshPlugin(args, timeoutMs = 42e4) {
  const launcher = process.argv[1];
  if (!launcher) throw new Error("cannot locate the dsh launcher this Host booted from");
  return new Promise((resolve2) => {
    const child = spawn2(
      process.execPath,
      [launcher, "plugin", "--profile", profileName(), ...args],
      { cwd: profileDir(homedir2()), stdio: ["ignore", "pipe", "pipe"] }
    );
    let log = "";
    const take = (chunk) => {
      log += chunk.toString("utf8");
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      log += "\ntimed out";
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve2({ code: -1, log: `${log}
${String(error)}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve2({ code: code ?? -1, log: log.slice(-8e3) });
    });
  });
}
var SKILL_TOPICS = ["agent-skills", "claude-skills", "claude-skill", "agent-skill", "skill-md"];
var PluginStationService = class extends TypertRemoteService {
  static inject = ["loader", "tools"];
  /** Staged install directories, keyed by the token handed to the client. */
  staged = /* @__PURE__ */ new Map();
  stageSeq = 0;
  /**
   * The last scan, reused for a moment.
   *
   * A scan walks every root and stats every file in every skill. Clicking
   * through a skill's file tree was doing that once per click just to check
   * the directory is one we know about — twenty directories re-walked to
   * answer a question the previous scan already answered. Two seconds is long
   * enough to cover a burst of clicks and short enough that an edit made in
   * an editor still shows up on the next look.
   */
  scanCache = null;
  /** The specifier currently being installed, if any. See `addPlugin`. */
  installing = null;
  /**
   * @param ctx - context carrying the loader and the tool registry.
   */
  constructor(ctx) {
    super(ctx, "pluginStation");
  }
  get home() {
    return homedir2();
  }
  /** Scan the roots, reusing a result from the last couple of seconds. */
  scan(fresh = false) {
    const now = Date.now();
    if (!fresh && this.scanCache && now - this.scanCache.at < 2e3) return this.scanCache.rows;
    const rows = scanSkills(this.home, process.cwd());
    this.scanCache = { at: now, rows };
    return rows;
  }
  /** Drop the cache after a write, so the next read sees the change. */
  invalidate() {
    this.scanCache = null;
  }
  // ── skills ────────────────────────────────────────────────────────────
  /** Every skill on disk, across every root, with shadowing resolved. */
  async skills() {
    return JSON.stringify(await this.scan(true));
  }
  /** One file's text from inside one skill directory. */
  async skillFile(payload) {
    const { dir, path } = JSON.parse(payload);
    const known = await this.scan();
    if (!known.some((skill) => skill.dir === dir)) throw new Error("not a known skill directory");
    return JSON.stringify({ text: await readSkillFile(dir, path) });
  }
  /** Move one skill between the four states. */
  async setSkillState(payload) {
    const { dir, state } = JSON.parse(payload);
    const known = await this.scan();
    if (!known.some((skill) => skill.dir === dir)) throw new Error("not a known skill directory");
    await setSkillState(this.home, dir, state);
    this.invalidate();
    return JSON.stringify({ ok: true });
  }
  /** Move one skill to the trash folder. */
  async removeSkill(payload) {
    const { dir } = JSON.parse(payload);
    const known = await this.scan();
    if (!known.some((skill) => skill.dir === dir)) throw new Error("not a known skill directory");
    const trash = await removeSkill(this.home, dir);
    this.invalidate();
    return JSON.stringify({ trash });
  }
  // ── mcp ───────────────────────────────────────────────────────────────
  /** Configured servers joined to the tools they actually registered. */
  async mcp() {
    const policy = await readToolPolicy(this.home);
    const byServer = /* @__PURE__ */ new Map();
    for (const schema of this.ctx.tools.schemas()) {
      const match = TOOL_PREFIX.exec(schema.name);
      if (!match) continue;
      const [, server, tool] = match;
      const list = byServer.get(server) ?? [];
      list.push({
        name: tool,
        description: schema.description ?? "",
        tokens: estimateToolTokens(schema),
        disabled: (policy[server] ?? []).includes(tool)
      });
      byServer.set(server, list);
    }
    const rows = [];
    const push = (row) => {
      row.tools.sort((a, b) => a.name.localeCompare(b.name));
      rows.push({ ...row, tokens: row.tools.filter((t) => !t.disabled).reduce((sum, t) => sum + t.tokens, 0) });
    };
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name !== MCP_CLIENT_MODULE) continue;
      const config = entry.options.config ?? {};
      const name2 = typeof config.serverName === "string" ? config.serverName : `entry:${entry.options.id}`;
      push({
        name: name2,
        entryId: entry.options.id,
        transport: typeof config.transport === "string" ? config.transport : config.url ? "streamable-http" : "stdio",
        target: targetOf(config),
        disabled: Boolean(entry.disabled),
        fiber: phaseOf(entry.fiber),
        tools: byServer.get(name2) ?? []
      });
      byServer.delete(name2);
    }
    for (const [name2, tools] of byServer) {
      push({ name: name2, entryId: "", transport: "unconfigured", target: "", disabled: false, fiber: null, tools });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(rows);
  }
  /** The whole MCP config as the universal `mcpServers` document. */
  async mcpJson() {
    const servers = await toUniversal(patchFile(this.home));
    return JSON.stringify({ mcpServers: servers }, null, 2);
  }
  /** Write a universal `mcpServers` document back into the patch layer. */
  async saveMcpJson(payload) {
    const { text } = JSON.parse(payload);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON \u65E0\u6CD5\u89E3\u6790 / invalid JSON: ${error.message}`);
    }
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      throw new Error('\u6587\u6863\u9700\u8981\u4E00\u4E2A\u9876\u5C42 "mcpServers" \u5BF9\u8C61 / the document needs a top-level "mcpServers" object');
    }
    for (const [name2, server] of Object.entries(parsed.mcpServers)) {
      if (!server.url && !server.command) throw new Error(`"${name2}" \u9700\u8981 url \u6216 command / needs either url or command`);
    }
    return JSON.stringify(await fromUniversal(patchFile(this.home), parsed.mcpServers));
  }
  /** Enable or disable one server without touching anything else. */
  async setMcpDisabled(payload) {
    const { name: name2, disabled } = JSON.parse(payload);
    return JSON.stringify({ backup: await setDisabled(patchFile(this.home), name2, disabled) });
  }
  /** Hide or restore one tool of one server. */
  async setToolDisabled(payload) {
    const { server, tool, disabled } = JSON.parse(payload);
    const policy = await readToolPolicy(this.home);
    const list = new Set(policy[server] ?? []);
    if (disabled) list.add(tool);
    else list.delete(tool);
    if (list.size === 0) delete policy[server];
    else policy[server] = [...list].sort();
    await writeToolPolicy(this.home, policy);
    return JSON.stringify({ ok: true });
  }
  // ── install ───────────────────────────────────────────────────────────
  /** Recognise what the user pasted. Runs nothing. */
  async detectInstall(payload) {
    const { input } = JSON.parse(payload);
    return JSON.stringify(detect(input));
  }
  /** Fetch and return the script a shell plan would pipe into a shell. */
  async peekInstall(payload) {
    const { plan } = JSON.parse(payload);
    return JSON.stringify({ text: await peek(plan) });
  }
  /** Stage a source and list the skills inside it, so the user can choose. */
  async stageInstall(payload) {
    const { plan } = JSON.parse(payload);
    const result = await stage(plan);
    const token = `stage-${++this.stageSeq}`;
    this.staged.set(token, { dir: result.dir, plan });
    for (const [key, value] of this.staged) {
      if (key !== token) {
        await cleanup(value.dir);
        this.staged.delete(key);
      }
    }
    return JSON.stringify({ token, candidates: result.candidates, log: result.log });
  }
  /**
   * Install the chosen candidates, then check whether anything landed.
   *
   * A shell plan installs wherever its script decides, so its result is
   * measured by diffing the target root rather than by trusting the exit
   * code — an installer that prints a menu and installs nothing still exits
   * zero, which is exactly how a "successful" install ends up empty.
   */
  async runInstall(payload) {
    const { token, chosen } = JSON.parse(payload);
    const entry = this.staged.get(token);
    if (!entry) throw new Error("staging expired \u2014 detect and stage again");
    const target = defaultRoot(this.home);
    let log = "";
    let code = 0;
    let installed = [];
    let settled = false;
    try {
      if (entry.plan.kind === "shell") {
        const before = new Set((await this.scan(true)).map((skill) => skill.dir));
        const result = await runShell(entry.plan.plan, entry.dir);
        log += result.out;
        code = result.code;
        installed = (await this.scan(true)).filter((skill) => !before.has(skill.dir)).map((skill) => skill.dir);
        if (installed.length === 0) {
          log += `
(exit ${code}, \u4F46\u6CA1\u6709\u65B0\u6280\u80FD\u843D\u5730 / no new skill appeared under any root)`;
        }
      } else {
        const candidates = await findSkills(join6(entry.dir, "src"));
        const picked = candidates.filter((candidate) => chosen.includes(candidate.path));
        if (picked.length === 0) throw new Error("nothing selected");
        log += await place(entry.dir, picked, target);
        installed = picked.map((candidate) => join6(target, candidate.name));
      }
      const names = (await this.scan(true)).map((skill) => skill.id);
      const checks = await Promise.all(installed.map(async (dir) => ({ dir, checks: await verify(dir, names) })));
      settled = true;
      return JSON.stringify({ code, log, installed, checks });
    } finally {
      if (settled) {
        await cleanup(entry.dir);
        this.staged.delete(token);
      }
    }
  }
  /** Write a hand-authored skill straight into the default root. */
  async createSkill(payload) {
    const { name: name2, description, instructions } = JSON.parse(payload);
    const dir = await createSkill(defaultRoot(this.home), name2, description, instructions);
    const names = (await this.scan(true)).map((skill) => skill.id);
    return JSON.stringify({ dir, checks: await verify(dir, names) });
  }
  /** Write an uploaded `.md` or archive into the default root. */
  async uploadSkill(payload) {
    const { filename, base64 } = JSON.parse(payload);
    const dir = await uploadSkill(defaultRoot(this.home), filename, base64);
    const names = (await this.scan(true)).map((skill) => skill.id);
    return JSON.stringify({ dir, checks: await verify(dir, names) });
  }
  /**
   * Third-party skills, searched on GitHub.
   *
   * Browse is for finding skills you do not have, which means somebody
   * else's. An earlier version pointed it at a hand-curated index of this
   * deployment's own published skills — that is backwards twice over: those
   * are already installed, and enumerating internal tooling on a public URL
   * turns "public but unlisted" into "here is the list".
   *
   * GitHub is where the format actually lives: `agent-skills` alone carries
   * five figures of repositories. Results feed straight into the install
   * flow, which stages the repository, lists the skills inside it and lets
   * you pick — a repository is rarely one skill.
   *
   * Unauthenticated search is rate-limited to a handful of queries a minute;
   * `DPS_GITHUB_TOKEN` lifts that for anyone who hits it.
   */
  async directory(payload) {
    const { query, topic } = JSON.parse(payload || "{}");
    const installed = new Set((await this.scan()).map((skill) => skill.id));
    const chosenTopic = topic && SKILL_TOPICS.includes(topic) ? topic : SKILL_TOPICS[0];
    const search = [`topic:${chosenTopic}`, (query ?? "").trim()].filter(Boolean).join(" ");
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(search)}&sort=stars&order=desc&per_page=30`;
    const headers = {
      accept: "application/vnd.github+json",
      // GitHub rejects requests with no user agent outright.
      "user-agent": "dsh-plugin-station"
    };
    if (process.env.DPS_GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.DPS_GITHUB_TOKEN}`;
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const hint = response.status === 403 ? " (rate limit \u2014 set DPS_GITHUB_TOKEN)" : "";
        throw new Error(`${response.status} ${response.statusText}${hint}`);
      }
      const body = await response.json();
      const entries = (body.items ?? []).map((repo) => ({
        name: repo.full_name,
        description: repo.description ?? "",
        source: `\u2605 ${repo.stargazers_count ?? 0}`,
        install: repo.html_url,
        // GitHub gives a moving default branch; the install flow pins the
        // commit it actually downloaded, which is where a version can honestly
        // come from. Claiming one here would be inventing it.
        version: null,
        installed: installed.has(repo.name),
        curated: false
      }));
      return JSON.stringify({ topics: SKILL_TOPICS, topic: chosenTopic, entries, error: null });
    } catch (cause) {
      return JSON.stringify({ topics: SKILL_TOPICS, topic: chosenTopic, entries: [], error: cause.message });
    }
  }
  /**
   * One repository's README, so a skill can be read before it is trusted.
   *
   * Browse used to jump straight from a search result into the install flow,
   * which is a strange thing to ask of someone: decide to run third-party
   * code on the strength of a one-line description. The README is the only
   * thing most repositories offer as an explanation, so it goes in front of
   * the decision rather than after it.
   */
  async repoReadme(payload) {
    const { repo } = JSON.parse(payload);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("expected owner/repo");
    const headers = { accept: "application/vnd.github.raw", "user-agent": "dsh-plugin-station" };
    if (process.env.DPS_GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.DPS_GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const text = await response.text();
    return JSON.stringify({ text: text.length > 6e4 ? text.slice(0, 6e4) + "\n\n\u2026" : text });
  }
  // ── code plugins ──────────────────────────────────────────────────────
  /**
   * The packages installed into this profile, with their live entries.
   *
   * The Host's own Plugin list answers a different question — every
   * composition entry, the great majority of which are the Host itself. This
   * answers "what did I install, and is it working".
   */
  async codePlugins() {
    const entries = [];
    for (const entry of this.ctx.loader.entries()) {
      const module = typeof entry.options.name === "string" ? entry.options.name : "";
      if (!module) continue;
      entries.push({
        id: String(entry.options.id ?? ""),
        module,
        disabled: Boolean(entry.disabled),
        fiber: phaseOf(entry.fiber)
      });
    }
    const grouped = await collectPackages(profileDir(this.home), entries);
    return JSON.stringify({ ...grouped, profile: profileName() });
  }
  /** Switch one composition entry off or back on, through the patch layer. */
  async setPluginDisabled(payload) {
    const { entryId, disabled } = JSON.parse(payload);
    const backupPath = await setEntryDisabled(patchFile(this.home), entryId, disabled);
    return JSON.stringify({ backup: backupPath });
  }
  /**
   * Remove a package from the profile by re-invoking the Host's own CLI.
   *
   * A removal is not symmetrical with an install. A newly installed package
   * simply sits inert until a restart; a newly REMOVED one leaves a fiber
   * running against files that are gone, and the browser then asks for a
   * client bundle that returns 404 — which fails the whole plugin tree and
   * takes the entire UI down, not just that plugin's menus. Measured, on
   * this deployment, by removing a plugin and reloading: "Failed to load
   * plugins … client.js failed to load", and nothing else renders.
   *
   * So the reply says the Host must restart, and the panel acts on it
   * without waiting to be told. Leaving that choice to someone means
   * offering them a broken app as one of the options.
   */
  async removePlugin(payload) {
    const { name: name2 } = JSON.parse(payload);
    if (!SAFE_PACKAGE.test(name2)) throw new Error(`refusing to remove ${JSON.stringify(name2)}`);
    if (this.installing) throw new Error(`already installing ${this.installing} \u2014 one at a time`);
    this.installing = name2;
    try {
      const result = await dshPlugin(["remove", name2]);
      return JSON.stringify({ ...result, mustRestart: result.code === 0 });
    } finally {
      this.installing = null;
    }
  }
  /**
   * One page of the market.
   *
   * The catalog is a couple of megabytes; it is fetched and cached here so
   * the browser only ever receives the page it is showing. Which packages
   * are already installed is joined in on the way out, so a card can say
   * "installed" without the panel making a second round trip.
   */
  async catalog(payload) {
    const query = JSON.parse(payload || "{}");
    const rows = await loadCatalog(this.home);
    const declared = new Set(Object.keys(await this.profileDependencies()));
    const live = /* @__PURE__ */ new Set();
    for (const entry of this.ctx.loader.entries()) {
      const module = typeof entry.options.name === "string" ? entry.options.name : "";
      if (!module) continue;
      live.add(module.startsWith("@") ? module.split("/").slice(0, 2).join("/") : module.split("/")[0]);
    }
    return JSON.stringify(page(rows, query, declared, live));
  }
  /** The profile's direct dependencies, as its package.json declares them. */
  async profileDependencies() {
    try {
      const text = await readFile6(join6(profileDir(this.home), "package.json"), "utf8");
      return JSON.parse(text).dependencies ?? {};
    } catch {
      return {};
    }
  }
  /**
   * Which declared packages are not live yet — i.e. what a restart would
   * pick up.
   *
   * A newly installed package is on disk and in the composition file, but
   * its fiber only exists after the process restarts: the loader's only
   * published seam for applying one is `exit()`, described in its own types
   * as "Hook for hosts that can restart the process on full-reload
   * requests". So "installed" and "running" are genuinely two states here,
   * and a panel that collapses them leaves people waiting for something that
   * is never going to happen on its own.
   */
  async pendingRestart() {
    const declared = new Set(Object.keys(await this.profileDependencies()));
    const live = /* @__PURE__ */ new Set();
    for (const entry of this.ctx.loader.entries()) {
      const module = typeof entry.options.name === "string" ? entry.options.name : "";
      if (!module) continue;
      live.add(module.startsWith("@") ? module.split("/").slice(0, 2).join("/") : module.split("/")[0]);
    }
    return JSON.stringify({
      added: [...declared].filter((name2) => !live.has(name2)).sort(),
      // Only things a profile could have declared count as "removed". The
      // Host's own scope never can, and neither can a built-in whose module
      // is a scheme rather than a package — `cordis:group`, `cordis:include`
      // — which is what made the bar demand a restart over entries nobody
      // installed and nobody can uninstall.
      removed: [...live].filter((name2) => !declared.has(name2) && !name2.startsWith("@deepseek-ai") && !name2.includes(":")).sort()
    });
  }
  /**
   * Apply the composition by restarting the Host.
   *
   * `loader.exit()` is the published request; whether anything comes back up
   * is the deployment's business — a service manager with a restart policy,
   * or a person. The reply is sent before exiting so the panel can say what
   * is about to happen rather than just losing its connection.
   */
  async restartHost() {
    setTimeout(() => {
      try {
        this.ctx.loader.exit?.();
      } catch {
      }
      process.exit(0);
    }, 250);
    return JSON.stringify({ restarting: true });
  }
  /** Drop the cached catalog so the next read refetches. */
  async refreshCatalog() {
    await rm3(cachePath(this.home), { force: true });
    const rows = await loadCatalog(this.home);
    return JSON.stringify({ total: rows.length });
  }
  /**
   * Install a package into the profile the same way.
   *
   * Serialised on purpose. pnpm takes a lock on its content-addressable
   * store, so a second install started while one is running does not fail —
   * it blocks, silently, for as long as the first takes. A caller that gets
   * told "one at a time" can say so; a caller left waiting on a lock cannot
   * tell that apart from a hang.
   */
  async addPlugin(payload) {
    const { spec } = JSON.parse(payload);
    const target = spec.trim();
    if (!target || /\s/.test(target)) throw new Error("one package specifier, no spaces");
    if (this.installing) throw new Error(`already installing ${this.installing} \u2014 one at a time`);
    this.installing = target;
    try {
      const result = await dshPlugin(["add", target]);
      return JSON.stringify({ ...result, restartRequired: result.code === 0 });
    } finally {
      this.installing = null;
    }
  }
};
function targetOf(config) {
  if (typeof config.url === "string") return config.url.replace(/\/\/[^@/]+@/, "//\u2022\u2022\u2022\u2022@");
  const command = typeof config.command === "string" ? config.command : "";
  const args = Array.isArray(config.args) ? config.args.filter((a) => typeof a === "string") : [];
  return [command, ...args].join(" ").trim() || "\u2014";
}

// src/wire.ts
import { z } from "zod";
var PKG = "dsh-plugin-station";
function jsonParam(name2) {
  return Object.freeze({
    name: name2,
    wire: name2,
    source: "json",
    codec: Object.freeze({ mode: "strict", typeSymbol: `${PKG}/types#Json`, schema: z.string() })
  });
}
var JSON_RESULT = Object.freeze({ mode: "strict", typeSymbol: `${PKG}/types#Json`, schema: z.string() });
function descriptor(method, argc) {
  return Object.freeze({
    id: `${PKG}#pluginStation/${method}`,
    service: "pluginStation",
    namespace: "pluginStation",
    method,
    invocation: Object.freeze({ kind: "direct" }),
    parameters: Object.freeze(argc === 1 ? [jsonParam("payload")] : []),
    result: JSON_RESULT,
    sourceLocation: Object.freeze({ file: "src/wire.ts", line: 1, column: 1 })
  });
}
var METHODS = [
  ["skills", 0],
  ["skillFile", 1],
  ["setSkillState", 1],
  ["removeSkill", 1],
  ["mcp", 0],
  ["mcpJson", 0],
  ["saveMcpJson", 1],
  ["setMcpDisabled", 1],
  ["setToolDisabled", 1],
  ["detectInstall", 1],
  ["peekInstall", 1],
  ["stageInstall", 1],
  ["runInstall", 1],
  ["createSkill", 1],
  ["uploadSkill", 1],
  ["directory", 1],
  ["repoReadme", 1],
  ["codePlugins", 0],
  ["setPluginDisabled", 1],
  ["removePlugin", 1],
  ["addPlugin", 1],
  ["catalog", 1],
  ["refreshCatalog", 0],
  ["restartHost", 0],
  ["pendingRestart", 0]
];
var CONSOLE_INVOCATIONS = Object.freeze(METHODS.map(([method, argc]) => descriptor(method, argc)));

// src/index.ts
var name = "plugin-station";
var inject = ["tools", "loader"];
async function apply(ctx) {
  await ctx.plugin(PluginStationService);
}
export {
  CATALOG_URL,
  CONSOLE_INVOCATIONS,
  MCP_CLIENT_MODULE,
  METHODS,
  PAGE_SIZE,
  PKG,
  PluginStationService,
  ROOTS,
  apply,
  backup,
  cachePath,
  cleanup,
  collectPackages,
  createSkill,
  detect,
  estimateTokens,
  estimateToolTokens,
  findSkills,
  formatTokens,
  fromUniversal,
  inject,
  loadCatalog,
  loadPatch,
  name,
  normalize,
  packageOf,
  page,
  parseFrontmatter,
  peek,
  phaseOf,
  place,
  policyPath,
  readSkillFile,
  readToolPolicy,
  removeSkill,
  repoOf,
  rootsFor,
  run,
  runShell,
  scanSkills,
  setDisabled,
  setEntryDisabled2 as setEntryDisabled,
  setSkillState,
  specOf,
  stage,
  stateOf,
  tildify,
  toUniversal,
  uploadSkill,
  verify,
  writeToolPolicy
};
