<?php
declare(strict_types=1);

function assetUrl(string $file): string {
    return $file.'?v='.hash_file('sha256', __DIR__.'/'.$file);
}
