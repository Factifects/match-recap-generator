import React from "react";
import { staticFile } from "remotion";
import { Billboard, Html, useTexture } from "@react-three/drei";
import { COLORS, PLAYER_LABEL_STYLE } from "../theme";

// Same fallback art JerseyDisc.tsx (the 2D marker) uses when no real team
// jersey is resolved — reused here rather than re-exported from that file so
// this 3D family doesn't reach into a 2D-specific component's internals.
export const DEFAULT_JERSEY_3D = staticFile("assets/jerseys/france.png");

/** The recolored-jersey disc mesh shared by every 3D marker (player or shot)
 * — same intent as 2D's JerseyDisc.tsx (a jersey photo tinted toward the
 * team color, "a shirt, not a dot"), though the technique differs: JerseyDisc
 * uses a CSS `mix-blend-mode: color` overlay (swaps hue/saturation, keeps the
 * source photo's own luminance shading); three.js has no direct equivalent
 * inside a single material, so this multiplies the texture by `color`
 * instead (MeshBasicMaterial's texture*color) — simpler, and still reads as
 * "a jersey in this team's color," just with a bit more of the tint's own
 * darkness mixed in than the 2D version's shading-preserving blend.
 *
 * Callers must render this beneath a `<Suspense>`/`<SuspenseLoader>`
 * boundary — drei's `useTexture` suspends while the image loads, and
 * @remotion/three's `SuspenseLoader` is what tells Remotion to hold the
 * frame until that resolves, instead of capturing a blank/partial frame. */
export const JerseyMarkerBase3D: React.FC<{
  jerseyImage: string;
  color: string;
  radius?: number;
  opacity?: number;
}> = ({ jerseyImage, color, radius = 0.55, opacity = 1 }) => {
  const texture = useTexture(jerseyImage);
  return (
    <>
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[radius + 0.05, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={opacity * 0.45} />
      </mesh>
      <mesh>
        <circleGeometry args={[radius, 32]} />
        <meshBasicMaterial map={texture} color={color} transparent opacity={opacity} />
      </mesh>
    </>
  );
};

/** Billboarded player marker for the 3D pitch family — the disc always faces
 * the camera (drei's <Billboard>) and the name label renders as a real HTML
 * overlay (drei's <Html>) instead of in-world geometry, so both stay fully
 * upright and legible at any camera angle. This is the direct fix for the
 * readability risk PerspectivePitch.tsx's own docstring flagged when it
 * rejected true 3D rotation: text/markers here never tilt out of plane,
 * because they're never actually rotated with the pitch — only the camera
 * moves. `jerseyImage` is optional (the ball marker in TacticalBoard3D has no
 * team/jersey identity and just renders a flat tinted disc); every player
 * marker passes one — see DEFAULT_JERSEY_3D above. */
export const PlayerMarker3D: React.FC<{
  position: [number, number, number];
  color: string;
  jerseyImage?: string;
  label?: string;
  radius?: number;
  opacity?: number;
  highlighted?: boolean;
}> = ({ position, color, jerseyImage, label, radius = 0.55, opacity = 1, highlighted = false }) => {
  return (
    <group position={position}>
      <Billboard>
        {jerseyImage ? (
          <JerseyMarkerBase3D jerseyImage={jerseyImage} color={color} radius={radius} opacity={opacity} />
        ) : (
          <>
            <mesh position={[0, 0, -0.01]}>
              <circleGeometry args={[radius + 0.05, 32]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={opacity * 0.45} />
            </mesh>
            <mesh>
              <circleGeometry args={[radius, 32]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} />
            </mesh>
          </>
        )}
        {highlighted && (
          <mesh position={[0, 0, 0.01]}>
            <ringGeometry args={[radius + 0.06, radius + 0.16, 32]} />
            <meshBasicMaterial color={COLORS.highlight} transparent opacity={opacity * 0.85} />
          </mesh>
        )}
      </Billboard>
      {label && (
        <Html center distanceFactor={9} style={{ pointerEvents: "none" }} position={[0, -(radius + 0.45), 0]}>
          <div
            style={{
              ...PLAYER_LABEL_STYLE,
              color: COLORS.text,
              whiteSpace: "nowrap",
              textAlign: "center",
              opacity,
              // A solid pill behind the text, not just a soft text-shadow —
              // a blur-only glow depends on the backdrop staying dark enough
              // to show through; a real background guarantees contrast no
              // matter how bright the pitch itself gets.
              background: "rgba(10, 12, 14, 0.62)",
              padding: "2px 8px",
              borderRadius: 5,
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
};
