import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { generateVideo } from "./generate";
import type { RenderProgress } from "./render/renderVideo";
import type { AspectRatio } from "./model/Segment";
import type { TtsProvider } from "./audio/resolveAudio";
import { fetchFeedItems } from "./news/fetchFeed";
import { extractArticleText } from "./news/extractArticle";

const PORT = Number(process.env.PORT) || 4321;
const PUBLIC_DIR = path.join(__dirname, "..", "public-ui");
/** Built React/Vite SPA (`npm run ui:build`) — the source-of-truth `index.html`
 * used to live directly in PUBLIC_DIR as a static file; it's now Vite's build
 * output, which also emits hashed JS/CSS under dist/assets/. */
const DIST_DIR = path.join(PUBLIC_DIR, "dist");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const NEWS_SOURCES_PATH = path.join(process.cwd(), "config", "news-sources.json");

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

interface NewsSource {
  name: string;
  feedUrl: string;
}

function loadNewsSources(): NewsSource[] {
  return JSON.parse(fs.readFileSync(NEWS_SOURCES_PATH, "utf8"));
}

interface JobResult {
  videoUrl: string;
  segmentCount: number;
  totalSeconds: number;
  usedSceneFormat: boolean;
}

interface Job {
  emitter: EventEmitter;
  done: boolean;
  result?: JobResult;
  error?: string;
}

const jobs = new Map<string, Job>();

function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid request body."));
      }
    });
    req.on("error", reject);
  });
}

/** Starts generation as a background job (rather than blocking the request)
 * so the client can open an SSE connection and watch real render progress
 * instead of staring at a spinner for minutes with no feedback. */
function startJob(
  script: string,
  withAudio: boolean,
  aspectRatio: AspectRatio,
  ttsProvider: TtsProvider,
  edgeVoice: string | undefined,
): string {
  const jobId = crypto.randomUUID();
  const emitter = new EventEmitter();
  const job: Job = { emitter, done: false };
  jobs.set(jobId, job);

  (async () => {
    try {
      const result = await generateVideo(script, {
        withAudio,
        aspectRatio,
        ttsProvider,
        edgeVoice,
        onLog: (message) => emitter.emit("log", { message }),
        onProgress: (progress: RenderProgress) => emitter.emit("progress", progress),
      });
      job.result = {
        videoUrl: `/output/${path.basename(result.outputPath)}`,
        segmentCount: result.segmentCount,
        totalSeconds: result.totalSeconds,
        usedSceneFormat: result.usedSceneFormat,
      };
      job.done = true;
      emitter.emit("complete", job.result);
    } catch (err) {
      job.error = err instanceof Error ? err.message : "Generation failed.";
      job.done = true;
      emitter.emit("failed", { error: job.error });
    }
  })();

  return jobId;
}

function streamProgress(req: http.IncomingMessage, res: http.ServerResponse, jobId: string) {
  const job = jobs.get(jobId);
  if (!job) {
    res.writeHead(404);
    res.end("Unknown job");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (job.done) {
    send(job.error ? "failed" : "complete", job.error ? { error: job.error } : job.result);
    res.end();
    return;
  }

  const onLog = (data: unknown) => send("log", data);
  const onProgress = (data: unknown) => send("progress", data);
  const onComplete = (data: unknown) => {
    send("complete", data);
    cleanup();
    res.end();
  };
  const onFailed = (data: unknown) => {
    send("failed", data);
    cleanup();
    res.end();
  };
  function cleanup() {
    job!.emitter.off("log", onLog);
    job!.emitter.off("progress", onProgress);
    job!.emitter.off("complete", onComplete);
    job!.emitter.off("failed", onFailed);
    jobs.delete(jobId);
  }

  job.emitter.on("log", onLog);
  job.emitter.on("progress", onProgress);
  job.emitter.on("complete", onComplete);
  job.emitter.on("failed", onFailed);
  req.on("close", cleanup);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/assets/")) {
    const fileName = decodeURIComponent(req.url.replace("/assets/", ""));
    const contentType = ASSET_CONTENT_TYPES[path.extname(fileName)] ?? "application/octet-stream";
    serveFile(res, path.join(DIST_DIR, "assets", fileName), contentType);
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/output/")) {
    const fileName = decodeURIComponent(req.url.replace("/output/", ""));
    serveFile(res, path.join(OUTPUT_DIR, fileName), "video/mp4");
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/progress/")) {
    const jobId = decodeURIComponent(req.url.replace("/progress/", ""));
    streamProgress(req, res, jobId);
    return;
  }

  if (req.method === "GET" && req.url === "/news") {
    try {
      const sources = loadNewsSources();
      if (sources.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ items: [], warning: "No sources configured in config/news-sources.json." }));
        return;
      }
      const results = await Promise.all(
        sources.map(async (source) => {
          const items = await fetchFeedItems(source.feedUrl);
          return items.map((item) => ({ ...item, sourceName: source.name }));
        }),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: results.flat() }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to fetch news." }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/news/extract") {
    try {
      const body = await readJsonBody(req);
      const url = typeof body.url === "string" ? body.url : "";
      if (!url) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing article url." }));
        return;
      }
      const article = await extractArticleText(url);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(article));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to extract article." }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/generate") {
    try {
      const body = await readJsonBody(req);
      const script = typeof body.script === "string" ? body.script : "";
      const withAudio = Boolean(body.withAudio);
      const aspectRatio: AspectRatio = body.aspectRatio === "9:16" ? "9:16" : "16:9";
      const ttsProvider: TtsProvider = body.ttsProvider === "edge" ? "edge" : "elevenlabs";
      const edgeVoice = typeof body.edgeVoice === "string" ? body.edgeVoice : undefined;

      if (!script.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Paste a script before generating." }));
        return;
      }

      const jobId = startJob(script, withAudio, aspectRatio, ttsProvider, edgeVoice);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jobId }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Request failed." }));
    }
    return;
  }

  if (req.method === "GET") {
    // SPA fallback: React Router owns client-side routes (/, /news, ...) —
    // every unmatched GET serves the same built index.html and the router
    // takes over from there, including on a hard refresh at /news.
    serveFile(res, path.join(DIST_DIR, "index.html"), "text/html");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Match Recap Generator UI running at http://localhost:${PORT}`);
});
