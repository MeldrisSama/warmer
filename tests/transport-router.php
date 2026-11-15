<?php

declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/transport/(plain|secure)/(index|api)\.php$#', $path, $match)) {
    $_SERVER['REMOTE_ADDR'] = '203.0.113.10';
    $_SERVER['HTTPS'] = $match[1] === 'secure' ? 'on' : 'off';
    $query = parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY);
    $_SERVER['REQUEST_URI'] = '/warmer/'.$match[2].'.php'.($query === null ? '' : '?'.$query);
    require $_SERVER['DOCUMENT_ROOT'].'/'.$match[2].'.php';
    return true;
}

return require $_SERVER['DOCUMENT_ROOT'].'/router.php';
