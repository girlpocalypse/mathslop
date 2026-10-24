// Tables for the panel's keycaps and colors modules.

export const PRETTY_LATEX = [
  ['\\sum_{#0}^{#0}', '\\sum_{n=1}^{N}'], ['\\prod_{#0}^{#0}', '\\prod_{n=1}^{N}'], ['\\int_{#?}^{#?}', '\\int_a^b'],
  ['\\lim_{#?}', '\\lim_{x\\to a}'], ['\\log_{#0}', '\\log_b'], ['\\sqrt[#0]{#?}', '\\sqrt[n]{x}'],
  ['\\frac{#@}{#?}', '\\frac{x}{y}'], ['\\frac{1}{#@}', '\\frac{1}{x}'], ['#@^2', '{x}^2'], ['#@^{#?}', '{x}^{n}'],
  ['#?^2', '{x}^2'], ['#@_{#?}', '{x}_{n}'], ['\\!#?\\,', '\\!f(x)\\,'], ['|#0|', '|{x}|'],
  ['x+#0', 'x+{y}'],                  // x is taken, so the box becomes y
  ['\\int#?\\,dx', '\\int{y}\\,dx'],  // so is the x in dx
  ['#0}', '{x}'],                     // a stray trailing brace is trimmed
  ['x', null], [42, null],            // nothing to prettify
];

export const PRETTY_CAP = [
  ['x', 'x'],
  ['#@^2', { latex: '{x}^2', insert: '#@^2' }],
  [{ latex: '#@^2' }, { latex: '{x}^2', insert: '#@^2' }],
  [{ latex: '#@^2', insert: 'Y' }, { latex: '{x}^2', insert: 'Y' }],
  [{ label: 'L', latex: '#@^2' }, { label: 'L', latex: '#@^2' }],   // a key with its own label is left alone
  [{ latex: '#0', shift: '#@^2', variants: ['#@^2', 'x'] },
    { latex: '{x}', insert: '#0', shift: { latex: '{x}^2', insert: '#@^2' }, variants: [{ latex: '{x}^2', insert: '#@^2' }, 'x'] }],
  [null, null], [5, 5],
];

export const COLOR_PALETTE = ['#99c1f1', '#ffbe6f', '#dc8add', '#f9f06b', '#f66151', '#7bdff4', '#cdab8f', '#f5a3c7'];
