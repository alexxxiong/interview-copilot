import { mkdir, writeFile } from "node:fs/promises";
import { Store } from "../server/store.mjs";
import { Engine } from "../server/engine.mjs";
import { Extract } from "../server/schemas.mjs";
import { runModel } from "../server/provider.mjs";
import { extractPrompt } from "../server/prompts.mjs";
await mkdir("artifacts/experience-data", { recursive: true });
const store = new Store("artifacts/experience-data");
store.settings.autoDetect = false;
const session = store.newSession();
session.transcripts = [
  {
    id: "a",
    role: "interviewer",
    text: "我们聊聊主备。订单发给交易所后，如果主节点宕机了",
  },
  { id: "b", role: "candidate", text: "你的意思是是否已经成交未知吗？" },
  { id: "c", role: "interviewer", text: "对，备节点接管后怎么避免重复下单？" },
];
const result = await runModel({
  settings: store.settings,
  prompt: extractPrompt(session, session.transcripts, store.settings),
  schema: Extract,
  search: false,
});
console.log("EXTRACTION", JSON.stringify(result.value));
await writeFile(
  "artifacts/live-extraction.json",
  JSON.stringify(result.value, null, 2),
);
const engine = new Engine(store, (event) => {
  const j = event.session?.jobs.at(-1);
  if (j) console.log(j.status, j.events.at(-1)?.message || "");
});
const job = engine.enqueue(session, {
  question: "请说说你曾经主导的量化交易系统架构改造，具体降低了多少延迟？",
  category: "experience",
});
while (["queued", "researching", "reviewing"].includes(job.status))
  await new Promise((r) => setTimeout(r, 500));
console.log("EXPERIENCE", job.status);
await writeFile("artifacts/live-experience.json", JSON.stringify(job, null, 2));
engine.close();
if (!job.answer) process.exitCode = 1;
