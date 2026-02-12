// ==UserScript==
// @name         DK membership autofill (VM mobile debug full)
// @namespace    local.dk.bstage
// @version      3.0.0
// @description  Autofill Name/DOB/Phone on DK bstage membership + mobile debug (PRINT/CLEAR) to capture DOM.
// @match        https://dpluskia.bstage.in/shop/my/membership*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ===== 你要替换成的值（按需改）=====
  const TARGET = {
    'Name': 'WANG XUAN',
    'Date of Birth': '2001.04.02',
    'Phone Number': '+82-01030583942',
  };
  const WANT = Object.keys(TARGET);

  // ===== 小状态条（右下角）=====
  const badge = document.createElement('div');
  badge.id = '__dk_vm_badge__';
  badge.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483647;' +
    'background:rgba(0,0,0,.78);color:#fff;padding:10px 10px;border-radius:14px;' +
    'font:12px/1.25 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial;' +
    'box-shadow:0 8px 22px rgba(0,0,0,.28);max-width:72vw;min-width:180px';
  function setBadge(t) {
    // 不覆盖按钮区：只改第一行文本
    let line = badge.querySelector('[data-line="1"]');
    if (!line) {
      line = document.createElement('div');
      line.dataset.line = '1';
      line.style.cssText = 'margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      badge.prepend(line);
    }
    line.textContent = t;
  }
  document.documentElement.appendChild(badge);
  setBadge('DK autofill: init…');

  // ====== DEBUG 工具：右下角按钮 + 打印 DOM（手机用）======
  function mkBtn(text, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText =
      'padding:6px 10px;border-radius:12px;border:0;' +
      'background:#2b2b2b;color:#fff;font-size:12px;line-height:1;opacity:.95';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
  badge.appendChild(btnWrap);

  // 是否把输出显示到页面上（手机没 Console 的时候用）
  const SHOW_ON_PAGE = true;

  function debugOut(s) {
    if (!SHOW_ON_PAGE) {
      console.log(s);
      setBadge('DK autofill: printed to console ✅');
      return;
    }
    // 在页面上弹一个可滚动的白底框，方便你截图
    let box = document.getElementById('__dk_debug_box__');
    if (!box) {
      box = document.createElement('pre');
      box.id = '__dk_debug_box__';
      box.style.cssText =
        'position:fixed;left:10px;right:10px;top:10px;bottom:88px;z-index:2147483647;' +
        'background:#fff;color:#111;border:2px solid #00ff88;border-radius:12px;' +
        'padding:10px;overflow:auto;font-size:12px;line-height:1.35;white-space:pre-wrap;';
      document.documentElement.appendChild(box);
    }
    box.textContent = s;
    setBadge('DK autofill: shown on page ✅ (scroll)');
  }

  function clearDebugBox() {
    const box = document.getElementById('__dk_debug_box__');
    if (box) box.remove();
  }

  btnWrap.appendChild(mkBtn('PRINT', () => printBackDom()));
  btnWrap.appendChild(mkBtn('CLEAR', () => {
    try { console.clear(); } catch (_) {}
    clearDebugBox();
    setBadge('DK autofill: cleared');
  }));

  // ===== 节流与调度 =====
  let scheduled = false;
  let lastApplied = 0;

  function schedule(reason) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      run(reason);
    }, 120);
  }

  // 1) 找“背面内容容器”：优先找同时包含 Name / DOB / Phone 的最大块
  function findBackRoot(doc = document) {
    const all = Array.from(doc.querySelectorAll('div,section,main,article'));
    let best = null;
    let bestScore = -1;

    for (const el of all) {
      const txt = (el.innerText || '').trim();
      if (!txt) continue;

      let hit = 0;
      for (const w of WANT) if (txt.includes(w)) hit++;
      if (hit === 0) continue;

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

  // 2) 在 ROOT 内：按 label 文本定位，并改“同一行/同一块里最像值”的那个叶子节点
  function setValueByLabel(ROOT, labelText, newValue) {
    const leafs = Array.from(ROOT.querySelectorAll('*')).filter(el => el.children.length === 0);

    // label 可能被分割/带空格，这里做严格相等 + 宽松匹配兜底
    let labelEl = leafs.find(el => (el.textContent || '').trim() === labelText);
    if (!labelEl) {
      labelEl = leafs.find(el => (el.textContent || '').trim().replace(/\s+/g, ' ') === labelText);
    }
    if (!labelEl) return false;

    // 常见结构：label 和 value 在同一个 parent 下
    const parentLeafs = Array.from(labelEl.parentElement.querySelectorAll('*')).filter(el => el.children.length === 0);
    const idx = parentLeafs.indexOf(labelEl);

    // 优先取 label 后面的第一个“非空且不是 label 本身”的 leaf 作为 value
    let valueEl = parentLeafs.slice(idx + 1).find(el => {
      const t = (el.textContent || '').trim();
      return t && t !== labelText;
    });

    // 兜底：顺着兄弟节点找
    if (!valueEl) {
      let sib = labelEl.nextElementSibling;
      while (sib && !(sib.textContent || '').trim()) sib = sib.nextElementSibling;
      if (sib && (sib.textContent || '').trim() !== labelText) valueEl = sib;
    }

    if (!valueEl) return false;

    // 已经是目标值就不动
    if ((valueEl.textContent || '').trim() === newValue) return true;

    valueEl.textContent = newValue;
    return true;
  }

  function apply(ROOT) {
    // 绿框提示：确认找到了背面容器
    ROOT.style.outline = '3px solid #00ff88';
    ROOT.style.outlineOffset = '2px';

    let okCount = 0;
    for (const k of WANT) {
      if (setValueByLabel(ROOT, k, TARGET[k])) okCount++;
    }
    return okCount;
  }

  function run(reason) {
    const now = Date.now();
    if (now - lastApplied < 600) return;

    // 只在目标页面运行（保险）
    if (!location.pathname.startsWith('/shop/my/membership')) {
      setBadge('DK autofill: not on membership page');
      return;
    }

    let ROOT = findBackRoot(document);

    // iframe 兜底（一般不会用到）
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
      // 临时调试：告诉你页面里有没有关键字
      const hasName = document.body && document.body.innerText ? document.body.innerText.includes('Name') : false;
      const hasDob = document.body && document.body.innerText ? document.body.innerText.includes('Date of Birth') : false;
      const hasPhone = document.body && document.body.innerText ? document.body.innerText.includes('Phone Number') : false;
      setBadge(`waiting… ${reason} | N=${hasName} D=${hasDob} P=${hasPhone}`);
      return;
    }

    const okCount = apply(ROOT);
    lastApplied = now;

    if (okCount >= 2) setBadge(`DK autofill: applied ✅ (${okCount}/3)`);
    else setBadge(`DK autofill: found root, labels not ready… (${reason})`);
  }

  // ===== PRINT：把命中的 ROOT outerHTML 打出来 =====
  function printBackDom() {
    if (!location.pathname.startsWith('/shop/my/membership')) {
      debugOut('[PRINT] ❌ Not on membership page.');
      return;
    }

    const root = findBackRoot(document);
    if (!root) {
      debugOut('[PRINT] ❌ root not found. Tip: flip to BACK side first, then tap PRINT.');
      setBadge('DK autofill: root not found (flip to back)');
      return;
    }

    const rect = root.getBoundingClientRect();
    const info =
      `[PRINT] ✅ root found\n` +
      `URL: ${location.href}\n` +
      `tag: ${root.tagName}\n` +
      `class: "${root.className}"\n` +
      `rect: ${Math.round(rect.width)}x${Math.round(rect.height)}\n\n`;

    const html = root.outerHTML || '';
    const max = 8000;
    const out = info + html.slice(0, max) + (html.length > max ? '\n...[TRUNCATED]...' : '');
    debugOut(out);
  }

  // ===== 触发点：打开页面就跑 + SPA/翻面/切换都跑 =====
  schedule('init');

  const mo = new MutationObserver(() => schedule('mutation'));
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule('visibility');
  });

  // SPA 路由变化（bstage 常用）
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

  // 额外保险：每 2 秒轻量检查一次
  setInterval(() => schedule('interval'), 2000);

  // ===== Mobile 3D flip fix (谨慎：只做轻量 CSS 补丁，不强行覆盖 transform) =====
  (function mobileFlipFix() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) return;

    function apply3DFix() {
      // 只在 membership 页面，避免全站污染
      if (!location.pathname.startsWith('/shop/my/membership')) return;

      // 只给“包含这些关键字”的大容器补 3D（更精准，避免误伤）
      const candidates = Array.from(document.querySelectorAll('div,section,main,article')).filter(el => {
        const t = (el.innerText || '');
        if (!(t.includes('Name') && t.includes('Date of Birth') && t.includes('Phone Number'))) return false;
        const r = el.getBoundingClientRect();
        return r.width > 180 && r.height > 220;
      });

      for (const el of candidates) {
        // 不改 transform（避免你说的“背面变正面”），只补 3D 支持属性
        el.style.transformStyle = 'preserve-3d';
        el.style.webkitTransformStyle = 'preserve-3d';
        el.style.perspective = '1200px';
        el.style.webkitPerspective = '1200px';

        // 尝试给其子层补 backfaceVisibility
        const kids = Array.from(el.children || []);
        for (const k of kids) {
          const r = k.getBoundingClientRect();
          if (r.width < 140 || r.height < 180) continue;
          k.style.backfaceVisibility = 'hidden';
          k.style.webkitBackfaceVisibility = 'hidden';
          k.style.transformStyle = 'preserve-3d';
          k.style.webkitTransformStyle = 'preserve-3d';
        }
      }
    }

    // 多次重试（SPA/异步渲染）
    let tries = 0;
    const timer = setInterval(() => {
      apply3DFix();
      tries++;
      if (tries >= 40) clearInterval(timer); // ~8秒后停止
    }, 200);

    const mo2 = new MutationObserver(() => apply3DFix());
    mo2.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) apply3DFix();
    });
  })();

})();
