// ==UserScript==
// @name         DK membership autofill (clean final)
// @namespace    local.dk.bstage
// @version      4.0.0
// @description  Autofill Name/DOB/Phone on DK bstage membership (clean, no debug UI)
// @match        https://dpluskia.bstage.in/shop/my/membership*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ===== 你要替换成的值 =====
  const TARGET = {
    'Name': 'WANG XUAN',
    'Date of Birth': '2001.04.02',
    'Phone Number': '+82-01030583942',
  };

  const WANT = Object.keys(TARGET);

  let scheduled = false;
  let lastApplied = 0;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      run();
    }, 120);
  }

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

  function setValueByLabel(ROOT, labelText, newValue) {
    const leafs = Array.from(ROOT.querySelectorAll('*')).filter(
      el => el.children.length === 0
    );

    let labelEl = leafs.find(
      el => (el.textContent || '').trim() === labelText
    );

    if (!labelEl) {
      labelEl = leafs.find(
        el =>
          (el.textContent || '').trim().replace(/\s+/g, ' ') === labelText
      );
    }

    if (!labelEl) return false;

    const parentLeafs = Array.from(
      labelEl.parentElement.querySelectorAll('*')
    ).filter(el => el.children.length === 0);

    const idx = parentLeafs.indexOf(labelEl);

    let valueEl = parentLeafs.slice(idx + 1).find(el => {
      const t = (el.textContent || '').trim();
      return t && t !== labelText;
    });

    if (!valueEl) {
      let sib = labelEl.nextElementSibling;
      while (sib && !(sib.textContent || '').trim())
        sib = sib.nextElementSibling;
      if (sib && (sib.textContent || '').trim() !== labelText)
        valueEl = sib;
    }

    if (!valueEl) return false;

    if ((valueEl.textContent || '').trim() === newValue) return true;

    valueEl.textContent = newValue;
    return true;
  }

  function apply(ROOT) {
    let okCount = 0;
    for (const k of WANT) {
      if (setValueByLabel(ROOT, k, TARGET[k])) okCount++;
    }
    return okCount;
  }

  function run() {
    if (!location.pathname.startsWith('/shop/my/membership')) return;

    const now = Date.now();
    if (now - lastApplied < 600) return;

    let ROOT = findBackRoot(document);

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

    if (!ROOT) return;

    const ok = apply(ROOT);
    if (ok >= 2) lastApplied = now;
  }

  // ===== 触发 =====
  schedule();

  const mo = new MutationObserver(() => schedule());
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });

  const _ps = history.pushState;
  history.pushState = function () {
    _ps.apply(this, arguments);
    schedule();
  };

  const _rs = history.replaceState;
  history.replaceState = function () {
    _rs.apply(this, arguments);
    schedule();
  };

  window.addEventListener('popstate', () => schedule());

  setInterval(() => schedule(), 2000);

  // ===== Mobile 3D flip fix（轻量，不破坏翻面）=====
  (function mobileFlipFix() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) return;

    function apply3DFix() {
      if (!location.pathname.startsWith('/shop/my/membership')) return;

      const candidates = Array.from(
        document.querySelectorAll('div,section,main,article')
      ).filter(el => {
        const t = el.innerText || '';
        if (
          !(
            t.includes('Name') &&
            t.includes('Date of Birth') &&
            t.includes('Phone Number')
          )
        )
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 180 && r.height > 220;
      });

      for (const el of candidates) {
        el.style.transformStyle = 'preserve-3d';
        el.style.webkitTransformStyle = 'preserve-3d';
        el.style.perspective = '1200px';
        el.style.webkitPerspective = '1200px';

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

    let tries = 0;
    const timer = setInterval(() => {
      apply3DFix();
      tries++;
      if (tries >= 40) clearInterval(timer);
    }, 200);

    const mo2 = new MutationObserver(() => apply3DFix());
    mo2.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) apply3DFix();
    });
  })();

})();
