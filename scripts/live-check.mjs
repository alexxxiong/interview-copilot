import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Store } from "../server/store.mjs";
import { Engine } from "../server/engine.mjs";
import { transcribe } from "../server/transcribe.mjs";
const directory = fileURLToPath(
  new URL("../artifacts/live-data", import.meta.url),
);
await mkdir(directory, { recursive: true });
const store = new Store(directory);
store.settings.autoDetect = false;
store.settings.timeoutSeconds = 300;
const session = store.newSession();
let previous = "";
const engine = new Engine(store, (event) => {
  const j = event.session?.jobs.at(-1);
  if (j) {
    const msg = `${j.status}: ${j.events.at(-1)?.message || ""}`;
    if (msg !== previous) {
      console.log(msg);
      previous = msg;
    }
  }
});
const job = engine.enqueue(session, {
  question:
    "高频量化交易系统中如何保证交易的严格一致性？请区分内部订单/资金状态、主备切换以及交易所回报不确定性。",
  category: "scenario",
});
while (["queued", "researching", "reviewing"].includes(job.status))
  await new Promise((resolve) => setTimeout(resolve, 500));
await writeFile(
  new URL("../artifacts/live-answer.json", import.meta.url),
  JSON.stringify(job, null, 2),
);
console.log(
  JSON.stringify(
    {
      status: job.status,
      sources: job.answer?.sources.map((s) => ({
        url: s.url,
        opened: s.opened,
      })),
      error: job.error,
      notes: job.answer?.evidenceNotes,
    },
    null,
    2,
  ),
);
engine.close();
if (!job.answer) process.exitCode = 1;
