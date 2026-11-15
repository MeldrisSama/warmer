<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
$https = require __DIR__.'/https.php';
session_name('sector_session');
session_set_cookie_params(['lifetime'=>0, 'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\').'/', 'secure'=>$https, 'httponly'=>true, 'samesite'=>'Strict']);
ini_set('session.use_strict_mode','1');
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
date_default_timezone_set('Europe/Rome');
function fail(string $message, int $status=422): never { http_response_code($status); echo json_encode(['error'=>$message],JSON_UNESCAPED_UNICODE); exit; }
function field(array $input,string $key,int $max=100,bool $required=true): string {
    $v=$input[$key]??'';
    if(!is_string($v)) fail('Campo non valido: '.$key);
    $v=trim($v);
    if(($required && $v==='') || strlen($v)>$max || !preg_match('//u',$v)) fail('Controlla il campo '.$key.'.');
    return $v;
}
function ident(): string { return bin2hex(random_bytes(12)); }
function saveMatchPhoto(?string $photo, string $matchId): ?string {
    if($photo===null || $photo==='') {
        return null;
    }

    if(!preg_match(
        '#^data:image/(jpeg|png|webp);base64,(.+)$#s',
        $photo,
        $matches
    )) {
        fail('Formato della foto non valido.');
    }

    $data=base64_decode($matches[2],true);

    if($data===false) {
        fail('Foto non valida.');
    }

    if(strlen($data)>5*1024*1024) {
        fail('La foto non può superare 5 MB.',413);
    }

    $info=@getimagesizefromstring($data);

    if($info===false) {
        fail('Il file caricato non è un’immagine valida.');
    }

    $allowed=[
        IMAGETYPE_JPEG=>'jpg',
        IMAGETYPE_PNG=>'png',
        IMAGETYPE_WEBP=>'webp'
    ];

    if(!isset($allowed[$info[2]])) {
        fail('Sono consentite solo immagini JPG, PNG o WebP.');
    }

    $extension=$allowed[$info[2]];

    $directory=__DIR__.'/uploads/matches';

    if(!is_dir($directory)) {
        if(!mkdir($directory,0755,true) && !is_dir($directory)) {
            throw new RuntimeException('Impossibile creare la cartella immagini');
        }
    }

    $filename=$matchId.'.'.$extension;

    $path=$directory.'/'.$filename;

    if(file_put_contents($path,$data,LOCK_EX)===false) {
        throw new RuntimeException('Impossibile salvare la foto');
    }

    return 'uploads/matches/'.$filename;
}
function publicUser(array $u): array { return array_intersect_key($u,array_flip(['id','name','username','admin'])); }
$config=require __DIR__.'/config.php';
require __DIR__.'/storage.php';
try { $storage=new SectorStorage($config['database']); $db=$storage->load(); }
catch(Throwable $e) { error_log('Warhammer database connection failed'); fail('Database non disponibile. Contatta l’amministratore.',503); }
function save(): void { global $storage,$db; $storage->save($db); }
function result(array $payload): never { echo json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); exit; }
$action=$_GET['action']??'state';
if(!is_string($action)) fail('Richiesta non valida.');
$me=null;
foreach($db['users'] as $u) if($u['id']===($_SESSION['uid']??null)) $me=$u;
if($me && time()-($_SESSION['seen']??0)>43200) { unset($_SESSION['uid']); $me=null; }
if($me) $_SESSION['seen']=time();
if($action==='state') {
    if(!$me) result(['user'=>null,'setup'=>count($db['users'])===0,'csrf'=>$_SESSION['csrf']]);
    result(['user'=>publicUser($me),'csrf'=>$_SESSION['csrf'],'users'=>array_map('publicUser',$db['users']),'matches'=>$db['matches'],'lists'=>array_map(fn($l)=>array_diff_key($l,['text'=>1]),$db['lists'])]);
}
if($action==='download') {
    if(!$me) fail('Accedi per scaricare la lista.',401);
    foreach($db['lists'] as $l) if($l['id']===($_GET['id']??'')) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="lista-'.$l['id'].'.txt"');
        echo $l['text']; exit;
    }
    fail('Lista non trovata.',404);
}
if($_SERVER['REQUEST_METHOD']!=='POST') fail('Metodo non consentito.',405);
if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('Sessione scaduta: ricarica la pagina.',403);
if((int)($_SERVER['CONTENT_LENGTH']??0)>8000000) {
    fail('Richiesta troppo grande.',413);
}
try { $in=json_decode(file_get_contents('php://input'),true,32,JSON_THROW_ON_ERROR); } catch(Throwable $e) { fail('Richiesta non valida.'); }
if(!is_array($in)) fail('Richiesta non valida.');
try {
    if(in_array($action,['login','setup','register'],true)) {
        $ip=hash('sha256',($_SERVER['REMOTE_ADDR']??'unknown').$config['setup_hash']);
        $now=time();
        $db['attempts']=array_filter($db['attempts'],fn($a)=>$a['until']>$now);
        $attempt=$db['attempts'][$ip]??['count'=>0,'until'=>$now+900];
        if($attempt['count']>=10) fail('Troppi tentativi. Riprova tra 15 minuti.',429);
        $attempt['count']++; $db['attempts'][$ip]=$attempt; save();
        $username=strtolower(field($in,'username',32));
        $password=$in['password']??'';
        if(!preg_match('/^[a-z0-9._-]{3,32}$/D',$username) || !is_string($password) || strlen($password)>72) fail('Nome utente: 3–32 lettere, numeri, punti, trattini.');
        if($action==='login') {
            $user=null; foreach($db['users'] as $u) if($u['username']===$username) $user=$u;
            if(!$user || !password_verify($password,$user['password'])) fail('Nome utente o password errati.',401);
        } else {
            if(strlen($password)<12) fail('Scegli una password di almeno 12 caratteri (massimo 72 byte).');
            $name=field($in,'name',60);
            foreach($db['users'] as $u) if($u['username']===$username || strtolower($u['name'])===strtolower($name)) fail('Nome giocatore o nome utente già utilizzato.');
            if($action==='setup') {
                if(count($db['users'])!==0 || !hash_equals($config['setup_hash'],hash('sha256',field($in,'code',128)))) fail('Codice iniziale non valido o configurazione già completata.',403);
            } else {
                $hash=hash('sha256',field($in,'code',128)); $inviteIndex=null;
                foreach($db['invites'] as $i=>$invite) if(hash_equals($invite['hash'],$hash) && $invite['expires']>$now && !$invite['used']) $inviteIndex=$i;
                if($inviteIndex===null || !count($db['users'])) fail('Invito non valido, scaduto o già utilizzato.',403);
                $db['invites'][$inviteIndex]['used']=true;
            }
            $user=['id'=>ident(),'username'=>$username,'name'=>$name,'password'=>password_hash($password,PASSWORD_DEFAULT),'admin'=>$action==='setup'];
            $db['users'][]=$user;
        }
        unset($db['attempts'][$ip]); save();
        session_regenerate_id(true); $_SESSION['uid']=$user['id']; $_SESSION['seen']=time(); $_SESSION['csrf']=bin2hex(random_bytes(32));
        result(['ok'=>true]);
    }
    if(!$me) fail('Accedi per continuare.',401);
    if($action==='logout') { $_SESSION=[]; session_destroy(); result(['ok'=>true]); }
    if($action==='invite') {
        if(!$me['admin']) fail('Solo l’amministratore può invitare giocatori.',403);
        $code=bin2hex(random_bytes(20));
        $db['invites']=array_values(array_filter($db['invites'],fn($i)=>!$i['used'] && $i['expires']>time()));
        $db['invites'][]=['hash'=>hash('sha256',$code),'expires'=>time()+604800,'used'=>false]; save(); result(['code'=>$code]);
    }
    if($action==='match') {
        $a=field($in,'a',30); $b=field($in,'b',30);
        $ids=array_column($db['users'],'id');
        if($a===$b || !in_array($a,$ids,true) || !in_array($b,$ids,true)) fail('Scegli due giocatori diversi.');
        if(!$me['admin'] && $me['id']!==$a && $me['id']!==$b) fail('Puoi registrare solo le partite a cui hai partecipato.',403);
        foreach(['scoreA','scoreB'] as $k) if(!isset($in[$k]) || !is_int($in[$k]) || $in[$k]<0 || $in[$k]>100) fail('I punti vittoria devono essere interi tra 0 e 100.');
        $date=field($in,'date',10); $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
        if(!$dt || $dt->format('Y-m-d')!==$date || $date>date('Y-m-d') || $date<'2000-01-01') fail('Inserisci una data valida, non futura.');
        $request=field($in,'request',64);
        foreach($db['matches'] as $m) if($m['request']===$request && $m['by']===$me['id']) result(['ok'=>true]);
        $matchId=ident();

        $photo=saveMatchPhoto(
        isset($in['photo']) && is_string($in['photo'])
            ? $in['photo']
            : null,
        $matchId
        );

        $db['matches'][]=[
        'id'=>$matchId,
        'a'=>$a,
        'b'=>$b,
        'scoreA'=>$in['scoreA'],
        'scoreB'=>$in['scoreB'],
        'date'=>$date,
        'mission'=>field($in,'mission',120,false),
        'photo'=>$photo,
        'by'=>$me['id'],
        'void'=>false,
        'created'=>date(DATE_ATOM),
        'request'=>$request
        ];

        save();

        result(['ok'=>true]);
    }
    if($action==='void') {
        $id=field($in,'id',30);
        foreach($db['matches'] as &$m) if($m['id']===$id) {
            if(!$me['admin'] && $m['by']!==$me['id']) fail('Solo l’autore o l’amministratore può annullare questa partita.',403);
            if(!isset($in['void']) || !is_bool($in['void'])) fail('Stato non valido.');
            $m['void']=$in['void']; $m['updatedBy']=$me['id']; $m['updated']=date(DATE_ATOM); save(); result(['ok'=>true]);
        }
        fail('Partita non trovata.',404);
    }
    if($action==='list') {
        $name=field($in,'name',100); $faction=field($in,'faction',80);
        $filename=field($in,'filename',200);
        if(strtolower(pathinfo($filename,PATHINFO_EXTENSION))!=='txt') fail('Carica un file con estensione .txt.');
        $text=$in['text']??null;
        if(!is_string($text) || trim($text)==='' || strlen($text)>1048576 || !preg_match('//u',$text) || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/',$text)) fail('Il file deve contenere testo UTF-8, massimo 1 MB.');
        if(count(array_filter($db['lists'],fn($l)=>$l['owner']===$me['id']))>=100) fail('Hai raggiunto il limite di 100 liste.');
        $db['lists'][]=['id'=>ident(),'owner'=>$me['id'],'name'=>$name,'faction'=>$faction,'text'=>$text,'date'=>date('Y-m-d'),'size'=>strlen($text)];
        save(); result(['ok'=>true]);
    }
    fail('Azione non trovata.',404);
} catch(Throwable $e) { error_log('Warhammer archive operation failed: '.$e->getMessage()); fail('Salvataggio non riuscito. Riprova; se il problema continua contatta l’amministratore.',503); }