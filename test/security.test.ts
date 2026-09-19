import { describe, expect, it } from "vitest";

import { redactRemote, sanitizeTerminalText } from "../src/security.ts";

describe("sanitizeTerminalText", () => {
  it.each([
    "\x1b]52;c;c2VjcmV0\x07",
    "\x1b]52;c;c2VjcmV0\x1b\\",
    "\x9d52;c;c2VjcmV0\x9c",
    "\x1b[2J\x1b[H",
    "\x1b[6n",
    "\x1bPmalicious\x1b\\",
    "\x1b_Gmalicious\x1b\\",
    "\x1b]unterminated",
    "\r\n\t\b\x00\x07\x7f\x9b",
    "\u202e\u2066\u2028\u2029",
  ])("removes executable controls from %j", (payload) => {
    const result = sanitizeTerminalText(`before${payload}after`);
    // No SGR in these payloads, so no control bytes may remain at all.
    expect(
      Array.from(result).some((char) => {
        const code = char.codePointAt(0)!;
        return (
          code < 32 ||
          (code >= 127 && code <= 159) ||
          (code >= 0x2028 && code <= 0x202e) ||
          (code >= 0x2066 && code <= 0x2069)
        );
      }),
    ).toBe(false);
    expect(result).toContain("before");
  });

  it("preserves colors, Unicode and powerline glyphs", () => {
    const text = "\x1b[1;38;2;10;20;30m🐍 中文 \x1b[0m";
    expect(sanitizeTerminalText(text)).toBe(text);
  });

  it("cannot assemble a new escape sequence by stripping controls", () => {
    const text = "\x1b\x00]52;c;c2VjcmV0\x07\x1b[31mred\x1b[0m";
    const result = sanitizeTerminalText(text);
    expect(result.replaceAll("\x1b[31m", "").replaceAll("\x1b[0m", "")).not.toContain("\x1b");
    expect(sanitizeTerminalText(result)).toBe(result);
  });
});

describe("redactRemote", () => {
  it.each([
    [
      "https://user:secret@example.com/repo.git?token=secret#secret",
      "https://example.com/repo.git",
    ],
    ["https://secret@example.com/repo.git", "https://example.com/repo.git"],
    ["https://user:p%40ss@example.com/repo.git", "https://example.com/repo.git"],
    ["ssh://git:secret@example.com:2222/repo.git", "ssh://example.com:2222/repo.git"],
    ["git@example.com:repo.git", "example.com:repo.git"],
    ["secret@example.com:repo.git?secret#secret", "example.com:repo.git"],
    ["https://user:secret@[invalid", "[invalid remote]"],
    ["/local/repo.git", "/local/repo.git"],
    ["", ""],
  ])("redacts %s", (remote, expected) => {
    expect(redactRemote(remote)).toBe(expected);
  });
});
