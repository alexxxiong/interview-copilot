import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { jsonSchema, parseOutput } from "./schemas.mjs";

export function collectEvidence(item, evidence, onActivity = () => {}) {
  if (!item || typeof item !== "object") return;
  if (item.type === "web_search" || item.type === "web_search_call") {
    evidence.searched = true;
    const action = item.action || {};
    if (action.type === "other" && /^https?:\/\//.test(item.query || ""))
      evidence.openedUrls.push(item.query);
    const isOpen =
      action.type === "open_page" ||
      (action.type === "other" && /^https?:\/\//.test(item.query || ""));
    const label = isOpen
      ? "打开来源"
      : action.type === "find_in_page"
        ? "查找证据"
        : "联网检索";
    onActivity(
      `${label}${action.query ? `：${action.query}` : action.url ? `：${action.url}` : isOpen ? `：${item.query}` : ""}`,
    );
    if (action.type === "open_page" && action.url)
      evidence.openedUrls.push(action.url);
  }
  for (const [k, v] of Object.entries(item))
    if (k !== "action" && k !== "results" && v && typeof v === "object") {
      if (Array.isArray(v))
        v.forEach((x) => collectEvidence(x, evidence, onActivity));
      else collectEvidence(v, evidence, onActivity);
    }
}
export function safeEndpoint(base, suffix) {
  const u = new URL(base);
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
    )
  )
    throw Error("模型接口必须使用 HTTPS；本地服务可使用 HTTP。");
  if (u.username || u.password || u.search || u.hash)
    throw Error("接口地址不能包含用户名、密码或查询参数。");
  return `${base.replace(/\/+$/, "")}/${suffix}`;
}
export async function runModel({
  settings,
  prompt,
  schema,
  search = true,
  signal,
  onActivity = () => {},
}) {
  return settings.provider === "codex"
    ? runCodex({ settings, prompt, schema, search, signal, onActivity })
    : runResponses({ settings, prompt, schema, search, signal, onActivity });
}
async function runCodex({
  settings,
  prompt,
  schema,
  search,
  signal,
  onActivity,
}) {
  const dir = await mkdtemp(path.join(tmpdir(), "interview-agent-"));
  try {
    const schemaPath = path.join(dir, "schema.json");
    await writeFile(schemaPath, JSON.stringify(jsonSchema(schema)));
    const args = [
      ...(search ? ["--search"] : []),
      "--disable",
      "shell_tool",
      "--disable",
      "multi_agent",
      "--disable",
      "hooks",
      "-a",
      "never",
      "-s",
      "read-only",
      "-c",
      "project_doc_max_bytes=0",
      "-c",
      "skills.max_context_tokens=1",
      "-c",
      "apps._default.enabled=false",
      "-c",
      "tools.view_image=false",
      "-c",
      `web_search=${JSON.stringify(search ? "live" : "disabled")}`,
      "-c",
      `model_reasoning_effort=${JSON.stringify(search ? settings.effort : "low")}`,
      "exec",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "--ephemeral",
      "--json",
      "--output-schema",
      schemaPath,
      "-C",
      dir,
    ];
    if (settings.codexModel.trim()) args.push("-m", settings.codexModel.trim());
    args.push("-");
    const evidence = { searched: false, openedUrls: [] };
    let output = "",
      last = "",
      stderr = "",
      turnError = "";
    const localSignal = AbortSignal.any([
      signal || new AbortController().signal,
      AbortSignal.timeout(settings.timeoutSeconds * 1000),
    ]);
    await new Promise((resolve, reject) => {
      const child = spawn(settings.codexPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: agentEnvironment(),
        signal: localSignal,
      });
      let killTimer;
      const kill = () => {
        killTimer = setTimeout(() => child.kill("SIGKILL"), 1500);
        killTimer.unref();
      };
      localSignal.addEventListener("abort", kill, { once: true });
      const consume = (line) => {
        try {
          const event = JSON.parse(line);
          if (event.type === "item.completed") {
            collectEvidence(event.item, evidence, onActivity);
            if (event.item?.type === "agent_message") last = event.item.text;
          }
          if (event.type === "turn.failed" || event.type === "error")
            turnError =
              event.error?.message || event.message || "Agent 执行失败";
        } catch {
          /* Ignore non-JSON diagnostics. */
        }
      };
      child.stdout.on("data", (data) => {
        output += data.toString();
        let idx;
        while ((idx = output.indexOf("\n")) >= 0) {
          consume(output.slice(0, idx));
          output = output.slice(idx + 1);
        }
      });
      child.stderr.on("data", (data) => {
        stderr = (stderr + data.toString()).slice(-4000);
      });
      child.on("error", (error) =>
        reject(
          localSignal.aborted
            ? new Error(
                signal?.aborted
                  ? "任务已取消"
                  : "Agent 超时，请重试或调高超时设置",
              )
            : error,
        ),
      );
      child.on("close", (code) => {
        clearTimeout(killTimer);
        localSignal.removeEventListener("abort", kill);
        if (output) consume(output);
        if (code !== 0 || turnError)
          reject(
            Error(turnError || `Codex 退出 (${code})：${stderr.slice(-1000)}`),
          );
        else if (!last) reject(Error("Codex 未返回有效答案"));
        else resolve();
      });
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
    });
    return { value: parseOutput(schema, last), evidence };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function runResponses({
  settings,
  prompt,
  schema,
  search,
  signal,
  onActivity,
}) {
  if (!settings.apiKey) throw Error("请先在设置中填写模型 API Key。");
  const body = {
    model: settings.apiModel,
    input: prompt,
    reasoning: { effort: search ? settings.effort : "low" },
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "interview_result",
        strict: true,
        schema: jsonSchema(schema),
      },
    },
    ...(search
      ? {
          tools: [{ type: "web_search" }],
          include: ["web_search_call.action.sources"],
        }
      : {}),
  };
  onActivity(search ? "请求 Agent 检索并核查资料" : "识别对话问题");
  const res = await fetch(safeEndpoint(settings.apiBase, "responses"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([
      signal || new AbortController().signal,
      AbortSignal.timeout(settings.timeoutSeconds * 1000),
    ]),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Error(
      `模型接口 ${res.status}：${data.error?.message || res.statusText}`,
    );
  }
  const data = await res.json();
  if (data.status !== "completed")
    throw Error(
      `模型未完成：${data.status || "未知状态"} ${data.incomplete_details?.reason || ""}`,
    );
  const evidence = { searched: false, openedUrls: [] };
  collectEvidence(data, evidence, onActivity);
  const text = (data.output || [])
    .flatMap((x) => x.content || [])
    .filter((x) => x.type === "output_text")
    .map((x) => x.text)
    .join("\n");
  return { value: parseOutput(schema, text), evidence };
}

function agentEnvironment() {
  const keys = [
    "HOME",
    "PATH",
    "TMPDIR",
    "SHELL",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "CODEX_HOME",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "all_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "OPENAI_API_KEY",
  ];
  return {
    ...Object.fromEntries(
      keys.filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
    ),
    TERM: "dumb",
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "interview-copilot",
  };
}
