import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {existsSync, readFileSync, rmSync} from "node:fs";
import {join} from "node:path";

describe("exporter", () => {
    const testDir = join(process.cwd(), "test-output-file-utils");

    beforeEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    });

    // describe("writeJsonFile", () => {
    //     it("throws on invalid output directory path", async () => {
    //         await expect(writeJsonFile("", "file", {})).rejects.toThrow("Invalid output directory path");
    //         await expect(writeJsonFile(null as any, "file", {})).rejects.toThrow();
    //     });
    //     it("throws on invalid output file name", async () => {
    //         await expect(writeJsonFile(".", "", {})).rejects.toThrow("Invalid output file name");
    //         await expect(writeJsonFile(".", null as any, {})).rejects.toThrow();
    //     });
    //     it("creates directory and writes JSON file", async () => {
    //         const filePath = await writeJsonFile(testDir, "test", { foo: "bar", n: 1 });
    //         expect(filePath).toBe(join(testDir, "test.json"));
    //         expect(existsSync(filePath)).toBe(true);
    //         const content = readFileSync(filePath, "utf8");
    //         const data = JSON.parse(content);
    //         expect(data.foo).toBe("bar");
    //         expect(data.n).toBe(1);
    //     });
    //     it("creates nested directory when recursive", async () => {
    //         const nested = join(testDir, "a", "b");
    //         const filePath = await writeJsonFile(nested, "nested", { x: 1 });
    //         expect(existsSync(filePath)).toBe(true);
    //         expect(JSON.parse(readFileSync(filePath, "utf8")).x).toBe(1);
    //     });
    // });
});

