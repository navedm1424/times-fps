import fs from "node:fs";
import path from "node:path";
import {mkdir} from "node:fs/promises";
import type {Frame, FramesData} from "../index.js";

export namespace FrameExporter {
    async function writeJsonFile(outputDirectoryPath: string, outputFileName: string, data: any) {
        if (!(typeof (outputDirectoryPath as any) === "string" && outputDirectoryPath))
            throw new Error("Invalid output directory path.");
        if (!(typeof (outputFileName as any) === "string" && outputFileName))
            throw new Error("Invalid output file name.");

        const cwd = process.cwd();
        outputDirectoryPath = outputDirectoryPath.trim();
        outputDirectoryPath = path.resolve(cwd, outputDirectoryPath);
        await mkdir(outputDirectoryPath, { recursive: true });
        outputFileName = outputFileName.trim();

        const filePath = path.resolve(outputDirectoryPath, `${outputFileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
        return filePath;
    }

    export async function exportToJson(data: Frame<any> | FramesData<any>, outputDirectoryPath: string, outputFileName: string): Promise<string> {
        if (typeof window !== "undefined" || typeof process === "undefined" || !process.versions?.node)
            throw new Error(`${exportToJson.name} can only run in Node.js.`);

        return writeJsonFile(outputDirectoryPath, outputFileName, data);
    }
}