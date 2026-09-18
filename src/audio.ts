import type { Role } from "./types";
export function encodeWav(samples: Float32Array, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(buffer);
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    v.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, samples[i])) * (samples[i] < 0 ? 32768 : 32767),
      true,
    );
  return buffer;
}
export type AudioChunk = {
  wav: ArrayBuffer;
  role: Role;
  source: string;
  capturedAt: string;
  chunkId: string;
};
export type SpeechInfo = Omit<AudioChunk, "wav">;
export async function systemAudioStream() {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 320, height: 180, frameRate: 1 },
    });
  } catch (error) {
    const status = await window.desktop?.mediaStatus();
    if (status?.platform === "darwin" && status.screen !== "granted")
      throw Error(
        "请在「录屏与系统录音」中开启面试助手，再完全退出并重开应用。",
      );
    if (status?.captureDiagnostic?.error)
      throw Error(status.captureDiagnostic.error);
    throw Error(
      `系统音频启动失败：${(error as Error).message}。请打开音频采集设置测试。`,
    );
  }
  const tracks = stream.getAudioTracks();
  if (!tracks.length || tracks.every((track) => track.readyState === "ended")) {
    stream.getTracks().forEach((track) => track.stop());
    throw Error(
      "系统采集未返回可用音轨。请重开应用后测试系统声音；这不等同于未授权。",
    );
  }
  return stream;
}

// Diagnostic only: no recording, transcription, storage, or network request.
export async function testSystemAudio() {
  const stream = await systemAudioStream();
  let ctx: AudioContext | undefined;
  try {
    ctx = new AudioContext();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx
      .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
      .connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let peak = 0;
    let frames = 0;
    const sample = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      for (const value of data) peak = Math.max(peak, Math.abs(value));
      frames++;
    }, 40);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await window.desktop?.playTestSound();
      await new Promise((resolve) => setTimeout(resolve, 2400));
    } finally {
      clearInterval(sample);
    }
    if (!stream.getAudioTracks().some((track) => track.readyState === "live"))
      throw Error("系统音轨已中断，请重开应用后再试。");
    return { peak, frames, audioTracks: stream.getAudioTracks().length };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    await ctx?.close();
  }
}
export class Capture {
  private contexts: AudioContext[] = [];
  private streams: MediaStream[] = [];
  private flushers: (() => void)[] = [];
  private stopped = false;
  async start({
    mic,
    system,
    micId,
    micRole,
    systemRole,
    onChunk,
    onPreview,
    onSpeech,
    onLevel,
    onEnded,
  }: {
    mic: boolean;
    system: boolean;
    micId?: string;
    micRole: Role;
    systemRole: Role;
    onChunk: (chunk: AudioChunk) => void;
    onPreview?: (chunk: AudioChunk) => void;
    onSpeech?: (info: SpeechInfo) => void;
    onLevel: (source: string, level: number) => void;
    onEnded: () => void;
  }) {
    try {
      // Display capture is requested first, preserving the click's user activation.
      if (system) {
        const stream = await systemAudioStream();
        this.streams.push(stream);
        await this.attach(
          stream,
          systemRole,
          "会议声音",
          onChunk,
          onLevel,
          onEnded,
          onPreview,
          onSpeech,
        );
      }
      if (mic) {
        const stream = await navigator.mediaDevices
          .getUserMedia({
            audio: {
              ...(micId ? { deviceId: { exact: micId } } : {}),
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          })
          .catch((error) => {
            if (error.name === "NotAllowedError")
              throw Error(
                "麦克风未获允许。请在「隐私与安全性 → 麦克风」中开启面试助手，再重开应用。",
              );
            throw error;
          });
        this.streams.push(stream);
        await this.attach(
          stream,
          micRole,
          "麦克风",
          onChunk,
          onLevel,
          onEnded,
          onPreview,
          onSpeech,
        );
      }
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  private async attach(
    stream: MediaStream,
    role: Role,
    source: string,
    onChunk: (chunk: AudioChunk) => void,
    onLevel: (source: string, level: number) => void,
    onEnded: () => void,
    onPreview?: (chunk: AudioChunk) => void,
    onSpeech?: (info: SpeechInfo) => void,
  ) {
    const ctx = new AudioContext({ sampleRate: 16000 });
    this.contexts.push(ctx);
    await ctx.audioWorklet.addModule("/pcm-worklet.js");
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    const input = ctx.createMediaStreamSource(
      new MediaStream(stream.getAudioTracks()),
    );
    input.connect(node);
    node.connect(ctx.destination);
    await ctx.resume();
    let frames: Float32Array[] = [],
      pre: Float32Array[] = [],
      length = 0,
      silence = 0,
      voiced = 0,
      start = 0,
      chunkId = "",
      announced = false,
      previewAt = 0,
      levelAt = 0;
    const info = () => ({
      role,
      source,
      capturedAt: new Date(start).toISOString(),
      chunkId,
    });
    const snapshot = () => {
      const samples = new Float32Array(length);
      let at = 0;
      for (const frame of frames) {
        samples.set(frame, at);
        at += frame.length;
      }
      return { ...info(), wav: encodeWav(samples, ctx.sampleRate) };
    };
    const flush = () => {
      if (voiced > ctx.sampleRate * 0.25 && length > ctx.sampleRate * 0.5) {
        onChunk(snapshot());
      }
      frames = [];
      length = 0;
      silence = 0;
      voiced = 0;
      announced = false;
      previewAt = 0;
    };
    this.flushers.push(flush);
    node.port.onmessage = ({ data }: { data: Float32Array }) => {
      if (this.stopped) return;
      let power = 0;
      for (const x of data) power += x * x;
      const rms = Math.sqrt(power / data.length);
      if (Date.now() - levelAt > 80) {
        onLevel(source, Math.min(1, rms * 12));
        levelAt = Date.now();
      }
      const speech = rms > 0.008;
      if (!length && !speech) {
        pre.push(data);
        if (pre.length > 38) pre.shift();
        return;
      }
      if (!length) {
        chunkId = crypto.randomUUID();
        start =
          Date.now() - ((pre.length * data.length) / ctx.sampleRate) * 1000;
        frames = pre;
        length = frames.reduce((n, f) => n + f.length, 0);
        pre = [];
      }
      frames.push(data);
      length += data.length;
      if (speech) {
        voiced += data.length;
        silence = 0;
      } else silence += data.length;
      if (
        !announced &&
        voiced > ctx.sampleRate * 0.25 &&
        length > ctx.sampleRate * 0.5
      ) {
        announced = true;
        onSpeech?.(info());
      }
      if (silence > ctx.sampleRate * 0.9 || length > ctx.sampleRate * 18)
        flush();
      else if (
        announced &&
        onPreview &&
        length >= ctx.sampleRate * 1.6 &&
        length - previewAt >= ctx.sampleRate * 2
      ) {
        previewAt = length;
        onPreview(snapshot());
      }
    };
    for (const track of stream.getTracks())
      track.addEventListener("ended", () => {
        if (!this.stopped) onEnded();
      });
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.flushers.forEach((f) => f());
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    void Promise.allSettled(this.contexts.map((c) => c.close()));
  }
}
export async function fileToWav(file: File) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    if (audio.duration > 180) throw Error("请使用 3 分钟以内的音频片段。");
    const samples = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const channel = audio.getChannelData(c);
      for (let i = 0; i < samples.length; i++)
        samples[i] += channel[i] / audio.numberOfChannels;
    }
    return encodeWav(samples, audio.sampleRate);
  } finally {
    await ctx.close();
  }
}
