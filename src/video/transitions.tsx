import { AbsoluteFill } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";

/** Remotion's own built-in "zoom" family (zoomBlur/dreamyZoom/zoomInOut) are
 * all WebGL2-shader presentations (they render via an OffscreenCanvas) —
 * real functionality, but a genuine render-reliability risk in a headless
 * environment that hasn't been verified to have working WebGL2 (GPU
 * drivers/flags vary machine to machine). A scene transitioning is exactly
 * the kind of thing that must never silently fail to render, so this is a
 * plain CSS scale+fade instead — same "camera zoom" feel as the Tifo
 * Football reference, zero WebGL dependency, same reliability guarantee as
 * the existing `fade()`/`none()` presentations already in use. */
function ZoomPresentation({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}: TransitionPresentationComponentProps<{ direction: "in" | "out" }>) {
  const isEntering = presentationDirection === "entering";
  // "in": entering scene grows from slightly small to full size (camera
  // pushing toward it). "out": entering scene shrinks from slightly large to
  // full size (camera pulling back to reveal it).
  const startScale = passedProps.direction === "in" ? 0.88 : 1.12;
  const scale = isEntering ? startScale + (1 - startScale) * presentationProgress : 1;
  const opacity = isEntering ? presentationProgress : 1 - presentationProgress;

  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>{children}</AbsoluteFill>
  );
}

function makeZoomPresentation(direction: "in" | "out"): TransitionPresentation<{ direction: "in" | "out" }> {
  return { component: ZoomPresentation, props: { direction } };
}

export const zoomIn = () => makeZoomPresentation("in");
export const zoomOut = () => makeZoomPresentation("out");
