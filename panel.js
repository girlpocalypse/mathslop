// mathslop — side panel UI.
// Runs under the extension's strict CSP: no eval, no new Function, no remote code.
// Anything that needs eval belongs in sandbox.js (see CLAUDE.md).
(async () => {
  const KEY = 'mathslop.v1';
  const SAMPLE = [
    'a\\coloneq 3', 'b\\coloneq 4', '\\sqrt{a^2+b^2}',
    '\\int_0^{\\pi}\\sin(x)\\,dx', '\\sum_{n=1}^{100} n',
    '\\frac{1}{3}+\\frac{1}{6}', '\\frac{d}{dx}x^3', 'e^{i\\pi}+1', 'x^2+y^2=r^2'
  ];
  const $ = id => document.getElementById(id);
  const pad = $('pad'), statusEl = $('status');

  if (!window.MathfieldElement) {
    pad.outerHTML = '<div class="err">MathLive failed to start. Reload the panel.</div>';
    return;
  }
  MathfieldElement.fontsDirectory = null;   // fonts come from vendor/mathlive/mathlive-static.css
  MathfieldElement.soundsDirectory = null;  // no keypress sounds

  // ---------- storage: chrome.storage.local, localStorage when opened outside the extension ----------
  const hasChromeStorage = !!(globalThis.chrome && chrome.storage && chrome.storage.local);
  const store = {
    async load(){
      try {
        if (hasChromeStorage) return (await chrome.storage.local.get(KEY))[KEY] ?? null;
        return JSON.parse(localStorage.getItem(KEY) || 'null');
      } catch { return null; }
    },
    save(o){
      try {
        if (hasChromeStorage) chrome.storage.local.set({ [KEY]: o });
        else localStorage.setItem(KEY, JSON.stringify(o));
      } catch {}
    }
  };
  const saved = await store.load();

  // ---------- keyboard: show real letters instead of placeholder boxes ----------
  function prettyLatex(l){
    if (typeof l !== 'string' || !/#[@?0]/.test(l)) return null;
    let out = l
      .replace(/\\(sum|prod)_\{#0\}\^\{#0\}/g, '\\$1_{n=1}^{N}')
      .replace(/\\int_\{#\?\}\^\{#\?\}/g, '\\int_a^b')
      .replace(/\\lim_\{#\?\}/g, '\\lim_{x\\to a}')
      .replace(/\\log_\{#0\}/g, '\\log_b')
      .replace(/\\sqrt\[#0\]\{#\?\}/g, '\\sqrt[n]{x}')
      .replace(/\\!#\?\\,/g, '\\!f(x)\\,')
      .replace(/\\frac\{#@\}\{#\?\}/g, '\\frac{x}{y}')
      .replace(/\\frac\{1\}\{#@\}/g, '\\frac{1}{x}')
      .replace(/#@/g, '{x}');
    const free = ['x','y','z']; let i = /x/.test(out) ? 1 : 0;
    out = out.replace(/(\^\{?|_\{?|\[)?#[?0]/g, (m, pre) => pre ? pre + 'n' : '{' + free[Math.min(i++, 2)] + '}');
    // a couple of stock keycaps carry a stray trailing brace
    while (out.endsWith('}') && (out.match(/\}/g) || []).length > (out.match(/\{/g) || []).length) out = out.slice(0, -1);
    return out;
  }
  function prettyCap(k){
    if (typeof k === 'string') { const d = prettyLatex(k); return d ? { latex: d, insert: k } : k; }
    if (!k || typeof k !== 'object') return k;
    const o = { ...k };
    if (!o.label) {
      const d = prettyLatex(o.latex);
      if (d) { if (!o.insert) o.insert = o.latex; o.latex = d; }
    }
    if (o.shift) o.shift = prettyCap(o.shift);
    if (Array.isArray(o.variants)) o.variants = o.variants.map(prettyCap);
    return o;
  }
  try {
    const vk = window.mathVirtualKeyboard;
    const src = JSON.parse(JSON.stringify(vk.normalizedLayouts));
    for (const layout of src) for (const layer of layout.layers || [])
      if (layer.rows) layer.rows = layer.rows.map(r => r.map(prettyCap));
    vk.layouts = src;
  } catch (e) { console.warn('keyboard relabel skipped', e); }

  // ---------- per-letter colors ----------
  let varColors = saved?.varColors ?? false;
  // Common variable letters come first so they land on different colors.
  const VAR_ORDER = 'xyzabcntkmpqrsuvwdfghjloe';
  const VAR_PALETTE = ['#99c1f1','#ffbe6f','#dc8add','#f9f06b','#f66151','#7bdff4','#cdab8f','#f5a3c7'];
  function colorFor(ch){
    const k = ch.toLowerCase(); let i = VAR_ORDER.indexOf(k);
    if (i < 0) i = [...k].reduce((h, c) => h * 31 + c.codePointAt(0), 7);
    if (ch !== k) i += 3;   // upper case gets its own slot so A and a stay distinguishable
    return VAR_PALETTE[Math.abs(i) % VAR_PALETTE.length];
  }
  function paint(root){
    if (!root) return;
    root.querySelectorAll('.ML__mathit').forEach(sp => {
      const ch = sp.textContent.trim();
      if (varColors && ch && [...ch].length === 1 && !'eiπ'.includes(ch)) sp.style.color = colorFor(ch);
      else if (sp.style.color) sp.style.color = '';
    });
  }
  const painted = new WeakSet();
  function watch(mf){
    const hook = () => {
      const sr = mf.shadowRoot; if (!sr || painted.has(sr)) return;
      painted.add(sr);
      new MutationObserver(() => paint(sr)).observe(sr, { childList: true, subtree: true, characterData: true });
      paint(sr);
    };
    hook(); mf.addEventListener('mount', hook);
  }
  function paintAll(){ fields().forEach(f => paint(f.shadowRoot)); rows().forEach(r => paint(r.querySelector('.res'))); }

  let mode = saved?.mode ?? 'arith';

  // ---------- toast ----------
  const toastEl = $('toast'); let toastT;
  function toast(msg, action){
    toastEl.textContent = msg;
    toastEl.classList.toggle('has-action', !!action);
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { toastEl.classList.remove('show'); action.run(); });
      toastEl.append(b);
    }
    toastEl.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), action ? 5000 : 1600);
  }
  async function copyText(text, label){
    try { await navigator.clipboard.writeText(text); toast(label); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch {}
      ta.remove(); toast(ok ? label : 'Copy blocked — use Import to select the text');
    }
  }

  // ---------- rows ----------
  const rows = () => [...pad.querySelectorAll('.row')];
  const fields = () => rows().map(r => r.querySelector('math-field'));

  function makeRow(latex = ''){
    const row = document.createElement('div'); row.className = 'row';
    const num = document.createElement('div'); num.className = 'num';
    const mf = new MathfieldElement();
    mf.smartFence = true;
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.placeholder = '\\text{…}';
    mf.value = latex;
    const res = document.createElement('div'); res.className = 'res'; res.title = 'Click to copy result';
    const acts = document.createElement('div'); acts.className = 'acts';
    acts.innerHTML = '<button type="button" data-a="copy" title="Copy this line as LaTeX">tex</button><button type="button" data-a="del" title="Delete this line">×</button>';
    row.append(num, mf, res, acts);

    mf.addEventListener('input', schedule);
    watch(mf);
    mf.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && mf.mode !== 'latex') {
        e.preventDefault(); e.stopPropagation();
        insertAfter(row).querySelector('math-field').focus();
      } else if (e.key === 'Backspace' && mf.value === '' && rows().length > 1) {
        e.preventDefault(); e.stopPropagation();
        const prev = row.previousElementSibling || row.nextElementSibling;
        const wasPrev = prev === row.previousElementSibling;
        row.remove(); renumber(); schedule();
        focusField(prev.querySelector('math-field'), wasPrev ? 'end' : 'start');
      }
    }, { capture: true });
    mf.addEventListener('move-out', e => {
      const d = e.detail.direction;
      const tgt = (d === 'upward' || d === 'backward') ? row.previousElementSibling : row.nextElementSibling;
      if (tgt && tgt.classList.contains('row')) {
        e.preventDefault();
        focusField(tgt.querySelector('math-field'), d === 'backward' || d === 'upward' ? 'end' : 'start');
      }
    });
    acts.addEventListener('click', e => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'copy') copyText(mf.value, 'Line copied as LaTeX');
      if (a === 'del') {
        if (rows().length === 1) mf.value = '';
        else { row.remove(); renumber(); }
        schedule();
      }
    });
    res.addEventListener('click', () => { if (res.dataset.latex) copyText(res.dataset.latex, 'Result copied as LaTeX'); });
    return row;
  }
  function focusField(mf, where){
    mf.focus();
    requestAnimationFrame(() => { mf.position = where === 'start' ? 0 : mf.lastOffset; });
  }
  function insertAfter(row, latex = ''){
    const n = makeRow(latex); row.after(n); renumber(); schedule(); return n;
  }
  function renumber(){
    rows().forEach((r, i) => r.querySelector('.num').textContent = i + 1);
    const n = rows().length; $('count').textContent = n + (n === 1 ? ' line' : ' lines');
  }
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'add'; addBtn.textContent = '+ add line';
  addBtn.addEventListener('click', () => insertAfter(rows().at(-1)).querySelector('math-field').focus());
  function setLines(lines){
    pad.innerHTML = '';
    (lines.length ? lines : ['']).forEach(l => pad.append(makeRow(l)));
    pad.append(addBtn); renumber(); schedule();
  }

  // ---------- math engine bridge (sandboxed iframe) ----------
  const engine = $('engine');
  let engineReady = false, reqId = 0;
  const toMarkup = l => MathLive.convertLatexToMarkup(l);

  window.addEventListener('message', ev => {
    if (ev.source !== engine.contentWindow) return;
    const m = ev.data || {};
    if (m.type === 'ready') { if (!engineReady) { engineReady = true; statusEl.textContent = ''; schedule(); } }
    else if (m.type === 'error') statusEl.textContent = 'Math engine failed to start: ' + m.message;
    else if (m.type === 'result' && m.id === reqId) applyResults(m.results || []);
  });
  // In case the sandbox said hello before this listener existed.
  engine.addEventListener('load', () => engine.contentWindow.postMessage({ type: 'ping' }, '*'));
  engine.contentWindow?.postMessage({ type: 'ping' }, '*');

  function clearResults(){
    rows().forEach(r => { const o = r.querySelector('.res'); o.innerHTML = ''; o.dataset.latex = ''; });
  }
  function applyResults(results){
    rows().forEach((r, i) => {
      const out = r.querySelector('.res'), res = results[i];
      let html = '', copy = '';
      if (res) {
        if (res.exact) { html = toMarkup('=' + res.exact); copy = res.exact; }
        if (res.approx) {
          html += (html ? '&ensp;' : '') + toMarkup((res.approxIsExact ? '=' : '\\approx ') + res.approx);
          copy = copy || res.approx;
        }
      }
      out.innerHTML = html; out.dataset.latex = copy; paint(out);
    });
  }
  function evaluateAll(){
    if (mode === 'off') { reqId++; clearResults(); return; }
    if (!engineReady) { statusEl.textContent = 'starting math engine…'; return; }
    engine.contentWindow.postMessage({ type: 'eval', id: ++reqId, mode, lines: fields().map(f => f.value) }, '*');
  }
  let t;
  function schedule(){
    clearTimeout(t);
    t = setTimeout(() => { evaluateAll(); store.save({ lines: fields().map(f => f.value), mode, varColors }); }, 220);
  }

  // ---------- answers mode ----------
  const MODE_HINT = {
    off:   '<b>Off</b> — no answers, just a place to write math.',
    arith: '<b>Arithmetic</b> — answers lines that are only numbers, or letters you gave a value with <b>:=</b>. Lines with unknowns like 2x+3x are left for you.',
    full:  '<b>Algebra</b> — also simplifies lines with unknowns: 2x+3x becomes 5x, d/dx x³ becomes 3x².'
  };
  const segBtns = [...document.querySelectorAll('.seg button')];
  function setMode(m){
    mode = MODE_HINT[m] ? m : 'arith';
    segBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    $('modehint').innerHTML = MODE_HINT[mode];
    schedule();
  }
  segBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ---------- toolbar ----------
  const bCol = $('btn-colors');
  function setColors(on){ varColors = on; bCol.setAttribute('aria-pressed', on); paintAll(); schedule(); }
  bCol.addEventListener('click', () => setColors(!varColors));

  const bKbd = $('btn-kbd');
  bKbd.addEventListener('click', () => {
    const vk = window.mathVirtualKeyboard; if (!vk) return;
    const show = !vk.visible;
    if (show) { (document.activeElement?.tagName === 'MATH-FIELD' ? document.activeElement : fields().at(-1)).focus(); vk.show(); }
    else vk.hide();
    bKbd.setAttribute('aria-pressed', show);
  });
  window.mathVirtualKeyboard?.addEventListener('geometrychange', () => {
    bKbd.setAttribute('aria-pressed', !!window.mathVirtualKeyboard.visible);
    document.body.style.paddingBottom = window.mathVirtualKeyboard.boundingRect.height + 40 + 'px';
  });

  // ---------- ☰ menu ----------
  const menu = $('menu'), bMenu = $('btn-menu');
  function openMenu(open){
    menu.hidden = !open; bMenu.setAttribute('aria-expanded', open);
    if (open) menu.querySelector('button')?.focus();
  }
  bMenu.addEventListener('click', e => { e.stopPropagation(); openMenu(menu.hidden); });
  // pointerdown + capture: math fields swallow click events, so listen before they do
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !bMenu.contains(e.target)) openMenu(false); }, true);
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); openMenu(false); bMenu.focus(); }
  });
  const menuAction = (id, fn) => $(id).addEventListener('click', () => { openMenu(false); fn(); });

  menuAction('btn-copy', () => copyText(fields().map(f => f.value).filter(Boolean).join('\n'), 'All lines copied as LaTeX'));
  menuAction('btn-clear', () => clearAll());

  function clearAll(){
    const before = fields().map(f => f.value);
    if (!before.some(Boolean)) { toast('Pad is already empty'); return; }
    setLines(['']); fields()[0].focus();
    toast('Pad cleared', { label: 'Undo', run: () => { setLines(before); toast('Pad restored'); } });
  }

  // ---------- dialogs ----------
  const keysDlg = $('keys');
  $('keys-close').addEventListener('click', () => keysDlg.close());
  menuAction('btn-keys', () => keysDlg.showModal());

  const dlg = $('dlg'), imp = $('imp');
  const parseImport = s => s.replace(/\r/g, '').split(/\n|\\\\/).map(x => x.trim()).filter(Boolean);
  menuAction('btn-import', () => { imp.value = fields().map(f => f.value).filter(Boolean).join('\n'); dlg.showModal(); imp.select(); });
  $('imp-cancel').addEventListener('click', () => dlg.close());
  $('imp-ok').addEventListener('click', () => { setLines(parseImport(imp.value)); dlg.close(); toast('Pad replaced'); });
  $('imp-append').addEventListener('click', () => {
    const cur = fields().map(f => f.value).filter(Boolean);
    setLines(cur.concat(parseImport(imp.value))); dlg.close(); toast('Lines appended');
  });

  // ---------- global shortcuts: Esc Esc clears, Ctrl+/ opens the guide ----------
  let escArmed = 0;
  window.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;        // dialogs keep their own Esc
    if (!menu.hidden) return;                                  // menu handles its own keys
    const inText = e.target.closest?.('textarea, input');
    const mf = document.activeElement?.tagName === 'MATH-FIELD' ? document.activeElement : null;
    if (e.key === 'Escape' && !inText) {
      if (mf && mf.mode === 'latex') return;                   // Esc still exits a \command
      e.preventDefault(); e.stopPropagation();
      if (Date.now() - escArmed < 1500) { escArmed = 0; clearAll(); }
      else { escArmed = Date.now(); toast('Press Esc again to clear the pad'); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'Slash' || e.key === '/' || e.key === '?')) {
      e.preventDefault(); e.stopPropagation();
      keysDlg.showModal();
    }
  }, true);

  // ---------- boot ----------
  setLines(saved?.lines?.length ? saved.lines : SAMPLE);
  setColors(varColors);
  setMode(mode);
})();
