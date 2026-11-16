<?php
declare(strict_types=1);
require __DIR__.'/https.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
header('Cache-Control: no-store');
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
  <link rel="stylesheet" href="campionato.css">
  <script defer src="standings.js"></script>
  <script defer src="campionato.js"></script>
</head>
<body>
  <a class="skip" href="#campionato">Salta al campionato</a>
  <header class="nav masthead">
    <nav class="wrap masthead-inner" aria-label="Navigazione del campionato">
      <a href="index.php" class="wordmark">Cronache del settore</a>
      <a href="index.php#classifica" class="back"><span aria-hidden="true">←</span> Classifica generale</a>
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
        <button type="button" role="tab" id="tab-classifica" aria-controls="classifica" aria-selected="true">Classifica</button>
        <button type="button" role="tab" id="tab-giornate" aria-controls="giornate" aria-selected="false" tabindex="-1">Giornate</button>
      </div>
      <section id="giornate" aria-labelledby="round-heading">
        <div class="section-head">
          <h2 id="round-heading">Calendario</h2>
          <div class="round-pick">
            <label for="round-picker">Giornata</label>
            <select id="round-picker"></select>
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
