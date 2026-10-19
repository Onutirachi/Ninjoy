import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("manifest schema", () => {
  it("is identical to the schema in the feature contract", () => {
    expect(read("../schema/skin-manifest.v1.schema.json")).toBe(
      read("../../../specs/20261019-122142-skin-package-format/contracts/skin-manifest.v1.schema.json"),
    );
  });
});
