# TCGplayer FAB Content Support Design

## Goal

Show the existing Simplified Chinese card tooltip when a reader hovers a
Flesh and Blood card embed in a TCGplayer content article.

## Scope

- Match `https://www.tcgplayer.com/content/*` so Tampermonkey can load on
  TCGplayer articles.
- Install the lightweight probe listener on every matched TCGplayer content
  URL, then test for the `/content/flesh-and-blood` breadcrumb at hover time.
  TCGplayer mounts article bodies after `document-idle`, so checking only at
  installation time would permanently miss valid FAB articles.
- Recognize only TCGplayer's explicit card-bearing markup:
  - inline `span.card-hover-link[data-embed="card-hover"]` with a `name`
    attribute;
  - a card row inside `.martech-deck-embed .list__item`, identified through
    its `a[data-testid="BaseTransition__base-link"]` card link; and
  - a showcase `img.is-card.card-image` nested in
    `[data-testid="CardShowcaseCard__base-link"]`.
- Parse optional `(Red)`, `(Yellow)`, and `(Blue)` suffixes into pitches `1`,
  `2`, and `3`; resolve the remaining English name with the existing slug
  lookup and translation data loader.
- Retain pitch on the candidate object for deterministic routing, while using
  the existing grouped published card record for the current tooltip display.
- Keep the normal `fetch` and Cache Storage data path. If a site's CSP blocks
  the GitHub data request, fall back to the explicitly granted
  `GM_xmlhttpRequest` API for `raw.githubusercontent.com`; GM responses are
  used without Cache Storage because they are not Fetch Response objects.

## Non-goals

- Do not add support for arbitrary TCGplayer product, pricing, search, article
  cards, deck titles, authors, or non-FAB content pages.
- Do not alter `data/source`, `data/translations`, or `dist/data`.
- Do not publish, push, merge, or otherwise release this local implementation.

## Safety and compatibility

The parser will not infer cards from ordinary article text, arbitrary `name`
attributes, or CSS classes alone. Each supported surface requires its complete
site-owned structure: inline card-hover marker, deck-row card-link test id, or
showcase-card link test id plus an image's card class. The runtime FAB
breadcrumb guard prevents the tooltip from appearing across unrelated
TCGplayer game categories. The userscript metadata grants its fallback request
only to the production GitHub data host.

## Verification

- Unit-test exact parsing and grouped slug resolution for
  `Scar for a Scar (Red)`.
- Unit-test rejection of an otherwise similar element without TCGplayer's
  `data-embed="card-hover"` marker.
- Unit-test deck-row name resolution and showcase-image pitch normalization.
- Unit-test the TCGplayer FAB runtime guard and metadata match.
- Unit-test the document-idle mount race and a blocked page fetch with a
  userscript-request fallback, including the Cache Storage path.
- Run the full project test command and inspect the final diff.
