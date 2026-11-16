<?php
declare(strict_types=1);

function leagueSummaries(array $db, string $player): array {
    $members=[];
    foreach($db['league_members'] as $entry) $members[$entry['league_id']][$entry['player']]=true;
    $leagues=array_map(function(array $league) use($members,$player): array {
        $entries=$members[$league['id']]??[];
        return $league+['joined'=>isset($entries[$player]),'entrants'=>count($entries)];
    },$db['league']);
    usort($leagues,fn($a,$b)=>($a['closed']!==null)<=>($b['closed']!==null)
        ?: $b['entrants']<=>$a['entrants'] ?: ($b['start']!==null)<=>($a['start']!==null)
        ?: strcmp($a['id'],$b['id']));
    return $leagues;
}

function leagueIndex(array $leagues, ?string $id): int {
    $index=$id===null && count($leagues)===1 ? 0 : array_search($id,array_column($leagues,'id'),true);
    if($index===false) fail('Campionato non trovato.',404);
    return $index;
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

function leagueState(array $db, array $me, ?string $id=null, bool $create=false): array {
    $myId=$me['id'];
    $leagues=leagueSummaries($db,$myId);
    $league=$create ? null : ($id===null ? ($leagues[0]??null) : $leagues[leagueIndex($leagues,$id)]);
    $matches=array_column($db['matches'],null,'id');
    $submitted=[];
    foreach($db['league_lineups'] as $list) $submitted[$list['fixture']][$list['player']]=true;
    $fixtures=[];
    foreach($db['league_fixtures'] as $fixture) {
        if($fixture['league_id']!==($league['id']??null)) continue;
        $players=[$fixture['a'],$fixture['b']];
        $mine=in_array($myId,$players,true) && $fixture['b']!==null;
        $pending=$league['closed']!==null || $fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
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
        'league'=>$league,'user'=>publicUser($me),'csrf'=>$_SESSION['csrf'],
        'today'=>date('Y-m-d'),'users'=>array_map('publicUser',$db['users']),
        'players'=>array_column(array_filter($db['league_members'],fn($entry)=>$entry['league_id']===($league['id']??null)),'player'),
        'fixtures'=>$fixtures
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

function updateLeague(string $action, array $in, array $me, array &$db): ?string {
    $player=$me['id'];
    if($action==='leagueOpen') {
        if(!$me['admin']) fail('Solo l’amministratore può aprire le iscrizioni.',403);
        $name=field($in,'name',100);
        $id=field($in,'request',24,false) ?: ident();
        if(!preg_match('/^[a-f0-9]{24}$/D',$id)) fail('Richiesta non valida.');
        foreach($db['league'] as $league) if($league['id']===$id) {
            if($league['name']!==$name) fail('Richiesta già usata. Ricarica la pagina.',409);
            return $id;
        }
        $db['league'][]=['id'=>$id,'name'=>$name,'start'=>null,'closed'=>null];
        return $id;
    }
    $fixtureIndex=null;
    $id=field($in,'league',24,false) ?: null;
    if(!in_array($action,['leagueJoin','leagueStart','leagueClose'],true)) {
        $fixtureIndex=leagueFixture($db['league_fixtures'],field($in,'fixture',24),$player);
        $fixtureLeague=$db['league_fixtures'][$fixtureIndex]['league_id'];
        if($id!==null && $id!==$fixtureLeague) fail('Incontro non trovato.',404);
        $id=$fixtureLeague;
    }
    $index=leagueIndex($db['league'],$id);
    $league=&$db['league'][$index];
    if($action==='leagueClose') {
        if(!$me['admin']) fail('Solo l’amministratore può chiudere il campionato.',403);
        $league['closed']??=date(DATE_ATOM);
        return null;
    }
    if($league['closed']!==null) fail('Il campionato è concluso.',409);
    if($action==='leagueJoin') {
        $memberId=$league['id'].':'.$player;
        if(in_array($memberId,array_column($db['league_members'],'id'),true)) return null;
        if($league['start']) fail('Le iscrizioni sono chiuse.',409);
        $db['league_members'][]=['id'=>$memberId,'league_id'=>$league['id'],'player'=>$player,'joined'=>date(DATE_ATOM)];
        return null;
    }
    if($action==='leagueStart') {
        if(!$me['admin']) fail('Solo l’amministratore può pubblicare il calendario.',403);
        if($league['start']) fail('Il calendario è già stato pubblicato.',409);
        $players=array_column(array_filter($db['league_members'],fn($entry)=>$entry['league_id']===$league['id']),'player');
        if(count($players)<2) fail('Servono almeno due iscritti.');
        shuffle($players);
        foreach(leagueSchedule($players) as $fixture) $db['league_fixtures'][]=$fixture+['league_id'=>$league['id']];
        $league['start']=date('Y-m-d');
        return null;
    }

    $fixture=&$db['league_fixtures'][$fixtureIndex];
    if($action==='leagueLineup') {
        $id=$fixture['id'].':'.$player;
        $opponent=$fixture['a']===$player ? $fixture['b'] : $fixture['a'];
        $lists=array_column($db['league_lineups'],null,'id');
        // A revealed list stays fixed so neither player can react to the opponent’s list.
        if(isset($lists[$id],$lists[$fixture['id'].':'.$opponent])) fail('Le liste sono già state rivelate.',409);
        $text=listText($in,false);
        // shortcut: validates file format only; check army rules when the list builder is available.
        $lists[$id]=['id'=>$id,'fixture'=>$fixture['id'],'player'=>$player,'text'=>$text];
        $db['league_lineups']=array_values($lists);
        return null;
    }

    if($fixture['match_id']!==null) fail('Il risultato dell’incontro è già stato confermato.',409);
    $pending=$fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
    if($action==='leaguePropose') {
        if($pending) fail('C’è già un risultato in attesa.',409);
        $scores=matchDetails($in);
        $fixture['pending']=json_encode($scores+['by'=>$player,'token'=>ident()],JSON_THROW_ON_ERROR);
        return null;
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
    return null;
}

function closedLeagueMatches(array $db): array {
    $closed=array_column(array_filter($db['league'],fn($league)=>$league['closed']!==null),'id');
    return array_column(array_filter($db['league_fixtures'],fn($fixture)=>
        $fixture['match_id']!==null && in_array($fixture['league_id'],$closed,true)),'match_id');
}
