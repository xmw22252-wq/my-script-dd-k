// ==UserScript==
// @name         vConsole Toggle (Firefox Android / Huawei)
// @namespace    https://example.local/
// @version      1.0.0
// @description  Toggle vConsole on/off via Violentmonkey menu. Loads vConsole from CDN when enabled.
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  // vConsole CDN（可替换版本）
  const VCONSOLE_URL = 'https://unpkg.com/vconsole@latest/dist/vconsole.min.js';

  // 是否启用：默认 false（不注入）
  const KEY = 'vconsole_enabled';
  const enabled = !!GM_getValue(KEY, false);

  // 菜单：开/关
  GM_registerMenuCommand(enabled ? '✅ vConsole: ON（点击关闭）' : '❌ vConsole: OFF（点击开启）', () => {
    GM_setValue(KEY, !enabled);
    // 刷新当前页让设置生效
    location.reload();
  });

  // 你也可以用 URL 参数临时开启（不用进菜单）
  // 例如：https://example.com/?vconsole=1
  const urlEnabled = /(?:\?|&)vconsole=1(?:&|$)/.test(location.search);

  if (!enabled && !urlEnabled) return;

  // 避免重复注入
  if (window.__VCONSOLE__) return;

  // 注入 vConsole
  const s = document.createElement('script');
  s.src = VCONSOLE_URL;
  s.async = false;

  s.onload = function () {
    try {
      window.__VCONSOLE__ = new window.VConsole();
      // 可选：提示一下
      console.log('[vConsole] injected');
    } catch (e) {
      console.warn('[vConsole] init failed:', e);
    }
  };

  s.onerror = function () {
    console.warn('[vConsole] load failed (possibly blocked by CSP or network)');
  };

  document.documentElement.appendChild(s);
})();
