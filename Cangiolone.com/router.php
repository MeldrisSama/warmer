<?php

declare(strict_types=1);

// PHP's development server does not read the IIS access rules.
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH));
if($path==='/' || $path==='/index.php') {
    require __DIR__.'/index.php';
    return true;
}
if($path==='/api.php') {
    require __DIR__.'/api.php';
    return true;
}
if($path==='/mail-worker.php') {
    require __DIR__.'/mail-worker.php';
    return true;
}
if($path==='/campionato.php') {
    require __DIR__.'/campionato.php';
    return true;
}
if(in_array($path,['/app.js','/style.css','/standings.js','/campionato.css','/campionato.js','/builder.css','/builder.js','/builder-workbench.js','/builder-engine.js','/theme.js','/theme.css'],true)) return false;
if(in_array($path,['/league-reveal.js','/speedfreaks.js','/assets/reveal/warp.mp4','/assets/reveal/bolter.mp4','/assets/reveal/orks.mp4','/assets/reveal/orks.json'],true)) return false;
if(preg_match('~^/assets/factions/[a-z_]+\.svg$~D',$path)&&is_file(__DIR__.$path))return false;

http_response_code(404);
return true;
