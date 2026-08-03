/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(enableTailwind);
// Matches src/render/renderVideo.ts's own chromiumOptions.gl — the CLI
// (studio/still/render) has its own separate Chromium launch path that
// doesn't read that Node API config, so it needs the same override here or
// any WebGL scene (Canvas3D, InfiniteRoadBenchmark) fails to get a GL
// context in headless Chromium ("Error creating WebGL context").
Config.setChromiumOpenGlRenderer("swangle");
