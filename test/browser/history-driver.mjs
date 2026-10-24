// Runs a test/cases/history.mjs case in a real panel with trusted input.
import assert from 'node:assert/strict';
import { values, focused, toastText, clickLine, sleep } from './fixture.mjs';

const caret = p => p.run(() => document.activeElement?.tagName === 'MATH-FIELD' ? document.activeElement.position : null);
const settle = () => sleep(160);   // focus and caret move on the next animation frame
const beat = () => sleep(40);      // between keys: keys within ~60 ms of Enter/Backspace are a known open issue

async function check(p, want, where){
  if (want.lines) assert.deepEqual(await values(p), want.lines, where + ': lines');
  if ('focus' in want) assert.equal(await focused(p), want.focus, where + ': focus');
  if ('caret' in want) assert.equal(await caret(p), want.caret, where + ': caret');
  if (want.toast) assert.equal(await toastText(p), want.toast, where + ': toast');
}

export async function runHistory(p, c){
  let n = 0;
  const step = async ([op, ...a]) => {
    const where = `step ${++n} ${op}`;
    switch (op) {
      case 'click': await clickLine(p, a[0], a[1] || 'end'); break;
      case 'type': await p.type(a[0]); await beat(); break;
      case 'key': await p.key(a[0], a[1]); await beat(); break;
      case 'left': for (let i = 0; i < a[0]; i++) await p.key('ArrowLeft'); break;
      case 'backspace': await p.key('Backspace'); await settle(); break;
      case 'enter': await p.key('Enter'); await settle(); break;
      case 'fastEnter': await p.key('Enter'); for (let i = 1; i < a[0]; i++) { await sleep(33); await p.key('Enter', { repeat: true }); } await settle(); break;
      case 'shiftTab': for (let i = 0; i < a[0]; i++) { await p.key('Tab', { shift: true }); await sleep(40); } break;
      case 'del': await p.click(`js:document.querySelectorAll('.row [data-a=del]')[${a[0]}]`); await settle(); break;
      case 'toastUndo': await p.click('#toast button'); await settle(); break;
      case 'wait': await sleep(a[0]); break;
      case 'repeat': for (let i = 0; i < a[0]; i++) for (const s of a[1]) await step(s); break;
      case 'undo': await p.key('z', { ctrl: true }); await settle(); await check(p, a[0], where); break;
      case 'redo': await p.key('z', { ctrl: true, shift: true }); await settle(); await check(p, a[0], where); break;
      case 'expect': await settle(); await check(p, a[0], where); break;
      default: throw new Error('unknown op ' + op);
    }
  };
  for (const s of c.steps) await step(s);
}
