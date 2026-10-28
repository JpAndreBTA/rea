import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { readClientConfigurationFiles } from "../../../src/application/ClientConfigurationFiles.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

it("attributes case-folded Windows overrides without disclosing values", async () => {
  const root = await createTestTempDirectory("rea-config-override-origin-");
  const configPath = join(root, "client.json");
  const client = { name: "cursor", format: "json", configPath } as const;
  const result = await readClientConfigurationFiles(
    client,
    undefined,
    "win32",
    {
      rea_asar_max_header_bytes: "0",
    },
  );
  expect(result).toMatchObject({
    ok: false,
    error: {
      detail: expect.stringContaining(
        "launch overrides (REA_ASAR_MAX_HEADER_BYTES)",
      ),
    },
  });
});

it("keeps a malformed stored environment attributed to its file", async () => {
  const root = await createTestTempDirectory("rea-config-file-origin-");
  const configPath = join(root, "client.json");
  await writeFile(
    configPath,
    JSON.stringify({
      mcpServers: {
        rea: {
          command: "rea",
          args: ["mcp"],
          env: { HOPPER_LOADER_ARGS_JSON: "not-json" },
        },
      },
    }),
  );
  const result = await readClientConfigurationFiles({
    name: "cursor",
    format: "json",
    configPath,
  });
  expect(result).toMatchObject({
    ok: false,
    error: { detail: expect.stringContaining(`Configuration ${configPath}`) },
  });
  if (!result.ok) expect(result.error.detail).not.toContain("not-json");
});
