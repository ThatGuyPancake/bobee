const SHOW_MS = 6000;
const FADE_MS = 300;
const BASE = 200;

export function createBubble(rootEl, { onResize = () => {} } = {}) {
  let isVisible = false;
  let hideTimer = null;
  let fadeTimer = null;

  function hide() {
    clearTimeout(hideTimer);
    clearTimeout(fadeTimer);
    hideTimer = null;
    rootEl.classList.remove('show');
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      rootEl.hidden = true;
      isVisible = false;
      onResize(BASE);
    }, FADE_MS);
  }

  return {
    showMessage({ text, image, from } = {}) {
      clearTimeout(hideTimer);
      clearTimeout(fadeTimer);
      fadeTimer = null;
      rootEl.textContent = '';
      const p = document.createElement('div');
      p.textContent = from ? `${from}: ${text ?? ''}` : String(text ?? '');
      rootEl.appendChild(p);
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        rootEl.appendChild(img);
      }
      rootEl.hidden = false;
      isVisible = true;
      const measure = () => {
        const cs = getComputedStyle(rootEl);
        const h = Math.ceil(rootEl.offsetHeight + parseFloat(cs.marginBottom || '0'));
        onResize(BASE + h);
      };
      measure();
      if (image) {
        const img = rootEl.querySelector('img');
        img.addEventListener('load', measure, { once: true });
      }
      // Next frame so the opacity transition runs.
      requestAnimationFrame(() => rootEl.classList.add('show'));
      hideTimer = setTimeout(hide, SHOW_MS);
    },
    visible() {
      return isVisible;
    },
  };
}
