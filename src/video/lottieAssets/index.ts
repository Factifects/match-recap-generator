import type { LottieAnimationData } from "@remotion/lottie";
import type { LottieAssetKey } from "../../model/visualDefinitions";
import spinner from "./spinner.json";
import checkBurst from "./checkBurst.json";
import humanComputer from "./humanComputer.json";
import videoGoingViral from "./videoGoingViral.json";

export interface LottieAsset {
  data: LottieAnimationData;
  // Whether Canvas.tsx's <Lottie> should loop this asset for as long as the
  // object stays on screen, vs. play once and hold its last frame. Ambient/
  // ongoing motifs (a spinner, a person typing) loop; one-shot beats (a
  // checkmark burst) don't.
  loop: boolean;
}

// The rendering half of Canvas's Lottie vocabulary — LOTTIE_ASSET_KEYS
// itself (the data-level allow-list) lives in model/visualDefinitions.ts so
// the model layer never has to import animation JSON, same split as
// CANVAS_ICON_COMPONENTS/CANVAS_ICON_KEYS. `spinner`/`checkBurst` are small
// enough abstract motifs to hand-author directly as raw JSON; `humanComputer`/
// `videoGoingViral` are sourced illustrations (LottieFiles.com), dropped in
// as plain JSON files and registered the same way — see
// feedback_lottie_illustrations_sourced_not_authored memory for why these
// aren't hand-authored. The Gangnam Style script's other three story beats
// (person dancing, fix celebration, reflecting moment) ended up using the
// GIF workflow instead (see canvasObjectSchema's `gifFile` field) since a
// matching free Lottie couldn't be found for them — not every registered
// key here.
export const LOTTIE_ASSETS: Record<LottieAssetKey, LottieAsset> = {
  spinner: { data: spinner as LottieAnimationData, loop: true },
  checkBurst: { data: checkBurst as LottieAnimationData, loop: false },
  humanComputer: { data: humanComputer as LottieAnimationData, loop: true },
  videoGoingViral: { data: videoGoingViral as LottieAnimationData, loop: true },
};
