import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/ui/markdown';
describe('markdown tables', () => {
  it('renders a GFM table', () => {
    const html = renderMarkdown('Intro\n\n| Item | Value |\n|---|---|\n| Mat | **38** x 14 |\n| Deck | `3` |\n\nAfter');
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('<td><strong>38</strong> x 14</td>');
    expect(html).toContain('<p>After</p>');
  });
});
