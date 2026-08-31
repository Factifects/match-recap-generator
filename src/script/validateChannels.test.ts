import { describe, expect, it } from "vitest";
import { diagnoseChannelsScenes } from "./validateChannels";
import type { TimedSegment } from "../model/Segment";

const CHANNELS = [
  { id: "mic", label: "MICROPHONE" },
  { id: "location", label: "LOCATION" },
  { id: "search", label: "SEARCH" },
];

const MARKS = [
  { at: 8.2, channel: "location", signals: ["running"] },
  { at: 12.6, channel: "search", signals: ["running"] },
  { at: 13.4, channel: "location", signals: ["running"] },
  { at: 20.2, channel: "search", signals: ["running"] },
  { at: 11.0, channel: "search", signals: ["cooking"] },
];

function scene(timeline: unknown[], overrides: Record<string, unknown> = {}): TimedSegment {
  return {
    type: "statement",
    text: "n",
    durationSeconds: 12,
    visual: { kind: "channels", theme: "cream", window: { from: 7, to: 23 }, channels: CHANNELS, marks: MARKS, moments: [], timeline, ...overrides },
  } as unknown as TimedSegment;
}

describe("validateChannels", () => {
  it("says nothing about a scene whose beats all hold", () => {
    const found = diagnoseChannelsScenes([
      scene([
        { type: "split", startSeconds: 1, durationSeconds: 2 },
        { type: "focus", channel: "mic", startSeconds: 4, durationSeconds: 3 },
        { type: "readout", show: "silent", startSeconds: 8, durationSeconds: 3 },
        { type: "converge", startSeconds: 12, durationSeconds: 4 },
        { type: "mute", channel: "location", startSeconds: 18, durationSeconds: 3 },
        { type: "readout", show: "delay", startSeconds: 22, durationSeconds: 3 },
      ]),
    ]);
    expect(found).toHaveLength(0);
  });

  it("catches the episode-killer: claiming a channel is empty when it isn't", () => {
    // The whole video argues the microphone recorded nothing. Put one trace on
    // it and the frame contradicts the narrator, silently.
    const found = diagnoseChannelsScenes([
      scene([{ type: "readout", show: "silent", startSeconds: 2, durationSeconds: 3 }], {
        marks: [...MARKS, { at: 15.0, channel: "mic", signals: ["running"] }],
      }),
    ]);
    expect(found.some((d) => d.category === "channels-nothing-silent")).toBe(true);
  });

  it("catches muting a channel that would actually change the answer", () => {
    const found = diagnoseChannelsScenes([
      scene([{ type: "mute", channel: "search", startSeconds: 2, durationSeconds: 3 }], {
        marks: [
          { at: 9, channel: "location", signals: ["running"] },
          { at: 11, channel: "search", signals: ["cooking"] },
          { at: 12, channel: "search", signals: ["cooking"] },
          { at: 13, channel: "search", signals: ["cooking"] },
        ],
      }),
    ]);
    expect(found.some((d) => d.category === "channels-mute-changes-answer")).toBe(true);
  });

  it("catches muting a channel that was already empty", () => {
    const found = diagnoseChannelsScenes([scene([{ type: "mute", channel: "mic", startSeconds: 2, durationSeconds: 3 }])]);
    expect(found.some((d) => d.category === "channels-mute-empty")).toBe(true);
  });

  it("catches a delay readout with nothing muted to compare against", () => {
    const found = diagnoseChannelsScenes([scene([{ type: "readout", show: "delay", startSeconds: 2, durationSeconds: 3 }])]);
    expect(found.some((d) => d.category === "channels-delay-without-mute")).toBe(true);
  });

  it("catches a converge with nothing supporting any conclusion", () => {
    const found = diagnoseChannelsScenes([scene([{ type: "converge", startSeconds: 2, durationSeconds: 3 }], { marks: [] })]);
    expect(found.some((d) => d.category === "channels-no-conclusion")).toBe(true);
  });

  it("catches a trace on a channel that does not exist, and one outside the day", () => {
    const found = diagnoseChannelsScenes([
      scene([], {
        marks: [
          { at: 9, channel: "nfc", signals: ["running"] },
          { at: 3, channel: "search", signals: ["running"] },
        ],
      }),
    ]);
    expect(found.some((d) => d.category === "channels-unknown-channel")).toBe(true);
    expect(found.some((d) => d.category === "channels-outside-window")).toBe(true);
  });

  it("catches a focus pointed at a channel that does not exist", () => {
    const found = diagnoseChannelsScenes([scene([{ type: "focus", channel: "camera", startSeconds: 2, durationSeconds: 3 }])]);
    expect(found.some((d) => d.category === "channels-focus-unknown")).toBe(true);
  });
});
