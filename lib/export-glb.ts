import type { Object3D } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export async function exportObjectToGLB(root: Object3D): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    try {
      const exporter = new GLTFExporter();
      root.updateMatrixWorld(true);

      exporter.parse(
        root,
        (result) => {
          try {
            const arrayBuffer =
              result instanceof ArrayBuffer
                ? result
                : new TextEncoder().encode(JSON.stringify(result)).buffer;
            resolve(new Blob([arrayBuffer], { type: "model/gltf-binary" }));
          } catch (err) {
            reject(err);
          }
        },
        (error) => {
          reject(error);
        },
        {
          binary: true,
          onlyVisible: true,
          trs: false
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}
