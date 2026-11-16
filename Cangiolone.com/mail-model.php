<?php
declare(strict_types=1);

const ACCOUNT_ACTIONS=['emailSet','emailVerify','passwordChange','passwordForgot','passwordReset'];

function sectorMailConfig(): ?array {
    $path=__DIR__.'/private/mail.php';
    if(!is_file($path)) return null;
    $config=require $path;
    if(!is_array($config) || !is_string($config['base_url']??null)
        || !filter_var($config['base_url'],FILTER_VALIDATE_URL)
        || parse_url($config['base_url'],PHP_URL_SCHEME)!=='https'
        || strpbrk($config['base_url'],'?#')!==false) {
        throw new RuntimeException('Invalid mail configuration');
    }
    $transport=$config['transport']??'smtp';
    if($transport==='smtp') {
        if(!filter_var($config['username']??null,FILTER_VALIDATE_EMAIL)
            || !is_string($config['password']??null) || $config['password']==='') {
            throw new RuntimeException('Missing SMTP account');
        }
    } elseif($transport!=='capture' || empty($config['capture_path'])) {
        throw new RuntimeException('Invalid mail transport');
    }
    return $config;
}

function mailProfile(array $db, string $id): array {
    return $db['mail_accounts'][$id]??[
        'id'=>$id,'email'=>null,'pending_email'=>null,'verify_hash'=>null,'verify_until'=>0,
        'reset_hash'=>null,'reset_until'=>0,'version'=>0
    ];
}

function mailLink(array $config, string $path): string {
    return rtrim($config['base_url'],'/').'/'.$path;
}

function queueSectorMail(array &$db, string $event, string $recipient, string $subject, string $body, string $label, string $url, ?int $expires=null, array $report=[]): void {
    $id=hash('sha256',$event);
    $payload=json_encode(compact('subject','body','label','url','report'),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    $db['mail_jobs'][$id]=[$id,$recipient,$payload,$expires??time()+604800,time()];
}

function notifySectorUsers(array &$db, array $users, string $event, string $subject, string $body, string $label, string $url): int {
    $count=0;
    foreach(array_unique($users) as $user) {
        $email=$db['mail_accounts'][$user]['email']??null;
        if($email===null) continue;
        queueSectorMail($db,$event.':'.$user,$email,$subject,$body,$label,$url);
        $count++;
    }
    return $count;
}

function sectorMailAddress(array $in): string {
    $email=strtolower(field($in,'email',254));
    if(!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Inserisci un indirizzo email valido.');
    return $email;
}

function checkSectorMailAvailable(array $db, string $email, ?string $owner=null): void {
    foreach($db['mail_accounts'] as $id=>$profile) if($id!==$owner && $profile['email']===$email) {
        fail('Questo indirizzo è già associato a un altro account.',409);
    }
}

function queueEmailVerification(array &$db, array $mail, string $id, string $email): void {
    checkSectorMailAvailable($db,$email,$id);
    $profile=mailProfile($db,$id);
    if($profile['email']===$email) return;
    if((int)$profile['verify_until']>time()+86340) fail('Attendi un minuto prima di chiedere un altro link.',429);
    $token=bin2hex(random_bytes(32));
    $profile['pending_email']=$email;
    $profile['verify_hash']=hash('sha256',$token);
    $profile['verify_until']=time()+86400;
    $db['mail_accounts'][$id]=$profile;
    queueSectorMail($db,'verify:'.$profile['verify_hash'],$email,'Conferma il tuo indirizzo email',
        'Verifica questo indirizzo per ricevere gli aggiornamenti del campionato e recuperare la password. Il link è valido 24 ore.',
        'Verifica indirizzo email',mailLink($mail,'index.php#verify-email?token='.$token),$profile['verify_until']);
}

function sectorPassword(array $in): string {
    $password=$in['password']??null;
    if(!is_string($password) || strlen($password)<12 || strlen($password)>72 || str_contains($password,"\0")) {
        fail('Scegli una password di almeno 12 caratteri (massimo 72 byte).');
    }
    return $password;
}

function accountThrottle(array &$db, string $kind, string $key, int $limit): bool {
    $now=time();
    $db['attempts']=array_filter($db['attempts'],fn($a)=>$a['until']>$now);
    $key=hash('sha256','account:'.$kind.':'.$key);
    $attempt=$db['attempts'][$key]??['count'=>0,'until'=>$now+900];
    if($attempt['count']>=$limit) return false;
    $attempt['count']++;
    $db['attempts'][$key]=$attempt;
    return true;
}

function updateSectorAccount(string $action, array $in, ?array $me, array &$db, ?array $mail): ?int {
    if($action!=='passwordChange' && $mail===null) fail('Servizio email non disponibile.',503);
    $now=time();
    if($action==='passwordForgot') {
        $valid=accountThrottle($db,$action,$_SERVER['REMOTE_ADDR']??'unknown',8);
        $email=sectorMailAddress($in);
        if(!$valid) return null;
        foreach($db['mail_accounts'] as &$profile) {
            if($profile['email']!==$email || (int)$profile['reset_until']>$now+7140) continue;
            $token=bin2hex(random_bytes(32));
            $profile['reset_hash']=hash('sha256',$token);
            $profile['reset_until']=$now+7200;
            queueSectorMail($db,'reset:'.$profile['reset_hash'],$email,'Reimposta la password',
                'È stato richiesto il recupero della password del tuo account. Il link è valido due ore e si può usare una volta sola. Se non hai fatto tu la richiesta, puoi ignorare il messaggio.',
                'Scegli una nuova password',mailLink($mail,'index.php#reset-password?token='.$token),$profile['reset_until']);
            break;
        }
        return null;
    }

    if($action==='emailVerify' || $action==='passwordReset') {
        $token=field($in,'token',64);
        $hash=hash('sha256',$token);
        $prefix=$action==='emailVerify'?'verify':'reset';
        foreach($db['mail_accounts'] as $id=>&$profile) {
            if(!is_string($profile[$prefix.'_hash']) || !hash_equals($profile[$prefix.'_hash'],$hash)
                || (int)$profile[$prefix.'_until']<=$now) continue;
            if($action==='emailVerify') {
                checkSectorMailAvailable($db,$profile['pending_email'],$id);
                $profile['email']=$profile['pending_email'];
                $profile['pending_email']=null;
                $profile['verify_hash']=null;
                $profile['verify_until']=0;
                $profile['reset_hash']=null;
                $profile['reset_until']=0;
            } else {
                setSectorPassword($db,$profile,$id,sectorPassword($in));
            }
            return null;
        }
        fail('Link scaduto o già utilizzato. Richiedine uno nuovo.',410);
    }

    if(!$me) fail('Accedi per continuare.',401);
    $id=$me['id'];
    if($action==='emailSet' && mailProfile($db,$id)['email']===null) {
        if(!accountThrottle($db,'email-set',$id,8)) fail('Troppi tentativi. Riprova tra 15 minuti.',429);
        queueEmailVerification($db,$mail,$id,sectorMailAddress($in));
        return null;
    }
    if(!accountThrottle($db,'current-password',$me['id'],8)) fail('Troppi tentativi. Riprova tra 15 minuti.',429);
    $current=$in['current']??null;
    if(!is_string($current) || strlen($current)>72 || str_contains($current,"\0") || !password_verify($current,$me['password'])) {
        // Keep failed attempts even though this operation cannot continue.
        save();
        fail('Password attuale errata.',403);
    }
    $db['mail_accounts'][$id]??=mailProfile($db,$id);
    $profile=&$db['mail_accounts'][$id];
    if($action==='passwordChange') {
        setSectorPassword($db,$profile,$id,sectorPassword($in));
        return (int)$profile['version'];
    }

    queueEmailVerification($db,$mail,$id,sectorMailAddress($in));
    return null;
}

function setSectorPassword(array &$db, array &$profile, string $id, string $password): void {
    $index=array_search($id,array_column($db['users'],'id'),true);
    if($index===false) fail('Account non trovato.',404);
    $db['users'][$index]['password']=password_hash($password,PASSWORD_DEFAULT);
    $profile['pending_email']=null;
    $profile['verify_hash']=null;
    $profile['verify_until']=0;
    $profile['reset_hash']=null;
    $profile['reset_until']=0;
    $profile['version']++;
}

function notifyLeague(array &$db, ?array $mail, array $league, array $users, string $event, string $subject, string $body, string $label, ?string $fixture=null): int {
    if($mail===null) return 0;
    $path='campionato.php?id='.$league['id'].($fixture===null?'':'&fixture='.$fixture);
    return notifySectorUsers($db,$users,$event,$subject,$league['name']."\n\n".$body,$label,mailLink($mail,$path));
}

function queueRoundReport(array &$db, ?array $mail, array $league, int $round): void {
    if($mail===null) return;
    $fixtures=array_filter($db['league_fixtures'],fn($f)=>$f['league_id']===$league['id'] && $f['b']!==null);
    $roundFixtures=array_filter($fixtures,fn($f)=>$f['round']===$round);
    foreach($roundFixtures as $fixture) if($fixture['match_id']===null) return;

    $users=array_column($db['users'],null,'id');
    $matches=array_column($db['matches'],null,'id');
    $players=leaguePlayers($db,$league['id']);
    $scores=array_fill_keys($players,['points'=>0,'diff'=>0]);
    $results=[];
    foreach($fixtures as $fixture) {
        $match=$matches[$fixture['match_id']]??null;
        if(!$match || $match['void']) {
            if($fixture['round']===$round && $match) $results[]=['Annullata',$users[$fixture['a']]['name'],$users[$fixture['b']]['name']];
            continue;
        }
        $a=$fixture['a']; $b=$fixture['b']; $diff=$match['scoreA']-$match['scoreB'];
        $scores[$a]['points']+=$diff>0?3:($diff===0?1:0);
        $scores[$b]['points']+=$diff<0?3:($diff===0?1:0);
        $scores[$a]['diff']+=$diff;
        $scores[$b]['diff']-=$diff;
        if($fixture['round']===$round) $results[]=[$match['scoreA'].' – '.$match['scoreB'],$users[$a]['name'],$users[$b]['name']];
    }
    uasort($scores,fn($a,$b)=>$b['points']<=>$a['points'] ?: $b['diff']<=>$a['diff']);
    $standings=[];
    foreach($scores as $id=>$score) $standings[]=[$users[$id]['name'],$score['points'],$score['diff']];
    $report=['results'=>array_map(fn($r)=>[$r[1],$r[0],$r[2]],$results),'standings'=>$standings];
    foreach($players as $user) {
        $recipient=$db['mail_accounts'][$user]['email']??null;
        if($recipient===null) continue;
        queueSectorMail($db,'round:'.$league['id'].':'.$round.':'.$user,$recipient,
            'Giornata '.$round.' — risultati e classifica',$league['name'],'Apri il campionato',
            mailLink($mail,'campionato.php?id='.$league['id']),null,$report);
    }
}
