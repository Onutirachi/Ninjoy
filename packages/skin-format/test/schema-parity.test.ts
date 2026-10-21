import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("manifest schema", () => {
  it("format 1 is identical to the schema in its feature contract", () => {
    expect(read("../schema/skin-manifest.v1.schema.json")).toBe(
      read("../../../specs/20261019-122142-skin-package-format/contracts/skin-manifest.v1.schema.json"),
    );
  });

  it("formats 1 and 2 are identical to the schema in the format 2 contract", () => {
    expect(read("../schema/skin-manifest.v2.schema.json")).toBe(read("../../../specs/20261021-153515-skin-format-v2/contracts/skin-manifest.v2.schema.json"));
  });
});
