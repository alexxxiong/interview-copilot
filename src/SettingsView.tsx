import { useState } from "react";
import { Check, LoaderCircle, PlugZap, Save, ShieldCheck } from "lucide-react";
import { api } from "./api";
import type { Settings } from "./types";
export default function SettingsView({
  settings,
  onSaved,
  profileOnly = false,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
  profileOnly?: boolean;
}) {
  const [draft, setDraft] = useState({ ...settings, apiKey: "", asrKey: "" }),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [health, setHealth] = useState<any>(null),
    [checking, setChecking] = useState(false);
  const set = (key: keyof Settings, value: any) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const { hasApiKey, hasAsrKey, keysPersisted, apiKey, asrKey, ...rest } =
        draft;
      const body = {
        ...rest,
        ...(apiKey ? { apiKey } : {}),
        ...(asrKey ? { asrKey } : {}),
      };
      onSaved(await api("/settings", body, "PUT"));
      setMessage("已保存");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-page">
      <div className="page-heading">
        <span className="eyebrow">
          {profileOnly ? "PERSONAL CONTEXT" : "WORKSPACE SETTINGS"}
        </span>
        <h1>{profileOnly ? "让提示有你的依据" : "配置你的工作台"}</h1>
        <p>
          {profileOnly
            ? "只填写真实经历。Agent 会引用这里的事实，不会替你创造项目或指标。"
            : "推理与转写分别配置，按你的工作方式组合。"}
        </p>
      </div>
      <div className="settings-content">
        <section className="settings-section">
          <h2>面试背景</h2>
          <label>
            应聘岗位
            <input
              value={draft.role}
              onChange={(e) => set("role", e.target.value)}
            />
          </label>
          <label>
            个人经历资料
            <textarea
              className="profile-input"
              placeholder="粘贴简历、项目背景、你实际负责的部分、可验证的结果……\n\n例如：项目名称 / 我的职责 / 方案与取舍 / 遇到的问题 / 结果\n没有确定的数据请留空。"
              value={draft.profile}
              onChange={(e) => set("profile", e.target.value)}
            />
          </label>
          <p className="field-note">
            资料会随问题发送给你选择的模型，用于生成经历提示。不会参与公开检索。
          </p>
        </section>
        {!profileOnly && (
          <>
            <section className="settings-section">
              <h2>
                推理 Agent <span>检索 + 独立复核</span>
              </h2>
              <div className="segmented">
                <button
                  className={draft.provider === "codex" ? "selected" : ""}
                  onClick={() => set("provider", "codex")}
                >
                  本机 Codex
                </button>
                <button
                  className={draft.provider === "openai" ? "selected" : ""}
                  onClick={() => set("provider", "openai")}
                >
                  Responses API
                </button>
              </div>
              {draft.provider === "codex" ? (
                <>
                  <p className="field-note">
                    使用本机 Codex 登录，允许 Agent
                    联网检索。每个问题先研究，再单独复核。
                  </p>
                  <div className="field-grid">
                    <label>
                      Codex 路径
                      <input
                        value={draft.codexPath}
                        onChange={(e) => set("codexPath", e.target.value)}
                      />
                    </label>
                    <label>
                      模型（留空使用 CLI 默认）
                      <input
                        value={draft.codexModel}
                        placeholder="CLI 默认模型"
                        onChange={(e) => set("codexModel", e.target.value)}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    API 地址
                    <input
                      value={draft.apiBase}
                      onChange={(e) => set("apiBase", e.target.value)}
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      模型
                      <input
                        value={draft.apiModel}
                        onChange={(e) => set("apiModel", e.target.value)}
                      />
                    </label>
                    <label>
                      API Key
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={
                          settings.hasApiKey ? "已保存，留空保留" : "sk-…"
                        }
                        value={draft.apiKey}
                        onChange={(e) => set("apiKey", e.target.value)}
                      />
                    </label>
                  </div>
                  <p className="field-note">
                    接口须支持 Responses、web_search、JSON
                    Schema。缺少检索能力会显示失败，不会自动降为普通聊天。
                  </p>
                </>
              )}
              <div className="field-grid">
                <label>
                  推理强度
                  <select
                    value={draft.effort}
                    onChange={(e) => set("effort", e.target.value)}
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高 · 默认</option>
                    <option value="xhigh">极高</option>
                  </select>
                </label>
                <label>
                  每阶段超时（秒）
                  <input
                    type="number"
                    min={30}
                    max={600}
                    value={draft.timeoutSeconds}
                    onChange={(e) =>
                      set("timeoutSeconds", Number(e.target.value))
                    }
                  />
                </label>
              </div>
            </section>
            <section className="settings-section">
              <h2>语音转写</h2>
              <div className="segmented">
                <button
                  className={draft.asrProvider === "local" ? "selected" : ""}
                  onClick={() => set("asrProvider", "local")}
                >
                  本地 Whisper
                </button>
                <button
                  className={draft.asrProvider === "openai" ? "selected" : ""}
                  onClick={() => set("asrProvider", "openai")}
                >
                  云端 API
                </button>
              </div>
              {draft.asrProvider === "local" ? (
                <>
                  <p className="field-note">
                    音频在本机处理。首次使用运行 npm run setup:asr
                    下载多语言模型（约 466 MB）。
                  </p>
                  <label>
                    whisper-cli 路径
                    <input
                      value={draft.whisperPath}
                      onChange={(e) => set("whisperPath", e.target.value)}
                    />
                  </label>
                  <label>
                    模型文件路径
                    <input
                      value={draft.whisperModel}
                      onChange={(e) => set("whisperModel", e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    转写 API 地址
                    <input
                      value={draft.asrBase}
                      onChange={(e) => set("asrBase", e.target.value)}
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      模型
                      <input
                        value={draft.asrModel}
                        onChange={(e) => set("asrModel", e.target.value)}
                      />
                    </label>
                    <label>
                      语音 API Key
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={
                          settings.hasAsrKey
                            ? "已保存，留空保留"
                            : "留空使用推理 API Key"
                        }
                        value={draft.asrKey}
                        onChange={(e) => set("asrKey", e.target.value)}
                      />
                    </label>
                  </div>
                </>
              )}
            </section>
            <section className="settings-section">
              <h2>诊断</h2>
              <button
                className="secondary-button"
                disabled={checking}
                onClick={async () => {
                  setChecking(true);
                  try {
                    setHealth(await api("/health"));
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                {checking ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <PlugZap size={16} />
                )}
                检查本机配置
              </button>
              {health && (
                <div className="health-results">
                  <p>
                    {health.codex.ok ? "✓" : "!"} Codex：{health.codex.message}
                  </p>
                  <p>
                    {health.asr.modelExists && health.asr.binaryExists
                      ? "✓"
                      : "!"}{" "}
                    本地转写：
                    {health.asr.modelExists && health.asr.binaryExists
                      ? "程序与模型文件均已找到"
                      : "请检查程序与模型路径"}
                  </p>
                  <p className="field-note">
                    此处仅检查配置。真实推理和检索请在工作台提交问题。
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        <div className="settings-save">
          <span>
            <ShieldCheck size={15} />
            {settings.keysPersisted
              ? "API Key 由系统加密后保存"
              : "浏览器模式的 API Key 仅在服务本次运行中保留"}
          </span>
          <span className="save-message">{message}</span>
          <button className="primary-button" onClick={save} disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : message === "已保存" ? (
              <Check size={16} />
            ) : (
              <Save size={16} />
            )}
            保存{profileOnly ? "资料" : "设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
