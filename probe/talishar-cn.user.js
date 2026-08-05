// ==UserScript==
// @name         Talishar / FaBrary 简体中文卡牌浮窗
// @namespace    https://talishar.net/
// @version      0.6.0
// @description  在 Talishar / FaBrary 悬停卡牌时显示简体中文卡牌信息
// @match        https://talishar.net/*
// @match        https://fabrary.net/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const root = window;
  const PRODUCTION_DATA_BASE_URL = 'https://raw.githubusercontent.com/jacefromxa/talishar-cn-data/main';
  const LOCAL_DATA_BASE_URL = 'http://127.0.0.1:4173/data';
  const CACHE_PREFIX = 'fab-cn-card-data-v1';

  // --- Data-base-url resolution -------------------------------------------

  function isLocalDataUrl(url) {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(String(url));
  }

  function resolveDataBaseUrl() {
    try {
      const stored = root.localStorage && root.localStorage.getItem('fab-cn-data-base-url');
      if (stored && String(stored).trim()) {
        return String(stored).trim().replace(/\/+$/, '');
      }
    } catch (_) { /* localStorage may be unavailable */ }
    return PRODUCTION_DATA_BASE_URL;
  }

  // --- Core helpers -------------------------------------------------------

  function normalizeCandidate(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  function splitTokens(value) {
    if (typeof value !== 'string') return [];
    return value
      .split(/[\s/_.\-=?:&]+/)
      .map(normalizeCandidate)
      .filter(Boolean);
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function extractImageTokens(value) {
    if (typeof value !== 'string' || !value.trim()) return [];

    let parsed;
    try {
      parsed = new URL(value, root.location?.href || 'https://talishar.net/');
    } catch {
      parsed = null;
    }

    const tokens = [];
    if (parsed) {
      const filename = parsed.pathname.split('/').filter(Boolean).pop();
      const stem = filename ? filename.replace(/\.[^.]+$/, '') : '';
      if (stem) {
        const exactStem = normalizeCandidate(stem);
        if (exactStem) tokens.push(exactStem);
        tokens.push(...splitTokens(stem));
      }
      for (const queryValue of parsed.searchParams.values()) {
        tokens.push(...splitTokens(queryValue));
      }
    } else {
      tokens.push(...splitTokens(value));
    }

    return unique(tokens);
  }

  // Mirrors scripts/translate-helper.mjs slugifyCardName so card-name text (e.g.
  // an <img alt="Boulder Drop"> on FaBrary) maps onto our slug-indexed database.
  function slugifyCardName(name) {
    return String(name || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // FaBrary card images use printing ids as filenames (e.g. "PEN313.webp").
  // The exact stem (PEN313) is the key into the printing-id alias table.
  function extractPrintingId(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let parsed;
    try {
      parsed = new URL(value, root.location?.href || 'https://fabrary.net/');
    } catch {
      parsed = null;
    }
    const filename = parsed && parsed.pathname.split('/').filter(Boolean).pop();
    const stem = filename ? filename.replace(/\.[^.]+$/, '') : '';
    return stem || null;
  }

  function attributeEntries(element) {
    if (!element || !element.attributes) return [];
    return Array.from(element.attributes, (attribute) => ({
      name: String(attribute.name || '').toLowerCase(),
      value: String(attribute.value || ''),
    }));
  }

  function collectCandidates(element) {
    const result = {
      tagName: String(element?.tagName || '').toLowerCase(),
      className: String(element?.className || ''),
      attributes: {},
      imageUrls: [],
      textHints: [],
    };

    const entries = attributeEntries(element);
    const knownEntries = new Map(entries.map(({ name, value }) => [name, value]));
    const addImageUrl = (value) => {
      if (typeof value !== 'string' || !value.trim()) return;
      if (!result.imageUrls.includes(value)) result.imageUrls.push(value);
    };
    const addTextHint = (value) => {
      const normalized = normalizeCandidate(value);
      if (normalized && !result.textHints.includes(normalized)) {
        result.textHints.push(normalized);
      }
    };

    addImageUrl(element?.src || knownEntries.get('src'));
    addTextHint(element?.alt || knownEntries.get('alt'));
    addTextHint(element?.title || knownEntries.get('title'));

    for (const { name, value } of entries) {
      if (!name.startsWith('data-')) continue;
      const normalized = normalizeCandidate(value);
      if (!normalized) continue;
      if (!result.attributes[name]) result.attributes[name] = [];
      if (!result.attributes[name].includes(normalized)) {
        result.attributes[name].push(normalized);
      }
    }

    return result;
  }

  function hasCandidateSignals(candidate) {
    return Boolean(
      candidate.imageUrls.length ||
        candidate.textHints.length ||
        Object.keys(candidate.attributes).length,
    );
  }

  function findProbeTarget(target, doc) {
    let current = target;
    let depth = 0;

    while (current && depth <= 6 && current !== doc.body) {
      const directCandidate = collectCandidates(current);
      if (hasCandidateSignals(directCandidate)) return current;

      if (typeof current.querySelector === 'function') {
        const image = current.querySelector('img');
        if (image && hasCandidateSignals(collectCandidates(image))) return image;
      }

      current = current.parentElement || current.parentNode;
      depth += 1;
    }

    return null;
  }

  function joinDataUrl(baseUrl, relativePath) {
    return `${String(baseUrl).replace(/\/+$/, '')}/${String(relativePath).replace(/^\/+/, '')}`;
  }

  // --- Remote card-data loader with versioned cache -----------------------

  // Talishar image filenames carry suffixes that are not part of the card:
  // a pitch color ("boulder_drop_red") or a printing-variant marker
  // ("MPW010-T", "FAB153-T"). Strip both so the base stem can be looked up in
  // the alias table (printing ids in the English source never contain hyphens,
  // so a trailing "-<alnum>" is always a variant marker).
  function normalizeStem(stem) {
    var s = String(stem);
    // Talishar applies modifiers to card image filenames: pitch colors
    // ("boulder_drop_red"), cropped thumbnails ("blaze_headlong_red_cropped"),
    // and printing-variant markers ("MPW010-T"). None are part of a card
    // name, so strip them iteratively until the stem stabilises.
    var strips = [/_(red|yellow|blue)$/i, /_cropped$/i, /_crop$/i];
    var changed = true;
    while (changed) {
      changed = false;
      for (var j = 0; j < strips.length; j++) {
        var next = s.replace(strips[j], '');
        if (next !== s) {
          s = next;
          changed = true;
          break;
        }
      }
    }
    // Printing-variant markers (English source has zero hyphen printing ids
    // so stripping a trailing "-<alnum>" is always safe).
    return s.replace(/-[a-z0-9]+$/i, '');
  }

  // Build an ordered list of candidate database keys for a hovered element.
  // Priority:
  //   1. Image-stem aliases (FaBrary printing ids + Talishar transliterated
  //      stems), cross-checked against alt/title text
  //   2. alt/title card-name text -> slug
  //   3. image filename tokens (Talishar slug-style names)
  function resolveCardKeys(candidate, aliases) {
    const keys = [];
    const push = (key) => {
      if (key && !keys.includes(key)) keys.push(key);
    };

    const altSlug = candidate.textHints
      .map(slugifyCardName)
      .find((slug) => slug && slug.length > 1);

    // 1. Image-stem aliases. Ambiguous ids keep an array of candidates; the
    // alt name picks the right one. Also, Talishar names pitched / variant
    // images with suffixes ("ice_quake_red", "MPW010-T"), so the normalized
    // base is a direct candidate key too.
    for (const url of candidate.imageUrls) {
      const stem = extractPrintingId(url);
      if (!stem) continue;
      const normalized = normalizeStem(stem);
      if (normalized && normalized !== stem) push(normalized);
      if (!aliases) continue;
      const lookupKeys = [stem, normalized];
      for (const key of lookupKeys) {
        const alias = aliases[key];
        if (!alias) continue;
        const targets = Array.isArray(alias) ? alias : [alias];
        const matched = altSlug
          ? targets.filter((target) => target.slug === altSlug)
          : targets;
        for (const target of (matched.length ? matched : targets)) push(target.slug);
      }
    }

    // 2. Card-name text (alt / title) as slug.
    if (altSlug) push(altSlug);

    // 3. Image filename tokens (Talishar slug-style names).
    for (const url of candidate.imageUrls) {
      for (const token of extractImageTokens(url)) push(token);
    }

    return keys;
  }

  function createCardDataLoader(browserRoot, baseUrl) {
    const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
    const isLocal = isLocalDataUrl(normalizedBaseUrl);
    const chunkPromises = new Map();
    let aliasesPromise = null;
    let loaderState = null;       // { cacheName, cache, manifest }
    let loaderInitPromise = null;
    let indexPromise = null;

    function noCache() {
      return !browserRoot.caches || typeof browserRoot.caches.open !== 'function' || isLocal;
    }

    async function cleanOldCaches(currentName) {
      if (!browserRoot.caches || typeof browserRoot.caches.keys !== 'function') return;
      try {
        const keys = await browserRoot.caches.keys();
        for (const key of keys) {
          if (key !== currentName && key.startsWith(CACHE_PREFIX + '-')) {
            await browserRoot.caches.delete(key);
          }
        }
      } catch (_) { /* best-effort */ }
    }

    // Fetch manifest and derive the versioned cache name.
    async function initLoader() {
      if (loaderState) return loaderState;

      const manifestUrl = joinDataUrl(normalizedBaseUrl, 'manifest.json');
      let manifest;

      // Manifest is always fetched network-first so we detect version bumps.
      if (typeof browserRoot.fetch !== 'function') {
        throw new Error('当前环境不支持远程卡库加载。');
      }
      const manifestResponse = await browserRoot.fetch(manifestUrl);
      if (!manifestResponse || manifestResponse.ok === false) {
        throw new Error('卡库请求失败：' + manifestUrl);
      }
      manifest = await manifestResponse.json();

      let cacheName = null;
      let cache = null;

      if (!noCache()) {
        cacheName = CACHE_PREFIX + '-' + (manifest.version || 'unknown');
        cache = await browserRoot.caches.open(cacheName).catch(function () { return null; });
        // Cache the manifest itself so the version persists across restarts.
        if (cache && typeof cache.put === 'function' && typeof manifestResponse.clone === 'function') {
          try {
            await cache.put(manifestUrl, manifestResponse.clone());
          } catch (_) { /* quota */ }
        }
        cleanOldCaches(cacheName);
      }

      loaderState = { cacheName: cacheName, cache: cache, manifest: manifest };
      return loaderState;
    }

    async function getJson(relativePath) {
      if (!loaderInitPromise) {
        loaderInitPromise = initLoader();
      }
      var state = await loaderInitPromise;
      var url = joinDataUrl(normalizedBaseUrl, relativePath);

      // Cache-first for index and chunks (manifest is already handled in init).
      if (state.cache && typeof state.cache.match === 'function') {
        var cachedResponse = await state.cache.match(url);
        if (cachedResponse) return cachedResponse.json();
      }

      if (typeof browserRoot.fetch !== 'function') {
        throw new Error('当前环境不支持远程卡库加载。');
      }
      var response = await browserRoot.fetch(url);
      if (!response || response.ok === false) {
        throw new Error('卡库请求失败：' + url);
      }
      var data = await response.json();

      if (state.cache && typeof state.cache.put === 'function' && typeof response.clone === 'function') {
        try {
          await state.cache.put(url, response.clone());
        } catch (_) {
          // Cache quota or browser privacy settings must not block card display.
        }
      }
      return data;
    }

    function loadIndex() {
      if (!indexPromise) {
        indexPromise = initLoader()
          .then(function (state) {
            return getJson(state.manifest.index_file).then(function (index) {
              return { manifest: state.manifest, index: index };
            });
          })
          .catch(function (error) {
            indexPromise = null;
            throw error;
          });
      }
      return indexPromise;
    }

    function loadChunk(relativePath) {
      if (!chunkPromises.has(relativePath)) {
        var promise = getJson(relativePath).catch(function (error) {
          chunkPromises.delete(relativePath);
          throw error;
        });
        chunkPromises.set(relativePath, promise);
      }
      return chunkPromises.get(relativePath);
    }

    // The alias table maps FaBrary printing ids and Talishar transliterated
    // image stems to canonical slugs. Loaded lazily on demand (only when the
    // fast token/text path fails), then cached like any other data file.
    function loadAliases() {
      if (!aliasesPromise) {
        aliasesPromise = getJson('aliases.json').catch(function () { return null; });
      }
      return aliasesPromise;
    }

    async function findInIndex(keys) {
      var loaded = await loadIndex();
      var index = loaded.index;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var reference = index.cards && index.cards[key];
        if (!reference) continue;
        var chunk = await loadChunk(reference.chunk);
        var card = chunk.cards && chunk.cards[reference.id];
        if (card) return { key: reference.id, card: card };
      }
      return null;
    }

    async function loadCardForElement(element) {
      var candidate = collectCandidates(element);

      // Fast pass: image tokens + alt text (covers most Talishar cards).
      var match = await findInIndex(resolveCardKeys(candidate, null));
      if (match) return match;

      // Fallback pass: fetch the alias table once and retry. This resolves
      // FaBrary printing ids and Talishar transliterated stems (special chars,
      // meld cards, ...) that the fast path cannot.
      var aliases = await loadAliases();
      return findInIndex(resolveCardKeys(candidate, aliases));
    }

    return {
      loadIndex: loadIndex,
      loadCardForElement: loadCardForElement,
      isLocal: isLocal,
    };
  }

  // --- UI helpers ---------------------------------------------------------

  function findCardAnchor(target, doc) {
    const detected = findProbeTarget(target, doc);
    if (!detected) return null;
    if (String(detected.tagName || '').toLowerCase() === 'img') return detected;
    if (typeof detected.querySelector === 'function') {
      const image = detected.querySelector('img');
      if (image) return image;
    }
    return detected;
  }

  function calculatePanelPosition(anchorRect, panelSize, viewport, options) {
    if (!options) options = {};
    const gap = options.gap != null ? options.gap : 12;
    const margin = options.margin != null ? options.margin : 12;
    const width = Math.max(0, panelSize.width || 0);
    const height = Math.max(0, panelSize.height || 0);
    const rightSpace = viewport.width - anchorRect.right;
    const leftSpace = anchorRect.left;
    const fitsRight = rightSpace >= width + gap;
    const fitsLeft = leftSpace >= width + gap;
    const side = fitsRight || (!fitsLeft && rightSpace >= leftSpace) ? 'right' : 'left';
    const preferredLeft = side === 'right'
      ? anchorRect.right + gap
      : anchorRect.left - width - gap;
    const preferredTop = anchorRect.top + (anchorRect.height - height) / 2;
    const maxLeft = Math.max(margin, viewport.width - width - margin);
    const maxTop = Math.max(margin, viewport.height - height - margin);

    return {
      left: Math.min(Math.max(preferredLeft, margin), maxLeft),
      top: Math.min(Math.max(preferredTop, margin), maxTop),
      side: side,
    };
  }

  function clearPanel(panel) {
    if (typeof panel.replaceChildren === 'function') {
      panel.replaceChildren();
      return;
    }
    if (Array.isArray(panel.children)) panel.children.length = 0;
  }

  function renderCardPanel(doc, panel, card) {
    clearPanel(panel);
    const name = doc.createElement('div');
    name.className = 'fab-cn-card-name';
    name.textContent = card.name_zh || card.name_en || '';
    name.style.color = '#ffad42';
    name.style.fontSize = '15px';
    name.style.fontWeight = '700';

    const type = doc.createElement('div');
    type.className = 'fab-cn-card-type';
    type.textContent = card.type_zh || card.type_en || '';
    type.style.fontSize = '12px';
    type.style.fontStyle = 'italic';
    type.style.fontWeight = '300';
    type.style.textDecoration = 'underline';
    type.style.marginTop = '2px';

    const text = doc.createElement('div');
    text.className = 'fab-cn-card-text';
    text.textContent = card.text_zh || '';
    text.style.fontSize = '13px';
    text.style.fontWeight = '400';
    text.style.lineHeight = '1.5';
    text.style.marginTop = '6px';
    text.style.whiteSpace = 'pre-wrap';

    panel.appendChild(name);
    panel.appendChild(type);
    panel.appendChild(text);
  }

  // --- Inline card-data lookup (for preloaded cardData) -------------------

  function lookupCard(element, cardData) {
    const candidate = collectCandidates(element);
    const keys = resolveCardKeys(candidate, null);
    const records = cardData || {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (records[key]) return { key: key, card: records[key] };

      var variantPrefix = key + '__';
      var variantKeys = Object.keys(records).filter(function (rk) { return rk.indexOf(variantPrefix) === 0; });
      if (variantKeys.length === 1) {
        var variantKey = variantKeys[0];
        return { key: variantKey, card: records[variantKey] };
      }
    }
    return null;
  }

  function candidateLines(element, cardData) {
    const candidate = collectCandidates(element);
    const lines = [
      'Fab CN probe',
      'tag: ' + (candidate.tagName || '(none)'),
      'class: ' + (candidate.className || '(none)'),
      'image tokens: ' + (candidate.imageUrls.flatMap(extractImageTokens).join(', ') || '(none)'),
      'text hints: ' + (candidate.textHints.join(', ') || '(none)'),
    ];

    const match = lookupCard(element, cardData);
    if (match) {
      const card = match.card;
      lines.push('card key: ' + match.key);
      if (card.name_zh) lines.push('中文卡名: ' + card.name_zh);
      if (card.type_zh) lines.push('中文类型: ' + card.type_zh);
      if (card.text_zh) lines.push('中文卡面:\n' + card.text_zh);
    }

    var attrKeys = Object.keys(candidate.attributes);
    for (var ai = 0; ai < attrKeys.length; ai++) {
      var name = attrKeys[ai];
      lines.push(name + ': ' + candidate.attributes[name].join(', '));
    }

    for (var ui = 0; ui < candidate.imageUrls.length; ui++) {
      lines.push('src: ' + candidate.imageUrls[ui]);
    }

    return lines;
  }

  // --- Main install -------------------------------------------------------

  function installProbe(doc, cardData) {
    if (!doc || !doc.body || typeof doc.createElement !== 'function') {
      return { destroy: function () {} };
    }

    var resolvedBaseUrl = cardData ? null : resolveDataBaseUrl();
    if (resolvedBaseUrl && typeof console !== 'undefined' && console.log) {
      console.log('[Talishar CN] 数据源: ' + resolvedBaseUrl +
        (isLocalDataUrl(resolvedBaseUrl) ? ' (本地)' : ' (远程)'));
    }

    var remoteLoader = (!cardData && typeof root.fetch === 'function')
      ? createCardDataLoader(root, resolvedBaseUrl)
      : null;
    var hoverSerial = 0;
    var currentAnchor = null;

    var panel = doc.createElement('div');
    panel.id = 'fab-cn-probe-panel';
    panel.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'z-index:2147483647',
      'display:none',
      'visibility:hidden',
      'max-width:320px',
      'max-height:45vh',
      'overflow:auto',
      'padding:9px 11px',
      'border:1px solid rgba(255,255,255,.35)',
      'border-radius:6px',
      'background:rgba(16,20,28,.94)',
      'color:#f4f7fb',
      'box-shadow:0 4px 18px rgba(0,0,0,.35)',
      'pointer-events:none',
      'font:13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    doc.body.appendChild(panel);

    var getViewport = function () {
      return {
        width: Number(root.innerWidth) || 1024,
        height: Number(root.innerHeight) || 768,
      };
    };

    var repositionPanel = function () {
      if (!currentAnchor || panel.style.display === 'none') return;
      if (typeof currentAnchor.getBoundingClientRect !== 'function') return;
      var anchorRect = currentAnchor.getBoundingClientRect();
      var panelSize = {
        width: Number(panel.offsetWidth) || 300,
        height: Number(panel.offsetHeight) || 100,
      };
      var position = calculatePanelPosition(anchorRect, panelSize, getViewport());
      panel.style.left = position.left + 'px';
      panel.style.top = position.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };

    var showLoading = function (anchor) {
      currentAnchor = anchor;
      panel.textContent = '中文卡库加载中…';
      panel.style.display = 'block';
      panel.style.visibility = 'hidden';
      repositionPanel();
      panel.style.visibility = 'visible';
    };

    var showCard = function (anchor, card) {
      currentAnchor = anchor;
      panel.style.display = 'block';
      panel.style.visibility = 'hidden';
      renderCardPanel(doc, panel, card);
      repositionPanel();
      panel.style.visibility = 'visible';
    };

    var hidePanel = function () {
      currentAnchor = null;
      panel.style.display = 'none';
      panel.style.visibility = 'hidden';
    };

    var onPointerOver = function (event) {
      var anchor = findCardAnchor(event && event.target, doc);
      if (!anchor) {
        hidePanel();
        return;
      }
      var serial = ++hoverSerial;
      if (cardData) {
        var match = lookupCard(anchor, cardData);
        if (match) showCard(anchor, match.card);
        else hidePanel();
        return;
      }
      if (!remoteLoader) {
        hidePanel();
        return;
      }

      showLoading(anchor);
      remoteLoader.loadCardForElement(anchor)
        .then(function (match) {
          if (serial !== hoverSerial) return;
          if (match) showCard(anchor, match.card);
          else hidePanel();
        })
        .catch(function (error) {
          if (serial !== hoverSerial) return;
          panel.textContent = '中文卡库加载失败：' + (error.message || error);
          panel.style.display = 'block';
          panel.style.visibility = 'visible';
          repositionPanel();
        });
    };

    var onViewportChange = function () { repositionPanel(); };

    doc.addEventListener('pointerover', onPointerOver);
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('resize', onViewportChange);
      root.addEventListener('scroll', onViewportChange, true);
    }

    return {
      destroy: function () {
        doc.removeEventListener('pointerover', onPointerOver);
        if (typeof root.removeEventListener === 'function') {
          root.removeEventListener('resize', onViewportChange);
          root.removeEventListener('scroll', onViewportChange, true);
        }
        hidePanel();
        if (typeof panel.remove === 'function') {
          panel.remove();
        } else if (typeof doc.body.removeChild === 'function') {
          doc.body.removeChild(panel);
        }
      },
    };
  }

  // --- Public API ---------------------------------------------------------

  var api = {
    calculatePanelPosition: calculatePanelPosition,
    collectCandidates: collectCandidates,
    createCardDataLoader: createCardDataLoader,
    PRODUCTION_DATA_BASE_URL: PRODUCTION_DATA_BASE_URL,
    LOCAL_DATA_BASE_URL: LOCAL_DATA_BASE_URL,
    resolveDataBaseUrl: resolveDataBaseUrl,
    isLocalDataUrl: isLocalDataUrl,
    extractImageTokens: extractImageTokens,
    extractPrintingId: extractPrintingId,
    normalizeStem: normalizeStem,
    slugifyCardName: slugifyCardName,
    resolveCardKeys: resolveCardKeys,
    findCardAnchor: findCardAnchor,
    lookupCard: lookupCard,
    normalizeCandidate: normalizeCandidate,
    renderCardPanel: renderCardPanel,
    installProbe: installProbe,
  };

  root.FabCnProbe = api;

  if (root.document) {
    root.FabCnProbeInstance = installProbe(root.document);
  }

  return api;
})();
