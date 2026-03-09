import { describe, it, expect } from "vitest";
import {createFrameSampler} from "../src/index.js";
import {FrameExporter as FrameExporterNode} from "../src/exporter/frame-exporter-node.runtime.js";
import {FrameExporter} from "../src/exporter/frame-exporter.js";

describe(`${FrameExporterNode.exportToJson.name}`, () => {
    it("writes JSON file in Node", async () => {
        const animated = createFrameSampler(_ => {
            return {
                x: 10,
                y: 0
            };
        });
        const frames = animated.collect({ duration: 1 });
        const outPath = await FrameExporterNode.exportToJson(frames, "test-output-times-fps", "frames");
        expect(outPath).toMatch(/frames\.json$/);
        const fs = await import("fs");
        const data = JSON.parse(fs.readFileSync(outPath, "utf8"));
        expect(data.frames).toBeDefined();
        expect(data.fps).toBe(60);
        fs.rmSync("test-output-times-fps", { recursive: true, force: true });
    });
    it("writes JSON file in Node", async () => {
        const animated = createFrameSampler(_ => {
            return {
                x: 10,
                y: 0
            };
        });
        const outPath = await FrameExporterNode.exportToJson(animated.sampleAt(0), "test-output-path", "path-export");
        expect(outPath).toMatch(/path-export\.json$/);
        const fs = await import("fs");
        const content = fs.readFileSync(outPath, "utf8");
        const data = JSON.parse(content);
        expect(data.value).toBeDefined();
        expect(typeof data.value).toBe("object");
        fs.rmSync("test-output-path", { recursive: true, force: true });
    });
    it("errors out outside of Node", async () => {
        await expect(async () => {
            return FrameExporter.exportToJson({ progress: 0, value: "" }, "", "");
        }).rejects.toThrow("only run in Node");
    });
});
