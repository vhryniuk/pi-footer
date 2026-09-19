import { stripVTControlCharacters } from "node:util";

// Preserve only SGR colors/styles, never cursor movement, OSC (including clipboard
// writes), terminal queries, or embedded line breaks. Use before width calculations.
const SGR = new RegExp(String.raw`(\x1b\[[0-9;:]*m)`);
const CONTROLS = new RegExp(String.raw`[\x00-\x1f\x7f-\x9f\u2028-\u202e\u2066-\u2069]`, "g");

export function sanitizeTerminalText(text: string): string {
  return text
    .split(SGR)
    .map((part, index) =>
      index % 2 === 1 ? part : stripVTControlCharacters(part).replace(CONTROLS, ""),
    )
    .join("");
}

export function redactRemote(remote: string): string {
  const text = stripVTControlCharacters(remote).replace(CONTROLS, "");
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      // Do not fall back to displaying a malformed URL that may contain secrets.
      return "[invalid remote]";
    }
  }
  // SCP-style remotes may also use a token as the username.
  return text.replace(/^[^/]+@(?=[^/]+:)/, "").split(/[?#]/, 1)[0] ?? "";
}
