<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'||$argc!==4)exit(2);
require __DIR__.'/../../Cangiolone.com/storage.php';
require __DIR__.'/../../Cangiolone.com/builder-model.php';
$database=$argv[1];$source=$argv[2];$testRoot=$argv[3];
if(!str_ends_with(str_replace('\\','/',$database),'/mdb-database/warhammer-pwa-test/pwa.sqlite')||file_exists($database))throw new RuntimeException('Destinazione database non valida o già presente.');
$storage=new SectorStorage(['driver'=>'sqlite','path'=>$database]);
$pdo=$storage->builderConnection();builderSchema($pdo,'sqlite');
$raw=json_decode(file_get_contents($source),true,40,JSON_THROW_ON_ERROR);
builderHandle($pdo,'builderImport',['id'=>'test_seed','admin'=>true],['catalog'=>$raw]);
unset($storage,$pdo,$raw);
// Load the test-only configuration without touching the repository configuration.
$config=require $testRoot.'/config.php';
if($config['database']['driver']!=='sqlite'||realpath($config['database']['path'])!==realpath($database))throw new RuntimeException('Il pacchetto non usa il database isolato.');
echo "Database SQLite isolato, catalogo importato, nessun account copiato.\n";
