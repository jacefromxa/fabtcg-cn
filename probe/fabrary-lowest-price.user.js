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

  function extractPricesFromDetailDocument(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return null;

    let links;
    try {
      links = doc.querySelectorAll('a[href*="tcgplayer.com"]');
    } catch (_) {
      return null;
    }

    return findLowestDollarPrice(Array.from(links || [], (link) => link && link.textContent));
  }

  function createPriceLoader(doc, browserRoot, options) {
    const runtime = browserRoot || root;
    const settings = Object.assign({ timeoutMs: 8000, pollMs: 150 }, options || {});
    const cache = new Map();
    const inflight = new Map();
    const queue = [];
    let iframe = null;
    let active = false;
    let destroyed = false;
    let currentFinish = null;
    let currentTimer = null;

    function schedule(callback, delay) {
      const setTimer = runtime && typeof runtime.setTimeout === 'function'
        ? runtime.setTimeout.bind(runtime)
        : setTimeout;
      return setTimer(callback, delay);
    }

    function cancelTimer(timerId) {
      if (timerId == null) return;
      const clearTimer = runtime && typeof runtime.clearTimeout === 'function'
        ? runtime.clearTimeout.bind(runtime)
        : clearTimeout;
      clearTimer(timerId);
    }

    function ensureIframe() {
      if (iframe || !doc || typeof doc.createElement !== 'function') return iframe;
      iframe = doc.createElement('iframe');
      iframe.setAttribute('data-fab-price-iframe', '1');
      iframe.setAttribute('aria-hidden', 'true');
      Object.assign(iframe.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '1px',
        height: '1px',
        border: '0',
        opacity: '0',
        pointerEvents: 'none',
      });
      if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(iframe);
      return iframe;
    }

    function readCurrentPrice() {
      try {
        return extractPricesFromDetailDocument(iframe && iframe.contentDocument);
      } catch (_) {
        return null;
      }
    }

    function loadInIframe(url) {
      return new Promise((resolve) => {
        const frame = ensureIframe();
        if (!frame || typeof frame.addEventListener !== 'function') {
          resolve(null);
          return;
        }

        let settled = false;
        let pollTimer = null;

        const cleanup = () => {
          if (typeof frame.removeEventListener === 'function') {
            frame.removeEventListener('load', onLoad);
          }
          cancelTimer(pollTimer);
          cancelTimer(currentTimer);
          pollTimer = null;
          currentTimer = null;
          currentFinish = null;
        };

        const finish = (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value == null ? null : value);
        };

        const poll = () => {
          if (settled) return;
          const price = readCurrentPrice();
          if (price != null) {
            finish(price);
            return;
          }
          pollTimer = schedule(poll, settings.pollMs);
        };

        const onLoad = () => {
          poll();
        };

        currentFinish = () => finish(null);
        frame.addEventListener('load', onLoad);
        currentTimer = schedule(() => finish(null), settings.timeoutMs);

        try {
          frame.src = url;
        } catch (_) {
          finish(null);
        }
      });
    }

    function drain() {
      if (active || destroyed || !queue.length) return;
      active = true;
      const job = queue.shift();
      loadInIframe(job.url)
        .then((value) => {
          cache.set(job.url, value);
          job.resolve(value);
        })
        .catch(() => {
          cache.set(job.url, null);
          job.resolve(null);
        })
        .finally(() => {
          inflight.delete(job.url);
          active = false;
          drain();
        });
    }

    function load(url) {
      if (destroyed) return Promise.resolve(null);
      const key = normalizeCardUrl(url, runtime.location?.href || 'https://fabrary.net/') || url;
      if (typeof key !== 'string' || !key) return Promise.resolve(null);
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      if (inflight.has(key)) return inflight.get(key);

      const promise = new Promise((resolve) => {
        queue.push({ url: key, resolve });
      });
      inflight.set(key, promise);
      drain();
      return promise;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      queue.splice(0, queue.length).forEach((job) => job.resolve(null));
      if (currentFinish) currentFinish();
      if (iframe && typeof iframe.remove === 'function') iframe.remove();
      iframe = null;
    }

    return { load, destroy };
  }

  function createPriceBadge(doc, image) {
    const badge = doc.createElement('span');
    badge.setAttribute('data-fab-price-badge', '1');
    badge.textContent = '…';
    Object.assign(badge.style, {
      position: 'absolute',
      top: '4px',
      right: '4px',
      zIndex: '20',
      pointerEvents: 'none',
      padding: '2px 5px',
      borderRadius: '4px',
      background: 'rgba(0, 0, 0, 0.82)',
      color: '#fff',
      font: '700 12px/1.2 sans-serif',
      whiteSpace: 'nowrap',
    });

    const wrapper = image && image.parentElement;
    if (wrapper && typeof wrapper.appendChild === 'function') {
      if (wrapper.style && !wrapper.style.position) wrapper.style.position = 'relative';
      wrapper.appendChild(badge);
    }
    return badge;
  }

  function installPriceOverlay(doc, browserRoot, options) {
    const runtime = browserRoot || root;
    const settings = options || {};
    if (runtime.top !== runtime || !doc || !doc.body) {
      return { scan() {}, destroy() {} };
    }

    const loader = settings.loader || createPriceLoader(doc, runtime, settings);
    const imageStates = new WeakMap();
    const badgesByUrl = new Map();
    const requestedUrls = new Set();
    const resolvedPrices = new Map();
    const allBadges = new Set();
    let mutationObserver = null;
    let intersectionObserver = null;
    let destroyed = false;

    function setBadgePrice(badge, value) {
      if (badge) badge.textContent = formatPrice(value);
    }

    function updateUrlBadges(url, value) {
      const badges = badgesByUrl.get(url);
      if (!badges) return;
      badges.forEach((badge) => setBadgePrice(badge, value));
    }

    function requestUrl(url) {
      if (requestedUrls.has(url)) return;
      requestedUrls.add(url);
      Promise.resolve(loader.load(url))
        .then((value) => {
          resolvedPrices.set(url, value == null ? null : value);
          updateUrlBadges(url, value);
        })
        .catch(() => {
          resolvedPrices.set(url, null);
          updateUrlBadges(url, null);
        });
    }

    function registerImage(image) {
      if (destroyed || !image) return;
      const baseHref = runtime.location?.href || 'https://fabrary.net/';
      const url = findCardUrlForImage(image, baseHref);
      if (!url) return;

      let state = imageStates.get(image);
      if (!state) {
        const badge = createPriceBadge(doc, image);
        state = { url, badge };
        imageStates.set(image, state);
        allBadges.add(badge);
        if (!badgesByUrl.has(url)) badgesByUrl.set(url, new Set());
        badgesByUrl.get(url).add(badge);
      }

      if (resolvedPrices.has(url)) {
        setBadgePrice(state.badge, resolvedPrices.get(url));
        return;
      }
      requestUrl(url);
    }

    function scan() {
      if (destroyed || typeof doc.querySelectorAll !== 'function') return;
      let images;
      try {
        images = doc.querySelectorAll('img');
      } catch (_) {
        return;
      }
      Array.from(images || []).forEach((image) => {
        if (intersectionObserver && typeof intersectionObserver.observe === 'function') {
          if (!imageStates.has(image)) intersectionObserver.observe(image);
          return;
        }
        registerImage(image);
      });
    }

    if (typeof runtime.IntersectionObserver === 'function') {
      intersectionObserver = new runtime.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.intersectionRatio > 0) registerImage(entry.target);
        });
      }, { rootMargin: '200px' });
    }

    if (typeof runtime.MutationObserver === 'function') {
      mutationObserver = new runtime.MutationObserver(() => scan());
      mutationObserver.observe(doc.body, { childList: true, subtree: true });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (mutationObserver) mutationObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      if (loader && typeof loader.destroy === 'function') loader.destroy();
      allBadges.forEach((badge) => {
        if (badge && typeof badge.remove === 'function') {
          badge.remove();
        } else if (badge && badge.parentNode && typeof badge.parentNode.removeChild === 'function') {
          badge.parentNode.removeChild(badge);
        }
      });
      allBadges.clear();
      badgesByUrl.clear();
    }

    const controller = { scan, destroy };
    scan();
    return controller;
  }

  root.FabPriceProbe = {
    parseDollarAmount,
    findLowestDollarPrice,
    formatPrice,
    normalizeCardUrl,
    slugifyCardName,
    findCardUrlForImage,
    extractPricesFromDetailDocument,
    createPriceLoader,
    createPriceBadge,
    installPriceOverlay,
  };

  if (root.top === root && root.document && !root.__fabPriceOverlayInstalled) {
    root.__fabPriceOverlayInstalled = installPriceOverlay(root.document, root);
  }
}());
