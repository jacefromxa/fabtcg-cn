// ==UserScript==
// @name         Talishar CN 注入诊断
// @namespace    https://talishar.net/
// @version      0.1.1
// @description  临时验证 Tampermonkey 是否成功注入用户脚本
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function showDiagnostic() {
    const host = document.body || document.documentElement;
    if (!host) {
      setTimeout(showDiagnostic, 50);
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'talishar-cn-diagnostic';
    banner.textContent = 'Talishar CN：脚本已成功注入';
    banner.style.cssText = [
      'position:fixed !important',
      'top:10px !important',
      'left:10px !important',
      'z-index:2147483647 !important',
      'display:block !important',
      'padding:12px 16px !important',
      'border:3px solid #7f1d1d !important',
      'border-radius:8px !important',
      'background:#ef4444 !important',
      'color:#fff !important',
      'font:700 16px/1.4 sans-serif !important',
      'opacity:1 !important',
      'visibility:visible !important',
    ].join(';');
    host.appendChild(banner);
  }

  showDiagnostic();
})();
