// @ts-check
// Injected into every Selkies-proxied HTML page. Mounts the HUD iframe,
// relays messages, remaps keyboard/gamepad input, and bounces back to / when
// the underlying WebSocket dies.
//
// Bump this whenever you change the file so it's easy to confirm in DevTools
// that the latest version is actually being served (no browser cache hit).
const __WISP_INJECT_VERSION__ = '2026-05-22-1';
console.log('[wisp] inject.js loaded, version:', __WISP_INJECT_VERSION__);

/** @typedef {Navigator & { keyboard?: { lock?: () => void, unlock?: () => void, getLayoutMap?: () => Promise<Map<string, string>> } }} NavWithKeyboard */
/** @typedef {Window & typeof globalThis & { __wispHudMounted?: boolean }} WispWindow */
/** @typedef {KeyboardEvent & { __wispRemap?: boolean }} WispKeyboardEvent */
/** @typedef {'success' | 'error' | 'info' | 'warning'} ToastKind */
/** @typedef {'nintendo' | 'sony' | 'xbox'} PadLayout */

(() => {
  const w = /** @type {WispWindow} */ (window);
  if (w.__wispHudMounted) {
    return;
  }
  w.__wispHudMounted = true;

  const sessionMatch = window.location.pathname.match(/^\/s\/([^/]+)\//);
  if (!sessionMatch) {
    return;
  }
  const sessionId = sessionMatch[1];

  const nav = /** @type {NavWithKeyboard} */ (navigator);

  const RELAY = ['serverSettings', 'sidebarButtonStatusUpdate', 'pipelineStatusUpdate', 'stats', 'clientRoleUpdate', 'fileUpload'];

  /** @type {Record<ToastKind, string>} */
  const TOAST_BG = {
    success: 'rgba(30,80,60,.92)',
    error: 'rgba(120,30,30,.92)',
    info: 'rgba(30,60,100,.92)',
    warning: 'rgba(120,90,30,.92)',
  };

  // QWERTY is the baseline; AZERTY swaps a↔q, w↔z, m→Semicolon to match
  // physical positions on a French keyboard.
  /** @type {Record<string, string>} */
  const QWERTY_CODE = { a: 'KeyA', b: 'KeyB', c: 'KeyC', d: 'KeyD', e: 'KeyE', f: 'KeyF', g: 'KeyG', h: 'KeyH', i: 'KeyI', j: 'KeyJ', k: 'KeyK', l: 'KeyL', m: 'KeyM', n: 'KeyN', o: 'KeyO', p: 'KeyP', q: 'KeyQ', r: 'KeyR', s: 'KeyS', t: 'KeyT', u: 'KeyU', v: 'KeyV', w: 'KeyW', x: 'KeyX', y: 'KeyY', z: 'KeyZ' };
  /** @type {Record<string, string>} */
  const AZERTY_CODE = { a: 'KeyQ', b: 'KeyB', c: 'KeyC', d: 'KeyD', e: 'KeyE', f: 'KeyF', g: 'KeyG', h: 'KeyH', i: 'KeyI', j: 'KeyJ', k: 'KeyK', l: 'KeyL', m: 'Semicolon', n: 'KeyN', o: 'KeyO', p: 'KeyP', q: 'KeyA', r: 'KeyR', s: 'KeyS', t: 'KeyT', u: 'KeyU', v: 'KeyV', w: 'KeyZ', x: 'KeyX', y: 'KeyY', z: 'KeyW' };

  let kbLayout = 'auto';
  /** @type {Record<string, PadLayout>} */
  let padOverrides = {};
  let hostIsAzerty = false;
  /** @type {HTMLElement | null} */
  let toastHost = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let disconnectTimer = null;
  let navigated = false;
  let hudPanelOpen = false;

  // Shortcuts dispatch on `e.key` (the labelled letter) rather than `e.code`
  // (the QWERTY-position name), so AZERTY/QWERTY both work without remapping.
  const SHORTCUT_KEYS = new Set(['o', 'q', 'h', 'f']);

  const iframe = document.createElement('iframe');
  iframe.src = `/hud/${sessionId}`;
  iframe.style.cssText = 'position:fixed;top:32px;left:50%;transform:translateX(-50%);width:80px;height:80px;border:0;background:transparent;opacity:0;z-index:2147483647;color-scheme:normal;';

  function mountIframe() {
    (document.body || document.documentElement).appendChild(iframe);
  }

  /**
   * @param {'handle' | 'panel' | 'hidden'} mode
   * @param {{ top?: string, left?: string, right?: string, bottom?: string, transform?: string, width?: string, height?: string }} [g]
   */
  function applyIframeGeometry(mode, g) {
    iframe.style.pointerEvents = mode === 'hidden' ? 'none' : 'auto';
    iframe.style.opacity = mode === 'hidden' ? '0' : '1';
    hudPanelOpen = mode === 'panel';
    if (!g || typeof g !== 'object') {
      return;
    }
    if (g.top !== undefined) {
      iframe.style.top = g.top;
    }
    if (g.left !== undefined) {
      iframe.style.left = g.left;
    }
    if (g.right !== undefined) {
      iframe.style.right = g.right;
    }
    if (g.bottom !== undefined) {
      iframe.style.bottom = g.bottom;
    }
    if (g.transform !== undefined) {
      iframe.style.transform = g.transform;
    }
    if (g.width !== undefined) {
      iframe.style.width = g.width;
    }
    if (g.height !== undefined) {
      iframe.style.height = g.height;
    }
  }

  /** @param {'hud:toggle' | 'hud:quit' | 'hud:home'} type */
  function postToHud(type) {
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type }, window.location.origin);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  /**
   * @param {string} message
   * @param {ToastKind} [kind] - Unknown kinds fall back to 'info'.
   */
  function showToast(message, kind) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;';
      (document.body || document.documentElement).appendChild(toastHost);
    }

    const toast = document.createElement('div');
    const bg = (kind && TOAST_BG[kind]) || TOAST_BG.info;
    toast.style.cssText = `background:${bg};color:#fff;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.35);backdrop-filter:blur(8px);transform:translateX(120%);transition:transform .25s ease,opacity .25s ease;opacity:0;max-width:320px;`;
    toast.textContent = String(message || '');
    toastHost.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  // Selkies reads the clipboard on the focus event, which doesn't carry user
  // activation in Chrome -> NotAllowedError. We prime the permission on the
  // first user gesture so Chrome grants it for the session.
  function primeClipboard() {
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().catch(() => {});
    }
  }

  // Selkies' #keyboard-input-assist is the trampoline that traps focus so keys
  // get captured. On desktop we don't need its text-input pathway (keys are
  // relayed via keydown/keyup at the document level), so we mark it readonly +
  // refuse focus globally. Readonly alone doesn't suppress Firefox's "Paste"
  // tooltip on type="search", hence the focusin trap. IME users on desktop
  // lose composition through that input as a tradeoff.
  function neutralizeSelkiesInputOnDesktop() {
    if (navigator.maxTouchPoints > 0) {
      return;
    }

    /** @param {EventTarget | Element | null | undefined} el @returns {el is HTMLInputElement} */
    const isAssistInput = (el) => el instanceof HTMLInputElement && el.id === 'keyboard-input-assist';

    /** @param {Element | null | undefined} el */
    const markReadOnly = (el) => {
      if (isAssistInput(el)) {
        el.readOnly = true;
        if (document.activeElement === el) {
          el.blur();
        }
      }
    };

    markReadOnly(document.querySelector('#keyboard-input-assist'));

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) {
            continue;
          }
          if (n.matches('#keyboard-input-assist')) {
            markReadOnly(n);
          }
          markReadOnly(n.querySelector('#keyboard-input-assist'));
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Global focusin trap: catches both initial focus (before our per-element
    // listener could attach) and any re-focus attempt.
    document.addEventListener(
      'focusin',
      (e) => {
        if (isAssistInput(e.target)) {
          e.target.blur();
        }
      },
      { capture: true },
    );
  }

  // Browser/OS shortcuts (Alt+Tab, Cmd+Tab, F11, Ctrl+T, etc.) consume the
  // modifier keyup before Selkies sees it, leaving the VM convinced the key
  // is still pressed → Alt+click in Steam multi-selects, etc. Dispatch
  // synthetic keyups across multiple targets so we hit whichever node Selkies
  // listens on. Caveat: if Selkies filters `event.isTrusted`, this is a no-op.
  function releaseStuckModifiers() {
    /** @type {Array<[string, string]>} */
    const modifiers = [
      ['MetaLeft', 'Meta'],
      ['MetaRight', 'Meta'],
      ['AltLeft', 'Alt'],
      ['AltRight', 'Alt'],
      ['ControlLeft', 'Control'],
      ['ControlRight', 'Control'],
      ['ShiftLeft', 'Shift'],
      ['ShiftRight', 'Shift'],
    ];
    /** @type {Array<EventTarget>} */
    const targets = [window, document, document.documentElement, document.body].filter(Boolean);
    if (document.activeElement instanceof HTMLElement && !targets.includes(document.activeElement)) {
      targets.push(document.activeElement);
    }
    for (const [code, key] of modifiers) {
      for (const t of targets) {
        t.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true, composed: true }));
      }
    }
  }

  function resumeMedia() {
    const els = document.querySelectorAll('audio,video');
    for (let i = 0; i < els.length; i++) {
      const el = /** @type {HTMLMediaElement} */ (els[i]);
      if (el.paused) {
        el.play().catch(() => {});
      }
    }
  }

  /**
   * @param {string} k - Anything other than 'qwerty'/'azerty' falls back to 'auto' (no remap).
   * @param {Record<string, PadLayout>} [layouts] - Map of gamepad.id → layout override.
   */
  function setInputRemap(k, layouts) {
    kbLayout = k === 'qwerty' || k === 'azerty' ? k : 'auto';
    padOverrides = layouts && typeof layouts === 'object' ? layouts : {};
  }

  function needsKbRemap() {
    if (kbLayout === 'auto') {
      return false;
    }

    if (kbLayout === 'qwerty' && hostIsAzerty) {
      return true;
    }

    if (kbLayout === 'azerty' && !hostIsAzerty) {
      return true;
    }

    return false;
  }

  /**
   * Capture host keydown/keyup and re-dispatch a synthetic event whose .code
   * matches the VM's expected layout — Selkies has no built-in layout knob.
   * Only alpha keys; punctuation/digits would need a full per-layout table.
   * @param {WispKeyboardEvent} event
   */
  function onKeyboardRemap(event) {
    const { type, key = '', code, location, repeat, isComposing, ctrlKey, shiftKey, altKey, metaKey, target, __wispRemap } = event;
    if (!needsKbRemap() || __wispRemap) {
      return;
    }

    const label = key.toLowerCase();
    if (label.length !== 1 || label < 'a' || label > 'z') {
      return;
    }

    const table = kbLayout === 'qwerty' ? QWERTY_CODE : AZERTY_CODE;
    const targetCode = table[label];
    if (!targetCode || targetCode === code) {
      return;
    }

    const synth = new KeyboardEvent(type, {
      key,
      code: targetCode,
      location,
      repeat,
      isComposing,
      ctrlKey,
      shiftKey,
      altKey,
      metaKey,
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    Object.defineProperty(synth, '__wispRemap', { value: true });
    event.preventDefault();
    event.stopImmediatePropagation();
    (target || window).dispatchEvent(synth);
  }

  function discoverHostLayout() {
    if (!nav.keyboard?.getLayoutMap) {
      return;
    }

    nav.keyboard
      .getLayoutMap()
      .then((layout) => {
        hostIsAzerty = (layout.get('KeyA') || '').toLowerCase() === 'q';
      })
      .catch(() => {});
  }

  /**
   * @param {string} id - The gamepad's `Gamepad.id` string.
   * @returns {PadLayout}
   */
  function detectPadLayout(id) {
    if (/vendor:\s*057e/i.test(id)) {
      return 'nintendo';
    }
    if (/vendor:\s*054c/i.test(id)) {
      return 'sony';
    }
    if (/vendor:\s*045e/i.test(id)) {
      return 'xbox';
    }

    const lower = (id || '').toLowerCase();
    if (/switch|joy.?con|pro controller/.test(lower)) {
      return 'nintendo';
    }
    if (/dualshock|dualsense|playstation/.test(lower)) {
      return 'sony';
    }
    if (/xbox|xinput/.test(lower)) {
      return 'xbox';
    }

    return 'xbox';
  }

  /**
   * @param {string} id
   * @returns {PadLayout}
   */
  function layoutForPad(id) {
    return padOverrides[id] || detectPadLayout(id);
  }

  // Nintendo layout swaps face buttons 0↔1 and 2↔3 so the right-thumb button
  // ends up at index 0 (the "confirm" index Xbox-targeted games hardcode).
  function installGamepadRemap() {
    const origGetGamepads = navigator.getGamepads?.bind(navigator);
    if (!origGetGamepads) {
      return;
    }

    /**
     * @param {any[]} arr
     * @param {number} i
     * @param {number} j
     */
    const swap = (arr, i, j) => {
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    };

    /** @param {Gamepad | null} pad */
    const wrapPad = (pad) => {
      if (!pad || layoutForPad(pad.id) !== 'nintendo') {
        return pad;
      }

      const buttons = pad.buttons.slice();
      if (buttons.length >= 2) {
        swap(buttons, 0, 1);
      }

      if (buttons.length >= 4) {
        swap(buttons, 2, 3);
      }

      return new Proxy(pad, {
        get: (t, p) => {
          if (p === 'buttons') {
            return buttons;
          }
          const v = /** @type {any} */ (t)[p];
          return typeof v === 'function' ? v.bind(t) : v;
        },
      });
    };

    navigator.getGamepads = () => {
      const pads = origGetGamepads();
      if (!pads) {
        return pads;
      }

      const out = Array.prototype.slice.call(pads);
      for (let i = 0; i < out.length; i++) {
        out[i] = wrapPad(out[i]);
      }

      return out;
    };
  }

  // The proxy closes our WS when the host revokes us or changes our role.
  // Reload — not redirect home — so the next request re-runs the proxy's
  // participant lookup: kicked → server redirects to /, role change → new
  // role applied, session dead → proxy 404 falls back to /.
  function leave() {
    if (navigated) {
      return;
    }

    navigated = true;
    setTimeout(() => {
      window.location.reload();
    }, 800);
  }

  function scheduleLeave() {
    if (disconnectTimer || navigated) {
      return;
    }

    disconnectTimer = setTimeout(() => {
      disconnectTimer = null;
      leave();
    }, 2500);
  }

  function cancelLeave() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  }

  // Debounce so transient reconnects aren't fatal.
  function installWebSocketWatchdog() {
    const Orig = window.WebSocket;
    if (!Orig || typeof Proxy !== 'function') {
      return;
    }

    window.WebSocket = new Proxy(Orig, {
      construct: (t, a) => {
        const ws = Reflect.construct(t, a);
        let opened = false;
        ws.addEventListener('open', () => {
          opened = true;
          cancelLeave();
        });
        ws.addEventListener('close', () => {
          if (opened) {
            scheduleLeave();
          }
        });
        return ws;
      },
    });
  }

  /**
   * Routes postMessage events between Selkies (parent window) and the HUD
   * (iframe). HUD → here: `hud:size`, `hud:fullscreen`, `hud:toast`,
   * `hud:requestFileUpload`, `hud:inputRemap`. Selkies → HUD: any type in
   * the RELAY list.
   * @param {MessageEvent} event
   */
  function onMessage({ data, origin, source }) {
    if (origin !== window.location.origin) {
      return;
    }

    if (!data || typeof data !== 'object') {
      return;
    }

    if (source === iframe.contentWindow) {
      if (typeof data.type !== 'string') {
        return;
      }
      if (data.type === 'hud:size') {
        applyIframeGeometry(data.mode, data.geometry);
        return;
      }
      if (data.type === 'hud:fullscreen') {
        toggleFullscreen();
        return;
      }
      if (data.type === 'hud:toast') {
        showToast(data.message, data.kind);
        return;
      }
      if (data.type === 'hud:requestFileUpload') {
        window.dispatchEvent(new CustomEvent('requestFileUpload'));
        return;
      }
      if (data.type === 'hud:inputRemap') {
        setInputRemap(data.keyboardLayout, data.gamepadLayouts);
        return;
      }
      if (data.type.indexOf('hud:') === 0) {
        return;
      }
      // Re-emit on the parent's own window so Selkies' core (which ignores
      // cross-window sources) actually receives it.
      window.postMessage(data, window.location.origin);
      return;
    }

    if (source === window && RELAY.indexOf(data.type) >= 0 && iframe.contentWindow) {
      iframe.contentWindow.postMessage(data, window.location.origin);
    }
  }

  // When the HUD is open and focus is in the parent (user opened via shortcut),
  // Escape lives in the parent and would leak to Selkies/VM. Intercept it here
  // and forward as hud:toggle. The iframe has its own Escape handler for when
  // it actually has focus (after a click inside the HUD).
  /** @param {KeyboardEvent} e */
  function onParentEscape(e) {
    if (!hudPanelOpen || e.key !== 'Escape') {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    postToHud('hud:toggle');
  }

  /** @param {KeyboardEvent} e */
  function onHudShortcut(e) {
    if (!e.metaKey || !e.altKey) {
      return;
    }
    const key = (e.key || '').toLowerCase();
    if (!SHORTCUT_KEYS.has(key)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (key === 'o') {
      postToHud('hud:toggle');
    } else if (key === 'q') {
      postToHud('hud:quit');
    } else if (key === 'h') {
      postToHud('hud:home');
    } else if (key === 'f') {
      toggleFullscreen();
    }
  }

  function onWindowFocus() {
    releaseStuckModifiers();
    resumeMedia();
    document.addEventListener('pointerdown', resumeMedia, { once: true, capture: true });
    document.addEventListener('keydown', resumeMedia, { once: true, capture: true });
  }

  // Lock keyboard in fullscreen so OS shortcuts (Cmd/Win, Alt+Tab) pass
  // through to the VM instead of being intercepted by the host.
  function onFullscreenChange() {
    if (!nav.keyboard) {
      return;
    }
    if (document.fullscreenElement) {
      nav.keyboard.lock?.();
    } else {
      nav.keyboard.unlock?.();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountIframe, { once: true });
  } else {
    mountIframe();
  }

  discoverHostLayout();
  installGamepadRemap();
  installWebSocketWatchdog();
  neutralizeSelkiesInputOnDesktop();

  // On page load (not just on window.focus), clear any modifier the VM may
  // think is held — the container's X server persists across browser
  // navigations, so resuming a session can inherit phantom state.
  releaseStuckModifiers();

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('pointerdown', primeClipboard, { once: true, capture: true });
  document.addEventListener('keydown', primeClipboard, { once: true, capture: true });

  window.addEventListener('focus', onWindowFocus);

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKeyboardRemap, true);
  window.addEventListener('keyup', onKeyboardRemap, true);
  window.addEventListener('keydown', onHudShortcut, true);
  window.addEventListener('keydown', onParentEscape, true);

  // Gamepad.id is verbose: Chrome appends "(Vendor: 045e ...)" after the name,
  // Firefox prepends "xxxx-xxxx-" (vendor-product hex IDs). Strip both so the
  // toast shows just the human-readable label.
  /** @param {Gamepad} pad */
  const padDisplayName = (pad) => {
    const stripped = (pad.id || 'Gamepad').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '');
    return stripped.split('(')[0]?.trim() || 'Gamepad';
  };
  window.addEventListener('gamepadconnected', ({ gamepad }) => showToast(`${padDisplayName(gamepad)} connected`, 'success'));
  window.addEventListener('gamepaddisconnected', ({ gamepad }) => showToast(`${padDisplayName(gamepad)} disconnected`, 'warning'));
})();
