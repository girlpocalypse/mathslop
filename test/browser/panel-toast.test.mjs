// panel toast: toasts, the Undo toast, copying, and the "close the menu first" guard.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, toastText, settled, clickLine, sleep } from './fixture.mjs';

const ctx = useBrowser();
const shown = p => p.run(() => [document.getElementById('toast').classList.contains('show'), document.getElementById('toast').inert]);
const grant = async () => ctx.b.send('Browser.grantPermissions', { origin: (await ctx.b.panelUrl()).replace(/\/panel\.html$/, ''),
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
const clipboard = p => p.run(() => navigator.clipboard.readText());

describe('toasts', () => {
  test('a plain toast goes after about 1.6 s and is inert once hidden', async t => {
    const p = await panel(t, ctx, { lines: [''], mode: 'off' });
    await clickLine(p, 0); await p.key('Escape');
    assert.deepEqual(await shown(p), [true, false]);
    await sleep(1200); assert.deepEqual(await shown(p), [true, false]);
    await sleep(700); assert.deepEqual(await shown(p), [false, true]);
  });
  test('an Undo toast stays about 5 s, and a focused Undo hands the focus to "+ add line" as it goes', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await p.click('js:document.querySelectorAll(".row [data-a=del]")[1]'); await sleep(100);
    await p.run(() => document.querySelector('#toast button').focus());
    await sleep(4000); assert.deepEqual(await shown(p), [true, false]);
    await sleep(1300); assert.deepEqual(await shown(p), [false, true]);
    assert.equal(await p.run(() => document.activeElement.className), 'add');
  });
  test('a step that changes nothing says so', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(100);
    await p.click('#imp-ok'); await sleep(150);   // the box is prefilled with the pad itself
    assert.equal(await toastText(p), 'Nothing changed');
    assert.deepEqual(await values(p), ['1', '2']);
  });
  test('Clear pad on an empty pad says so', async t => {
    const p = await panel(t, ctx, { lines: [''], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-clear'); await sleep(100);
    assert.equal(await toastText(p), 'Pad is already empty');
  });
});

describe('copying', () => {
  test('tex copies the line as portable LaTeX; Shift+click copies an answer', async t => {
    const p = await panel(t, ctx, { lines: ['e^{i\\pi}+\\sqrt{-4}'], mode: 'full' });
    await grant();
    await p.waitFor(() => document.querySelector('.row .res .part'), { what: 'the answer', timeout: 10000 });
    await p.click('.row [data-a=copy]'); await sleep(150);
    assert.equal(await toastText(p), 'Line copied as LaTeX');
    assert.equal(await clipboard(p), 'e^{i\\pi}+\\sqrt{-4}');
    await p.click('.row .res .part', { shift: true }); await sleep(150);
    assert.equal(await toastText(p), 'Answer copied as LaTeX');
    assert.equal(await clipboard(p), '-1+2i', 'CE\'s \\imaginaryI copied as i');
  });
  test('without the clipboard API: the copy-command fallback; with neither, a hint', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await p.run(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
    await p.click('.row [data-a=copy]'); await sleep(150);
    assert.match(await toastText(p), /^(Line copied as LaTeX|Copy blocked — use Import to select the text)$/);
    await p.run(() => { document.execCommand = () => false; });
    await p.click('.row [data-a=copy]'); await sleep(150);
    assert.equal(await toastText(p), 'Copy blocked — use Import to select the text');
  });
});

describe('with a menu open in a line', () => {
  for (const [what, act] of [
    ['×', p => p.run(() => document.querySelectorAll('.row [data-a=del]')[1].click())],
    ['Clear pad', p => p.run(() => document.getElementById('btn-clear').click())],
    ['Import…', p => p.run(() => document.getElementById('btn-import').click())],
  ]) test(`${what} only asks to close the menu`, async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    const [x, y] = await p.point('js:document.querySelectorAll(".row math-field")[0]', { dx: 0.3 });
    await p.mouse('mouseMoved', x, y); await p.mouse('mousePressed', x, y, { button: 'right' }); await p.mouse('mouseReleased', x, y, { button: 'right' });
    await sleep(250);
    await act(p); await sleep(100);
    assert.equal(await toastText(p), 'Close the menu in the line first');
    assert.deepEqual(await values(p), ['1', '2']);
    assert.equal(await p.run(() => document.getElementById('dlg').open), false);
  });
  test('the toast\'s Undo only asks to close the menu', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await p.click('js:document.querySelectorAll(".row [data-a=del]")[1]'); await sleep(100);
    const [x, y] = await p.point('js:document.querySelectorAll(".row math-field")[0]', { dx: 0.3 });
    await p.mouse('mouseMoved', x, y); await p.mouse('mousePressed', x, y, { button: 'right' }); await p.mouse('mouseReleased', x, y, { button: 'right' });
    await sleep(250);
    await p.run(() => document.querySelector('#toast button').click()); await sleep(100);
    assert.equal(await toastText(p), 'Close the menu in the line first');
    assert.deepEqual(await values(p), ['1']);
  });
});
