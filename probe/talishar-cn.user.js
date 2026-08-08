// ==UserScript==
// @name           Talishar / FaBrary 简体中文卡牌浮窗
// @name:zh-CN     Talishar / FaBrary 简体中文卡牌浮窗
// @name:en        Talishar / FaBrary Simplified Chinese Card Tooltip
// @namespace      https://talishar.net/
// @version        0.7.23
// @description    在 Talishar / FaBrary 悬停卡牌时显示简体中文卡牌信息
// @description:zh-CN 在 Talishar / FaBrary 悬停卡牌时显示简体中文卡牌信息
// @description:en Show Simplified Chinese card info on hover for Talishar and FaBrary — card name, type, rules text, and keyword explanations.
// @author         jacefromxa
// @license        GPL-3.0
// @match          https://talishar.net/*
// @match          https://fabrary.net/*
// @run-at         document-idle
// @updateURL      https://raw.githubusercontent.com/jacefromxa/talishar-cn/main/probe/talishar-cn.user.js
// @downloadURL    https://raw.githubusercontent.com/jacefromxa/talishar-cn/main/probe/talishar-cn.user.js
// @grant          GM_registerMenuCommand
// @grant          GM_getValue
// @grant          GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const root = window;
  const PRODUCTION_DATA_BASE_URL = 'https://raw.githubusercontent.com/jacefromxa/talishar-cn/main/dist/data';
  const LOCAL_DATA_BASE_URL = 'http://127.0.0.1:4173/data';
  const CACHE_PREFIX = 'fab-cn-card-data-v1';

  // --- Settings management --------------------------------------------------

  const SETTINGS_DEFAULTS = {
    bgColor: '16, 20, 28',
    bgOpacity: 0.94,
    borderColor: '255, 255, 255',
    borderOpacity: 0.35,
    textColor: '#f4f7fb',
    textSize: 13,
    nameColor: '#ffad42',
    nameSize: 15,
    typeColor: '#f4f7fb',
    typeSize: 12,
    keywordColor: '#8be9fd',
    keywordSize: 11,
    panelMode: 'follow',
    panelPosition: null,
  };

  function loadSettings() {
    try {
      if (typeof GM_getValue !== 'function') return Object.assign({}, SETTINGS_DEFAULTS);
      var stored = GM_getValue('fab-cn-settings', null);
      if (stored) {
        var parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        return Object.assign({}, SETTINGS_DEFAULTS, parsed);
      }
    } catch (_) { /* GM storage unavailable */ }
    return Object.assign({}, SETTINGS_DEFAULTS);
  }

  function saveSettings(settings) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue('fab-cn-settings', JSON.stringify(settings));
      }
    } catch (_) { /* best-effort */ }
  }

  // Convert a stored "R, G, B" tuple to a #rrggbb hex used by the color picker.
  function rgbToHex(rgb) {
    var parts = String(rgb || '').match(/\d+/g) || ['10', '20', '28'];
    var hex = '#';
    for (var i = 0; i < 3; i++) {
      var n = parseInt(parts[i] || 0, 10);
      hex += ('0' + n.toString(16)).slice(-2);
    }
    return hex;
  }

  // --- Data-base-url resolution -------------------------------------------

  function isLocalDataUrl(url) {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(String(url));
  }

  // Opt-in resolution debugging: set localStorage 'fab-cn-debug' to '1' to log
  // each hover's image URL / alt hints, candidate keys and final match.
  function isDebugEnabled() {
    try {
      return root.localStorage && root.localStorage.getItem('fab-cn-debug') === '1';
    } catch (_) {
      return false;
    }
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

  // An image found by scanning an ancestor's descendants is only accepted as
  // the hovered card when the pointer is actually over it. Without this, a
  // pointer resting on whitespace inside a large card-holding container (a card
  // grid gap, a game-board header, the space between hands) resolves to the
  // first card image in that container and keeps the tooltip stuck on a card
  // the user is not hovering. A few px of slack lets a pointer sitting on a
  // card's thin border / edge still count as hovering it.
  function imageUnderPointer(image, clientX, clientY) {
    if (clientX == null || clientY == null) return true; // no coords — structural match only
    let rect = null;
    try {
      if (typeof image.getBoundingClientRect === 'function') rect = image.getBoundingClientRect();
    } catch (_) { /* layout unavailable */ }
    if (!rect) return false;
    const tolerance = Math.max(8, Math.round((rect.width || 0) * 0.06));
    return clientX >= rect.left - tolerance && clientX <= rect.right + tolerance &&
           clientY >= rect.top - tolerance && clientY <= rect.bottom + tolerance;
  }

  function findProbeTarget(target, doc, clientX, clientY) {
    let current = target;
    let depth = 0;

    while (current && depth <= 6 && current !== doc.body) {
      const directCandidate = collectCandidates(current);
      if (hasCandidateSignals(directCandidate)) return current;

      if (typeof current.querySelector === 'function') {
        const image = current.querySelector('img');
        if (image && hasCandidateSignals(collectCandidates(image)) &&
            imageUnderPointer(image, clientX, clientY)) {
          return image;
        }
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
    // printing-variant markers ("MPW010-T"), and a card-square type marker for
    // equip-able cards ("arcbane_grasp_blue_equip"). None are part of a card
    // name, so strip them iteratively until the stem stabilises.
    var strips = [
      /_(red|yellow|blue)$/i,
      /_cropped$/i,
      /_crop$/i,
      /_equip$/i,
    ];
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
  // The image identifies the card the pointer is over, so it wins ("point at
  // a card, see that card"). On Talishar a transformed card (e.g. Adaptive
  // Alpha Mold) overlays its original with the transformed art: hovering the
  // overlay resolves to the transformed card via its image, hovering the
  // underlying original resolves to the original via its own image.
  // Priority:
  //   1. Image-stem aliases (FaBrary printing ids + Talishar transliterated
  //      stems / slug stems), cross-checked against alt/title text
  //   2. alt/title card-name text -> slug (secondary; resolves when the image
  //      has a variant or printing-id form the alias table cannot cover)
  //   3. image filename tokens (Talishar slug-style names), last resort
  function resolveCardKeys(candidate, aliases) {
    const keys = [];
    const push = (key) => {
      if (key && !keys.includes(key)) keys.push(key);
    };

    const altSlug = candidate.textHints
      .map(slugifyCardName)
      .find((slug) => slug && slug.length > 1);

    // 1. Image-stem aliases. Ambiguous ids keep an array of candidates; the
    // alt name picks the right one. Also, Talishar names pitched / variant /
    // card-square images with suffixes ("ice_quake_red", "MPW010-T",
    // "arcbane_grasp_blue_equip"), so the normalized base is a candidate too.
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
    let keywordsPromise = null;
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

    // The keyword explanation library (English keyword -> {name_zh, desc_zh}).
    // Small enough to preload once at install; cached like the other data files.
    function loadKeywords() {
      if (!keywordsPromise) {
        keywordsPromise = getJson('keywords.json').catch(function () { return null; });
      }
      return keywordsPromise;
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

      if (isDebugEnabled()) {
        console.log('[Talishar CN][debug] hover:',
          'img=', candidate.imageUrls,
          'alt/title=', candidate.textHints,
          'data=', candidate.attributes);
      }

      // Fast pass: image tokens + alt text (covers most Talishar cards).
      var fastKeys = resolveCardKeys(candidate, null);
      var match = await findInIndex(fastKeys);
      if (match) {
        if (isDebugEnabled()) console.log('[Talishar CN][debug] fast keys:', fastKeys, '-> match:', match.key, match.card && match.card.name_zh);
        return match;
      }

      // Fallback pass: fetch the alias table once and retry. This resolves
      // FaBrary printing ids and Talishar transliterated stems (special chars,
      // meld cards, ...) that the fast path cannot.
      var aliases = await loadAliases();
      var aliasKeys = resolveCardKeys(candidate, aliases);
      match = await findInIndex(aliasKeys);
      if (isDebugEnabled()) {
        console.log('[Talishar CN][debug] alias keys:', aliasKeys, '-> match:', match ? match.key : null, match && match.card && match.card.name_zh);
      }
      return match;
    }

    return {
      loadIndex: loadIndex,
      loadCardForElement: loadCardForElement,
      loadKeywords: loadKeywords,
      isLocal: isLocal,
    };
  }

  // --- UI helpers ---------------------------------------------------------

  function findCardAnchor(target, doc, clientX, clientY) {
    const detected = findProbeTarget(target, doc, clientX, clientY);
    if (!detected) return null;
    let anchor = detected;
    if (String(detected.tagName || '').toLowerCase() !== 'img' &&
        typeof detected.querySelector === 'function') {
      const image = detected.querySelector('img');
      if (image) anchor = image;
    }
    // Whatever element the pointer probe settled on, the card image it maps to
    // must actually be under the pointer. Without this last check, a signal
    // carried by an ancestor — a card-list wrapper or row with its own title /
    // data-* attributes — turns any empty space inside it into "the first card
    // of the list", keeping the tooltip stuck on that card while the mouse sits
    // on whitespace.
    if (!imageUnderPointer(anchor, clientX, clientY)) return null;
    return anchor;
  }

  // Talishar renders its full-card hover preview through a React portal: a
  // position:fixed container (z-index 10002) whose image child is roughly half
  // the viewport height. Production class names are Vite-hashed, so the
  // preview is identified by size + fixed positioning rather than by class.
  // The tooltip anchors to this image so it sits beside the full card, not the
  // small hovered thumbnail.
  function findCardPreviewImage(doc, browserRoot) {
    if (!doc || !doc.body || typeof doc.body.querySelectorAll !== 'function') return null;
    if (!browserRoot || typeof browserRoot.getComputedStyle !== 'function') return null;
    let images;
    try {
      images = doc.body.querySelectorAll('img');
    } catch (_) {
      return null;
    }
    const viewportHeight = Number(browserRoot.innerHeight) || 768;
    const minHeight = viewportHeight * 0.22;
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (typeof img.getBoundingClientRect !== 'function') continue;
      let rect;
      try {
        rect = img.getBoundingClientRect();
      } catch (_) {
        continue;
      }
      if (!rect || rect.height < minHeight) continue;
      let ancestor = img.parentElement;
      while (ancestor && ancestor !== doc.body) {
        let style;
        try {
          style = browserRoot.getComputedStyle(ancestor);
        } catch (_) {
          style = null;
        }
        if (style && style.position === 'fixed') return img;
        ancestor = ancestor.parentElement;
      }
    }
    return null;
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

  // Prefix each non-empty line with a "· " marker so the card text / ability
  // line breaks are visually obvious in the tooltip. Blank lines (paragraph
  // breaks) stay blank.
  function prefixLines(text) {
    return String(text || '').split('\n').map(function (line) {
      return line.trim() === '' ? line : '· ' + line;
    }).join('\n');
  }

  function renderCardPanel(doc, panel, card, keywordsData) {
    clearPanel(panel);
    const name = doc.createElement('div');
    name.className = 'fab-cn-card-name';
    name.textContent = card.name_zh || card.name_en || '';
    name.style.color = 'var(--fab-cn-name-color)';
    name.style.fontSize = 'var(--fab-cn-name-size)';
    name.style.fontWeight = '700';

    const type = doc.createElement('div');
    type.className = 'fab-cn-card-type';
    type.textContent = card.type_zh || card.type_en || '';
    type.style.color = 'var(--fab-cn-type-color)';
    type.style.fontSize = 'var(--fab-cn-type-size)';
    type.style.fontStyle = 'italic';
    type.style.fontWeight = '300';
    type.style.textDecoration = 'underline';
    type.style.marginTop = '2px';

    const text = doc.createElement('div');
    text.className = 'fab-cn-card-text';
    text.textContent = prefixLines(card.text_zh);
    text.style.fontSize = 'var(--fab-cn-text-size)';
    text.style.fontWeight = '400';
    text.style.lineHeight = '1.5';
    text.style.marginTop = '6px';
    text.style.whiteSpace = 'pre-wrap';

    panel.appendChild(name);
    panel.appendChild(type);
    panel.appendChild(text);

    // Keyword explanations follow the card text, one line per keyword, styled
    // with their own color/size. No interaction — the text is shown directly.
    if (keywordsData && Array.isArray(card.keywords) && card.keywords.length) {
      const resolved = [];
      for (const keyword of card.keywords) {
        const entry = lookupKeywordEntry(keyword, keywordsData);
        if (entry) resolved.push(entry);
      }
      if (resolved.length) {
        const block = doc.createElement('div');
        block.className = 'fab-cn-card-keywords';
        block.style.color = 'var(--fab-cn-keyword-color)';
        block.style.fontSize = 'var(--fab-cn-keyword-size)';
        block.style.lineHeight = '1.5';
        block.style.marginTop = '6px';
        const label = doc.createElement('div');
        label.textContent = '关键词';
        label.style.fontWeight = '600';
        label.style.marginBottom = '1px';
        block.appendChild(label);
        for (const entry of resolved) {
          const line = doc.createElement('div');
          line.textContent = '· ' + entry.name_zh + '：' + entry.desc_zh;
          block.appendChild(line);
        }
        panel.appendChild(block);
      }
    }
  }

  // Resolve a card keyword (e.g. "Arcane Barrier 1") against the keyword
  // library (lowercased base keys). Numbered magnitudes fall back to the base.
  function lookupKeywordEntry(keyword, keywordsData) {
    if (!keywordsData) return null;
    const key = String(keyword).toLowerCase();
    return keywordsData[key] || keywordsData[key.replace(/ \d+$| x$/, '')] || null;
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

    var settings = loadSettings();

    // --- CSS variable style tag --------------------------------------------

    var styleTag = doc.createElement('style');
    styleTag.id = 'fab-cn-probe-styles';
    styleTag.textContent = '';
    (doc.head || doc.documentElement || doc.body).appendChild(styleTag);

    function applyStyleVariables(vars) {
      // Define the variables on :root so both the tooltip panel and the
      // settings-dialog preview box can resolve them.
      styleTag.textContent =
        ':root {' +
        '--fab-cn-bg-color:' + (vars.bgColor || '16, 20, 28') + ';' +
        '--fab-cn-bg-opacity:' + (vars.bgOpacity != null ? vars.bgOpacity : 0.94) + ';' +
        '--fab-cn-border-color:' + (vars.borderColor || '255, 255, 255') + ';' +
        '--fab-cn-border-opacity:' + (vars.borderOpacity != null ? vars.borderOpacity : 0.35) + ';' +
        '--fab-cn-text-color:' + (vars.textColor || '#f4f7fb') + ';' +
        '--fab-cn-name-color:' + (vars.nameColor || '#ffad42') + ';' +
        '--fab-cn-name-size:' + (vars.nameSize || 15) + 'px;' +
        '--fab-cn-type-color:' + (vars.typeColor || '#f4f7fb') + ';' +
        '--fab-cn-type-size:' + (vars.typeSize || 12) + 'px;' +
        '--fab-cn-text-size:' + (vars.textSize || 13) + 'px;' +
        '--fab-cn-keyword-color:' + (vars.keywordColor || '#8be9fd') + ';' +
        '--fab-cn-keyword-size:' + (vars.keywordSize || 11) + 'px;' +
        '}';
    }
    applyStyleVariables(settings);

    // --- Data loading -------------------------------------------------------

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
    var currentCard = null;
    var currentCardKey = null;
    // Debug-only resolution trace, shown at the bottom of the tooltip panel
    // when debug mode is on (menu item 调试模式).
    var debugState = {
      anchorUrls: [], anchorHints: [], anchorKey: null,
      anchorTag: '', anchorClass: '', anchorData: {},
      previewUrl: null, previewKey: null,
      previewStatus: 'searching', // 'searching' | 'none' | 'found'
    };
    var keywordsData = null;
    // Preload the tiny keyword library once; a very first hover that happens
    // before it arrives gets re-rendered as soon as it loads.
    if (remoteLoader) {
      remoteLoader.loadKeywords().then(function (kw) {
        keywordsData = kw;
        if (currentCard && panel && panel.style.display !== 'none') {
          presentCard(currentAnchor, currentCard);
        }
      });
    }

    // Talishar's full-card preview (React portal) is the positioning target.
    // It appears a beat after the pointerover, so we poll for it briefly.
    var currentPreviewImg = null;
    var previewSearchTimer = null;
    var previewResolveDone = false;

    // --- Panel creation -----------------------------------------------------

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
      'border:1px solid rgba(var(--fab-cn-border-color),var(--fab-cn-border-opacity))',
      'border-radius:6px',
      'background:rgba(var(--fab-cn-bg-color),var(--fab-cn-bg-opacity))',
      'color:var(--fab-cn-text-color)',
      'box-shadow:0 4px 18px rgba(0,0,0,.35)',
      'pointer-events:none',
      'font:13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    doc.body.appendChild(panel);

    // --- Drag handle (fixed mode) -------------------------------------------

    var dragHandle = doc.createElement('div');
    dragHandle.className = 'fab-cn-drag-handle';
    dragHandle.title = '按住拖动可移动窗格';
    dragHandle.textContent = '⠿ ⠿ ⠿';
    dragHandle.style.cssText = [
      'display:none',
      'height:20px',
      'cursor:grab',
      'margin:-9px -11px 6px -11px',
      'border-radius:6px 6px 0 0',
      'background:rgba(255,255,255,0.06)',
      'color:rgba(255,255,255,0.45)',
      'text-align:center',
      'font-size:11px',
      'line-height:20px',
      'letter-spacing:4px',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');
    dragHandle.addEventListener('mouseenter', function () {
      dragHandle.style.background = 'rgba(255,255,255,0.14)';
      dragHandle.style.color = 'rgba(255,255,255,0.8)';
    });
    dragHandle.addEventListener('mouseleave', function () {
      dragHandle.style.background = 'rgba(255,255,255,0.06)';
      dragHandle.style.color = 'rgba(255,255,255,0.45)';
    });
    panel.insertBefore(dragHandle, panel.firstChild);

    // --- Drag state ---------------------------------------------------------

    var dragState = null;

    function onDragMouseDown(e) {
      if (settings.panelMode !== 'fixed') return;
      // Only the header bar (the visible drag area) starts a drag.
      if (e.target !== dragHandle) return;
      if (e.button !== 0) return;
      e.preventDefault();
      dragHandle.style.cursor = 'grabbing';
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: panel.offsetLeft,
        startTop: panel.offsetTop,
      };
      doc.addEventListener('mousemove', onDragMouseMove);
      doc.addEventListener('mouseup', onDragMouseUp);
    }

    function onDragMouseMove(e) {
      if (!dragState) return;
      panel.style.left = (dragState.startLeft + e.clientX - dragState.startX) + 'px';
      panel.style.top = (dragState.startTop + e.clientY - dragState.startY) + 'px';
    }

    function onDragMouseUp() {
      if (!dragState) return;
      doc.removeEventListener('mousemove', onDragMouseMove);
      doc.removeEventListener('mouseup', onDragMouseUp);
      dragState = null;
      dragHandle.style.cursor = 'grab';
      settings.panelPosition = {
        left: parseInt(panel.style.left, 10) || 0,
        top: parseInt(panel.style.top, 10) || 0,
      };
      saveSettings(settings);
    }

    panel.addEventListener('mousedown', onDragMouseDown);

    // --- Viewport helpers ---------------------------------------------------

    var getViewport = function () {
      return {
        width: Number(root.innerWidth) || 1024,
        height: Number(root.innerHeight) || 768,
      };
    };

    // --- Positioning --------------------------------------------------------

    // Prefer Talishar's full-card preview image as the anchor; fall back to the
    // hovered thumbnail while the preview has not appeared yet.
    function ensurePreviewAnchor() {
      if (currentPreviewImg) {
        var stillAttached = typeof doc.body.contains === 'function'
          ? doc.body.contains(currentPreviewImg)
          : true;
        if (stillAttached) return currentPreviewImg;
        currentPreviewImg = null;
      }
      currentPreviewImg = findCardPreviewImage(doc, root);
      return currentPreviewImg;
    }

    function schedulePreviewSearch() {
      if (previewSearchTimer) {
        if (typeof clearTimeout === 'function') clearTimeout(previewSearchTimer);
        previewSearchTimer = null;
      }
      if (typeof setTimeout !== 'function') return;
      previewSearchTimer = setTimeout(function () {
        previewSearchTimer = null;
        if (!currentAnchor) return;
        // Use a preview already located by ensurePreviewAnchor (during a
        // reposition) so resolveCardFromPreview still fires exactly once.
        var img = currentPreviewImg || findCardPreviewImage(doc, root);
        if (img) {
          var firstResolve = !previewResolveDone;
          currentPreviewImg = img;
          previewResolveDone = true;
          if (isDebugEnabled()) {
            debugState.previewStatus = 'found';
            renderDebugPanel();
          }
          if (firstResolve) resolveCardFromPreview(img);
          repositionPanel();
        } else {
          if (isDebugEnabled()) {
            debugState.previewStatus = 'searching';
            renderDebugPanel();
          }
          schedulePreviewSearch(); // preview not up yet — retry shortly
        }
      }, 300);
    }

    // The native full-card preview knows which card the pointer is actually
    // over. For a transform stack (e.g. Adaptive Alpha Mold covered by an Evo
    // card) the hovered thumbnail resolves to the base card while the preview
    // is the transformed card, so when the preview appears we re-resolve from
    // it and follow it — the tooltip shows the same card the native UI previews.
    function resolveCardFromPreview(img) {
      var serial = hoverSerial;
      if (isDebugEnabled()) {
        var pcand = collectCandidates(img);
        debugState.previewUrl = pcand.imageUrls[0] || '';
      }
      var apply = function (match) {
        if (serial !== hoverSerial) return; // a new hover started meanwhile
        if (isDebugEnabled()) debugState.previewKey = match ? match.key : null;
        if (!match || !currentAnchor) return;
        if (currentCardKey && match.key === currentCardKey) return; // same card — keep it
        presentCard(currentAnchor, match.card, match.key);
      };
      if (cardData) {
        apply(lookupCard(img, cardData));
        return;
      }
      if (remoteLoader) {
        remoteLoader.loadCardForElement(img).then(apply).catch(function () { /* keep anchor card */ });
      }
    }

    // Renders (or live-updates) the debug trace section at the bottom of the
    // tooltip panel, so resolution diagnostics are visible without DevTools.
    function renderDebugPanel() {
      if (!isDebugEnabled()) return;
      var dbg = (typeof panel.querySelector === 'function')
        ? panel.querySelector('.fab-cn-debug')
        : null;
      if (!dbg) {
        dbg = doc.createElement('div');
        dbg.className = 'fab-cn-debug';
        dbg.style.cssText = [
          'margin-top:6px;padding-top:4px;',
          'border-top:1px dashed rgba(255,255,255,.25);',
          'font-size:10px;line-height:1.4;',
          'color:rgba(255,255,255,.6);white-space:pre-wrap;',
        ].join('');
        panel.appendChild(dbg);
      }
      var dataKeys = Object.keys(debugState.anchorData || {});
      dbg.textContent = [
        '元素: ' + (debugState.anchorTag || '(无)') + (debugState.anchorClass ? ' .' + debugState.anchorClass : ''),
        '图: ' + (debugState.anchorUrls.join(', ') || '(无)'),
        'alt: ' + (debugState.anchorHints.join(', ') || '(无)'),
        'data: ' + (dataKeys.length
          ? dataKeys.map(function (k) { return k + '=' + debugState.anchorData[k].join(','); }).join('; ')
          : '(无)'),
        '命中: ' + (debugState.anchorKey || '(无)'),
        '预览: ' + (debugState.previewStatus === 'found'
          ? (debugState.previewUrl || '(有图)') + ' → ' + (debugState.previewKey || '(未解析)')
          : debugState.previewStatus),
      ].join('\n');
    }

    function clearPreviewAnchor() {
      if (previewSearchTimer) {
        if (typeof clearTimeout === 'function') clearTimeout(previewSearchTimer);
        previewSearchTimer = null;
      }
      currentPreviewImg = null;
    }

    var repositionPanel = function () {
      if (settings.panelMode === 'fixed') return; // Fixed mode: don't reposition
      if (!currentAnchor || panel.style.display === 'none') return;
      var anchorEl = ensurePreviewAnchor() || currentAnchor;
      if (typeof anchorEl.getBoundingClientRect !== 'function') return;
      var anchorRect = anchorEl.getBoundingClientRect();
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

    // --- rAF following ------------------------------------------------------

    // requestAnimationFrame keeps the panel glued to the card during layout
    // changes and animations. Fall back to a ~16ms timer where rAF is missing.
    var followRafId = null;

    function scheduleFollowingTick(fn) {
      if (typeof root.requestAnimationFrame === 'function') {
        return root.requestAnimationFrame(fn);
      }
      if (typeof setTimeout === 'function') {
        return setTimeout(fn, 16);
      }
      return null; // no scheduler available — rely on scroll/resize repositioning
    }

    function cancelFollowingTick(id) {
      if (id == null) return;
      if (typeof root.cancelAnimationFrame === 'function') {
        root.cancelAnimationFrame(id);
      } else {
        clearTimeout(id);
      }
    }

    function startFollowing() {
      stopFollowing();
      function tick() {
        if (settings.panelMode === 'fixed' || !currentAnchor || panel.style.display === 'none') {
          stopFollowing();
          return;
        }
        repositionPanel();
        followRafId = scheduleFollowingTick(tick);
      }
      followRafId = scheduleFollowingTick(tick);
    }

    function stopFollowing() {
      if (followRafId) {
        cancelFollowingTick(followRafId);
        followRafId = null;
      }
    }

    // --- Panel show / hide --------------------------------------------------

    var showLoading = function (anchor) {
      currentAnchor = anchor;
      panel.textContent = '中文卡库加载中…';
      // Re-insert drag handle after textContent clears children
      if (settings.panelMode === 'fixed') {
        panel.insertBefore(dragHandle, panel.firstChild);
      }
      panel.style.display = 'block';
      panel.style.visibility = 'hidden';
      repositionPanel();
      panel.style.visibility = 'visible';
      if (settings.panelMode === 'follow') startFollowing();
    };

    var presentCard = function (anchor, card, key) {
      currentAnchor = anchor;
      currentCard = card;
      currentCardKey = key || (card && card.id) || null;
      panel.style.display = 'block';
      panel.style.visibility = 'hidden';
      renderCardPanel(doc, panel, card, keywordsData);
      renderDebugPanel();
      if (settings.panelMode === 'fixed') {
        panel.insertBefore(dragHandle, panel.firstChild);
      }
      repositionPanel();
      panel.style.visibility = 'visible';
      if (settings.panelMode === 'follow') startFollowing();
    };

    var showCard = function (anchor, card, key) { presentCard(anchor, card, key); };

    var hidePanel = function () {
      currentAnchor = null;
      stopFollowing();
      clearPreviewAnchor();
      if (settings.panelMode === 'fixed') return; // pinned panel stays visible
      panel.style.display = 'none';
      panel.style.visibility = 'hidden';
    };

    // --- Mode management ----------------------------------------------------

    function updatePanelMode(mode) {
      settings.panelMode = mode;
      if (mode === 'fixed') {
        panel.style.pointerEvents = 'auto';
        dragHandle.style.display = 'block';
        stopFollowing();
        if (settings.panelPosition) {
          panel.style.left = settings.panelPosition.left + 'px';
          panel.style.top = settings.panelPosition.top + 'px';
        } else {
          var rect = panel.getBoundingClientRect();
          var pinnedLeft = rect.left;
          var pinnedTop = rect.top;
          // A hidden panel reports 0,0 — pin at a sensible default instead
          if (!pinnedLeft && !pinnedTop && panel.style.display === 'none') {
            var viewport = getViewport();
            pinnedLeft = Math.round(viewport.width * 0.7);
            pinnedTop = Math.round(viewport.height * 0.12);
          }
          settings.panelPosition = { left: pinnedLeft, top: pinnedTop };
        }
        panel.style.left = settings.panelPosition.left + 'px';
        panel.style.top = settings.panelPosition.top + 'px';
        panel.style.display = 'block';
        panel.style.visibility = 'visible';
      } else {
        panel.style.pointerEvents = 'none';
        dragHandle.style.display = 'none';
        settings.panelPosition = null;
        // Re-attach to current card if hovering
        if (!currentAnchor) {
          hidePanel();
        }
      }
      saveSettings(settings);
    }

    var modeFeedbackTimer = null;

    function showModeToast(text) {
      if (modeFeedbackTimer) {
        if (typeof clearTimeout === 'function') clearTimeout(modeFeedbackTimer);
        modeFeedbackTimer = null;
      }
      panel.textContent = text;
      if (settings.panelMode === 'fixed') {
        panel.insertBefore(dragHandle, panel.firstChild);
      }
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      if (typeof setTimeout === 'function') {
        modeFeedbackTimer = setTimeout(function () {
          modeFeedbackTimer = null;
          if (settings.panelMode === 'fixed') return; // keep pinned panel visible
          hidePanel();
        }, 1600);
      }
    }

    function togglePanelMode() {
      var newMode = settings.panelMode === 'follow' ? 'fixed' : 'follow';
      updatePanelMode(newMode);
      refreshPanelModeMenu();
      if (newMode === 'fixed') {
        showModeToast('浮窗已固定 — 拖住顶部抓手可移动');
      } else {
        showModeToast('已切换为跟随卡牌模式');
      }
    }

    // Visible debug toggle (menu item). When on, every hover logs its image
    // URL / alt / candidate keys / matched card to the browser console, so a
    // mis-resolved card can be diagnosed from the page directly.
    function toggleDebugMode() {
      var on = isDebugEnabled();
      try {
        if (on) root.localStorage.removeItem('fab-cn-debug');
        else root.localStorage.setItem('fab-cn-debug', '1');
      } catch (_) { /* localStorage unavailable */ }
      refreshDebugMenu();
      showModeToast(on ? '调试模式已关闭' : '调试模式已开启 — 悬停卡牌，按 F12 查看控制台');
    }

    // Initialize mode from saved settings
    if (settings.panelMode === 'fixed' && settings.panelPosition) {
      panel.style.left = settings.panelPosition.left + 'px';
      panel.style.top = settings.panelPosition.top + 'px';
      panel.style.pointerEvents = 'auto';
      dragHandle.style.display = 'block';
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      if (!cardData && remoteLoader) {
        panel.textContent = '已固定 — 悬停卡牌查看中文';
        panel.insertBefore(dragHandle, panel.firstChild);
      }
    }

    // --- Settings dialog ----------------------------------------------------

    var settingsOverlay = null;

    function closeSettingsDialog() {
      if (settingsOverlay) {
        if (settingsOverlay._keydownHandler) {
          doc.removeEventListener('keydown', settingsOverlay._keydownHandler);
        }
        settingsOverlay.remove();
        settingsOverlay = null;
      }
    }

    function openSettingsDialog() {
      closeSettingsDialog();

      var savedSettings = loadSettings();

      settingsOverlay = doc.createElement('div');
      settingsOverlay.id = 'fab-cn-settings-overlay';
      settingsOverlay.style.cssText = [
        'position:fixed;inset:0;z-index:2147483646;',
        'background:rgba(0,0,0,.5);',
        'display:flex;align-items:center;justify-content:center;',
      ].join('');

      var dialog = doc.createElement('div');
      dialog.id = 'fab-cn-settings-dialog';
      dialog.style.cssText = [
        'background:#1a1d24;color:#e0e0e0;',
        'border:1px solid rgba(255,255,255,.2);border-radius:10px;',
        'padding:12px 14px;width:330px;max-width:calc(100vw - 20px);',
        'max-height:90vh;overflow-y:auto;',
        'font:13px/1.4 system-ui,sans-serif;',
        'box-shadow:0 8px 32px rgba(0,0,0,.5);',
      ].join('');

      // Stop clicks inside dialog from closing it
      dialog.addEventListener('click', function (e) { e.stopPropagation(); });

      // --- Live preview box (mirrors the tooltip using the same CSS vars) ---

      var previewLabel = doc.createElement('div');
      previewLabel.textContent = '效果预览';
      previewLabel.style.cssText = 'font-size:11px;font-weight:600;color:#888;margin-bottom:4px;';
      dialog.appendChild(previewLabel);

      var preview = doc.createElement('div');
      preview.id = 'fab-cn-settings-preview';
      preview.style.cssText = [
        'margin-bottom:10px;padding:8px 10px;border-radius:6px;',
        'border:1px solid rgba(var(--fab-cn-border-color),var(--fab-cn-border-opacity));',
        'background:rgba(var(--fab-cn-bg-color),var(--fab-cn-bg-opacity));',
        'color:var(--fab-cn-text-color);',
      ].join('');

      var previewName = doc.createElement('div');
      previewName.textContent = '泰坦之拳';
      previewName.style.cssText = [
        'color:var(--fab-cn-name-color);',
        'font-size:var(--fab-cn-name-size);',
        'font-weight:700;',
      ].join('');
      var previewType = doc.createElement('div');
      previewType.textContent = '守护者武器·锤（单手）';
      previewType.style.cssText = [
        'color:var(--fab-cn-type-color);',
        'font-size:var(--fab-cn-type-size);',
        'font-style:italic;font-weight:300;text-decoration:underline;',
        'margin-top:2px;',
      ].join('');
      var previewText = doc.createElement('div');
      previewText.textContent = '· 每回合一次行动：攻击。\n· 再动';
      previewText.style.cssText = [
        'color:var(--fab-cn-text-color);',
        'font-size:var(--fab-cn-text-size);',
        'line-height:1.5;margin-top:4px;white-space:pre-wrap;',
      ].join('');
      var previewKeyword = doc.createElement('div');
      previewKeyword.textContent = '关键词\n· 再动：获得 1 点行动点。';
      previewKeyword.style.cssText = [
        'color:var(--fab-cn-keyword-color);',
        'font-size:var(--fab-cn-keyword-size);',
        'line-height:1.5;margin-top:4px;white-space:pre-wrap;',
      ].join('');

      preview.appendChild(previewName);
      preview.appendChild(previewType);
      preview.appendChild(previewText);
      preview.appendChild(previewKeyword);
      dialog.appendChild(preview);

      // --- Compact field helpers ---

      function makeRow(label) {
        var row = doc.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;';
        var lbl = doc.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'flex:0 0 auto;font-size:12px;';
        row.appendChild(lbl);
        return row;
      }

      // A color swatch with a transparent native color input layered over it.
      // The user actually clicks the native input, so the browser always opens
      // its color picker; the visible swatch mirrors the picked color.
      function makeColorSwatch(value, onChange) {
        var wrap = doc.createElement('span');
        wrap.style.cssText = 'position:relative;display:inline-block;width:22px;height:22px;flex:0 0 auto;';
        var swatch = doc.createElement('span');
        swatch.style.cssText = 'position:absolute;inset:0;border-radius:4px;background-color:' + value + ';border:1px solid rgba(255,255,255,.35);pointer-events:none;';
        var input = doc.createElement('input');
        input.type = 'color';
        input.value = value;
        input.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none;padding:0;';
        input.addEventListener('input', function () {
          swatch.style.backgroundColor = input.value;
          onChange(input.value);
        });
        wrap.appendChild(swatch);
        wrap.appendChild(input);
        return { wrap: wrap, input: input, swatch: swatch };
      }

      function makeRange(value, onChange) {
        var wrap = doc.createElement('span');
        wrap.style.cssText = 'display:flex;align-items:center;gap:5px;';
        var input = doc.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '1';
        input.step = '0.05';
        input.value = String(value);
        input.style.width = '84px';
        var val = doc.createElement('span');
        val.textContent = String(value);
        val.style.cssText = 'font-size:11px;min-width:28px;text-align:right;';
        input.addEventListener('input', function () {
          val.textContent = String(parseFloat(input.value).toFixed(2));
          onChange(parseFloat(input.value));
        });
        wrap.appendChild(input);
        wrap.appendChild(val);
        return { wrap: wrap, input: input };
      }

      function makeNumber(value, onChange) {
        var wrap = doc.createElement('span');
        wrap.style.cssText = 'display:flex;align-items:center;gap:3px;';
        var input = doc.createElement('input');
        input.type = 'number';
        input.min = '8';
        input.max = '30';
        input.value = String(value);
        input.style.cssText = 'width:50px;background:#2a2d35;color:#e0e0e0;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:2px 5px;font-size:12px;';
        input.addEventListener('input', function () {
          var v = parseInt(input.value, 10);
          if (!isNaN(v)) onChange(Math.min(30, Math.max(8, v)));
        });
        var px = doc.createElement('span');
        px.textContent = 'px';
        px.style.cssText = 'font-size:11px;color:#888;';
        wrap.appendChild(input);
        wrap.appendChild(px);
        return { wrap: wrap, input: input };
      }

      function sectionTitle(text) {
        var t = doc.createElement('div');
        t.textContent = text;
        t.style.cssText = 'font-size:11px;font-weight:600;color:#888;margin:6px 0 4px;';
        return t;
      }

      // --- Background / border ---

      dialog.appendChild(sectionTitle('底色与边框'));

      var bgRow = makeRow('底色');
      var bgColorField = makeColorSwatch(rgbToHex(savedSettings.bgColor), function () { previewChanges(); });
      var bgOpacityField = makeRange(savedSettings.bgOpacity, function () { previewChanges(); });
      bgRow.appendChild(bgColorField.wrap);
      bgRow.appendChild(bgOpacityField.wrap);

      var borderRow = makeRow('边框');
      var borderColorField = makeColorSwatch(rgbToHex(savedSettings.borderColor), function () { previewChanges(); });
      var borderOpacityField = makeRange(savedSettings.borderOpacity, function () { previewChanges(); });
      borderRow.appendChild(borderColorField.wrap);
      borderRow.appendChild(borderOpacityField.wrap);

      dialog.appendChild(bgRow);
      dialog.appendChild(borderRow);

      // --- Fonts (each: color swatch + size, cap 30px) ---

      dialog.appendChild(sectionTitle('字体'));

      function makeFontRow(label, colorValue, sizeValue) {
        var row = makeRow(label);
        var colorField = makeColorSwatch(colorValue, function () { previewChanges(); });
        var sizeField = makeNumber(sizeValue, function () { previewChanges(); });
        row.appendChild(colorField.wrap);
        row.appendChild(sizeField.wrap);
        return { row: row, colorField: colorField, sizeField: sizeField };
      }

      var nameFont = makeFontRow('卡名', savedSettings.nameColor, savedSettings.nameSize);
      var typeFont = makeFontRow('类别', savedSettings.typeColor, savedSettings.typeSize);
      var textFont = makeFontRow('正文', savedSettings.textColor, savedSettings.textSize);
      var keywordFont = makeFontRow('关键词', savedSettings.keywordColor, savedSettings.keywordSize);

      dialog.appendChild(nameFont.row);
      dialog.appendChild(typeFont.row);
      dialog.appendChild(textFont.row);
      dialog.appendChild(keywordFont.row);

      // --- Read current field values into a settings object ---

      function readFieldValues() {
        var out = {};
        var bgHex = bgColorField.input.value.replace('#', '');
        out.bgColor = [
          parseInt(bgHex.substring(0, 2), 16),
          parseInt(bgHex.substring(2, 4), 16),
          parseInt(bgHex.substring(4, 6), 16),
        ].join(', ');
        var bdHex = borderColorField.input.value.replace('#', '');
        out.borderColor = [
          parseInt(bdHex.substring(0, 2), 16),
          parseInt(bdHex.substring(2, 4), 16),
          parseInt(bdHex.substring(4, 6), 16),
        ].join(', ');
        out.bgOpacity = parseFloat(bgOpacityField.input.value);
        out.borderOpacity = parseFloat(borderOpacityField.input.value);
        out.nameColor = nameFont.colorField.input.value;
        out.nameSize = parseInt(nameFont.sizeField.input.value, 10);
        out.typeColor = typeFont.colorField.input.value;
        out.typeSize = parseInt(typeFont.sizeField.input.value, 10);
        out.textColor = textFont.colorField.input.value;
        out.textSize = parseInt(textFont.sizeField.input.value, 10);
        out.keywordColor = keywordFont.colorField.input.value;
        out.keywordSize = parseInt(keywordFont.sizeField.input.value, 10);
        return out;
      }

      // Live preview: any change re-applies the CSS variables so the tooltip
      // (and the preview box above, which reads the same vars) updates at once.
      function previewChanges() {
        applyStyleVariables(readFieldValues());
      }

      // --- Buttons ---

      var buttonRow = doc.createElement('div');
      buttonRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-top:8px;';

      function makeButton(text, primary) {
        var btn = doc.createElement('button');
        btn.textContent = text;
        btn.style.cssText = [
          'padding:5px 12px;border-radius:5px;border:1px solid rgba(255,255,255,.15);',
          'cursor:pointer;font-size:12px;',
          primary
            ? 'background:#ffad42;color:#111;border-color:#ffad42;font-weight:600;'
            : 'background:transparent;color:#ccc;',
        ].join('');
        return btn;
      }

      var resetBtn = makeButton('恢复默认', false);
      var cancelBtn = makeButton('取消', false);
      var saveBtn = makeButton('保存', true);

      buttonRow.appendChild(resetBtn);
      buttonRow.appendChild(cancelBtn);
      buttonRow.appendChild(saveBtn);
      dialog.appendChild(buttonRow);

      resetBtn.addEventListener('click', function () {
        settings = Object.assign({}, SETTINGS_DEFAULTS);
        saveSettings(settings);
        applyStyleVariables(SETTINGS_DEFAULTS);
        closeSettingsDialog();
        openSettingsDialog(); // Re-open with defaults
      });

      cancelBtn.addEventListener('click', function () {
        applyStyleVariables(settings); // Restore saved
        closeSettingsDialog();
      });

      saveBtn.addEventListener('click', function () {
        var newVals = readFieldValues();
        // Preserve non-style fields
        newVals.panelMode = settings.panelMode;
        newVals.panelPosition = settings.panelPosition;
        settings = newVals;
        saveSettings(settings);
        applyStyleVariables(settings);
        closeSettingsDialog();
      });

      // Close on backdrop click
      settingsOverlay.addEventListener('click', function (e) {
        if (e.target === settingsOverlay) {
          applyStyleVariables(settings); // Restore saved
          closeSettingsDialog();
        }
      });

      // Close on Escape (listener removed when the overlay is closed)
      function onKeyDown(e) {
        if (e.key === 'Escape') {
          applyStyleVariables(settings);
          closeSettingsDialog();
        }
      }
      settingsOverlay._keydownHandler = onKeyDown;
      doc.addEventListener('keydown', onKeyDown);

      settingsOverlay.appendChild(dialog);
      doc.body.appendChild(settingsOverlay);
    }

    // --- Register menu commands (toggle-style, in-place label update) --------
    //
    // Tampermonkey ≥5.0.6189 and Violentmonkey ≥2.16.0 update an existing menu
    // item in place when GM_registerMenuCommand is called again with the same
    // `id`. Stable string ids let each toggle re-render its own row (☑/☐)
    // without creating duplicates; the style item keeps a gear glyph.

    var menuCommandIds = {
      pin: 'fab-cn-menu-pin',
      debug: 'fab-cn-menu-debug',
      style: 'fab-cn-menu-style',
    };

    function registerMenuCommand(label, handler, id, autoClose) {
      if (typeof GM_registerMenuCommand !== 'function') return;
      try {
        GM_registerMenuCommand(label, handler, {
          id: id,
          autoClose: autoClose !== false,
        });
      } catch (_) { /* GM menu not available */ }
    }

    function refreshPanelModeMenu() {
      var on = settings.panelMode === 'fixed';
      registerMenuCommand((on ? '☑ ' : '☐ ') + '固定模式', togglePanelMode, menuCommandIds.pin, false);
    }

    function refreshDebugMenu() {
      var on = isDebugEnabled();
      registerMenuCommand((on ? '☑ ' : '☐ ') + '调试模式', toggleDebugMode, menuCommandIds.debug, false);
    }

    function registerGmMenu() {
      try {
        refreshPanelModeMenu();
        refreshDebugMenu();
        registerMenuCommand('⚙ 设置样式…', openSettingsDialog, menuCommandIds.style);
      } catch (_) { /* GM menu not available */ }
    }

    registerGmMenu();

    // --- Event listeners ----------------------------------------------------

    var onPointerOver = function (event) {
      var anchor = findCardAnchor(event && event.target, doc,
        event ? event.clientX : null, event ? event.clientY : null);
      if (!anchor) {
        // Follow mode: hide. Fixed mode: keep the pinned panel as-is.
        if (settings.panelMode !== 'fixed') hidePanel();
        return;
      }
      var serial = ++hoverSerial;
      // A new hover targets a (possibly new) full-card preview — drop any
      // cached reference so we re-locate it.
      currentPreviewImg = null;
      previewResolveDone = false;
      if (isDebugEnabled()) {
        var hoverCand = collectCandidates(anchor);
        debugState.anchorUrls = hoverCand.imageUrls;
        debugState.anchorHints = hoverCand.textHints;
        debugState.anchorTag = String(anchor && anchor.tagName || '').toLowerCase();
        debugState.anchorClass = String(anchor && anchor.className || '');
        debugState.anchorData = hoverCand.attributes;
        debugState.anchorKey = null;
        debugState.previewUrl = null;
        debugState.previewKey = null;
        debugState.previewStatus = 'searching';
      }
      if (cardData) {
        var match = lookupCard(anchor, cardData);
        if (match) {
          showCard(anchor, match.card, match.key);
          schedulePreviewSearch();
        } else if (settings.panelMode !== 'fixed') hidePanel();
        return;
      }
      if (!remoteLoader) {
        if (settings.panelMode !== 'fixed') hidePanel();
        return;
      }

      showLoading(anchor);
      schedulePreviewSearch();
      remoteLoader.loadCardForElement(anchor)
        .then(function (match) {
          if (serial !== hoverSerial) return;
          if (isDebugEnabled()) debugState.anchorKey = match ? match.key : null;
          if (match) showCard(anchor, match.card, match.key);
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
        clearPreviewAnchor();
        closeSettingsDialog();
        doc.removeEventListener('mousemove', onDragMouseMove);
        doc.removeEventListener('mouseup', onDragMouseUp);
        if (typeof panel.remove === 'function') {
          panel.remove();
        } else if (typeof doc.body.removeChild === 'function') {
          doc.body.removeChild(panel);
        }
        if (styleTag && typeof styleTag.remove === 'function') {
          styleTag.remove();
        }
      },
    };
  }

  // --- Public API ---------------------------------------------------------

  var api = {
    calculatePanelPosition: calculatePanelPosition,
    collectCandidates: collectCandidates,
    createCardDataLoader: createCardDataLoader,
    SETTINGS_DEFAULTS: SETTINGS_DEFAULTS,
    loadSettings: loadSettings,
    rgbToHex: rgbToHex,
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
    findCardPreviewImage: findCardPreviewImage,
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
