import React, { createContext, useContext } from "react";

// The transform/grouping primitive the rest of the engine composes with —
// "layers" and "parent-child transforms" aren't a scene graph we need to
// invent: Three.js's own Object3D parenting already gives real transform
// inheritance for free the moment one <group> nests inside another via
// ordinary React children. This component just wraps that idiomatically with
// the properties an After-Effects-style layer actually authors against
// (position/rotation/scale/opacity/anchorPoint), instead of every scene
// hand-rolling its own <group> nesting and re-deriving the anchor-point math.

/** Three.js has no group-level opacity (only materials do) — accumulated
 * here via context instead, so a Layer's own opacity multiplies down into
 * whatever its children's materials actually are, without every leaf mesh
 * needing an explicit opacity prop threaded through by hand. Formalizes the
 * same per-object opacity multiplication Canvas3D.tsx already does ad hoc
 * (`baseOpacity * idleOpacity` etc.) as a real, nestable primitive. */
const LayerOpacityContext = createContext<number>(1);

/** Read by any leaf mesh/material inside a Layer tree — multiply this into
 * the material's own `opacity` prop. Defaults to 1 outside any Layer. */
export function useLayerOpacity(): number {
  return useContext(LayerOpacityContext);
}

export interface LayerProps {
  /** World-unit position of this layer's anchor point. Default origin. */
  position?: [number, number, number];
  /** Euler rotation in radians, applied around `anchorPoint`. Default none. */
  rotation?: [number, number, number];
  /** Uniform or per-axis scale, applied around `anchorPoint`. Default 1. */
  scale?: number | [number, number, number];
  /** Multiplies into every descendant's material opacity via context —
   * composes with any ancestor Layer's own opacity (nested layers multiply,
   * not override), the same way real compositing opacity stacks. Default 1. */
  opacity?: number;
  /** The point (in this layer's own local content space) that stays fixed at
   * `position` regardless of rotation/scale — the standard AE pivot-point
   * trick: content is shifted by `-anchorPoint` before rotate/scale is
   * applied, then the whole thing is placed at `position`. Default origin
   * (content's own local (0,0,0) is the pivot, i.e. today's plain behavior
   * with no anchor offset applied). */
  anchorPoint?: [number, number, number];
  children?: React.ReactNode;
}

const ORIGIN: [number, number, number] = [0, 0, 0];

export const Layer: React.FC<LayerProps> = ({
  position = ORIGIN,
  rotation = ORIGIN,
  scale = 1,
  opacity = 1,
  anchorPoint = ORIGIN,
  children,
}) => {
  const parentOpacity = useLayerOpacity();
  const effectiveOpacity = parentOpacity * opacity;
  const negAnchor: [number, number, number] = [-anchorPoint[0], -anchorPoint[1], -anchorPoint[2]];

  return (
    <group position={position}>
      <group rotation={rotation} scale={scale}>
        <group position={negAnchor}>
          <LayerOpacityContext.Provider value={effectiveOpacity}>{children}</LayerOpacityContext.Provider>
        </group>
      </group>
    </group>
  );
};
