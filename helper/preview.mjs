// The local preview's two pieces: a stand-in for the SDK the content Worker
// puts first in every page of a bit (gdiffer services/content-delivery/sdk/
// differ.js), and the player page that frames the bit's pages as Differ does.

// The stand-in has the SDK's API, lifecycle and messages, and also logs every
// differ.open and differ.close to the console, framed or not. It is served as
// this function's source text, so it may use only browser globals.
function sdk() {
  'use strict';
  var player = window.parent;
  var inPlayer = player !== window;
  var page = /\/preview\.html$/.test(location.pathname) ? 'preview' : 'index';
  var hidden = inPlayer;
  var visibility = inPlayer ? null : 'show';
  var opened = !inPlayer && page === 'index' ? { state: null } : null;
  var subscribers = { open: [], show: [], hide: [] };
  function send(message) { if (inPlayer) player.postMessage(message, '*'); }
  function call(fn, value) { try { fn(value); } catch (error) { setTimeout(function () { throw error; }); } }
  function emit(name, value) { subscribers[name].slice().forEach(function (entry) { call(entry.fn, value); }); }
  function open(state) {
    if (page !== 'preview') return console.info('[differ] open ignored: only preview.html opens the bit');
    if (!inPlayer) return console.info('[differ] open ignored outside a player', state);
    var text = JSON.stringify(state === undefined ? null : state);
    if (text === undefined) throw new TypeError('differ.open takes a JSON value.');
    if (new TextEncoder().encode(text).length > 4096) throw new RangeError('differ.open state is over 4096 bytes.');
    console.info('[differ] open', JSON.parse(text));
    send({ type: 'differ:open', v: 1, state: JSON.parse(text) });
  }
  function close() {
    if (page !== 'index') return console.info('[differ] close ignored: only index.html closes the bit');
    console.info('[differ] close' + (inPlayer ? '' : ' ignored outside a player'));
    send({ type: 'differ:close', v: 1 });
  }
  function on(name, fn) {
    if (!Object.prototype.hasOwnProperty.call(subscribers, name) || typeof fn !== 'function') return function () {};
    var list = subscribers[name], entry = { fn: fn };
    list.push(entry);
    var replay = name === 'open' ? opened : visibility === name ? {} : null;
    if (replay) Promise.resolve().then(function () { if (list.indexOf(entry) >= 0) call(fn, replay.state); });
    return function () { var at = list.indexOf(entry); if (at >= 0) list.splice(at, 1); };
  }
  window.differ = Object.freeze({ page: page, inPlayer: inPlayer, get hidden() { return hidden; }, open: open, close: close, on: on });
  document.addEventListener('click', function (event) {
    var element = event.target instanceof Element ? event.target.closest('[data-differ-open]') : null;
    if (element) open(element.getAttribute('data-differ-open') || null);
  }, true);
  if (!inPlayer) return;

  var gesture = null;
  var nativeCapture = { set: Element.prototype.setPointerCapture, release: Element.prototype.releasePointerCapture, has: Element.prototype.hasPointerCapture };
  var synthetic = function (id) { return gesture !== null && gesture.id === id; };
  Element.prototype.setPointerCapture = function (id) { if (!synthetic(id)) return nativeCapture.set.call(this, id); };
  Element.prototype.releasePointerCapture = function (id) { if (!synthetic(id)) return nativeCapture.release.call(this, id); };
  Element.prototype.hasPointerCapture = function (id) { return synthetic(id) || nativeCapture.has.call(this, id); };
  var pointerTypes = { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' };
  var mouseTypes = { down: 'mousedown', move: 'mousemove', up: 'mouseup' };
  function dispatch(target, Kind, type, x, y, button, buttons, extra) {
    var init = { bubbles: true, cancelable: type !== 'pointercancel', composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: button, buttons: buttons };
    for (var key in extra) init[key] = extra[key];
    target.dispatchEvent(new Kind(type, init));
  }
  function pointer(message) {
    var phase = message.phase, id = message.id, x = message.x, y = message.y;
    if (!Object.prototype.hasOwnProperty.call(pointerTypes, phase) || !Number.isInteger(id) || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
    if (phase === 'down') gesture = { id: id, target: document.elementFromPoint(x, y) || document.documentElement, x: x, y: y, moved: false };
    else if (!synthetic(id)) return;
    var current = gesture;
    if (Math.hypot(x - current.x, y - current.y) >= 10) current.moved = true;
    var buttons = phase === 'down' || phase === 'move' ? 1 : 0;
    var change = phase === 'move' || phase === 'cancel' ? -1 : 0;
    dispatch(current.target, PointerEvent, pointerTypes[phase], x, y, change, buttons, { pointerId: id, pointerType: 'touch', isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0 });
    if (mouseTypes[phase]) dispatch(current.target, MouseEvent, mouseTypes[phase], x, y, 0, buttons, { detail: phase === 'move' ? 0 : 1 });
    if (phase === 'up' && !current.moved) dispatch(current.target, MouseEvent, 'click', x, y, 0, 0, { detail: 1 });
    if (phase === 'up' || phase === 'cancel') gesture = null;
  }
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (event.source !== window.parent || message === null || typeof message !== 'object' || message.v !== 1) return;
    if (message.type === 'differ:show' || message.type === 'differ:hide') {
      hidden = message.type === 'differ:hide';
      visibility = hidden ? 'hide' : 'show';
      emit(visibility);
    } else if (message.type === 'differ:open' && page === 'index') {
      opened = { state: message.state === undefined ? null : message.state };
      emit('open', opened.state);
    } else if (message.type === 'differ:pointer') {
      pointer(message);
    }
  });
  var touches = 0, timer = 0;
  function report() {
    if (!touches) { timer = 0; return; }
    send({ type: 'differ:activity', v: 1, interactions: touches });
    touches = 0;
    timer = setTimeout(report, 1000);
  }
  ['pointerdown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function () { touches++; if (!timer) report(); }, { capture: true, passive: true });
  });
  send({ type: 'differ:ready', v: 1, page: page });
}
export const sdkStandIn = `(${sdk})();\n`;

// The player: it sends a frame nothing before its differ:ready, then
// differ:show, and differ:open to the open index.html. It forwards presses
// on the preview as differ:pointer, hands vertical drags to the feed, honours
// differ:open only from the preview within a second of a forwarded release
// and differ:close only from the index, and opens each time in a new frame.
function player() {
  var preview = document.getElementById('preview');
  var box = document.getElementById('open');
  var frames = { preview: preview, index: null };
  var state = null, lastUp = -Infinity;
  function log(text) {
    var line = document.createElement('li');
    line.textContent = new Date().toLocaleTimeString() + '  ' + text;
    document.getElementById('log').prepend(line);
    console.info('[player] ' + text);
  }
  function tell(frame, message) { message.v = 1; frame.contentWindow.postMessage(message, location.origin); }
  function openIndex(value) {
    state = value;
    var frame = document.createElement('iframe');
    frame.src = '/index.html'; frame.title = 'index.html'; frame.width = 390; frame.height = 693;
    frames.index = frame;
    box.replaceChildren(frame);
  }
  function closeIndex() {
    frames.index = null;
    var again = document.createElement('button');
    again.className = 'reopen'; again.textContent = 'Closed. Open again';
    again.onclick = function () { log('player: open'); openIndex(null); };
    box.replaceChildren(again);
  }
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (event.origin !== location.origin || message === null || typeof message !== 'object' || message.v !== 1) return;
    var page = preview && event.source === preview.contentWindow ? 'preview' : frames.index && event.source === frames.index.contentWindow ? 'index' : null;
    if (!page) return;
    if (message.type === 'differ:ready') {
      log(page + '.html: ready');
      tell(frames[page], { type: 'differ:show' });
      if (page === 'index') tell(frames.index, { type: 'differ:open', state: state });
    } else if (message.type === 'differ:open') {
      if (page !== 'preview') return log('index.html: differ.open ignored, only preview.html opens the bit');
      if (performance.now() - lastUp > 1000) return log('preview.html: open ' + JSON.stringify(message.state) + ' ignored, the feed opens only within 1 s of a tap');
      log('preview.html: open ' + JSON.stringify(message.state));
      openIndex(message.state);
    } else if (message.type === 'differ:close') {
      if (page !== 'index') return log('preview.html: differ.close ignored, only index.html closes the bit');
      log('index.html: close');
      closeIndex();
    }
  });
  var badge = document.getElementById('badge');
  if (badge) badge.onclick = function () { log('player: open'); openIndex(null); };
  var layer = document.getElementById('layer');
  var gesture = null, ids = 0;
  function forward(phase, event) {
    var rect = preview.getBoundingClientRect();
    tell(preview, { type: 'differ:pointer', phase: phase, id: gesture.id, x: event.clientX - rect.left, y: event.clientY - rect.top });
  }
  if (layer) {
    layer.addEventListener('pointerdown', function (event) {
      if (gesture) return;
      layer.setPointerCapture(event.pointerId);
      gesture = { pointer: event.pointerId, id: ++ids, x: event.clientX, y: event.clientY, sideways: false, feed: false };
      forward('down', event);
    });
    layer.addEventListener('pointermove', function (event) {
      if (!gesture || event.pointerId !== gesture.pointer || gesture.feed) return;
      var dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
      if (!gesture.sideways && dy > 10 && dy > dx) {
        gesture.feed = true;
        forward('cancel', event);
        return log('preview.html: vertical drag, the feed takes it and pages; the preview gets pointercancel');
      }
      if (dx > 10) gesture.sideways = true;
      forward('move', event);
    });
    var end = function (phase) {
      return function (event) {
        if (!gesture || event.pointerId !== gesture.pointer) return;
        if (!gesture.feed) forward(phase, event);
        if (phase === 'up') lastUp = performance.now();
        gesture = null;
      };
    };
    layer.addEventListener('pointerup', end('up'));
    layer.addEventListener('pointercancel', end('cancel'));
  }
  openIndex(null);
}

const style = `
:root { color-scheme: light; --ground: #ece7dd; --ink: #1b1a17; --soft: rgba(27,26,23,.56); }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px; background: var(--ground); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
main { display: flex; flex-wrap: wrap; gap: 32px; justify-content: center; align-items: flex-start; }
h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
h2 span, .note, footer { color: var(--soft); font-weight: 400; }
.box, .open { position: relative; overflow: hidden; background: #fbf8f2; box-shadow: 0 1px 2px rgba(27,26,23,.08), 0 12px 32px rgba(27,26,23,.12); }
.box { width: 390px; height: 520px; border-radius: 18px; }
.open { width: 390px; height: 693px; border-radius: 22px; display: grid; place-items: center; }
iframe { display: block; border: 0; background: #fff; }
#layer { position: absolute; inset: 0; touch-action: none; }
#badge { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; border: 0; border-radius: 50%; padding: 0; background: rgba(27,26,23,.42); backdrop-filter: blur(8px); color: #fff; font-size: 14px; cursor: pointer; }
#badge::before { content: ''; position: absolute; inset: -7px; }
.note { width: 390px; height: 520px; border: 1px dashed var(--soft); border-radius: 18px; padding: 24px; margin: 0; }
.reopen { font: inherit; padding: 10px 16px; border-radius: 999px; border: 1px solid var(--ink); background: none; cursor: pointer; }
footer { max-width: 812px; margin: 24px auto 0; }
#log { font: 12px/1.6 ui-monospace, monospace; padding-left: 0; list-style: none; color: var(--ink); }
`;

export function previewPage({ preview }) {
  const box = preview
    ? '<div class="box"><iframe id="preview" src="/preview.html" title="preview.html" allow="" width="390" height="520"></iframe><div id="layer"></div><button id="badge" aria-label="Open">⤢</button></div>'
    : '<p class="note">No preview.html. The feed shows index.html laid out at 390×693 and scaled into this 390×520 box, and a tap there opens the bit. Add preview.html to make the box interactive.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Differ preview</title><style>${style}</style></head><body>
<main><section><h2>preview.html <span>390×520, the feed's box</span></h2>${box}</section>
<section><h2>index.html <span>390×693, the open bit</span></h2><div class="open" id="open"></div></section></main>
<footer><p>A local stand-in for Differ's player and SDK. Presses on the preview are forwarded as a player forwards them; vertical drags belong to the feed. Restart preview after editing. Nothing is uploaded.</p><ol id="log"></ol></footer>
<script>(${player})();</script></body></html>`;
}
