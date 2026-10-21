import type {Frame, FramesData} from "../index.js";

export namespace FrameExporter {
    export async function exportToJson(data: Frame<any> | FramesData<any>, outputDirectoryPath: string, outputFileName: string): Promise<string> {
        throw new Error(`${exportToJson.name} can only run in Node.js.`);
    }
}