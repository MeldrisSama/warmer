<?php
declare(strict_types=1);
ini_set('display_errors','0');
// Test deployment only. The setup code authorizes installing this exact seed once.
require __DIR__.'/https.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$config=require __DIR__.'/config.php';
$token=$_SERVER['HTTP_X_PWA_SETUP']??'';
if(!is_string($token)||!hash_equals($config['setup_hash'],hash('sha256',$token))){http_response_code(404);echo '{"error":"Non trovato"}';exit;}
$database=$config['database'];
$path=$database['path'];
$seed=dirname($path).'/seed.sqlite.gz';
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    $lock=null;$input=null;$output=null;$temporary=null;$installError=null;
    try{
        if(($database['driver']??null)!=='sqlite'||basename($path)!=='pwa.sqlite'||basename(dirname($path))!=='warhammer-pwa-test')throw new RuntimeException('Percorso del database di prova non valido.');
        if(!extension_loaded('pdo_sqlite')||!function_exists('gzopen'))throw new RuntimeException('Servono PDO_SQLITE e zlib sul PHP del server.');
        $lock=fopen($path.'.install-lock','c');
        if($lock===false||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('Installazione in corso: riprova tra poco.');
        // Never replace even an empty/invalid existing database. It must be reviewed explicitly.
        clearstatcache(true,$path);
        if(!is_file($path)){
            if(!is_file($seed))throw new RuntimeException('Seed compresso non ancora caricato.');
            $temporary=$path.'.seed-'.bin2hex(random_bytes(8)).'.tmp';
            $input=gzopen($seed,'rb');$output=fopen($temporary,'xb');
            if($input===false||$output===false)throw new RuntimeException('Impossibile aprire il seed o creare il database temporaneo.');
            $size=0;$hash=hash_init('sha256');$expectedSize=(int)'__SEED_SIZE__';
            while(!gzeof($input)){
                $chunk=gzread($input,1048576);
                if($chunk===false||($chunk===''&&!gzeof($input)))throw new RuntimeException('Seed compresso incompleto.');
                $size+=strlen($chunk);
                if($size>$expectedSize)throw new RuntimeException('Dimensione seed non valida.');
                hash_update($hash,$chunk);
                if(fwrite($output,$chunk)!==strlen($chunk))throw new RuntimeException('Scrittura del seed interrotta.');
            }
            gzclose($input);$input=null;fclose($output);$output=null;
            if($size!==$expectedSize||!hash_equals('__SEED_SHA256__',hash_final($hash)))throw new RuntimeException('Seed non integro: hash o dimensione diversi. Ripeti il caricamento del pacchetto.');
            $pdo=new PDO('sqlite:'.$temporary);$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
            if((int)$pdo->query('SELECT COUNT(*) FROM w40k_users')->fetchColumn()!==0||(int)$pdo->query('SELECT COUNT(*) FROM w40k_builder_active')->fetchColumn()<1)throw new RuntimeException('Il seed non e il database di prova iniziale.');
            $pdo=null;
            clearstatcache(true,$path);
            if(file_exists($path)||!rename($temporary,$path))throw new RuntimeException('Database esistente o installazione non completata. Nessun database e stato sostituito.');
            $temporary=null;
        }
    }catch(Throwable $e){$installError=$e->getMessage();}
    finally{
        if(is_resource($input))gzclose($input);
        if(is_resource($output))fclose($output);
        if($temporary!==null&&is_file($temporary))unlink($temporary);
        if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}
    }
    if($installError!==null){http_response_code(409);echo json_encode(['error'=>$installError],JSON_THROW_ON_ERROR);exit;}
}
clearstatcache(true,$path);
$status=['php_supported'=>PHP_VERSION_ID>=80100,'sqlite_available'=>extension_loaded('pdo_sqlite'),'gzip_available'=>function_exists('gzopen'),'directory_writable'=>is_writable(dirname($path)),'seed_present'=>is_file($seed),'database_present'=>is_file($path),'database_writable'=>is_file($path)&&is_writable($path),'database_readable'=>false,'catalog_ready'=>false,'account_ready'=>false];
if($status['sqlite_available']&&$status['database_present']){
    try{
        $pdo=new PDO('sqlite:'.$path);$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
        $status['database_readable']=true;
        $status['catalog_ready']=(int)$pdo->query('SELECT COUNT(*) FROM w40k_builder_active')->fetchColumn()>0;
        $status['account_ready']=(int)$pdo->query('SELECT COUNT(*) FROM w40k_users')->fetchColumn()>0;
    }catch(Throwable $e){$status['database_readable']=false;}
}
echo json_encode($status,JSON_THROW_ON_ERROR);
