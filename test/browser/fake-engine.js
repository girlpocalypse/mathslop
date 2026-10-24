// The fake engine: records what the panel sends and answers only what the test tells it to.
// fake.auto: reply 'ready' to a ping (default true; ?auto=0 in the frame's URL turns it off, also after a restart). fake.send(msg): post msg to the panel.
window.fake = { got: [], auto: new URLSearchParams(location.search).get('auto') !== '0', send(m){ parent.postMessage(m, '*'); } };
window.addEventListener('message', e => {
  if (e.source !== parent) return;
  fake.got.push(e.data);
  if (e.data?.type === 'ping' && fake.auto) fake.send({ type: 'ready' });
});
// The panel may ping before this script runs: say hello once anyway, like sandbox.js.
if (fake.auto) fake.send({ type: 'ready' });
