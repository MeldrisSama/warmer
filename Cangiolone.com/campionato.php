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
  <meta name="theme-color" content="#151513">
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
      <a href="index.php#classifica" class="back">← Classifica generale</a>
    </nav>
  </header>
  <main class="wrap" id="campionato" tabindex="-1">
    <section class="hero" data-enter>
      <div>
        <p class="eyebrow">Warhammer 40.000</p>
        <h1>Campionato<span>.</span></h1>
        <p id="season-caption">Calendario, classifica e risultati.</p>
        <div id="season-actions"><p>Caricamento del campionato…</p></div>
      </div>
      <aside id="season-board" class="season-board" aria-label="Panoramica del campionato" hidden></aside>
    </section>
    <p id="league-notice" role="status" aria-live="polite" hidden></p>
    <div class="grid league-grid" id="league-content" hidden>
      <section id="giornate" aria-labelledby="round-heading">
        <div class="section-head">
          <h2 id="round-heading">Calendario</h2>
          <div class="round-pick">
            <label for="round-picker">Giornata</label>
            <select id="round-picker"></select>
          </div>
        </div>
        <div id="round"></div>
      </section>
      <section id="classifica" aria-labelledby="standings-heading">
        <div class="section-head"><h2 id="standings-heading">Classifica</h2></div>
        <div id="league-standings"></div>
      </section>
    </div>
  </main>
</body>
</html>
