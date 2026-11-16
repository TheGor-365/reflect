import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// CSS regression: absolute Mindspace nodes use left/top at their CENTRE.
// Hover must preserve translate(-50%,-50%) or the card jumps right/down.
const stylesheet=readFileSync(new URL('./mindspace.css',import.meta.url),'utf8');
describe('UX R7 Mindspace card anchor stability',()=>{
  test('all hover transform rules retain the centering translate',()=>{
    const rules=[...stylesheet.matchAll(
      /\.reflect-mind-node:hover\s*\{\s*transform:\s*([^;}]+);\s*\}/g
    )].map(m=>m[1]);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatch(/translate\(-50%,\s*-50%\)/);
    expect(rules[0]).toMatch(/scale\(1\.0[0-9]+\)/);
    expect(stylesheet).not.toMatch(
      /\.reflect-mind-node:hover\s*\{\s*transform:\s*translateY\(/
    );
  });
  test('the default node is still centred before pointer interaction',()=>{
    expect(stylesheet).toMatch(
      /\.reflect-mind-node\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)/s
    );
  });
});
