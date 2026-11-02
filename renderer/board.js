import { createDelivery } from './delivery.js';

// Only bounded RGBA data reaches this canvas; no remote markup or image URLs.
export function createBoard(element, done, { announce, phaseChanged, reduced } = {}) {
  const canvas = element.querySelector('canvas');
  const button = element.querySelector('button');
  const delivery = createDelivery({ done, announce: announce || (() => {}), reduced,
    changed(phase) {
      element.dataset.phase = phase;
      element.hidden = phase === 'idle' || phase === 'waiting';
      button.disabled = phase !== 'showing';
      phaseChanged?.(phase);
    },
  });
  button.addEventListener('click', () => delivery.dismiss());
  return {
    show(drawing) {
      if (drawing) {
        const data = new Uint8ClampedArray(drawing.pixels.match(/../g).map(v => parseInt(v, 16)));
        canvas.getContext('2d').putImageData(new ImageData(data, 64, 64), 0, 0);
      }
      delivery.show(drawing);
    },
    active: delivery.active,
    phase: delivery.phase,
    reveal: delivery.reveal,
  };
}
