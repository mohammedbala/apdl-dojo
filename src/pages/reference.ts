// #/reference — searchable command list.
import type { RouteCtx } from '../app/router';
import { COMMANDS } from '../content/commands';
import { h } from '../ui/dom';
import { renderRefList } from '../ui/reference';
import { pageHead } from './common';

export function referencePage({ root, query }: RouteCtx) {
  const input = h('input', { placeholder: 'Search name, argument or description…', style: 'width:360px', value: query.get('q') ?? '' }) as HTMLInputElement;
  root.appendChild(pageHead('Command reference', `${COMMANDS.length} commands with real ANSYS argument order. Ctrl+R opens this as a drawer anywhere (counts as a peek in timed attempts).`, input));
  const list = h('div');
  root.appendChild(list);
  const render = () => renderRefList(list, input.value, true);
  input.addEventListener('input', render);
  render();
  input.focus();
}
