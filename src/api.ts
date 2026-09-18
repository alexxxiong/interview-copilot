let csrf = "";
export function setToken(token: string) {
  csrf = token;
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || `请求失败 ${res.status}`);
  return data;
}
export async function transcribeAudio(wav: ArrayBuffer): Promise<string> {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "audio/wav", "X-CSRF-Token": csrf },
    body: wav,
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "转写失败");
  return data.text;
}
