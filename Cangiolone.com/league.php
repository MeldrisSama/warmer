<?php
declare(strict_types=1);

function leagueSummary(array $db, string $player): ?array {
    $league=$db['league'][0]??null;
    if(!$league) return null;
    return [
        'name'=>$league['name'],
        'start'=>$league['start'],
        'joined'=>in_array($player,array_column($db['league_entries'],'player'),true)
    ];
}

function leagueSchedule(array $players): array {
    if(count($players)%2) $players[]=null;
    $size=count($players);
    $fixtures=[];
    for($round=1;$round<$size;$round++) {
        for($i=0;$i<$size/2;$i++) {
            $a=$players[$i];
            $b=$players[$size-1-$i];
            if($a===null || ($b!==null && ($round+$i)%2===0)) [$a,$b]=[$b,$a];
            $fixtures[]=['id'=>ident(),'round'=>$round,'a'=>$a,'b'=>$b,'pending'=>null,'match_id'=>null];
        }
        array_splice($players,1,0,[array_pop($players)]);
    }
    return $fixtures;
}

function leagueState(array $db, array $me): array {
    $myId=$me['id'];
    $matches=array_column($db['matches'],null,'id');
    $submitted=[];
    foreach($db['league_lineups'] as $list) $submitted[$list['fixture']][$list['player']]=true;
    $fixtures=[];
    foreach($db['league_fixtures'] as $fixture) {
        $players=[$fixture['a'],$fixture['b']];
        $mine=in_array($myId,$players,true) && $fixture['b']!==null;
        $pending=$fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
        $match=$matches[$fixture['match_id']]??null;
        $lineups=$submitted[$fixture['id']]??[];
        $fixtures[]=[
            'id'=>$fixture['id'],'round'=>$fixture['round'],'a'=>$fixture['a'],'b'=>$fixture['b'],
            'result'=>$match ? array_intersect_key($match,array_flip(['scoreA','scoreB','date','mission','void'])) : null,
            'pending'=>$mine ? $pending : null,
            'awaiting'=>$pending!==null,
            'lineups'=>$mine ? [
                'mine'=>isset($lineups[$myId]),
                'opponent'=>isset($lineups[$fixture['a']===$myId ? $fixture['b'] : $fixture['a']])
            ] : null
        ];
    }
    usort($fixtures,fn($a,$b)=>$a['round']<=>$b['round'] ?: strcmp($a['id'],$b['id']));
    return [
        'league'=>leagueSummary($db,$myId),'user'=>publicUser($me),'csrf'=>$_SESSION['csrf'],
        'today'=>date('Y-m-d'),'users'=>array_map('publicUser',$db['users']),
        'players'=>array_column($db['league_entries'],'player'),'fixtures'=>$fixtures
    ];
}

function leagueFixture(array $fixtures, string $id, string $player): int {
    $index=array_search($id,array_column($fixtures,'id'),true);
    if($index===false || $fixtures[$index]['b']===null) fail('Incontro non trovato.',404);
    $fixture=$fixtures[$index];
    if($fixture['a']!==$player && $fixture['b']!==$player) fail('Solo i due giocatori possono gestire questo incontro.',403);
    return $index;
}

function leagueDownload(SectorStorage $storage, array $db, string $player): never {
    $id=$_GET['fixture']??'';
    $owner=$_GET['player']??'';
    if(!is_string($id) || !is_string($owner)) fail('Lista non trovata.',404);
    $fixture=$db['league_fixtures'][leagueFixture($db['league_fixtures'],$id,$player)];
    $lists=array_column($db['league_lineups'],null,'id');
    $requested=$lists[$id.':'.$owner]??null;
    if(!$requested) fail('Lista non trovata.',404);
    if(!isset($lists[$id.':'.$fixture['a']],$lists[$id.':'.$fixture['b']])) fail('Le liste saranno visibili dopo entrambe le consegne.',403);
    $text=$storage->leagueLineupText($requested['id']);
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="lista-campionato-'.$requested['player'].'.txt"');
    echo $text;
    exit;
}

function updateLeague(string $action, array $in, array $me, array &$db): void {
    $player=$me['id'];
    $league=leagueSummary($db,$player);
    if($action==='leagueOpen') {
        if(!$me['admin']) fail('Solo l’amministratore può aprire le iscrizioni.',403);
        if($league) fail('Il campionato è già stato creato.',409);
        $db['league'][]=['id'=>ident(),'name'=>field($in,'name',100),'start'=>null];
        return;
    }
    if(!$league) fail('Il campionato non è ancora aperto.',409);
    if($action==='leagueJoin') {
        if($league['joined']) return;
        if($league['start']) fail('Le iscrizioni sono chiuse.',409);
        $db['league_entries'][]=['player'=>$player,'joined'=>date(DATE_ATOM)];
        return;
    }
    if($action==='leagueStart') {
        if(!$me['admin']) fail('Solo l’amministratore può pubblicare il calendario.',403);
        if($league['start']) fail('Il calendario è già stato pubblicato.',409);
        $players=array_column($db['league_entries'],'player');
        if(count($players)<2) fail('Servono almeno due iscritti.');
        $start=field($in,'start',10);
        $date=DateTimeImmutable::createFromFormat('!Y-m-d',$start);
        if(!$date || $date->format('Y-m-d')!==$start || $start<date('Y-m-d')) fail('Scegli una data di inizio di oggi o futura.');
        shuffle($players);
        $db['league_fixtures']=leagueSchedule($players);
        $db['league'][0]['start']=$start;
        return;
    }

    $index=leagueFixture($db['league_fixtures'],field($in,'fixture',24),$player);
    $fixture=&$db['league_fixtures'][$index];
    if($action==='leagueLineup') {
        $id=$fixture['id'].':'.$player;
        $opponent=$fixture['a']===$player ? $fixture['b'] : $fixture['a'];
        $lists=array_column($db['league_lineups'],null,'id');
        // A revealed list stays fixed so neither player can react to the opponent’s list.
        if(isset($lists[$id],$lists[$fixture['id'].':'.$opponent])) fail('Le liste sono già state rivelate.',409);
        $text=listText($in);
        // shortcut: validates file format only; check army rules when the list builder is available.
        $lists[$id]=['id'=>$id,'fixture'=>$fixture['id'],'player'=>$player,'text'=>$text];
        $db['league_lineups']=array_values($lists);
        return;
    }

    if($fixture['match_id']!==null) fail('Il risultato dell’incontro è già stato confermato.',409);
    $pending=$fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
    if($action==='leaguePropose') {
        if($pending) fail('C’è già un risultato in attesa.',409);
        $scores=matchDetails($in);
        if($scores['date']<$league['start']) fail('La partita deve essere giocata a campionato iniziato.');
        $fixture['pending']=json_encode($scores+['by'=>$player,'token'=>ident()],JSON_THROW_ON_ERROR);
        return;
    }
    if(!$pending || $pending['token']!==field($in,'proposal',24)) fail('Il risultato è cambiato. Aggiorna la pagina.',409);
    if($action==='leagueWithdraw') {
        if($pending['by']!==$player) fail('Solo chi ha proposto il risultato può ritirarlo.',403);
    } else {
        if($pending['by']===$player) fail('Il risultato deve essere verificato dall’avversario.',403);
        if($action==='leagueConfirm') {
            $matchId=ident();
            $db['matches'][]=[
                'id'=>$matchId,'a'=>$fixture['a'],'b'=>$fixture['b'],
                'scoreA'=>$pending['scoreA'],'scoreB'=>$pending['scoreB'],'date'=>$pending['date'],
                'mission'=>$pending['mission'],'photo'=>null,'by'=>$pending['by'],'void'=>false,
                'created'=>date(DATE_ATOM),'request'=>'league:'.$fixture['id']
            ];
            $fixture['match_id']=$matchId;
        }
    }
    $fixture['pending']=null;
}
