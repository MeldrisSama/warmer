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
if($path==='/campionato.php') {
    require __DIR__.'/campionato.php';
    return true;
}
if(in_array($path,['/app.js','/style.css','/standings.js','/campionato.css','/campionato.js','/builder.css','/builder.js'],true)) return false;

http_response_code(404);
return true;
