import { z } from "zod";
export const Category = z.enum([
  "technical",
  "scenario",
  "experience",
  "general",
]);
export const Extract = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: Category,
      transcriptIds: z.array(z.string()),
    }),
  ),
  pendingFragment: z.string(),
});
export const Answer = z.object({
  headline: z.string(),
  shortAnswer: z.string(),
  assumptions: z.array(z.string()),
  points: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      kind: z.enum(["fact", "design", "experience"]),
      sourceIds: z.array(z.string()),
    }),
  ),
  pitfalls: z.array(z.string()),
  followUps: z.array(z.string()),
  unknowns: z.array(z.string()),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      supports: z.string(),
    }),
  ),
  experienceUsed: z.array(z.string()),
});
export const Review = z.object({
  verdict: z.enum(["pass", "revise", "insufficient"]),
  issues: z.array(z.string()),
  answer: Answer,
});
export const Settings = z.object({
  provider: z.enum(["codex", "openai"]).default("codex"),
  codexPath: z.string().default("codex"),
  codexModel: z.string().default(""),
  apiBase: z.string().default("https://api.openai.com/v1"),
  apiModel: z.string().default("gpt-5.4"),
  apiKey: z.string().default(""),
  effort: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
  timeoutSeconds: z.number().min(30).max(600).default(240),
  asrProvider: z.enum(["local", "openai"]).default("local"),
  asrBase: z.string().default("https://api.openai.com/v1"),
  asrKey: z.string().default(""),
  asrModel: z.string().default("gpt-4o-transcribe"),
  whisperPath: z.string().default("/opt/homebrew/bin/whisper-cli"),
  whisperModel: z.string().default(""),
  role: z.string().max(200).default("量化开发工程师 / 架构师"),
  profile: z.string().max(30000).default(""),
  autoDetect: z.boolean().default(true),
});
export const jsonSchema = (schema) =>
  z.toJSONSchema(schema, { target: "draft-7" });
export function parseOutput(schema, text) {
  const raw = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  return schema.parse(JSON.parse(raw));
}
export function normalizeQuestion(text) {
  return text.toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}
export function gateAnswer(
  answer,
  { searched = false, openedUrls = [], profile = "" } = {},
) {
  const notes = [];
  const urls = new Set(openedUrls.map(normalizeUrl));
  const sources = answer.sources
    .filter((s) => {
      try {
        const u = new URL(s.url);
        return ["https:", "http:"].includes(u.protocol);
      } catch {
        return false;
      }
    })
    .map((s) => ({ ...s, opened: urls.has(normalizeUrl(s.url)) }));
  const byId = new Map(sources.map((s) => [s.id, s]));
  const points = answer.points.map((p) => ({
    ...p,
    sourceIds: p.sourceIds.filter((id) => byId.has(id)),
  }));
  if (!searched) notes.push("本轮没有观察到联网检索，技术结论仍待核验。");
  if (
    points.some(
      (p) =>
        p.kind === "fact" &&
        (!p.sourceIds.length ||
          p.sourceIds.some((id) => !byId.get(id)?.opened)),
    )
  )
    notes.push("部分事实尚未关联到本轮实际打开的来源。");
  const unopened = sources.filter((s) => !s.opened);
  if (unopened.length)
    notes.push(
      `以下来源尚未观察到本轮打开记录：${unopened.map((s) => s.id).join("、")}。`,
    );
  const validExperience = answer.experienceUsed.filter((t) =>
    profile.includes(t),
  );
  if (validExperience.length !== answer.experienceUsed.length)
    notes.push("经历引用与个人资料不匹配，不能作为本人经历使用。");
  if (!profile.trim() && points.some((p) => p.kind === "experience"))
    notes.push("未提供个人经历资料，不能确认经历陈述。");
  return {
    ...answer,
    points,
    sources,
    experienceUsed: validExperience,
    evidenceNotes: notes,
  };
}
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
