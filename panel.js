// mathslop — side panel UI.
// Runs under the extension's strict CSP: no eval, no new Function, no remote code.
// Anything that needs eval belongs in sandbox.js (see CLAUDE.md).
(async () => {
  const KEY = 'mathslop.v1';
  const SAMPLE = [
    'a\\coloneq 3', 'b\\coloneq 4', '\\sqrt{a^2+b^2}',
    '\\int_0^{\\pi}\\sin(x)\\,dx', '\\sum_{n=1}^{100} n',
    '\\frac{1}{3}+\\frac{1}{6}', '\\frac{d}{dx}x^3', 'e^{i\\pi}+1', 'x^2+y^2=r^2',
    'f(x)\\coloneq x^2+1', 'f(3)'
  ];
  const PLACES = ['auto', 0, 1, 2, 3, 4, 5, 6, 8, 10];
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

  // ---------- settings ----------
  let mode = saved?.mode ?? 'off';
  let angle = saved?.angle === 'deg' ? 'deg' : 'rad';
  let places = PLACES.includes(saved?.places) ? saved.places : 'auto';
  let order = saved?.order === 'decimal' ? 'decimal' : 'exact';
  let copyFmt = saved?.copyFmt === 'text' ? 'text' : 'latex';
  let copyAns = saved?.copyAns ?? true;
  function persist(){
    store.save({ lines: fields().map(f => f.value), mode, varColors, angle, places, order, copyFmt, copyAns });
  }

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
  // An Undo toast is for the step it announced; any later step (or undo) takes it away.
  const dropUndoToast = () => { if (toastEl.classList.contains('has-action')) toastEl.classList.remove('show'); };
  // Compute Engine writes e and i as \exponentialE and \imaginaryI, which other LaTeX tools don't know.
  const portable = l => l.replace(/\\exponentialE(?![A-Za-z])/g, 'e').replace(/\\imaginaryI(?![A-Za-z])/g, 'i')
    .replace(/\\differentialD(?![A-Za-z])/g, '\\mathrm{d}');
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
  let lastField = null;   // the line an answer click goes into
  pad.addEventListener('focusin', e => { if (e.target.tagName === 'MATH-FIELD') lastField = e.target; });

  function makeRow(latex = ''){
    const row = document.createElement('div'); row.className = 'row';
    const num = document.createElement('div'); num.className = 'num';
    const mf = new MathfieldElement();
    mf.smartFence = true;
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.placeholder = '\\text{…}';
    // No read-aloud (Ctrl+Alt+↑/↓), see CLAUDE.md. Undo is the pad's own (see "undo" below).
    // keybindings and inlineShortcuts throw until the field is mounted.
    mf.addEventListener('mount', () => {
      mf.keybindings = mf.keybindings.filter(k => !['speak', 'undo', 'redo'].includes([].concat(k.command)[0]));
      mf.inlineShortcuts = { ...mf.inlineShortcuts, ans: '\\mathrm{ans}' };
    });
    mf.value = latex;
    const res = document.createElement('div'); res.className = 'res';
    const acts = document.createElement('div'); acts.className = 'acts';
    acts.innerHTML = '<button type="button" data-a="copy" title="Copy this line as LaTeX">tex</button><button type="button" data-a="del" title="Delete this line">×</button>';
    row.append(num, mf, res, acts);

    mf.addEventListener('input', () => { hist.typed(row); schedule(); });
    watch(mf);
    let tabbing = false;   // move-out from Tab: let focus go on in page order (answer, tex, ×, next line)
    mf.addEventListener('keydown', e => {
      tabbing = e.key === 'Tab';
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && mf.mode !== 'latex') {
        e.preventDefault(); e.stopPropagation();
        hist.change(() => focusIn(insertAfter(row)));
      } else if (e.key === 'Backspace' && mf.value === '' && rows().length > 1) {
        e.preventDefault(); e.stopPropagation();
        const prev = row.previousElementSibling || row.nextElementSibling;
        const wasPrev = prev === row.previousElementSibling;
        hist.change(() => { row.remove(); renumber(); schedule(); return focusField(prev.querySelector('math-field'), wasPrev ? 'end' : 'start'); });
      }
    }, { capture: true });
    mf.addEventListener('move-out', e => {
      if (tabbing) return;
      const d = e.detail.direction;
      const tgt = (d === 'upward' || d === 'backward') ? row.previousElementSibling : row.nextElementSibling;
      if (tgt && tgt.classList.contains('row')) {
        e.preventDefault();
        focusField(tgt.querySelector('math-field'), d === 'backward' || d === 'upward' ? 'end' : 'start');
      }
    });
    acts.addEventListener('click', e => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'copy') copyText(portable(mf.value), 'Line copied as LaTeX');
      if (a === 'del') {
        const n = rows().indexOf(row) + 1, had = mf.value !== '';
        const step = hist.change(() => {
          if (rows().length === 1) mf.setValue('', { silenceNotifications: true });
          else { row.remove(); renumber(); }
        });
        schedule();
        if (had) undoToast('Line ' + n + ' deleted', 'Line restored', step);
      }
    });
    // Click (or Enter on) an answer: into the line last edited. With Shift: copy it.
    const pick = e => {
      const parts = answerParts(resultOf.get(row));
      if (!parts.length) return;
      const p = parts[+(e.target.closest('.part')?.dataset.i ?? 0)] || parts[0];
      if (e.shiftKey) copyText(portable(p.latex), 'Answer copied as LaTeX');
      else useAnswer(row, p.latex, p.group);
    };
    res.addEventListener('click', pick);
    res.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.part')) { e.preventDefault(); pick(e); }
    });
    return row;
  }
  function focusField(mf, where){
    mf.focus();
    requestAnimationFrame(() => { mf.position = where === 'start' ? 0 : mf.lastOffset; });
    return mf;
  }
  const focusIn = row => { const mf = row.querySelector('math-field'); mf.focus(); return mf; };
  function insertAfter(row, latex = ''){
    const n = makeRow(latex); row.after(n); renumber(); schedule(); return n;
  }
  function renumber(){
    rows().forEach((r, i) => {
      r.querySelector('.num').textContent = i + 1;
      r.querySelector('math-field').setAttribute('aria-label', 'Line ' + (i + 1));
    });
    const n = rows().length; $('count').textContent = n + (n === 1 ? ' line' : ' lines');
  }
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'add'; addBtn.textContent = '+ add line';
  addBtn.addEventListener('click', () => hist.change(() => focusIn(insertAfter(rows().at(-1)))));
  function setLines(lines){
    pad.innerHTML = '';
    (lines.length ? lines : ['']).forEach(l => pad.append(makeRow(l)));
    pad.append(addBtn); renumber(); schedule();
  }
  // An answer goes into the line that had the focus, at its caret. Clicking the answer of that same
  // line (or with no line focused yet) starts a new line below with the answer.
  function useAnswer(from, latex, group){
    const target = lastField?.isConnected && lastField.closest('.row') !== from ? lastField : null;
    hist.change(() => {
      if (!target) return focusIn(insertAfter(from, latex));
      target.focus();
      // A sum or a negative number keeps its brackets inside another expression: 2·(x+1), not 2·x+1.
      const wrap = group && target.value.trim() !== '';
      target.insert(wrap ? '\\left(' + latex + '\\right)' : latex, { insertionMode: 'replaceSelection', selectionMode: 'after', format: 'latex' });
      return target;
    });
    schedule();
  }

  // ---------- undo: one history for the whole pad ----------
  // Typing, new and deleted lines, clear and import all go on one list, so Ctrl+Z steps back through
  // the pad in order, whichever line has the focus. MathLive's per-line undo is switched off in makeRow,
  // and the on-screen keyboard's undo/redo buttons are sent here too (see "global shortcuts").
  // Keystrokes in the same line less than a second apart are one step.
  const hist = (() => {
    const MAX = 200;
    let past = [], future = [], cur = null, groupRow = null, groupT = 0, quiet = false;
    const sameLines = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    function snap(focus){
      const fs = fields();
      let i = fs.indexOf(focus || document.activeElement); if (i < 0) i = fs.indexOf(lastField);
      return { lines: fs.map(f => f.value), focus: i, pos: i >= 0 ? fs[i].position : 0 };
    }
    function push(){ past.push(cur); if (past.length > MAX) past.shift(); future = []; dropUndoToast(); }
    const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
    // The keyboard's undo/redo buttons are dimmed from these (panel.css), not from MathLive's own history.
    function sync(){ document.body.dataset.undo = past.length ? 'yes' : 'no'; document.body.dataset.redo = future.length ? 'yes' : 'no'; }
    // Put the pad back to state s (coming from state `from`), with the focus on the line that changed.
    function restore(s, from){
      quiet = true;
      try {
        const fs = fields();
        if (fs.length === s.lines.length) fs.forEach((f, i) => { if (f.value !== s.lines[i]) f.setValue(s.lines[i], { silenceNotifications: true }); });
        else setLines(s.lines);
      } finally { quiet = false; }
      schedule(); dropUndoToast();
      let i = firstDiff(from.lines, s.lines); if (i < 0) i = s.focus;
      const mf = fields()[Math.min(i, s.lines.length - 1)], pos = i === s.focus ? s.pos : Infinity;
      if (mf) { mf.focus(); requestAnimationFrame(() => { mf.position = Math.min(pos, mf.lastOffset); }); }
    }
    return {
      reset(){ past = []; future = []; cur = snap(); groupRow = null; sync(); },
      typed(row){
        if (quiet) return;
        const s = snap(), now = Date.now();
        if (sameLines(s.lines, cur.lines)) { cur = s; return; }
        if (row !== groupRow || now - groupT > 1000) push();
        cur = s; groupRow = row; groupT = now; future = []; sync();
      },
      // Run a change to the pad as one undo step. fn may return the math field it leaves the focus in.
      // Returns the step (for undoToast), or null if nothing changed.
      change(fn){
        if (quiet) { fn(); return null; }
        push(); quiet = true;
        let focus;
        try { focus = fn(); } finally { quiet = false; }
        cur = snap(focus); groupRow = null;
        const step = past.at(-1);
        if (sameLines(cur.lines, step.lines)) { past.pop(); sync(); return null; }   // nothing changed after all
        sync(); return step;
      },
      undo(){ if (!past.length) return false; const from = cur; future.push(cur); cur = past.pop(); groupRow = null; restore(cur, from); sync(); return true; },
      redo(){ if (!future.length) return false; const from = cur; past.push(cur); cur = future.pop(); groupRow = null; restore(cur, from); sync(); return true; },
      isLatest: step => past.at(-1) === step
    };
  })();
  // A toast with Undo for one step. It only ever undoes that step: once anything else happens, it's gone.
  function undoToast(msg, done, step){
    if (!step) { toast('Nothing changed'); return; }
    toast(msg, { label: 'Undo', run: () => { if (hist.isLatest(step)) { hist.undo(); toast(done); } } });
  }

  // ---------- math engine bridge (sandboxed iframe) ----------
  // Only the newest request's answers are shown. The engine stops a line itself after 1.5 s and says
  // which line it is on before each one, so WATCHDOG_MS without any message means it is stuck: the
  // frame is replaced, and the line it was on is skipped from then on ("took too long").
  const WATCHDOG_MS = 3000;
  let engine = $('engine'), engineReady = false, reqId = 0, dog = 0, busy = null;
  const inflight = new Map();   // id → request, until its result (or a newer one's) arrives
  const slowKeys = new Set();   // lines that took too long, keyed by what their answer depends on:
  // the line, the := lines above it, and every line above when it uses ans.
  const lineKey = (req, i) => {
    const above = req.lines.slice(0, i), line = req.lines[i];
    const deps = line.includes('\\mathrm{ans}') ? above : above.filter(l => /\\coloneqq?|:=/.test(l));
    return JSON.stringify([req.mode, deps, line]);
  };
  // A line's answer from a request, with skipped lines shown as "took too long" and slow ones remembered.
  function lineResult(req, i, r){
    if (req.skip.includes(i)) return { slow: true };
    if (r?.slow) slowKeys.add(lineKey(req, i));
    return r ?? null;
  }
  const toMarkup = l => MathLive.convertLatexToMarkup(l);

  function hookEngine(){
    const frame = engine;
    // In case the sandbox said hello before the message listener existed.
    frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'ping' }, '*'));
  }
  hookEngine();
  function armDog(){ clearTimeout(dog); dog = inflight.size ? setTimeout(hung, WATCHDOG_MS) : 0; }
  function hung(){
    dog = 0;
    const req = busy && inflight.get(busy.id);
    if (req) slowKeys.add(lineKey(req, busy.line));
    else for (const r of inflight.values()) r.lines.forEach((_, i) => slowKeys.add(lineKey(r, i)));
    inflight.clear(); busy = null; engineReady = false;
    const fresh = engine.cloneNode(false);
    engine.replaceWith(fresh); engine = fresh; hookEngine();
    statusEl.textContent = 'restarting math engine…';
  }

  window.addEventListener('message', ev => {
    if (ev.source !== engine.contentWindow) return;
    const m = ev.data || {};
    if (m.type === 'ready') { if (!engineReady) { engineReady = true; statusEl.textContent = ''; schedule(); } }
    else if (m.type === 'error') statusEl.textContent = 'Math engine failed to start: ' + m.message;
    else if (m.type === 'progress') busy = { id: m.id, line: m.line };
    else if (m.type === 'line') {
      const req = inflight.get(m.id), row = rows()[m.line];
      if (req && m.id === reqId && row) showResult(row, lineResult(req, m.line, m.result));
    }
    else if (m.type === 'result') {
      const req = inflight.get(m.id);
      for (const id of inflight.keys()) if (id <= m.id) inflight.delete(id);
      busy = null;
      if (req) {
        const results = req.lines.map((_, i) => lineResult(req, i, (m.results || [])[i]));
        if (m.id === reqId) applyResults(results);
      }
    }
    armDog();   // any message means the engine is alive
  });
  engine.contentWindow?.postMessage({ type: 'ping' }, '*');

  const INVALID_TIP = {
    'missing': 'Something is missing, like an empty box.',
    'unexpected-operator': 'An operator is missing a number on one side.',
    'unexpected-command': 'This uses a command the engine doesn\'t know.',
    'unexpected-delimiter': 'A bracket isn\'t matched.',
    'expected-closing-delimiter': 'A bracket isn\'t closed.'
  };
  const SLOW_TIP = 'This line took more than 1.5 seconds to work out, so it is skipped. Edit it to try again.';
  const resultOf = new WeakMap();   // row → its last result from the engine
  function answerParts(res){
    if (!res || res.invalid || res.slow) return [];
    const parts = [];
    // group: needs brackets inside another line (a sum, or a negative number)
    if (res.exact) parts.push({ rel: '=', latex: res.exact, group: res.group });
    if (res.approx) parts.push({ rel: res.approxIsExact ? '=' : '\\approx', latex: res.approx, group: /^-|\d[+-]/.test(res.approx) });
    return order === 'decimal' ? parts.reverse() : parts;
  }
  function showResult(row, res){
    resultOf.set(row, res);
    const out = row.querySelector('.res'), key = res ? JSON.stringify([res, order]) : '';
    if (out.dataset.key === key) return;   // unchanged: keep the markup, and a marker's fade-in, as they are
    out.dataset.key = key;
    out.innerHTML = ''; out.removeAttribute('title');
    if (res?.invalid || res?.slow) {
      const mark = document.createElement('span'); mark.className = 'mark';
      mark.textContent = res.slow ? 'took too long' : 'can\'t read';
      out.title = res.slow ? SLOW_TIP : 'The engine can\'t read this line. ' + (INVALID_TIP[res.invalid] || 'Check for a typo.');
      out.append(mark);
      return;
    }
    const parts = answerParts(res);
    try {
      out.innerHTML = parts.map((p, i) => `<span class="part" role="button" tabindex="0" data-i="${i}">${toMarkup(p.rel + ' ' + p.latex)}</span>`).join('');
    } catch { out.innerHTML = ''; return; }   // MathLive gives up on enormous answers
    out.querySelectorAll('.part').forEach((el, i) => {
      let said = parts[i].latex; try { said = MathLive.convertLatexToSpeakableText(parts[i].rel + parts[i].latex); } catch {}
      el.setAttribute('aria-label', said + '. Enter puts it in the line you were editing, Shift+Enter copies it.');
    });
    if (parts.length) out.title = 'Click to put this answer in the line you\'re editing. Shift+click to copy it.';
    paint(out);
  }
  function applyResults(results){ rows().forEach((r, i) => showResult(r, results[i] ?? null)); }
  function clearResults(){ rows().forEach(r => showResult(r, null)); }
  function evaluateAll(){
    if (mode === 'off') { reqId++; clearResults(); return; }
    if (!engineReady) { if (!statusEl.textContent) statusEl.textContent = 'starting math engine…'; return; }
    if (slowKeys.size > 500) slowKeys.clear();
    const req = { mode, angle, lines: fields().map(f => f.value) };
    req.skip = slowKeys.size ? req.lines.map((_, i) => i).filter(i => slowKeys.has(lineKey(req, i))) : [];
    const id = ++reqId;
    inflight.set(id, req);
    if (!dog) armDog();
    engine.contentWindow.postMessage({ type: 'eval', id, places, ...req }, '*');
  }
  let t;
  function schedule(){
    clearTimeout(t);
    t = setTimeout(() => { evaluateAll(); persist(); }, 220);
  }

  // ---------- answers mode ----------
  const MODE_HINT = {
    off:   '<b>Off</b> — no answers, just a place to write math.',
    arith: '<b>Arithmetic</b> — answers lines that are only numbers, or letters you gave a value with <b>:=</b>. Lines with unknowns like 2x+3x are left for you.',
    full:  '<b>Algebra</b> — also simplifies lines with unknowns: 2x+3x becomes 5x, d/dx x³ becomes 3x².'
  };
  const segBtns = [...document.querySelectorAll('.segrow .seg button')];
  function setMode(m){
    mode = MODE_HINT[m] ? m : 'off';
    segBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    $('modehint').innerHTML = MODE_HINT[mode];
    $('ansopts').hidden = mode === 'off';
    schedule();
  }
  // Turning answers on from Off asks first (see CLAUDE.md, "Answers modes"). Switching between
  // Arithmetic and Algebra, or restoring a saved mode, doesn't.
  const ansDlg = $('ans-warn'); let ansPending = null;
  function requestMode(m){
    if (mode !== 'off' || m === 'off') return setMode(m);
    ansPending = m; ansDlg.showModal();
  }
  $('ans-cancel').addEventListener('click', () => ansDlg.close());
  $('ans-ok').addEventListener('click', () => { const m = ansPending; ansDlg.close(); setMode(m); });
  ansDlg.addEventListener('close', () => { ansPending = null; });
  segBtns.forEach(b => b.addEventListener('click', () => requestMode(b.dataset.mode)));

  // ---------- answer options: angles, decimal places, order ----------
  const angleBtns = [...document.querySelectorAll('[data-angle]')];
  const placesSel = $('opt-places'), orderSel = $('opt-order');
  function setAngle(a){
    angle = a === 'deg' ? 'deg' : 'rad';
    angleBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.angle === angle));
    schedule();
  }
  angleBtns.forEach(b => b.addEventListener('click', () => setAngle(b.dataset.angle)));
  placesSel.value = String(places);
  placesSel.addEventListener('change', () => { places = placesSel.value === 'auto' ? 'auto' : +placesSel.value; schedule(); });
  orderSel.value = order;
  orderSel.addEventListener('change', () => {
    order = orderSel.value === 'decimal' ? 'decimal' : 'exact';
    rows().forEach(r => showResult(r, resultOf.get(r) ?? null));
    persist();
  });

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

  menuAction('btn-copy', () => copyText(portable(fields().map(f => f.value).filter(Boolean).join('\n')), 'All lines copied as LaTeX'));
  menuAction('btn-clear', () => clearAll());

  function clearAll(){
    if (!fields().some(f => f.value)) { toast('Pad is already empty'); return; }
    undoToast('Pad cleared', 'Pad restored', hist.change(() => { setLines(['']); return focusIn(rows()[0]); }));
  }

  // ---------- dialogs ----------
  const keysDlg = $('keys');
  $('keys-close').addEventListener('click', () => keysDlg.close());
  menuAction('btn-keys', () => keysDlg.showModal());

  const dlg = $('dlg'), imp = $('imp');
  const parseImport = s => s.replace(/\r/g, '').split(/\n|\\\\/).map(x => x.trim()).filter(Boolean);
  menuAction('btn-import', () => { imp.value = fields().map(f => f.value).filter(Boolean).join('\n'); dlg.showModal(); imp.select(); });
  $('imp-cancel').addEventListener('click', () => dlg.close());
  // The dialog closes before the pad is rebuilt: new math fields made under an open modal dialog
  // could end up unable to take typed text.
  $('imp-ok').addEventListener('click', () => {
    const lines = parseImport(imp.value); dlg.close();
    undoToast('Pad replaced', 'Pad restored', hist.change(() => setLines(lines)));
  });
  $('imp-append').addEventListener('click', () => {
    const lines = fields().map(f => f.value).filter(Boolean).concat(parseImport(imp.value)); dlg.close();
    undoToast('Lines appended', 'Pad restored', hist.change(() => setLines(lines)));
  });

  // Copy all, as LaTeX or plain text, with or without answers.
  // Plain text is MathLive's AsciiMath, with fixes for what it gets wrong on this pad's lines.
  function toText(latex){
    const s = latex
      .replace(/\\coloneqq?(?![A-Za-z])/g, ':=')
      .replace(/\\[lr]?vert(?![A-Za-z])/g, '|')                              // CE's |x|, not U+2223
      .replace(/(\d)\\,(?=\d)/g, '$1')                                         // 5\,050 → 5050
      .replace(/\\overline\{(\d+)\}/g, '\\text{@@bar$1@@}')                     // 3.\overline{142857}
      .replace(/\\(?:mathrm|operatorname)\{([A-Za-z]+)\}/g, '\\text{@@$1@@}')   // ans, not a n s
      .replace(/\^\{?\\circ\}?/g, '\\degree');
    return MathLive.convertLatexToAsciiMath(s)
      .replace(/"@@bar(\d+)@@"\s?/g, 'bar($1)').replace(/"@@([A-Za-z]+)@@"\s?/g, '$1')
      .replace(/\b([a-z]{2,}) \(/g, '$1(').replace(/\s+([_^])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }
  function exportText(){
    const withAns = copyAns && mode !== 'off';
    return rows().map(r => {
      const src = r.querySelector('math-field').value;
      if (!src) return null;
      const parts = withAns ? answerParts(resultOf.get(r)) : [];
      if (copyFmt === 'latex') return portable([src, ...parts.map(p => p.rel + ' ' + p.latex)].join(' '));
      const text = l => { try { return toText(l); } catch { return portable(l); } };
      return [text(src), ...parts.map(p => (p.rel === '=' ? '= ' : '≈ ') + text(p.latex))].join(' ');
    }).filter(x => x !== null).join('\n');
  }
  const expDlg = $('exp'), expText = $('exp-text'), expAns = $('exp-ans');
  const fmtBtns = [...expDlg.querySelectorAll('[data-fmt]')];
  function renderExport(){
    fmtBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.fmt === copyFmt));
    expAns.disabled = mode === 'off'; expAns.checked = copyAns && mode !== 'off';
    $('exp-note').textContent = mode === 'off' ? 'Answers are off, so there are none to include.' : '';
    expText.value = exportText();
  }
  fmtBtns.forEach(b => b.addEventListener('click', () => { copyFmt = b.dataset.fmt; renderExport(); persist(); }));
  expAns.addEventListener('change', () => { copyAns = expAns.checked; renderExport(); persist(); });
  menuAction('btn-export', () => { renderExport(); expDlg.showModal(); });
  $('exp-cancel').addEventListener('click', () => expDlg.close());
  $('exp-copy').addEventListener('click', () => {
    const what = (copyFmt === 'latex' ? 'as LaTeX' : 'as plain text') + (expAns.checked ? ' with answers' : '');
    expDlg.close(); copyText(expText.value, 'All lines copied ' + what);
  });

  // ---------- global shortcuts: Esc Esc clears, Ctrl+/ opens the guide, Ctrl+Z undoes ----------
  function undoRedo(redo){ if (!(redo ? hist.redo() : hist.undo())) toast(redo ? 'Nothing to redo' : 'Nothing to undo'); }
  // The on-screen keyboard's undo/redo buttons: capture the click before MathLive's toolbar handler.
  window.addEventListener('click', e => {
    const c = e.target.closest?.('.ML__keyboard [data-command]')?.getAttribute('data-command');
    if (c !== '"undo"' && c !== '"redo"') return;
    e.preventDefault(); e.stopPropagation();
    undoRedo(c === '"redo"');
  }, true);
  let escArmed = 0;
  window.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;        // dialogs keep their own Esc
    if (!menu.hidden) return;                                  // menu handles its own keys
    const inText = e.target.closest?.('textarea, input, select');
    const mf = document.activeElement?.tagName === 'MATH-FIELD' ? document.activeElement : null;
    if (e.key === 'Escape' && !inText) {
      if (mf && mf.mode === 'latex') return;                   // Esc still exits a \command
      e.preventDefault(); e.stopPropagation();
      if (Date.now() - escArmed < 1500) { escArmed = 0; clearAll(); }
      else { escArmed = Date.now(); toast('Press Esc again to clear the pad'); }
      return;
    }
    const k = e.key.toLowerCase(), mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (!inText && ((mod && (k === 'z' || k === 'y')) || e.key === 'Undo' || e.key === 'Redo')) {
      e.preventDefault(); e.stopPropagation();
      undoRedo(e.key === 'Redo' || k === 'y' || (k === 'z' && e.shiftKey));
      return;
    }
    if (mod && (e.code === 'Slash' || e.key === '/' || e.key === '?')) {
      e.preventDefault(); e.stopPropagation();
      keysDlg.showModal();
    }
  }, true);

  // ---------- boot ----------
  setLines(saved?.lines?.length ? saved.lines : SAMPLE);
  setColors(varColors);
  setAngle(angle);
  setMode(mode);
  hist.reset();
})();
