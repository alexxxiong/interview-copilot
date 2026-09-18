import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
await mkdir("artifacts", { recursive: true });
const dir = await mkdtemp(path.join(tmpdir(), "interview-e2e-"));
const executablePath = process.env.INTERVIEW_E2E_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    ...(executablePath ? [] : ["."]),
    `--user-data-dir=${path.join(dir, "electron-user")}`,
  ],
  env: { ...process.env, INTERVIEW_PORT: "4321", INTERVIEW_DATA_DIR: dir },
});
try {
  const page = await app.firstWindow();
  await page.waitForSelector(".workspace-columns");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({ path: "artifacts/workspace-empty.png" });
  await page
    .getByRole("button", {
      name: "高频交易中，如何设计才能保证交易的严格一致性？",
      exact: false,
    })
    .click();
  assert.match(
    await page.getByRole("textbox", { name: "输入问题或对话" }).inputValue(),
    /严格一致性/,
  );
  await page.getByRole("button", { name: "个人经历", exact: true }).click();
  await page
    .getByLabel("个人经历资料")
    .fill("我负责开发行情回放工具，尚无可公开的性能指标。");
  await page.getByRole("button", { name: "保存资料", exact: true }).click();
  await page.getByText("已保存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "面试工作台", exact: true }).click();
  await page.getByRole("switch", { name: "自动识别问题" }).click();
  await page.getByRole("button", { name: "补充对话", exact: true }).click();
  await page
    .getByRole("textbox", { name: "输入问题或对话" })
    .fill("我们讨论订单状态和交易所回报的边界。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".transcript-item").waitFor();
  await page.getByRole("button", { name: "修正", exact: true }).click();
  await page
    .locator(".transcript-edit textarea")
    .fill("我们讨论内部订单状态和外部交易所回报的边界。");
  await page.locator(".transcript-edit select").selectOption("candidate");
  await page.locator(".transcript-edit button").click();
  await page
    .getByText("我们讨论内部订单状态和外部交易所回报的边界。", { exact: true })
    .waitFor();
  const windowsBefore = app.windows().length;
  await page.getByRole("button", { name: "置顶提示窗", exact: false }).click();
  await expectWindow();
  const overlay = app.windows().find((w) => w !== page);
  await overlay.waitForSelector(".overlay-title");
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find(
          (w) =>
            w.getTitle().includes("置顶") ||
            w.webContents.getURL().includes("overlay=1"),
        )
        .isAlwaysOnTop(),
    ),
    true,
  );
  await overlay.getByTitle("取消置顶").click();
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("overlay=1"))
        .isAlwaysOnTop(),
    ),
    false,
  );
  await overlay.getByTitle("开启置顶").click();
  await overlay.screenshot({ path: "artifacts/overlay-empty.png" });
  await page.getByRole("button", { name: "模型与设置", exact: true }).click();
  await page.getByRole("button", { name: "检查本机配置" }).click();
  await page.locator(".health-results").waitFor();
  await page.screenshot({ path: "artifacts/settings.png" });
  await page.getByRole("button", { name: "面试工作台", exact: true }).click();
  await page.screenshot({ path: "artifacts/workspace-transcript.png" });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "问题卡片", exact: true })
    .click();
  const beforePrep = await page.evaluate(() =>
    fetch("/api/state").then((r) => r.json()),
  );
  await page
    .getByRole("button", { name: "打开卡片：一分钟自我介绍", exact: true })
    .click();
  await page.getByRole("region", { name: "预置口述草稿" }).waitFor();
  assert.match(
    await page.locator(".prepared-script").innerText(),
    /【真实职责】/,
  );
  await page
    .getByRole("button", {
      name: "打开卡片：AI 运维平台，如何讲贡献",
      exact: true,
    })
    .click();
  await page
    .locator(".prepared-followups summary")
    .filter({ hasText: "部署时间的改善" })
    .click();
  assert.match(
    await page.locator(".prepared-followups details[open]").innerText(),
    /分别覆盖/,
  );
  assert.match(
    await page.locator(".prepared-process").innerText(),
    /幂等|重复提交/,
  );
  assert.doesNotMatch(await page.locator(".prepared-script").innerText(), /【/);
  await page
    .locator(".prepared-process")
    .screenshot({ path: "artifacts/technical-process.png" });
  await page.getByLabel("搜索问题卡片").fill("微调");
  await page
    .getByRole("button", {
      name: "打开卡片：RAG 与 LoRA 怎么分工",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "清空搜索", exact: true }).click();
  await page.getByRole("button", { name: "置顶这张卡", exact: true }).click();
  await overlay.locator(".prepared-script").waitFor();
  assert.match(
    await overlay.locator(".prepared-script").innerText(),
    /实施团队/,
  );
  const afterPrep = await page.evaluate(() =>
    fetch("/api/state").then((r) => r.json()),
  );
  assert.equal(
    afterPrep.library.jobs.length,
    beforePrep.library.jobs.length,
    "reading and pinning preset drafts must not queue Agent jobs",
  );
  assert.equal(
    afterPrep.sessions[0].jobs.length,
    beforePrep.sessions[0].jobs.length,
    "practice does not change live interview jobs",
  );
  await page.screenshot({ path: "artifacts/prepared-answers.png" });
  await overlay.screenshot({ path: "artifacts/prepared-overlay.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: workspace, profile, transcript edit, pinned window, settings, preset answers, follow-ups, search, and offline reading without Agent jobs.",
  );
  async function expectWindow() {
    for (let i = 0; i < 50; i++) {
      if (app.windows().length > windowsBefore) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("overlay missing");
  }
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
