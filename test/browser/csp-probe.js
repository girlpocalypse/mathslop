// What the extension pages' CSP allows a page script to do. The result lands in window.probe.
window.probe = (async () => {
  const tryIt = f => { try { f(); return 'ran'; } catch (e) { return e.name; } };
  return { eval: tryIt(() => eval('1')), fn: tryIt(() => new Function('return 1')()), timer: tryIt(() => setTimeout('1')) };
})();
