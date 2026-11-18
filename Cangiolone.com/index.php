<?php
declare(strict_types=1);
$https = require __DIR__.'/https.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
header('Cache-Control: no-store');
?><!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#111714"><title>Cronache del settore · Warhammer 40k</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="builder.css"><script defer src="standings.js"></script><script defer src="builder.js"></script><script defer src="builder-workbench.js"></script><script defer src="app.js"></script></head>
<body><div class="shell"><a class="skip-link" href="#main">Vai al contenuto</a><header><div><a class="brand" href="#classifica">Cronache del settore</a><p class="tagline">Le nostre battaglie nel XLI millennio</p></div><div id="account">Per amici.<br>Per il 41° millennio.</div></header><nav aria-label="Navigazione principale" id="nav" hidden></nav><aside id="email-banner" class="email-banner" aria-label="Verifica email" hidden></aside><main id="main" tabindex="-1"><p class="empty">Apertura del settore…</p></main><div id="notice" role="status" aria-live="polite" hidden></div><footer><span>Cronache del settore</span><small>Un piccolo settore. Grandi storie.</small></footer></div></body></html>