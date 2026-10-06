// Star display, with an optional fill animation.
import { h } from '../dom';

export function starsEl(n: number, max = 3, big = false): HTMLElement {
  const el = h('span', { class: `stars ${big ? 'big' : ''}`, title: `${n} of ${max} stars`, 'aria-label': `${n} stars` });
  for (let i = 0; i < max; i++) el.appendChild(h('span', { class: `s ${!big && i < n ? 'on' : ''}` }, '★'));
  return el;
}

/** Big stars that pop in one by one. Returns the element. */
export function animatedStars(n: number): HTMLElement {
  const el = starsEl(n, 3, true);
  const ss = [...el.querySelectorAll<HTMLElement>('.s')];
  ss.forEach((s, i) => {
    setTimeout(() => {
      s.classList.add('pop');
      if (i < n) s.classList.add('on');
      else s.style.opacity = '0.2';
    }, 200 + i * 260);
  });
  return el;
}
