import * as LJS from 'littlejsengine';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export function applyCamera(camera: Camera): void {
  LJS.setCameraPos(LJS.vec2(camera.x, camera.y));
  LJS.setCameraScale(camera.scale);
}
