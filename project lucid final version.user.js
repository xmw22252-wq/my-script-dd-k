// ==UserScript==
// @name         DK membership autofill (clean)
// @namespace    local.dk.autofill.clean
// @version      3.0.0
// @description  Auto-fill DK bstage membership back-side fields. Clean build (no PRINT/CLEAR). Includes Android/Huawei 3D flip fix.
// @match        https://dpluskia.bstage.in/shop/my/membership*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /**********************
   * 0) 配置区（只改这里）
   **********************/
  const TARGET = {
    'Name': 'WANG XUAN',
    'Date of Birth': '2001.04.02',
    'Phone Number': '+82-01030583942',
  };

  // 是否显示右下角小状态条（不会有 PRINT/CLEAR）
  const SHOW_BADGE = true;

  // 防止“把正面也改了”：只有当容器里同时出现这几个关键词才会动手
  const REQUIRED_HINTS = ['Membership number', 'Name', 'Date of Birth', 'Phone Number'];

  /**********************
   * 1) 轻量小状态条（可关）
   **********************/
  let badge = null;
  function setBadge(text) {
    if (!SHOW_BADGE) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.style.cssText =
        'position:fixed;right:12px;bottom:12px;z-index:2147483647;' +
        'background:rgba(0,0,0,.72);color:#fff;padding:8px 10px;border-radius:12px;' +
        'font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:70vw;pointer-events:none;';
      document.documentElement.appendChild(badge);
    }
    badge.textContent = text;
  }

  /**********************
   * 2) Autofill 核心逻辑
   **********************/
  const WANT = Object.keys(TARGET);

  let scheduled = false;
  let lastAppliedAt = 0;

  function schedule(reason) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      run(reason);
    }, 120);
  }

  function textHasAllHints(txt) {
    if (!txt) return false;
    for (const h of REQUIRED_HINTS) {
      if (!txt.includes(h)) return false;
    }
    return true;
  }

  // 选“最可能是背面信息块”的容器：同时命中 WANT + REQUIRED_HINTS，且面积较大
  function findBackRoot(doc = document) {
    const all = Array.from(doc.querySelectorAll('div,section,main,article'));
    let best = null;
    let bestScore = -1;

    for (const el of all) {
      const txt = (el.innerText || '').trim();
      if (!txt) continue;

      // 必须包含这些关键提示（防止误选正面/其他区域）
      if (!textHasAllHints(txt)) continue;

      let hit = 0;
      for (const w of WANT) if (txt.includes(w)) hit++;
      if (hit < 2) continue; // 至少 2 个字段出现才算

      const r = el.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const score = hit * 1e9 + area;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function normalize(s) {
    return (s || '').trim().replace(/\s+/g, ' ');
  }

  // 在 ROOT 内：按 label 文本定位 value 元素（同块/同父容器优先）
  function setValueByLabel(ROOT, labelText, newValue) {
    const leafs = Array.from(ROOT.querySelectorAll('*')).filter(el => el.children.length === 0);

    let labelEl = leafs.find(el => normalize(el.textContent) === labelText);
    if (!labelEl) return false;

    // 同 parent 内取 label 后面的第一个“像 value 的”leaf
    const parent = labelEl.parentElement;
    if (!parent) return false;

    const parentLeafs = Array.from(parent.querySelectorAll('*')).filter(el => el.children.length === 0);
    const idx = parentLeafs.indexOf(labelEl);

    let valueEl = parentLeafs.slice(idx + 1).find(el => {
      const t = normalize(el.textContent);
      return t && t !== labelText;
    });

    // 兜底：顺兄弟找
    if (!valueEl) {
      let sib = labelEl.nextElementSibling;
      while (sib && !normalize(sib.textContent)) sib = sib.nextElementSibling;
      if (sib && normalize(sib.textContent) !== labelText) valueEl = sib;
    }

    if (!valueEl) return false;

    // 已是目标值就不改
    if (normalize(valueEl.textContent) === newValue) return true;

    // 仅改文字（该页面展示是文本节点而不是 input）
    valueEl.textContent = newValue;
    return true;
  }

  function apply(ROOT) {
    let ok = 0;
    for (const k of WANT) {
      if (setValueByLabel(ROOT, k, TARGET[k])) ok++;
    }
    return ok;
  }

  function run(reason) {
    const now = Date.now();
    if (now - lastAppliedAt < 600) return;

    if (!location.pathname.startsWith('/shop/my/membership')) {
      setBadge('DK autofill: idle (not membership page)');
      return;
    }

    let ROOT = findBackRoot(document);

    // iframe 兜底
    if (!ROOT) {
      for (const fr of Array.from(document.querySelectorAll('iframe'))) {
        try {
          const d = fr.contentDocument;
          if (!d) continue;
          ROOT = findBackRoot(d);
          if (ROOT) break;
        } catch (_) {}
      }
    }

    if (!ROOT) {
      setBadge(`DK autofill: waiting… (${reason})`);
      return;
    }

    const okCount = apply(ROOT);
    lastAppliedAt = now;

    if (okCount >= 2) {
      setBadge(`DK autofill: applied ✅ (${okCount}/3)`);
    } else {
      setBadge(`DK autofill: found card, labels not ready… (${reason})`);
    }
  }

  /**********************
   * 3) Android/Huawei 翻面修复（不注入 UI）
   * - 只做“补 3D 场景/隐藏背面”样式修复
   * - 尽量不动 transform（避免把正反面变一样）
   **********************/
  function androidFlipFix() {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    if (!isAndroid) return;

    function apply3DFixOnce() {
      // 找候选：面积较大，且包含 membership 文本（避免误伤全站）
      const candidates = Array.from(document.querySelectorAll('div,section,main,article'))
        .filter(el => {
          const txt = (el.innerText || '');
          if (!txt.includes('My Membership')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 250 && r.height > 250;
        });

      for (const el of candidates) {
        // 关键：只补 3D 上下文，不覆盖已有 transform
        el.style.transformStyle = 'preserve-3d';
        el.style.webkitTransformStyle = 'preserve-3d';
        el.style.perspective = el.style.perspective || '1200px';
        el.style.webkitPerspective = el.style.webkitPerspective || '1200px';

        // 子层：补 backface-visibility，别改 transform
        const kids = Array.from(el.children || []);
        for (const k of kids) {
          const r = k.getBoundingClientRect();
          if (r.width < 160 || r.height < 160) continue;
          k.style.backfaceVisibility = 'hidden';
          k.style.webkitBackfaceVisibility = 'hidden';
          k.style.transformStyle = 'preserve-3d';
          k.style.webkitTransformStyle = 'preserve-3d';
        }
      }
    }

    // 多次短重试（SPA 渲染/翻面动画）
    let tries = 0;
    const timer = setInterval(() => {
      apply3DFixOnce();
      tries++;
      if (tries >= 40) clearInterval(timer); // ~8s
    }, 200);

    const mo = new MutationObserver(() => apply3DFixOnce());
    mo.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) apply3DFixOnce();
    });
  }

  /**********************
   * 4) 触发点
   **********************/
  setBadge('DK autofill: init…');
  schedule('init');

  const mo = new MutationObserver(() => schedule('mutation'));
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule('visibility');
  });

  const _ps = history.pushState;
  history.pushState = function () {
    _ps.apply(this, arguments);
    schedule('pushState');
  };
  const _rs = history.replaceState;
  history.replaceState = function () {
    _rs.apply(this, arguments);
    schedule('replaceState');
  };
  window.addEventListener('popstate', () => schedule('popstate'));

  setInterval(() => schedule('interval'), 2000);

  // Android 翻面修复启动
  androidFlipFix();
})();
