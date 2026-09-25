import { afterEach, expect, it } from 'vitest';
import { anchorTarget } from '../../src/core/anchor';

afterEach(() => {
  document.body.innerHTML = '';
});

// A click lands on the leaf; the pin belongs to the control that owns it.
it.each([
  ['<div role="link" id="c"><span>Docs</span></div>'],
  ['<ul role="listbox"><li role="option" id="c"><span>Blue</span></li></ul>'],
  ['<div role="radiogroup"><div role="radio" id="c"><span>Monthly</span></div></div>'],
  ['<details><summary id="c"><span>More</span></summary><p>Body</p></details>'],
  ['<div role="menu"><div role="menuitemcheckbox" id="c"><span>Bold</span></div></div>'],
])('anchors a leaf inside %s to the control', (html) => {
  document.body.innerHTML = `<section data-testid="card">${html}</section>`;
  expect(anchorTarget(document.querySelector('span')!).id).toBe('c');
});
