import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { generateVideo, renderEditedTimeline, previewScene, type TimelinePayload } from "./generate";
import { makeCancelSignal, isUserCancelledRender, type RenderProgress, type CancelSignal } from "./render/renderVideo";
import type { AspectRatio, TimedSegment, AudioClipPlacement } from "./model/Segment";
import type { TtsProvider } from "./audio/resolveAudio";
import { fetchFeedItems } from "./news/fetchFeed";
import { extractArticleText } from "./news/extractArticle";
import { parseSceneScript, isSceneScript } from "./script/parseSceneScript";
import { parseAnalysisScript } from "./script/parseAnalysisScript";
import { autoFixGeometry } from "./script/validateGeometry";
import { diagnoseScenes } from "./script/validateScene";
import { sortDiagnostics, type SceneDiagnostic } from "./script/sceneDiagnostics";
import { authorScript } from "./ai/authorScript";
import { selectProvider } from "./ai/selectProvider";

const PORT = Number(process.env.PORT) || 4321;
const PUBLIC_DIR = path.join(__dirname, "..", "public-ui");
/** Built React/Vite SPA (`npm run ui:build`) — the source-of-truth `index.html`
 * used to live directly in PUBLIC_DIR as a static file; it's now Vite's build
 * output, which also emits hashed JS/CSS under dist/assets/. */
const DIST_DIR = path.join(PUBLIC_DIR, "dist");
const OUTPUT_DIR = path.join(process.cwd(), "output");
/** Where a user's own sound-effect/background-music files land after upload
 * from the timeline editor — lives under public/ (not output/) for the same
 * reason public/audio-cache/ does: Remotion needs staticFile() to reach it. */
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const NEWS_SOURCES_PATH = path.join(
  process.cwd(),
  "config",
  "news-sources.json",
);

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
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
  /** Basename (no extension) of the rendered mp4 — lets the client link to
   * `/edit/:outputName` (or POST an edited timeline back to
   * `/timeline/:outputName/render`) after generation finishes. */
  outputName: string;
  /** The final (post-audio) scene diagnostics report — present even on a
   * successful render, since soft findings never block but are still worth
   * showing once the video is done. A hard-failure abort never reaches this
   * point at all; it surfaces through the job's `error`/"failed" event
   * instead (generateVideo throws, caught below), not this field. */
  diagnostics: SceneDiagnostic[];
}

interface Job {
  emitter: EventEmitter;
  done: boolean;
  // Union, not just JobResult — startScenePreviewJob populates this with a
  // ScenePreviewJobResult instead (a genuinely different shape: no
  // segmentCount/totalSeconds/diagnostics). streamProgress's own "already
  // done by the time the SSE connection opens" fallback just forwards
  // whatever's here as JSON without caring which shape it is; every other
  // path (the live emitter events) is shape-agnostic already since it just
  // relays whatever was emit()ted.
  result?: JobResult | ScenePreviewJobResult | AuthorJobResult;
  error?: string;
}

const jobs = new Map<string, Job>();

// --- Render state machine ---------------------------------------------------
//
// There must never be two full Remotion renders (generate / scene-preview /
// timeline-render — all three spin up their own headless-Chrome workers)
// running at once: a slow render with no visible progress reads as "stuck",
// the user clicks Generate again, and now two renders are competing for the
// same already-scarce RAM — which is what actually produces render crashes,
// not any single render on its own. So exactly one render is allowed at a
// time, tracked here as one explicit state instead of an implicit "is
// something in the jobs map" check, with real cancellation wired through
// Remotion's own makeCancelSignal() rather than just marking state and
// leaving the render running underneath.
export type RenderState = "idle" | "rendering" | "completed" | "failed" | "cancelled";

let renderState: RenderState = "idle";
let activeJobId: string | null = null;
let activeLabel: string | null = null;
let activeCancel: (() => void) | null = null;

function renderBusyError(): string | null {
  if (renderState !== "rendering") return null;
  return `A render is already in progress (${activeLabel}, job ${activeJobId}). Wait for it to finish, or POST /render/cancel, before starting another — running two at once is what's been causing render crashes.`;
}

/** Wraps a render job's async body: marks the state machine busy for its
 * duration, creates the cancel signal the job itself must thread down into
 * renderVideo(), and always resolves to a terminal state afterward — success,
 * a real failure, or a user-triggered cancellation (distinguished via
 * isUserCancelledRender so a deliberate cancel doesn't get logged/reported
 * as a crash). */
async function withRenderState<T>(jobId: string, label: string, run: (cancelSignal: CancelSignal) => Promise<T>): Promise<T> {
  const { cancelSignal, cancel } = makeCancelSignal();
  renderState = "rendering";
  activeJobId = jobId;
  activeLabel = label;
  activeCancel = cancel;
  try {
    const result = await run(cancelSignal);
    renderState = "completed";
    return result;
  } catch (err) {
    renderState = isUserCancelledRender(err) ? "cancelled" : "failed";
    throw err;
  } finally {
    activeCancel = null;
  }
}

function serveFile(
  res: http.ServerResponse,
  filePath: string,
  contentType: string,
) {
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

function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown>> {
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

interface StartJobOptions {
  script: string;
  withAudio: boolean;
  aspectRatio: AspectRatio;
  ttsProvider: TtsProvider;
  edgeVoice: string | undefined;
  backgroundMusicPath: string | undefined;
  segments: TimedSegment[] | undefined;
  audioClips: AudioClipPlacement[] | undefined;
  /** Bypasses generateVideo's hard-failure gate — see generate.ts's
   * runEnforcementGate. Without this, a script with a hard scene issue
   * (an overlap, a declared-but-unrealized Flow edge, a scene with zero
   * explanatory motion) throws before any audio/render cost is spent, and
   * that error surfaces here as a normal "failed" job/SSE event — the
   * client's existing error-handling path needs no changes to show it. */
  force: boolean;
}

/** Starts generation as a background job (rather than blocking the request)
 * so the client can open an SSE connection and watch real render progress
 * instead of staring at a spinner for minutes with no feedback. */
function startJob(options: StartJobOptions): string {
  const jobId = crypto.randomUUID();
  const emitter = new EventEmitter();
  const job: Job = { emitter, done: false };
  jobs.set(jobId, job);

  withRenderState(jobId, "full generate", async (cancelSignal) => {
    try {
      const result = await generateVideo(options.script, {
        withAudio: options.withAudio,
        aspectRatio: options.aspectRatio,
        ttsProvider: options.ttsProvider,
        edgeVoice: options.edgeVoice,
        backgroundMusicPath: options.backgroundMusicPath,
        segments: options.segments,
        audioClips: options.audioClips,
        force: options.force,
        cancelSignal,
        onLog: (message) => emitter.emit("log", { message }),
        onProgress: (progress: RenderProgress) =>
          emitter.emit("progress", progress),
      });
      job.result = {
        videoUrl: `/output/${path.basename(result.outputPath)}`,
        segmentCount: result.segmentCount,
        totalSeconds: result.totalSeconds,
        usedSceneFormat: result.usedSceneFormat,
        outputName: result.outputName,
        diagnostics: result.diagnostics,
      };
      job.done = true;
      emitter.emit("complete", job.result);
    } catch (err) {
      job.error = err instanceof Error ? err.message : "Generation failed.";
      job.done = true;
      emitter.emit("failed", { error: job.error });
      // Rethrown so withRenderState can classify completed/failed/cancelled —
      // the job's own error/emitter bookkeeping above is already done, so
      // the caller below just swallows this to avoid an unhandled rejection.
      throw err;
    }
  }).catch(() => {});

  return jobId;
}

interface StartScenePreviewJobOptions {
  script: string;
  sceneIndex: number;
  withAudio: boolean;
  ttsProvider: TtsProvider;
  edgeVoice: string | undefined;
  aspectRatio: AspectRatio;
  /** Pre-generation timeline-preview edits (reordered/trimmed segments) —
   * without this, `sceneIndex` would index into a fresh re-parse of
   * `script` in its ORIGINAL order, which silently means a different scene
   * than whichever one the UI is actually showing at that index once the
   * user has reordered anything. */
  segments: TimedSegment[] | undefined;
}

interface ScenePreviewJobResult {
  videoUrl: string;
  sceneLabel: string;
  totalScenes: number;
  outputName: string;
}

/** Same background-job/SSE-progress shape as startJob — mirrors it exactly
 * rather than sharing a generic "job runner," since the two entry points
 * (generateVideo vs previewScene) have different option shapes and result
 * shapes; forcing them through one generic function would need more
 * indirection than the ~15 lines of duplication it'd save. */
function startScenePreviewJob(options: StartScenePreviewJobOptions): string {
  const jobId = crypto.randomUUID();
  const emitter = new EventEmitter();
  const job: Job = { emitter, done: false };
  jobs.set(jobId, job);

  withRenderState(jobId, "scene preview", async (cancelSignal) => {
    try {
      const result = await previewScene(options.script, {
        sceneIndex: options.sceneIndex,
        withAudio: options.withAudio,
        ttsProvider: options.ttsProvider,
        edgeVoice: options.edgeVoice,
        aspectRatio: options.aspectRatio,
        segments: options.segments,
        cancelSignal,
        onLog: (message) => emitter.emit("log", { message }),
        onProgress: (progress: RenderProgress) => emitter.emit("progress", progress),
      });
      const scenePreviewResult: ScenePreviewJobResult = {
        videoUrl: `/output/${path.basename(result.outputPath)}`,
        sceneLabel: result.sceneLabel,
        totalScenes: result.totalScenes,
        outputName: result.outputName,
      };
      job.result = scenePreviewResult;
      job.done = true;
      emitter.emit("complete", scenePreviewResult);
    } catch (err) {
      job.error = err instanceof Error ? err.message : "Scene preview failed.";
      job.done = true;
      emitter.emit("failed", { error: job.error });
      throw err;
    }
  }).catch(() => {});

  return jobId;
}

/** Same background-job/SSE-progress shape as startJob, but re-renders an
 * already-resolved timeline (from the post-generation edit view) instead of
 * parsing a script — see renderEditedTimeline in generate.ts. */
function startEditedRenderJob(timeline: TimelinePayload, sourceOutputName: string): string {
  const jobId = crypto.randomUUID();
  const emitter = new EventEmitter();
  const job: Job = { emitter, done: false };
  jobs.set(jobId, job);

  withRenderState(jobId, "timeline re-render", async (cancelSignal) => {
    try {
      const result = await renderEditedTimeline(timeline, {
        outputName: `${sourceOutputName}-edit-${Date.now()}`,
        cancelSignal,
        onProgress: (progress: RenderProgress) => emitter.emit("progress", progress),
      });
      job.result = {
        videoUrl: `/output/${path.basename(result.outputPath)}`,
        segmentCount: result.segmentCount,
        totalSeconds: result.totalSeconds,
        usedSceneFormat: result.usedSceneFormat,
        outputName: result.outputName,
        diagnostics: result.diagnostics,
      };
      job.done = true;
      emitter.emit("complete", job.result);
    } catch (err) {
      job.error = err instanceof Error ? err.message : "Render failed.";
      job.done = true;
      emitter.emit("failed", { error: job.error });
      throw err;
    }
  }).catch(() => {});

  return jobId;
}

/** Reads the sidecar JSON a completed render wrote (see renderAndPersist in
 * generate.ts) so the timeline editor can reload a finished job's resolved
 * segments. `path.basename` guards against a URL segment escaping OUTPUT_DIR. */
function loadTimelineData(outputNameRaw: string): TimelinePayload | null {
  const outputName = path.basename(outputNameRaw);
  const sidecarPath = path.join(OUTPUT_DIR, `${outputName}.json`);
  if (!fs.existsSync(sidecarPath)) return null;
  return JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
}

interface AuthorJobResult {
  /** The finished `### SCENE N` script. The client drops this straight into
   * the script box, which is what makes the whole existing pipeline — parse,
   * timeline preview, diagnostics panel, Generate — light up with no further
   * wiring. The authoring layer produces a script; it does not produce a
   * second, parallel way to make a video. */
  scriptText: string;
  title: string;
  sceneCount: number;
  diagnostics: SceneDiagnostic[];
  provider: string;
  model: string;
}

interface StartAuthorJobOptions {
  topic: string;
  aspectRatio: AspectRatio;
  targetSceneCount: number | undefined;
  llm: string | undefined;
  model: string | undefined;
}

/** Starts SCRIPT AUTHORING as a background job, reusing the same
 * emitter/SSE plumbing as the render jobs so the client watches real progress
 * ("Scene 3/6...", "repairing round 1") instead of a spinner.
 *
 * Deliberately NOT wrapped in `withRenderState`. That mutex exists because two
 * concurrent Remotion renders compete for scarce RAM and crash each other —
 * authoring spawns no headless Chrome and allocates nothing meaningful, so
 * making it contend for the render lock would only mean you cannot write the
 * next script while the current one renders. Since authoring takes minutes and
 * rendering takes longer, overlapping them is the whole point of a studio that
 * runs unattended. */
function startAuthorJob(options: StartAuthorJobOptions): string {
  const jobId = crypto.randomUUID();
  const emitter = new EventEmitter();
  const job: Job = { emitter, done: false };
  jobs.set(jobId, job);

  void (async () => {
    try {
      const provider = selectProvider(options.llm, { model: options.model });
      const result = await authorScript(provider, {
        topic: options.topic,
        aspectRatio: options.aspectRatio,
        targetSceneCount: options.targetSceneCount,
        onLog: (message) => emitter.emit("log", { message }),
      });
      job.result = {
        scriptText: result.scriptText,
        title: result.outline.title,
        sceneCount: result.scenes.length,
        diagnostics: result.diagnostics,
        provider: result.provider,
        model: result.model,
      };
      job.done = true;
      emitter.emit("complete", job.result);
    } catch (err) {
      // A missing/blocked API key and a model that could not satisfy a schema
      // after its repair rounds both land here, and both are things the author
      // can act on — so the real message is forwarded rather than flattened
      // into a generic failure.
      job.error = err instanceof Error ? err.message : "Authoring failed.";
      job.done = true;
      emitter.emit("failed", { error: job.error });
    }
  })();

  return jobId;
}

function streamProgress(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  jobId: string,
) {
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

  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (job.done) {
    send(
      job.error ? "failed" : "complete",
      job.error ? { error: job.error } : job.result,
    );
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
    const contentType =
      ASSET_CONTENT_TYPES[path.extname(fileName)] ?? "application/octet-stream";
    serveFile(res, path.join(DIST_DIR, "assets", fileName), contentType);
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/output/")) {
    const fileName = decodeURIComponent(req.url.replace("/output/", ""));
    serveFile(res, path.join(OUTPUT_DIR, fileName), "video/mp4");
    return;
  }

  // Serves a user's uploaded sfx/music files back to the browser — needed
  // so the timeline editor can fetch+decode them client-side for waveform
  // previews. Previously these files only ever needed to reach Remotion's
  // server-side staticFile() during render, never the browser directly.
  if (req.method === "GET" && req.url?.startsWith("/uploads/")) {
    const fileName = decodeURIComponent(req.url.replace("/uploads/", ""));
    const contentType = AUDIO_CONTENT_TYPES[path.extname(fileName)] ?? "application/octet-stream";
    serveFile(res, path.join(UPLOADS_DIR, fileName), contentType);
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
        res.end(
          JSON.stringify({
            items: [],
            warning: "No sources configured in config/news-sources.json.",
          }),
        );
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
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Failed to fetch news.",
        }),
      );
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
      res.end(
        JSON.stringify({
          error:
            err instanceof Error ? err.message : "Failed to extract article.",
        }),
      );
    }
    return;
  }

  if (req.method === "GET" && req.url === "/render-state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ state: renderState, jobId: activeJobId, label: activeLabel }));
    return;
  }

  if (req.method === "POST" && req.url === "/render/cancel") {
    if (!activeCancel) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No render in progress to cancel.", renderState }));
      return;
    }
    activeCancel();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/author") {
    // No renderBusyError() gate here, unlike /generate and /preview-scene:
    // authoring spends no render resources, so it stays available while a
    // video is rendering. See startAuthorJob.
    try {
      const body = await readJsonBody(req);
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      if (!topic) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Describe what the video should be about." }));
        return;
      }
      const aspectRatio: AspectRatio = body.aspectRatio === "9:16" ? "9:16" : "16:9";
      const rawSceneCount = Number(body.sceneCount);
      const targetSceneCount =
        Number.isInteger(rawSceneCount) && rawSceneCount >= 3 ? rawSceneCount : undefined;

      const jobId = startAuthorJob({
        topic,
        aspectRatio,
        targetSceneCount,
        llm: typeof body.llm === "string" ? body.llm : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jobId }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Could not start authoring." }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/parse") {
    // Preview-only: parses a script into its segments with word-count-
    // estimated durations, no narration/render involved, so the timeline
    // preview can appear the moment a script is pasted, before Generate is
    // ever clicked. Deliberately synchronous/instant — no job/SSE needed.
    try {
      const body = await readJsonBody(req);
      const script = typeof body.script === "string" ? body.script : "";
      if (!script.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Paste a script first." }));
        return;
      }
      const usedSceneFormat = isSceneScript(script);
      const segments = usedSceneFormat ? parseSceneScript(script) : parseAnalysisScript(script);
      // Diagnostics only — the segments returned to the client stay exactly
      // as parsed (autoFixGeometry's own CORRECTED segments are discarded
      // here on purpose, not returned), since this response's `segments`
      // shape is what the timeline-preview editor already consumes and
      // Generate itself re-parses/re-fixes the script fresh anyway. This is
      // purely additive: an early, free ("no narration/render involved")
      // look at what full generation would also find, so problems surface
      // before the user ever clicks Generate, not just before it renders.
      const { diagnostics: geometryDiagnostics } = autoFixGeometry(segments);
      const diagnostics: SceneDiagnostic[] = sortDiagnostics([...geometryDiagnostics, ...diagnoseScenes(segments)]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ segments, usedSceneFormat, diagnostics }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Could not parse this script." }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/generate") {
    const busy = renderBusyError();
    if (busy) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: busy, renderState }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const script = typeof body.script === "string" ? body.script : "";
      const withAudio = Boolean(body.withAudio);
      const aspectRatio: AspectRatio =
        body.aspectRatio === "9:16" ? "9:16" : "16:9";
      const ttsProvider: TtsProvider =
        body.ttsProvider === "edge" ? "edge" : "elevenlabs";
      const edgeVoice =
        typeof body.edgeVoice === "string" ? body.edgeVoice : undefined;
      const backgroundMusicPath =
        typeof body.backgroundMusicPath === "string" ? body.backgroundMusicPath : undefined;
      const segments =
        Array.isArray(body.segments) && body.segments.length > 0 ? (body.segments as TimedSegment[]) : undefined;
      const audioClips = Array.isArray(body.audioClips) ? (body.audioClips as AudioClipPlacement[]) : undefined;
      const force = Boolean(body.force);

      if (!script.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Paste a script before generating." }));
        return;
      }

      const jobId = startJob({
        script,
        withAudio,
        aspectRatio,
        ttsProvider,
        edgeVoice,
        backgroundMusicPath,
        segments,
        audioClips,
        force,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jobId }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Request failed.",
        }),
      );
    }
    return;
  }

  if (req.method === "POST" && req.url === "/preview-scene") {
    // Renders exactly one scene (see generate.ts's previewScene) instead of
    // the whole video — the actual "click Scene 03, see just that scene in
    // seconds" loop the diagnostics report above exists to make useful.
    // Same background-job/SSE-progress shape as /generate, so the client
    // reuses its existing progress-streaming hook unchanged.
    const busy = renderBusyError();
    if (busy) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: busy, renderState }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const script = typeof body.script === "string" ? body.script : "";
      const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : -1;
      const withAudio = Boolean(body.withAudio);
      const aspectRatio: AspectRatio = body.aspectRatio === "9:16" ? "9:16" : "16:9";
      const ttsProvider: TtsProvider = body.ttsProvider === "edge" ? "edge" : "elevenlabs";
      const edgeVoice = typeof body.edgeVoice === "string" ? body.edgeVoice : undefined;
      // Same convention as /generate's own `segments` field — pre-generation
      // timeline-preview edits (reorder/trim), so `sceneIndex` means the
      // same scene the UI is actually showing rather than a fresh re-parse
      // in the script's original order.
      const segments = Array.isArray(body.segments) && body.segments.length > 0 ? (body.segments as TimedSegment[]) : undefined;

      if (!script.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Paste a script before previewing a scene." }));
        return;
      }
      if (sceneIndex < 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing or invalid sceneIndex." }));
        return;
      }

      const jobId = startScenePreviewJob({ script, sceneIndex, withAudio, ttsProvider, edgeVoice, aspectRatio, segments });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jobId }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Request failed." }));
    }
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/timeline/")) {
    const outputName = decodeURIComponent(req.url.replace("/timeline/", ""));
    const data = loadTimelineData(outputName);
    if (!data) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown or not-yet-rendered video." }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...data, videoUrl: `/output/${path.basename(outputName)}.mp4` }));
    return;
  }

  if (req.method === "POST" && req.url === "/uploads/audio") {
    try {
      const body = await readJsonBody(req);
      const fileName = typeof body.fileName === "string" ? body.fileName : "";
      const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
      if (!fileName || !dataBase64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing fileName or file data." }));
        return;
      }

      // Stored filename is derived from a hash of the content, never the
      // user-supplied fileName itself (only its extension survives) — avoids
      // any path-traversal/injection risk from an arbitrary uploaded name.
      const extension = path.extname(fileName) || ".mp3";
      const hash = crypto.createHash("sha256").update(dataBase64).digest("hex").slice(0, 24);
      const storedName = `${hash}${extension}`;
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const filePath = path.join(UPLOADS_DIR, storedName);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, Buffer.from(dataBase64, "base64"));
      }

      const { durationInSeconds } = await parseMedia({
        src: filePath,
        fields: { durationInSeconds: true },
        reader: nodeReader,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ staticPath: `uploads/${storedName}`, durationSeconds: durationInSeconds ?? null }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Upload failed." }));
    }
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/timeline/") && req.url.endsWith("/render")) {
    const busy = renderBusyError();
    if (busy) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: busy, renderState }));
      return;
    }
    try {
      const outputName = path.basename(decodeURIComponent(req.url.replace("/timeline/", "").replace(/\/render$/, "")));
      const body = await readJsonBody(req);
      const segments = Array.isArray(body.segments) && body.segments.length > 0 ? (body.segments as TimedSegment[]) : null;
      const aspectRatio: AspectRatio = body.aspectRatio === "9:16" ? "9:16" : "16:9";
      const backgroundMusicPath = typeof body.backgroundMusicPath === "string" ? body.backgroundMusicPath : undefined;
      const audioClips = Array.isArray(body.audioClips) ? (body.audioClips as AudioClipPlacement[]) : undefined;

      if (!segments) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No segments to render." }));
        return;
      }

      const jobId = startEditedRenderJob({ segments, aspectRatio, backgroundMusicPath, audioClips }, outputName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jobId }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Request failed." }));
    }
    return;
  }

  if (req.method === "GET") {
    // SPA fallback: React Router owns client-side routes (/, /news, /edit/..., ...) —
    // every unmatched GET serves the same built index.html and the router
    // takes over from there, including on a hard refresh at /news or /edit/:outputName.
    serveFile(res, path.join(DIST_DIR, "index.html"), "text/html");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Tactivilizer UI running at http://localhost:${PORT}`);
});
