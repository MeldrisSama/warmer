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



    if(file_put_contents($path,$data,LOCK_EX)!==strlen($data)) {

        if(is_file($path) && !unlink($path)) error_log('Warhammer incomplete photo cleanup failed');
        throw new RuntimeException('Impossibile salvare la foto');

    }



    return 'uploads/matches/'.$filename;

}

function publicUser(array $u): array { return array_intersect_key($u,array_flip(['id','name','username','admin'])); }

function matchDetails(array $in): array {
    foreach(['scoreA','scoreB'] as $k) if(!isset($in[$k]) || !is_int($in[$k]) || $in[$k]<0 || $in[$k]>100) fail('I punti vittoria devono essere interi tra 0 e 100.');
    $date=field($in,'date',10); $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if(!$dt || $dt->format('Y-m-d')!==$date || $date>date('Y-m-d') || $date<'2000-01-01') fail('Inserisci una data valida, non futura.');
    return ['scoreA'=>$in['scoreA'],'scoreB'=>$in['scoreB'],'date'=>$date,'mission'=>field($in,'mission',120,false)];
}
function listText(array $in, bool $fileRequired=true): string {
    if($fileRequired || array_key_exists('filename',$in)) {
        $filename=field($in,'filename',200);
        if(strtolower(pathinfo($filename,PATHINFO_EXTENSION))!=='txt') fail('Carica un file con estensione .txt.');
    }
    $text=$in['text']??null;
    if(!is_string($text) || trim($text)==='' || strlen($text)>1048576 || !preg_match('//u',$text) || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/',$text)) fail('Il file deve contenere testo UTF-8, massimo 1 MB.');
    return $text;
}
$config=require __DIR__.'/config.php';

require __DIR__.'/storage.php';

require __DIR__.'/mail-model.php';
require __DIR__.'/league.php';
try { $mail=sectorMailConfig(); }
catch(Throwable $error) { error_log('Warhammer mail configuration invalid'); $mail=null; }
require __DIR__.'/builder-model.php';
$action=$_GET['action']??'state';
if(!is_string($action)) fail('Richiesta non valida.');
$leagueWrites=[...LEAGUE_LIFECYCLE_ACTIONS,'leagueOpen','leagueJoin','leagueStart','leagueAnnounce','leagueLineup','leaguePropose','leagueConfirm','leagueReject','leagueWithdraw','leaguePhoto'];
$leagueWrite=in_array($action,$leagueWrites,true);
try {
    $storage=new SectorStorage($config['database']);
    if(($leagueWrite || in_array($action,['void','login','setup','register','invite',...ACCOUNT_ACTIONS],true)) && $_SERVER['REQUEST_METHOD']==='POST') $storage->beginLeagueUpdate();
    $scope=($leagueWrite || $action==='league' || $action==='leagueDownload' || $action==='void') ? 'league' : ($action==='state' ? 'state' : 'archive');
    $db=$storage->load($scope);
    $db['mail_accounts']=array_column($db['mail_accounts'],null,'id');
}
catch(Throwable $e) { error_log('Warhammer database connection failed'); fail('Database non disponibile. Contatta l’amministratore.',503); }

$savedMailIds=[];
function save(): void {
    global $storage,$db,$savedMailIds;
    $storage->save($db);
    $savedMailIds=array_keys($db['mail_jobs']??[]);
}

function result(array $payload): never {
    global $storage,$mail,$action,$savedMailIds;
    $recovery=$action==='passwordForgot';
    if($recovery || $savedMailIds) session_write_close();
    if($recovery) {
        // Use the same response for known and unknown addresses before contacting SMTP.
        ignore_user_abort(true);
        $json=json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        header('Content-Length: '.strlen($json));
        echo $json;
        if(function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        else {
            if(ob_get_level()>0) ob_flush();
            flush();
        }
    }
    if($mail!==null && $savedMailIds) {
        try {
            $storage->releaseApplicationLock();
            require_once __DIR__.'/mail-delivery.php';
            $mailFailed=attemptSectorEmails($storage,$mail,$savedMailIds);
        } catch(Throwable $error) {
            error_log('Warmer immediate mail delivery unavailable');
            $mailFailed=true;
        }
        if($mailFailed && !$recovery) $payload['mailFailed']=true;
    }
    if(!$recovery) echo json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    exit;
}

$me=null;

foreach($db['users'] as $u) if($u['id']===($_SESSION['uid']??null)) $me=$u;

if($me && time()-($_SESSION['seen']??0)>43200) { unset($_SESSION['uid']); $me=null; }

if($me && (int)mailProfile($db,$me['id'])['version']!==($_SESSION['authVersion']??0)) {
    unset($_SESSION['uid']);
    $me=null;
}
if($me) $_SESSION['seen']=time();

if($action==='state') {

    if(!$me) result(['user'=>null,'setup'=>count($db['users'])===0,'csrf'=>$_SESSION['csrf'],'mailEnabled'=>$mail!==null]);

    $leagues=leagueSummaries($db,$me['id']);
    $locked=leagueMatchLocks($db);
    $matches=array_map(function(array $match) use($locked): array {
        if(isset($locked[$match['id']])) $match['leagueLocked']=true;
        if(!empty($match['photo'])) $match['photo']='api.php?action=photo&id='.rawurlencode($match['id']);
        return $match;
    },$db['matches']);

    $readableLists=leagueReadableLists($db);
    $profile=mailProfile($db,$me['id']);
    $needsEmail=$mail!==null && ($_SESSION['askEmail']??false) && $profile['email']===null && $profile['pending_email']===null;
    result(['mailEnabled'=>$mail!==null,'needsEmail'=>$needsEmail,'account'=>['email'=>$profile['email'],'pendingEmail'=>$profile['pending_email']],'user'=>publicUser($me),'csrf'=>$_SESSION['csrf'],'users'=>array_map('publicUser',$db['users']),'matches'=>$matches,'league'=>$leagues[0]??null,'leagues'=>$leagues,'readableLists'=>$readableLists,'lists'=>array_map(fn($l)=>array_diff_key($l,['text'=>1]),$db['lists'])]);
}
if($action==='league' || $action==='leagueDownload') {
    if(!$me) fail('Accedi per consultare il campionato.',401);
    if($_SERVER['REQUEST_METHOD']!=='GET') fail('Metodo non consentito.',405);
    if($action==='leagueDownload') leagueDownload($storage,$db,$me['id']);
    $id=$_GET['id']??null;
    if($id!==null && !is_string($id)) fail('Campionato non trovato.',404);
    result(leagueState($db,$me,$id,($_GET['new']??null)==='1')+['mailEnabled'=>$mail!==null]);
}

if($action==='photo') {
    if(!$me) fail('Accedi per vedere la foto.',401);
    $id=$_GET['id']??'';
    if(!is_string($id)) fail('Foto non trovata.',404);
    foreach($db['matches'] as $match) if($match['id']===$id) {
        $photo=$match['photo']??null;
        if(!is_string($photo) || !preg_match('#^uploads/matches/[a-f0-9]{24}\.(jpg|png|webp)$#D',$photo,$parts)) fail('Foto non trovata.',404);
        $file=@fopen(__DIR__.'/'.$photo,'rb');
        if($file===false) fail('Foto non trovata.',404);
        $types=['jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp'];
        header('Content-Type: '.$types[$parts[1]]);
        header('Content-Length: '.fstat($file)['size']);
        session_write_close();
        fpassthru($file);
        fclose($file);
        exit;
    }
    fail('Foto non trovata.',404);
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

if(in_array($action,['builderCatalog','builderArmies','builderDefaults','builderArmyText'],true)) {
    if($_SERVER['REQUEST_METHOD']!=='GET') fail('Metodo non consentito.',405);
    if(!$me) fail('Accedi per continuare.',401);
    try {
        builderSchema($storage->builderConnection(),$storage->builderDriver());
        result(builderHandle($storage->builderConnection(),$action,$me));
    } catch(BuilderInputError $e) { fail($e->getMessage()); }
    catch(Throwable $e) { error_log('Builder read failed: '.$e->getMessage()); fail('Catalogo non disponibile.',503); }
}
if($_SERVER['REQUEST_METHOD']!=='POST') fail('Metodo non consentito.',405);

if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('Sessione scaduta: ricarica la pagina.',403);

if((int)($_SERVER['CONTENT_LENGTH']??0)>($action==='builderImport'?32000000:8000000)) {

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

        $password=$in['password']??'';

        if($action==='login') {

            $identity=strtolower(field($in,'username',254));
            $user=null;
            foreach($db['users'] as $u) if($u['username']===$identity || mailProfile($db,$u['id'])['email']===$identity) $user=$u;
            // On IIS, a 401 here can trigger the browser's HTTP authentication prompt.
            if(!$user || !is_string($password) || strlen($password)>72 || str_contains($password,"\0")
                || !password_verify($password,$user['password'])) fail('Nome utente, email o password errati.');

        } else {

            $username=strtolower(field($in,'username',32));
            if(!preg_match('/^[a-z0-9._-]{3,32}$/D',$username)) fail('Nome utente: 3–32 lettere, numeri, punti, trattini.');
            $password=sectorPassword($in);

            $name=field($in,'name',60);

            // Keep the attempt on failure, then reload under the write lock before consuming an invite.
            $storage->beginLeagueUpdate();
            $db=$storage->load();
            $db['mail_accounts']=array_column($db['mail_accounts'],null,'id');
            foreach($db['users'] as $u) if($u['username']===$username || strtolower($u['name'])===strtolower($name)) fail('Nome giocatore o nome utente già utilizzato.');
            $email=null; $emailInvite=false;

            if($action==='setup') {

                if(count($db['users'])!==0 || !hash_equals($config['setup_hash'],hash('sha256',field($in,'code',128)))) fail('Codice iniziale non valido o configurazione già completata.',403);

            } else {

                $token=field($in,'inviteToken',295,false);
                $emailInvite=$token!=='';
                $hash=hash('sha256',$emailInvite?'email-invite:'.$token:field($in,'code',128));
                $inviteIndex=null;

                foreach($db['invites'] as $i=>$invite) if(hash_equals($invite['hash'],$hash) && $invite['expires']>$now && !$invite['used']) $inviteIndex=$i;

                if($inviteIndex===null || !count($db['users'])) fail('Invito non valido, scaduto o già utilizzato.',403);
                if($emailInvite) $email=sectorMailAddress(['email'=>explode('.',$token,2)[1]??'']);
                elseif($mail!==null) $email=sectorMailAddress($in);
                if($email!==null) checkSectorMailAvailable($db,$email);

                $db['invites'][$inviteIndex]['used']=true;

            }

            $user=['id'=>ident(),'username'=>$username,'name'=>$name,'password'=>password_hash($password,PASSWORD_DEFAULT),'admin'=>$action==='setup'];

            $db['users'][]=$user;
            if($emailInvite) $db['mail_accounts'][$user['id']]=array_replace(mailProfile($db,$user['id']),['email'=>$email]);
            elseif($email!==null) queueEmailVerification($db,$mail,$user['id'],$email);

        }

        unset($db['attempts'][$ip]); save();

        session_regenerate_id(true); $_SESSION['authVersion']=(int)mailProfile($db,$user['id'])['version']; $_SESSION['uid']=$user['id']; $_SESSION['seen']=time(); $_SESSION['csrf']=bin2hex(random_bytes(32));
        $_SESSION['askEmail']=$action==='login' && $mail!==null;

        result(['ok'=>true]);

    }

    if(in_array($action,ACCOUNT_ACTIONS,true)) {
        $version=updateSectorAccount($action,$in,$me,$db,$mail);
        save();
        if($version!==null) {
            session_regenerate_id(true);
            $_SESSION['authVersion']=$version;
        }
        result(['ok'=>true]);
    }
    if(!$me) fail('Accedi per continuare.',401);

    if(in_array($action,['builderImport','builderSave','builderDelete','builderDefaultSave','builderDefaultDelete'],true)) {
        try {
            builderSchema($storage->builderConnection(),$storage->builderDriver());
            result(builderHandle($storage->builderConnection(),$action,$me,$in));
        } catch(BuilderInputError $e) { fail($e->getMessage()); }
    }
    if($leagueWrite) {
        if($action==='leaguePhoto') {
            $fixture=$db['league_fixtures'][leagueFixture($db['league_fixtures'],field($in,'fixture',24),$me['id'])];
            $league=field($in,'league',24,false);
            if($league!=='' && $league!==$fixture['league_id']) fail('Incontro non trovato.',404);
            $index=array_search($fixture['match_id'],array_column($db['matches'],'id'),true);
            if($fixture['match_id']===null || $index===false || $db['matches'][$index]['void']) fail('Conferma il risultato della partita prima di aggiungere una foto.',409);
            if(!is_string($in['photo']??null) || $in['photo']==='') fail('Scegli una foto da caricare.');
            $previous=$db['matches'][$index]['photo'];
            // A new filename preserves the previous image if persistence fails.
            $photo=saveMatchPhoto($in['photo'],ident());
            $db['matches'][$index]['photo']=$photo;
            try { save(); }
            catch(Throwable $error) {
                if($photo!==null && !unlink(__DIR__.'/'.$photo)) error_log('Warhammer league photo cleanup failed');
                throw $error;
            }
            if(is_string($previous) && preg_match('#^uploads/matches/[a-f0-9]{24}\.(jpg|png|webp)$#D',$previous) && is_file(__DIR__.'/'.$previous)) {
                if(!unlink(__DIR__.'/'.$previous)) error_log('Warhammer previous league photo cleanup failed');
            }
            result(['ok'=>true]);
        }
        if ($action==='leagueLineup'&&!empty($in['builderArmyId'])) {
            if (!empty($in['filename'])||!is_string($in['text']??'')||trim($in['text']??'')!=='') fail('Scegli una sola fonte per la lista.');
            try {$in['text']=builderSavedArmyText($storage->builderConnection(),$me['id'],builderId($in['builderArmyId'],'armata'));}
            catch(BuilderInputError $e){fail($e->getMessage());}
        }
        $leagueId=updateLeague($action,$in,$me,$db,$mail);
        save();
        result($leagueId===null ? ['ok'=>true] : ['ok'=>true,'id'=>$leagueId]);
    }
    if($action==='logout') { $_SESSION=[]; session_destroy(); result(['ok'=>true]); }

    if($action==='invite') {

        if(!$me['admin']) fail('Solo l’amministratore può invitare giocatori.',403);

        $address=field($in,'email',254,false);
        $code=bin2hex(random_bytes(20));
        $expires=time()+604800;
        $hash=hash('sha256',$code);
        if($address!=='') {
            if($mail===null) fail('Servizio email non disponibile.',503);
            $address=sectorMailAddress($in);
            checkSectorMailAvailable($db,$address);
            $token=$code.'.'.$address;
            $hash=hash('sha256','email-invite:'.$token);
            queueSectorMail($db,'invite:'.$hash,$address,'Sei invitato a Cronache del settore',
                'Usa questo invito per creare il tuo account. Il link personale vale sette giorni e si può usare una sola volta.',
                'Crea il tuo account',mailLink($mail,'index.php#invito?token='.rawurlencode($token)),$expires);
        }

        $db['invites']=array_values(array_filter($db['invites'],fn($i)=>!$i['used'] && $i['expires']>time()));

        $db['invites'][]=['hash'=>$hash,'expires'=>$expires,'used'=>false]; save();
        result($address===''?['code'=>$code]:['ok'=>true]);

    }

    if($action==='match') {

        $a=field($in,'a',30); $b=field($in,'b',30);

        $ids=array_column($db['users'],'id');

        if($a===$b || !in_array($a,$ids,true) || !in_array($b,$ids,true)) fail('Scegli due giocatori diversi.');

        if(!$me['admin'] && $me['id']!==$a && $me['id']!==$b) fail('Puoi registrare solo le partite a cui hai partecipato.',403);

        $details=matchDetails($in);
        $request=field($in,'request',64);

        foreach($db['matches'] as $m) if($m['request']===$request && $m['by']===$me['id']) result(['ok'=>true]);

        $matchId=ident();




        if(isset($in['photo']) && !is_string($in['photo'])) fail('Foto non valida.');

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

        'date'=>$details['date'],
        'mission'=>$details['mission'],
        'photo'=>$photo,

        'by'=>$me['id'],

        'void'=>false,

        'created'=>date(DATE_ATOM),

        'request'=>$request

        ];



        try {
            save();
        } catch(Throwable $error) {
            if($photo!==null && !unlink(__DIR__.'/'.$photo)) error_log('Warhammer photo cleanup failed');
            throw $error;
        }


        result(['ok'=>true]);

    }

    if($action==='void') {

        $id=field($in,'id',30);

        foreach($db['matches'] as &$m) if($m['id']===$id) {

            if(!$me['admin'] && $m['by']!==$me['id']) fail('Solo l’autore o l’amministratore può annullare questa partita.',403);

            if(!isset($in['void']) || !is_bool($in['void'])) fail('Stato non valido.');

            $locked=leagueMatchLocks($db);
            if(isset($locked[$id])) fail($locked[$id],409);
            $m['void']=$in['void']; $m['updatedBy']=$me['id']; $m['updated']=date(DATE_ATOM); save(); result(['ok'=>true]);
        }

        fail('Partita non trovata.',404);

    }

    if($action==='list') {

        $name=field($in,'name',100); $faction=field($in,'faction',80);

        $text=listText($in);
        if(count(array_filter($db['lists'],fn($l)=>$l['owner']===$me['id']))>=100) fail('Hai raggiunto il limite di 100 liste.');

        $db['lists'][]=['id'=>ident(),'owner'=>$me['id'],'name'=>$name,'faction'=>$faction,'text'=>$text,'date'=>date('Y-m-d'),'size'=>strlen($text)];

        save(); result(['ok'=>true]);

    }

    fail('Azione non trovata.',404);

} catch(Throwable $e) { error_log('Warhammer archive operation failed: '.$e->getMessage()); fail('Salvataggio non riuscito. Riprova; se il problema continua contatta l’amministratore.',503); }
