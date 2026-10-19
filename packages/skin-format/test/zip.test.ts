import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { filesFromMap, filesFromZip, loadSkin, MAX_PACKAGE_BYTES } from "../src/index.ts";
import { codes, fixture, readSkinFolder } from "./helpers.ts";

describe("filesFromZip", () => {
  it("loads a zipped package exactly like the folder", async () => {
    const folder = readSkinFolder(fixture("minimal"));
    const fromFolder = await loadSkin(filesFromMap(folder));
    const fromZip = await loadSkin(filesFromZip(zipSync(folder)));
    expect(fromZip).toEqual(fromFolder);
  });

  it("rejects archives over the size limit before inflating them", async () => {
    // highly compressible: tiny archive, huge declared size
    const archive = zipSync({ "skin.json": strToU8("{}"), "huge.bin": new Uint8Array(MAX_PACKAGE_BYTES + 1) });
    expect(archive.byteLength).toBeLessThan(1024 * 1024);
    expect(codes(await loadSkin(filesFromZip(archive)))).toEqual(["package-too-large"]);
  });

  it("reports a damaged archive as a missing manifest", async () => {
    expect(codes(await loadSkin(filesFromZip(new Uint8Array([1, 2, 3]))))).toEqual(["missing-manifest"]);
  });
});
