import './styles.css';

import { Projector2D } from './canvas2d/projector2d';
import { clamp, getRotation, getState, onStateChange, resetState, setState } from './state';
import { Scene3D } from './three/scene3d';
import { initControls, syncControls } from './ui/controls';
import { renderMatrix } from './ui/matrixPanel';

const scene = new Scene3D(document.getElementById('viewport-3d')!, (dTheta, dPhi) => {
  const s = getState();
  setState({
    thetaDeg: clamp(s.thetaDeg + dTheta, -180, 180),
    phiDeg: clamp(s.phiDeg + dPhi, -90, 90),
  });
});

const projector = new Projector2D(
  document.getElementById('canvas-2d') as HTMLCanvasElement,
);

initControls((patch) => setState(patch), () => resetState());

document.getElementById('btn-export')!.addEventListener('click', () => projector.exportPNG());

function refresh(): void {
  const s = getState();
  const R = getRotation();
  scene.update(s);
  projector.update(s, R);
  renderMatrix(document.getElementById('matrix-panel')!, s, R);
  syncControls(s);
}

onStateChange(refresh);
refresh();
