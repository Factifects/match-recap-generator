import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimedSegment } from "../model/Segment";
import { resolveSegmentAudio, resolveSegmentSfxCue, resolveSegmentSfxClueCues } from "./resolveAudio";
import { buildAudioCacheKey } from "./elevenLabs";

const { mockGenerateSoundEffect, mockGenerateSpeech, mockGenerateSpeechEdge } = vi.hoisted(() => ({
  mockGenerateSoundEffect: vi.fn(),
  mockGenerateSpeech: vi.fn(),
  mockGenerateSpeechEdge: vi.fn(),
}));

vi.mock("./elevenLabs", async () => {
  const actual = await vi.importActual<typeof import("./elevenLabs")>("./elevenLabs");
  return {
    ...actual,
    generateSoundEffect: mockGenerateSoundEffect,
    generateSpeech: mockGenerateSpeech,
  };
});

vi.mock("./edgeTts", () => ({
  generateSpeechEdge: mockGenerateSpeechEdge,
}));

beforeEach(() => {
  mockGenerateSoundEffect.mockReset();
  mockGenerateSpeech.mockReset();
  mockGenerateSpeech.mockResolvedValue({
    audioFilePath: "/tmp/narration.mp3",
    staticFilePath: "audio-cache/narration.mp3",
    durationSeconds: 3,
  });
  mockGenerateSpeechEdge.mockResolvedValue({
    audioFilePath: "/tmp/narration-edge.mp3",
    staticFilePath: "audio-cache/narration-edge.mp3",
    durationSeconds: 3,
  });
  mockGenerateSoundEffect.mockResolvedValue({
    audioFilePath: "/tmp/sfx.mp3",
    staticFilePath: "audio-cache/sfx.mp3",
    durationSeconds: 0.6,
  });
});

describe("resolveSegmentSfxCue (whole-scene fallback, no per-action sound cues)", () => {
  it("returns an entrance cue for a plain Canvas scene", () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: { kind: "canvas", objects: [{ id: "a", type: "dot", x: 50, y: 50 }] },
    } as TimedSegment;

    const cue = resolveSegmentSfxCue(segment);
    expect(cue?.prompt).toContain("micro click");
  });

  it("returns a move cue for Canvas scenes driven by timeline move actions", () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: {
        kind: "canvas",
        objects: [{ id: "a", type: "dot", x: 50, y: 50 }],
        timeline: [{ type: "move", id: "a", startSeconds: 0, durationSeconds: 0.8, to: { x: 20 } }],
      },
    } as TimedSegment;

    const cue = resolveSegmentSfxCue(segment);
    expect(cue?.prompt).toContain("glide");
  });

  it("returns a zoom cue for Canvas scenes with multi-phase camera motion", () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: {
        kind: "canvas",
        objects: [{ id: "a", type: "dot", x: 50, y: 50 }],
        phases: [{ objects: [{ id: "a", type: "dot", x: 50, y: 50 }] }, { objects: [{ id: "a", type: "dot", x: 60, y: 50 }] }],
        camera: { x: 50, y: 50, zoom: 1.2 },
      },
    } as TimedSegment;

    const cue = resolveSegmentSfxCue(segment);
    expect(cue?.prompt).toContain("riser");
  });

  it("returns a chapter transition cue for chapter segments", () => {
    const segment = { type: "chapter", text: "Chapter" } as TimedSegment;
    const cue = resolveSegmentSfxCue(segment);
    expect(cue?.prompt).toContain("page turn");
  });
});

describe("resolveSegmentSfxClueCues (per-action sound cues)", () => {
  it("pulls every timeline action with an explicit sound cue, in authored order", () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: {
        kind: "canvas",
        objects: [{ id: "a", type: "dot", x: 50, y: 50 }],
        timeline: [
          { type: "appear", id: "a", startSeconds: 0.3, sound: "entrance" },
          { type: "move", id: "a", startSeconds: 1, durationSeconds: 0.5, to: { x: 60 }, sound: "click" },
          { type: "move", id: "a", startSeconds: 2, durationSeconds: 0.5, to: { x: 70 } },
        ],
      },
    } as TimedSegment;

    const cues = resolveSegmentSfxClueCues(segment);
    expect(cues).toEqual([
      { event: "entrance", startSeconds: 0.3 },
      { event: "click", startSeconds: 1 },
    ]);
  });

  it("returns undefined (not empty) when a timeline exists but no action opted into sound", () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: {
        kind: "canvas",
        objects: [{ id: "a", type: "dot", x: 50, y: 50 }],
        timeline: [{ type: "appear", id: "a", startSeconds: 0.3 }],
      },
    } as TimedSegment;

    expect(resolveSegmentSfxClueCues(segment)).toBeUndefined();
  });
});

describe("resolveSegmentAudio", () => {
  it("generates sound effects for Canvas scenes even when narration uses edge TTS", async () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: { kind: "canvas", objects: [{ id: "a", type: "dot", x: 50, y: 50 }] },
    } as TimedSegment;

    await resolveSegmentAudio([segment], { provider: "edge" });

    expect(mockGenerateSoundEffect).toHaveBeenCalled();
  });

  it("places per-action sound cues at their own startSeconds as sfxClips, not one whole-scene sfxStaticPath", async () => {
    const segment = {
      type: "statement",
      text: "hello",
      visual: {
        kind: "canvas",
        objects: [{ id: "a", type: "dot", x: 50, y: 50 }],
        timeline: [
          { type: "appear", id: "a", startSeconds: 0.3, sound: "entrance" },
          { type: "move", id: "a", startSeconds: 1, durationSeconds: 0.5, to: { x: 60 }, sound: "success" },
        ],
      },
    } as TimedSegment;

    const [resolved] = await resolveSegmentAudio([segment]);
    expect(resolved.sfxStaticPath).toBeUndefined();
    expect(resolved.sfxClips).toHaveLength(2);
    expect(resolved.sfxClips?.[0].startSeconds).toBe(0.3);
    expect(resolved.sfxClips?.[1].startSeconds).toBe(1);
  });

  it("uses a stable cache key for equivalent sound effect requests", () => {
    const keyA = buildAudioCacheKey("sfx", "cinematic whoosh", 1.1);
    const keyB = buildAudioCacheKey("sfx", "cinematic whoosh", 1.1);

    expect(keyA).toBe(keyB);
  });
});
