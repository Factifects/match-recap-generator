import React, { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { CameraPose3D } from "../camera3D";

/** Applies a camera3D.ts pose to the scene's actual Three.js camera every
 * render — imperative (camera.position.set/lookAt), not a declarative prop,
 * because @remotion/three's ThreeCanvas constructs its default camera once on
 * mount and doesn't reactively diff a plain `camera` prop object thereafter.
 * `useLayoutEffect` with no dependency array runs on every render (`position`/
 * `target` are fresh arrays each Remotion frame) so the camera is exactly
 * where this frame's pose says before Remotion captures the frame. */
export const CameraRig3D: React.FC<{ pose: CameraPose3D }> = ({ pose }) => {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    if ("fov" in camera) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
};
