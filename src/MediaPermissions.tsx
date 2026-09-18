import { useEffect, useState } from "react";
import type { MediaPermissions as Permissions } from "./types";
import { testSystemAudio } from "./audio";

const labels: Record<string, string> = {
  granted: "已授权",
  denied: "未授权",
  restricted: "系统限制",
  "not-determined": "尚未请求",
  unknown: "未能读取",
};

export default function MediaPermissions({
  onTesting,
}: {
  onTesting: (active: boolean) => void;
}) {
  const [status, setStatus] = useState<Permissions>();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
  async function refresh() {
    try {
      setStatus(await window.desktop?.mediaStatus());
    } catch (error) {
      setResult((error as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  async function test() {
    setTesting(true);
    onTesting(true);
    setResult("正在检查音轨并播放提示音，请稍候…");
    try {
      const result = await testSystemAudio();
      setResult(
        result.peak > 0.001
          ? `测试通过：已收到系统声音（${result.audioTracks} 条音轨，峰值 ${result.peak.toFixed(3)}）。`
          : "已建立音轨，但没有检测到声音。请确认电脑能播放声音，再测试一次；若仍无声，请重开应用。",
      );
    } catch (error) {
      setResult((error as Error).message);
    } finally {
      setTesting(false);
      onTesting(false);
      void refresh();
    }
  }
  if (!window.desktop) return null;
  return (
    <div className="media-permissions">
      <div className="media-permission-row">
        <strong>系统授权与声音测试</strong>
        <span>录屏与系统录音：{labels[status?.screen || "unknown"]}</span>
        <span>麦克风：{labels[status?.microphone || "unknown"]}</span>
      </div>
      <p>
        系统音频包含电脑播放的会议声音。采集时系统可能显示录屏标识，应用仅处理音频，不保存或上传屏幕画面。
      </p>
      <div className="media-permission-row">
        <button type="button" disabled={testing} onClick={test}>
          {testing ? "正在测试声音…" : "测试系统声音"}
        </button>
        <button
          type="button"
          disabled={testing}
          onClick={() => window.desktop?.openMediaSettings("screen")}
        >
          打开录屏权限
        </button>
        <button
          type="button"
          disabled={testing}
          onClick={() => window.desktop?.openMediaSettings("microphone")}
        >
          打开麦克风权限
        </button>
        <button
          type="button"
          disabled={testing}
          onClick={() => window.desktop?.restart()}
        >
          退出并重新打开
        </button>
      </div>
      <p>
        测试会播放一声提示音，只检测音量，不保存、转写或发送音频。更改权限后请重开应用。
      </p>
      {result && (
        <p className="media-test-result" role="status">
          {result}
        </p>
      )}
    </div>
  );
}
