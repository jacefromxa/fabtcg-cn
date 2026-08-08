// ==UserScript==
// @name         FaBrary 最低美元价格显示
// @namespace    https://fabrary.net/
// @version      0.1.0
// @description  在 FaBrary 卡牌和牌组页面牌图右上角显示 TCGplayer 最低美元价
// @match        https://fabrary.net/cards
// @match        https://fabrary.net/cards/*
// @match        https://fabrary.net/decks/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const root = window;

  function parseDollarAmount(text) {
    const match = String(text || '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function findLowestDollarPrice(texts) {
    const prices = Array.from(texts || [], parseDollarAmount)
      .filter((value) => value != null);
    return prices.length ? Math.min(...prices) : null;
  }

  function formatPrice(value) {
    return value == null ? '—' : '$' + Number(value).toFixed(2);
  }

  function normalizeCardUrl(href, baseHref) {
    if (typeof href !== 'string' || !href.trim()) return null;

    let parsed;
    try {
      parsed = new URL(href, baseHref || root.location?.href || 'https://fabrary.net/');
    } catch (_) {
      return null;
    }

    if (parsed.protocol !== 'https:' || parsed.hostname !== 'fabrary.net') return null;
    const match = parsed.pathname.match(/^\/cards\/([^/]+)\/?$/i);
    if (!match || !match[1]) return null;
    const slug = decodeURIComponent(match[1]).trim().toLowerCase();
    return slug ? 'https://fabrary.net/cards/' + slug : null;
  }

  function slugifyCardName(name) {
    return String(name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function findCardUrlForImage(image, baseHref) {
    let current = image;
    let depth = 0;

    while (current && depth <= 8) {
      const tagName = String(current.tagName || '').toLowerCase();
      if (tagName === 'a') {
        const href = current.href || (typeof current.getAttribute === 'function'
          ? current.getAttribute('href')
          : null);
        const cardUrl = normalizeCardUrl(href, baseHref);
        if (cardUrl) return cardUrl;
      }
      current = current.parentElement || current.parentNode;
      depth += 1;
    }

    const alt = image && (image.alt || (typeof image.getAttribute === 'function'
      ? image.getAttribute('alt')
      : ''));
    const slug = slugifyCardName(alt);
    return slug ? 'https://fabrary.net/cards/' + slug : null;
  }

  root.FabPriceProbe = {
    parseDollarAmount,
    findLowestDollarPrice,
    formatPrice,
    normalizeCardUrl,
    slugifyCardName,
    findCardUrlForImage,
  };
}());
