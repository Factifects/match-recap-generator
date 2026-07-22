import React, { Suspense, useLayoutEffect } from "react";
import { useDelayRender } from "remotion";

// @remotion/three ships an equivalent `SuspenseLoader` (its own
// SuspenseLoader.tsx), but this installed version (4.0.487) doesn't
// re-export it from the package's public entry point — only ThreeCanvas and
// the (deprecated) video-texture hooks are. Reimplemented here rather than
// deep-importing @remotion/three/dist/cjs/SuspenseLoader (blocked anyway by
// its package.json `exports` map). Same mechanism: the Suspense fallback
// holds Remotion's render via delayRender/continueRender until whatever
// suspended (drei's useTexture loading a jersey PNG) resolves, so a frame is
// never captured mid-load.
const Unblocker: React.FC = () => {
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    const handle = delayRender("Waiting for <Suspense /> inside a 3D pitch scene to resolve");
    return () => continueRender(handle);
  }, [delayRender, continueRender]);
  return null;
};

export const SuspenseLoader3D: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<Unblocker />}>{children}</Suspense>
);
