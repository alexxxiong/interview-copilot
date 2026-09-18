export function sameOrigin(value, expected) {
  try {
    return new URL(value).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
