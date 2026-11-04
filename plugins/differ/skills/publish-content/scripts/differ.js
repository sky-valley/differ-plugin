// The Differ SDK. The content Worker serves this file at /__differ/sdk.js on
// every bit and stage host and puts it first in every page of a bit, so it
// runs before the bit's own scripts. Bits never reference it themselves.
//
// It speaks the player protocol: every message is {type, v: 1, ...}; it
// accepts a player's only from window.parent. Outside a player nothing is
// sent, nothing is accepted and nothing throws.
(function () {
  'use strict';
  var player = window.parent;
  var inPlayer = player !== window;
  var page = /\/preview\.html$/.test(location.pathname) ? 'preview' : 'index';
  var hidden = inPlayer;
  // What a later subscriber is replayed: the last show or hide, and the last
  // open state ({state}) once the page is opened.
  var visibility = inPlayer ? null : 'show';
  var opened = !inPlayer && page === 'index' ? { state: null } : null;
  var subscribers = { open: [], show: [], hide: [] };

  function send(message) {
    if (inPlayer) player.postMessage(message, '*');
  }

  // A throwing subscriber is reported without stopping the others.
  function call(fn, value) {
    try { fn(value); } catch (error) { setTimeout(function () { throw error; }); }
  }

  function emit(name, value) {
    subscribers[name].slice().forEach(function (entry) { call(entry.fn, value); });
  }

  function open(state) {
    if (!inPlayer || page !== 'preview') return;
    var text = JSON.stringify(state === undefined ? null : state);
    if (text === undefined) throw new TypeError('differ.open takes a JSON value.');
    if (new TextEncoder().encode(text).length > 4096) throw new RangeError('differ.open state is over 4096 bytes.');
    send({ type: 'differ:open', v: 1, state: JSON.parse(text) });
  }

  function close() {
    if (page === 'index') send({ type: 'differ:close', v: 1 });
  }

  function on(name, fn) {
    if (!Object.prototype.hasOwnProperty.call(subscribers, name) || typeof fn !== 'function') return function () {};
    var list = subscribers[name];
    var entry = { fn: fn };
    list.push(entry);
    var replay = name === 'open' ? opened : visibility === name ? {} : null;
    if (replay) {
      Promise.resolve().then(function () {
        if (list.indexOf(entry) >= 0) call(fn, replay.state);
      });
    }
    return function () {
      var at = list.indexOf(entry);
      if (at >= 0) list.splice(at, 1);
    };
  }

  window.differ = Object.freeze({
    page: page,
    inPlayer: inPlayer,
    get hidden() { return hidden; },
    open: open,
    close: close,
    on: on,
  });

  // Any click on or inside [data-differ-open] opens the bit with that
  // attribute's value as its state.
  document.addEventListener('click', function (event) {
    var target = event.target;
    var element = target instanceof Element ? target.closest('[data-differ-open]') : null;
    if (element) open(element.getAttribute('data-differ-open') || null);
  }, true);

  if (!inPlayer) return;

  // A player forwards a preview's gestures as differ:pointer. The SDK plays
  // each one back as touch pointer events and their mouse events at the
  // element under the press, which receives the rest of the gesture, and
  // clicks when the pointer stayed within 10 px and was not cancelled.
  var gesture = null;
  var nativeCapture = {
    set: Element.prototype.setPointerCapture,
    release: Element.prototype.releasePointerCapture,
    has: Element.prototype.hasPointerCapture,
  };
  var synthetic = function (id) { return gesture !== null && gesture.id === id; };
  Element.prototype.setPointerCapture = function (id) {
    if (!synthetic(id)) return nativeCapture.set.call(this, id);
  };
  Element.prototype.releasePointerCapture = function (id) {
    if (!synthetic(id)) return nativeCapture.release.call(this, id);
  };
  Element.prototype.hasPointerCapture = function (id) {
    return synthetic(id) || nativeCapture.has.call(this, id);
  };

  var pointerTypes = { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' };
  var mouseTypes = { down: 'mousedown', move: 'mousemove', up: 'mouseup' };

  function dispatch(target, Kind, type, x, y, button, buttons, extra) {
    var init = { bubbles: true, cancelable: type !== 'pointercancel', composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y, button: button, buttons: buttons };
    for (var key in extra) init[key] = extra[key];
    target.dispatchEvent(new Kind(type, init));
  }

  function pointer(message) {
    var phase = message.phase, id = message.id, x = message.x, y = message.y;
    if (!Object.prototype.hasOwnProperty.call(pointerTypes, phase) || !Number.isInteger(id) ||
      typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
    if (phase === 'down') {
      gesture = { id: id, target: document.elementFromPoint(x, y) || document.documentElement, x: x, y: y, moved: false };
    } else if (!synthetic(id)) {
      return;
    }
    var current = gesture;
    if (Math.hypot(x - current.x, y - current.y) >= 10) current.moved = true;
    // A move changes no button (-1 for a pointer, 0 for a mouse event).
    var buttons = phase === 'down' || phase === 'move' ? 1 : 0;
    var change = phase === 'move' || phase === 'cancel' ? -1 : 0;
    dispatch(current.target, PointerEvent, pointerTypes[phase], x, y, change, buttons, {
      pointerId: id, pointerType: 'touch', isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0,
    });
    if (mouseTypes[phase]) dispatch(current.target, MouseEvent, mouseTypes[phase], x, y, 0, buttons, { detail: phase === 'move' ? 0 : 1 });
    if (phase === 'up' && !current.moved) dispatch(current.target, MouseEvent, 'click', x, y, 0, 0, { detail: 1 });
    // A forwarded gesture is the bit's only once the player let it end here.
    if (phase === 'up') touched();
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

  // How often the bit is touched, told at most once a second, the first at
  // once. Nothing on the page is read. A touch is a real press or key, or a
  // forwarded gesture that ended with an up; the events the SDK plays back
  // are not real, so a gesture the player kept (a swipe past the bit) and
  // cancelled never counts.
  var touches = 0, timer = 0;
  function report() {
    if (!touches) { timer = 0; return; }
    send({ type: 'differ:activity', v: 1, interactions: touches });
    touches = 0;
    timer = setTimeout(report, 1000);
  }
  function touched() {
    touches++;
    if (!timer) report();
  }
  ['pointerdown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function (event) {
      if (event.isTrusted) touched();
    }, { capture: true, passive: true });
  });

  send({ type: 'differ:ready', v: 1, page: page });
})();
