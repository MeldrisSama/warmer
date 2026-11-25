<?php
declare(strict_types=1);

const CALENDAR_WRITES=['calendarSave','calendarJoin','calendarCancel'];

function calendarCanManage(array $event, array $me): bool {
    return $me['admin'] || in_array($me['id'],[$event['owner'],$event['a'],$event['b']],true);
}

function calendarFixtureData(array $db, string $id): array {
    $index=array_search($id,array_column($db['league_fixtures'],'id'),true);
    if($index===false) fail('Incontro non trovato.',404);
    $fixture=$db['league_fixtures'][$index];
    $league=$db['league'][leagueIndex($db['league'],$fixture['league_id'])];
    return [$fixture,$league];
}

function calendarCheckFixture(array $db, string $id, array $me): array {
    [$fixture,$league]=calendarFixtureData($db,$id);
    if(!$me['admin'] && !in_array($me['id'],[$fixture['a'],$fixture['b']],true)) fail('Solo i partecipanti o un amministratore possono programmare questo incontro.',403);
    if($fixture['b']===null || $fixture['match_id']!==null) fail('Questo incontro non può essere programmato.',409);
    if(!$league['start'] || $league['closed']!==null || $league['paused']!==null) fail('Il campionato non è attivo.',409);
    return $fixture;
}

function calendarCheckSlot(array $db, array $event): void {
    if($event['time']==='') return;
    foreach($db['calendar_events'] as $other) {
        if($other['id']===$event['id'] || $other['cancelled'] || $other['date']!==$event['date'] || $other['time']!==$event['time']) continue;
        if($other['fixture']!==null) {
            [$fixture]=calendarFixtureData($db,$other['fixture']);
            if($fixture['match_id']!==null) continue;
        }
        if(array_intersect(array_filter([$event['a'],$event['b']]),array_filter([$other['a'],$other['b']]))) {
            fail('Un giocatore ha già un incontro in questa data e a questo orario.',409);
        }
    }
}

function calendarCheckFuture(string $date, string $time): void {
    $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if(!$dt || $dt->format('Y-m-d')!==$date || $date<date('Y-m-d') || $date>'2100-12-31') fail('Scegli una data valida da oggi in avanti.');
    if($time!=='' && !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D',$time)) fail('Orario non valido.');
    if($time!=='' && $date.' '.$time<date('Y-m-d H:i')) fail('L’orario scelto è già passato.');
}

function calendarState(array $db, array $me): array {
    $events=$db['calendar_events'];
    $scheduled=array_column($events,null,'fixture');
    $leagues=leagueSummaries($db,$me['id']);
    $fixtures=[];
    $matches=array_column($db['matches'],null,'id');
    foreach($db['league_fixtures'] as $fixture) {
        if($fixture['b']===null) continue;
        $match=$matches[$fixture['match_id']]??null;
        $fixtures[]=[
            'id'=>$fixture['id'],'leagueId'=>$fixture['league_id'],'round'=>$fixture['round'],
            'a'=>$fixture['a'],'b'=>$fixture['b'],'played'=>$fixture['match_id']!==null,
            'awaiting'=>$fixture['pending']!==null,
            'result'=>$match ? array_intersect_key($match,array_flip(['date','scoreA','scoreB','void'])) : null
        ];
        // Completed league games without an appointment can still be placed on their actual date.
        if($match && !$match['void'] && !isset($scheduled[$fixture['id']])) {
            $events[]=['id'=>'played:'.$fixture['id'],'fixture'=>$fixture['id'],'date'=>$match['date'],'time'=>'',
                'a'=>$fixture['a'],'b'=>$fixture['b'],'owner'=>'','location'=>'','notes'=>'','cancelled'=>false,'version'=>0];
        }
    }
    return ['events'=>$events,'fixtures'=>$fixtures,'leagues'=>$leagues,'today'=>date('Y-m-d')];
}

function updateCalendar(string $action, array $in, array $me, array &$db): string {
    $id=field($in,'id',24);
    if(!preg_match('/^[a-f0-9]{24}$/D',$id)) fail('Identificativo non valido.');
    $index=array_search($id,array_column($db['calendar_events'],'id'),true);
    $old=$index===false ? null : $db['calendar_events'][$index];
    if(!is_int($in['version']??null) || ($old ? $in['version']!==$old['version'] : $in['version']!==0)) fail('L’incontro è cambiato. Aggiorna il calendario e riprova.',409);
    if($action!=='calendarSave' && !$old) fail('Incontro non trovato.',404);
    if($action==='calendarJoin') {
        if($old['cancelled'] || $old['fixture']!==null || $old['b']!==null || $old['a']===$me['id']) fail('Il posto non è più disponibile.',409);
        calendarCheckFuture($old['date'],$old['time']);
        $event=$old;
        $event['b']=$me['id'];
        calendarCheckSlot($db,$event);
    } else {
        if($old && !calendarCanManage($old,$me)) fail('Non puoi modificare questo incontro.',403);
        if($action==='calendarCancel') {
            if($old['fixture']!==null) calendarCheckFixture($db,$old['fixture'],$me);
            $event=$old;
            $event['cancelled']=true;
        } else {
            $fixtureId=field($in,'fixture',24,false) ?: null;
            if($old && $old['fixture']!==$fixtureId) fail('Il tipo di incontro non può essere cambiato.',409);
            $date=field($in,'date',10);
            $time=field($in,'time',5,false);
            calendarCheckFuture($date,$time);
            if($fixtureId!==null) {
                $fixture=calendarCheckFixture($db,$fixtureId,$me);
                foreach($db['calendar_events'] as $other) if($other['fixture']===$fixtureId && $other['id']!==$id) fail('Questo incontro ha già una programmazione. Aprilo dal calendario per modificarla.',409);
                $a=$fixture['a'];$b=$fixture['b'];
            } else {
                $a=field($in,'a',24);$b=field($in,'b',24,false) ?: null;
                $users=array_column($db['users'],'id');
                if(!in_array($a,$users,true) || ($b!==null && (!in_array($b,$users,true)||$a===$b))) fail('Scegli almeno un giocatore e due giocatori diversi.');
                if($old && !$me['admin'] && $old['owner']!==$me['id'] && [$a,$b]!==[$old['a'],$old['b']]) fail('Solo il creatore o un amministratore può cambiare i partecipanti.',403);
            }
            $event=['id'=>$id,'date'=>$date,'time'=>$time,'a'=>$a,'b'=>$b,'owner'=>$old['owner']??$me['id'],
                'fixture'=>$fixtureId,'location'=>field($in,'location',160,false),'notes'=>field($in,'notes',1000,false),
                'cancelled'=>false,'version'=>0,'created'=>$old['created']??date(DATE_ATOM)];
            calendarCheckSlot($db,$event);
        }
    }
    $event['version']=($old['version']??0)+1;
    if($index===false) $db['calendar_events'][]=$event;
    else $db['calendar_events'][$index]=$event;
    return $id;
}
