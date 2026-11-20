<?php
declare(strict_types=1);
require __DIR__.'/https.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
header('Cache-Control: no-store');
require_once __DIR__.'/assets.php';
?><!doctype html>
<html lang="it" data-type="software">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="page-type" content="software">
  <meta name="site-kind" content="software">
  <meta name="theme-color" content="#111714">
  <meta name="description" content="Classifica, calendario e risultati del campionato Warhammer 40.000 di Cronache del settore.">
  <meta property="og:title" content="Campionato Warhammer 40.000 · Cronache del settore">
  <meta property="og:description" content="Calendario, classifica e risultati del campionato.">
  <title>Campionato Warhammer 40.000 · Cronache del settore</title>
  <link rel="stylesheet" href="<?= assetUrl('campionato.css') ?>"><link rel="stylesheet" href="<?= assetUrl('theme.css') ?>"><script src="<?= assetUrl('theme.js') ?>"></script>
  <script defer src="<?= assetUrl('standings.js') ?>"></script>
  <script defer src="<?= assetUrl('speedfreaks.js') ?>"></script>
  <script defer src="<?= assetUrl('league-reveal.js') ?>"></script>
  <script defer src="<?= assetUrl('campionato.js') ?>"></script>
</head>
<body>
  <a class="skip" href="#campionato">Salta al campionato</a>
  <header class="nav masthead">
    <nav class="wrap masthead-inner" aria-label="Navigazione del campionato">
      <a href="index.php" class="wordmark">Cronache del settore</a>
      <a href="index.php#campionati" class="back"><span aria-hidden="true">←</span> <span data-theme-menu="Tutti i campionati">Tutti i campionati</span></a>
      <a href="index.php#profilo" class="league-profile-link" aria-label="Apri il tuo profilo" title="Profilo"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="11" r="5"/><path d="M5 28v-3c0-6 5-9 11-9s11 3 11 9v3"/></svg></a>
    </nav>
  </header>
  <main id="campionato" tabindex="-1">
    <section class="hero" id="panoramica" data-enter>
      <div class="wrap hero-layout">
        <div class="hero-title">
          <h1 id="season-title">Campionato Warhammer 40.000</h1>
          <p id="season-caption">Calendario, classifica e risultati.</p>
          <div id="season-actions"><p>Caricamento del campionato…</p></div>
        </div>
        <aside id="season-board" class="season-board" aria-label="Panoramica del campionato" hidden></aside>
      </div>
    </section>
    <p class="wrap" id="league-notice" role="status" aria-live="polite" hidden></p>
    <div class="wrap league-grid" id="league-content" hidden>
      <div class="league-tabs" id="league-tabs" role="tablist" aria-label="Campionato" hidden>
        <button type="button" role="tab" data-theme-menu="Classifica" id="tab-classifica" aria-controls="classifica" aria-selected="true">Classifica</button>
        <button type="button" role="tab" data-theme-menu="Giornate" id="tab-giornate" aria-controls="giornate" aria-selected="false" tabindex="-1">Giornate</button>
      </div>
      <section id="giornate" aria-labelledby="round-heading">
        <div class="section-head">
          <h2 id="round-heading">Calendario</h2>
          <div class="round-pick">
            <label for="round-picker">Giornata</label>
            <select id="round-picker"></select>
            <button type="button" class="secondary" id="reveal-round">Rivela abbinamenti</button>
          </div>
        </div>
        <div id="round" class="round-scroll" tabindex="0" role="region" aria-label="Elenco delle giornate"></div>
      </section>
      <section id="classifica" aria-labelledby="standings-heading">
        <div class="section-head"><h2 id="standings-heading">Classifica</h2></div>
        <div id="league-standings"></div>
      </section>
    </div>
  </main>
  <dialog id="league-reveal" aria-labelledby="reveal-title">
    <div class="reveal-head">
      <h2 id="reveal-title">Accoppiamenti del campionato</h2>
      <label>Animazione<select id="reveal-animation"><option value="warp">Warp</option><option value="bolter">Bolter</option><option value="orks">Orki · Speed Freeks</option></select></label>
      <button type="button" class="secondary" id="reveal-close">Salta al calendario</button>
    </div>
    <div class="reveal-stage" id="reveal-stage">
      <video id="reveal-video" muted playsinline preload="none" aria-hidden="true" data-warp="<?= assetUrl('assets/reveal/warp.mp4') ?>" data-bolter="<?= assetUrl('assets/reveal/bolter.mp4') ?>" data-orks="<?= assetUrl('assets/reveal/orks.mp4') ?>" data-orks-motion="<?= assetUrl('assets/reveal/orks.json') ?>"></video>
      <canvas id="reveal-engraving" width="640" height="360" aria-hidden="true" hidden></canvas>
      <div class="reveal-names" aria-hidden="true">
        <p id="reveal-day" hidden></p>
        <div class="reveal-pair"><strong id="reveal-first" hidden></strong><span id="reveal-versus" hidden></span><strong id="reveal-second" hidden></strong></div>
      </div>
    </div>
    <p id="reveal-announcement" class="reveal-announcement" role="status" aria-live="polite"></p>
    <div class="reveal-controls">
      <p id="reveal-progress"></p>
      <p id="reveal-bye"></p>
      <button type="button" class="secondary" id="reveal-pause">Pausa</button>
      <button type="button" class="secondary" id="reveal-now">Mostra subito</button>
      <button type="button" class="primary" id="reveal-next">Prossimo abbinamento</button>
    </div>
  </dialog>
  <dialog id="lineup-reader" aria-labelledby="lineup-title">
    <div class="reader-head">
      <h2 id="lineup-title">Lista esercito</h2>
      <button class="secondary" id="lineup-close" type="button">Chiudi</button>
    </div>
    <p id="lineup-status" role="status"></p>
    <pre id="lineup-text" tabindex="0" aria-label="Testo della lista" hidden></pre>
    <a class="jump" id="lineup-download" hidden>Scarica il .txt</a>
  </dialog>
</body>
</html>
