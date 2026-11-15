<?php

declare(strict_types=1);

$https = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
$localServer = PHP_SAPI === 'cli-server' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);

if (!$https && !$localServer) {
    header('Cache-Control: no-store');
    if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        if (!str_starts_with($uri, '/') || preg_match('/[\r\n]/', $uri)) $uri = '/';
        header('Location: https://cangiolone.com'.$uri, true, 308);
    } else {
        http_response_code(426);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error'=>'Usa HTTPS per accedere al sito.']);
    }
    exit;
}

if ($https) header('Strict-Transport-Security: max-age=31536000');

return $https;
