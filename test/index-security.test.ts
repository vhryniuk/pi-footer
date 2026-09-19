import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { asyncCache } from "../src/cache.ts";
import type * as ConfigModule from "../src/config.ts";
import statuslineExtension from "../src/index.ts";
import type { StatuslineConfig } from "../src/types.ts";
import { taggedPiTheme } from "./helpers/theme.ts";

vi.mock("../src/config.ts", async (importOriginal) => {
  const original = await importOriginal<typeof ConfigModule>();
  return { ...original, loadConfig: async () => original.cloneConfig(original.DEFAULT_CONFIG) };
});
vi.mock("../src/ui.ts", () => ({
  openStatuslineConfigUi: async (_ctx: unknown, config: StatuslineConfig) => ({ config }),
}));

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;
type StartHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;
type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

afterEach(() => asyncCache.clear());

describe("footer trust boundary", () => {
  it.each([false, true])(
    "honors project trust (%s) in the footer and config preview",
    async (trusted) => {
      let start: StartHandler | undefined;
      let command: CommandHandler | undefined;
      let factory: FooterFactory | undefined;
      const exec = vi.fn<ExtensionAPI["exec"]>(async () => ({
        stdout: "",
        stderr: "",
        code: 128,
        killed: false,
      }));
      const pi = {
        on(name: string, handler: StartHandler) {
          if (name === "session_start") start = handler;
        },
        events: { on: vi.fn<() => void>() },
        registerCommand(_name: string, options: { handler: CommandHandler }) {
          command = options.handler;
        },
        getSessionName: () => "test",
        getActiveTools: () => [],
        exec,
      } as unknown as ExtensionAPI;
      const ctx = {
        hasUI: true,
        cwd: "/repo",
        isProjectTrusted: () => trusted,
        getContextUsage: () => undefined,
        sessionManager: {
          getSessionId: () => "test",
          getBranch: () => [],
          getEntries: () => [],
        },
        ui: {
          theme: taggedPiTheme,
          setStatus: vi.fn<() => void>(),
          setFooter(next: FooterFactory) {
            factory = next;
          },
        },
      } as unknown as ExtensionCommandContext;
      await statuslineExtension(pi);
      await start!({}, ctx);
      const footer = factory!(
        { requestRender: vi.fn<() => void>() } as unknown as Parameters<FooterFactory>[0],
        taggedPiTheme,
        {
          getGitBranch: () => "main",
          onBranchChange: () => () => {},
          getExtensionStatuses: () => new Map([["unsafe", "ok\x1b]52;c;c2VjcmV0\x07\n"]]),
        } as unknown as Parameters<FooterFactory>[2],
      );
      const output = footer.render(200).join("");
      expect(output).toContain("ok");
      expect(output).not.toContain("\x1b]52");
      expect(output).not.toContain("\n");
      expect(exec).toHaveBeenCalledTimes(trusted ? 1 : 0);

      exec.mockClear();
      await command!("", ctx);
      expect(exec).toHaveBeenCalledTimes(trusted ? 1 : 0);
      footer.dispose?.();
    },
  );
});
