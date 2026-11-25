<?php
declare(strict_types=1);

const LEAGUE_FORMATS=['round_robin','knockout','knockout_legs','swiss'];

function leagueFormat(array $league): string {
    return $league['format']??'round_robin';
}

function tournamentPairSlots(int $players, int $round): array {
    $slots=[];
    $offset=$players%2 && $round%2===0 ? 1 : 0;
    if($offset) $slots[]=[0];
    for($i=$offset;$i+1<$players;$i+=2) $slots[]=[$i,$i+1];
    if($players%2 && !$offset) $slots[]=[$players-1];
    return $slots;
}

function tournamentFixture(int $round, int $slot, string $a, ?string $b, int $leg=1): array {
    return ['id'=>ident(),'round'=>$round,'slot'=>$slot,'leg'=>$leg,'a'=>$a,'b'=>$b,
        'pending'=>null,'match_id'=>null,'winner'=>null];
}

function tournamentDraw(string $format, int $round, array $players): array {
    $fixtures=[];
    foreach(tournamentPairSlots(count($players),$round) as $slot=>$sources) {
        $a=$players[$sources[0]];
        $b=isset($sources[1]) ? $players[$sources[1]] : null;
        $fixtures[]=tournamentFixture($round,$slot,$a,$b);
        if($b!==null && $format==='knockout_legs') $fixtures[]=tournamentFixture($round,$slot,$b,$a,2);
    }
    return $fixtures;
}

function tournamentFirstRound(string $format, array $players, mixed $selected): array {
    $byeCount=count($players)%2;
    if(!is_array($selected) || !array_is_list($selected) || count($selected)>$byeCount) {
        fail('Numero di riposi del primo turno non valido.');
    }
    if($selected) {
        $bye=$selected[0];
        if(!is_string($bye) || !in_array($bye,$players,true)) fail('Scegli un giocatore iscritto per il riposo.');
        $players=[...array_values(array_diff($players,[$bye])),$bye];
    }
    return tournamentDraw($format,1,$players);
}

function tournamentFixtures(array $db, string $leagueId): array {
    $fixtures=array_values(array_filter($db['league_fixtures'],fn($f)=>$f['league_id']===$leagueId));
    usort($fixtures,fn($a,$b)=>$a['round']<=>$b['round'] ?: $a['slot']<=>$b['slot'] ?: $a['leg']<=>$b['leg']);
    return $fixtures;
}

function tournamentSwissStandings(array $players, array $fixtures, array $matches): array {
    $rows=[];
    foreach($players as $id) $rows[$id]=['id'=>$id,'wins'=>0,'draws'=>0,'losses'=>0,'diff'=>0,'byes'=>0];
    foreach($fixtures as $fixture) {
        $a=$fixture['a']; $b=$fixture['b'];
        if($b===null) {
            $rows[$a]['byes']++;
            continue;
        }
        $match=$matches[$fixture['match_id']]??null;
        if(!$match || $match['void']) continue;
        $diff=$match['scoreA']-$match['scoreB'];
        $rows[$a][$diff>0?'wins':($diff<0?'losses':'draws')]++;
        $rows[$b][$diff<0?'wins':($diff>0?'losses':'draws')]++;
        $rows[$a]['diff']+=$diff;
        $rows[$b]['diff']-=$diff;
    }
    $record=fn($row)=>[$row['wins'],$row['draws'],$row['diff']];
    usort($rows,fn($a,$b)=>$record($b)<=>$record($a) ?: strcmp($a['id'],$b['id']));
    $previous=null;
    foreach($rows as $index=>&$row) {
        $row['rank']=$previous && $record($row)===$record($previous)
            ? $previous['rank'] : $index+1;
        $previous=$row;
    }
    unset($row);
    return $rows;
}

function tournamentSwissUnplayedPairs(array $players, array $opponents, int &$attempts): ?array {
    if(!$players) return [];
    if(--$attempts<0) return null;
    $first=array_shift($players);
    foreach($players as $index=>$other) {
        if(isset($opponents[$first][$other])) continue;
        $remaining=$players;
        unset($remaining[$index]);
        $tail=tournamentSwissUnplayedPairs($remaining,$opponents,$attempts);
        if($tail!==null) return [[$first,$other],...$tail];
        if($attempts<0) break;
    }
    return null;
}

function tournamentSwissRound(int $round, array $standings, array $fixtures): array {
    $players=array_column($standings,'id');
    $byeCandidates=[null];
    if(count($players)%2) {
        $fewest=min(array_column($standings,'byes'));
        $byeCandidates=array_column(array_filter(array_reverse($standings),fn($row)=>$row['byes']===$fewest),'id');
    }
    $opponents=[];
    foreach($fixtures as $fixture) if($fixture['b']!==null) {
        $opponents[$fixture['a']][$fixture['b']]=true;
        $opponents[$fixture['b']][$fixture['a']]=true;
    }
    // Backtrack across score groups before allowing a rematch.
    $attempts=20000;
    $pairs=null;
    $bye=$byeCandidates[0];
    foreach($byeCandidates as $candidate) {
        $pairable=$candidate===null ? $players : array_diff($players,[$candidate]);
        $pairs=tournamentSwissUnplayedPairs($pairable,$opponents,$attempts);
        if($pairs!==null) {
            $bye=$candidate;
            break;
        }
        if($attempts<0) break;
    }
    if($pairs===null) {
        if($bye!==null) $players=array_diff($players,[$bye]);
        $pairs=[];
        while($players) {
            $a=array_shift($players);
            $index=array_key_first($players);
            foreach($players as $candidate=>$b) if(!isset($opponents[$a][$b])) {
                $index=$candidate;
                break;
            }
            $pairs[]=[$a,$players[$index]];
            unset($players[$index]);
        }
    }
    if($bye!==null) $pairs[]=[$bye,null];
    return array_map(fn($slot,$pair)=>tournamentFixture($round,$slot,...$pair),array_keys($pairs),$pairs);
}

function tournamentSeries(array $fixtures, array $matches): array {
    $series=[];
    foreach($fixtures as $fixture) {
        $slot=$fixture['slot'];
        $leg=$fixture['leg'];
        if($leg===1) $series[$slot]=['id'=>$fixture['id'],'slot'=>$slot,'a'=>$fixture['a'],'b'=>$fixture['b'],
            'winner'=>$fixture['winner'],'scores'=>[],'ids'=>[],'ready'=>true];
        $card=&$series[$slot];
        $card['ids'][]=$fixture['id'];
        if($fixture['b']!==null) {
            $result=$matches[$fixture['match_id']]??null;
            $valid=$result && !$result['void'];
            if(!$valid) $card['ready']=false;
            $card['scores'][]=$valid ? ($leg===1 ? [$result['scoreA'],$result['scoreB']] : [$result['scoreB'],$result['scoreA']]) : null;
        }
        unset($card);
    }
    foreach($series as &$card) {
        $points=$card['scores'];
        $card['total']=$card['ready'] && $points ? [array_sum(array_column($points,0)),array_sum(array_column($points,1))] : null;
    }
    unset($card);
    return array_values($series);
}

function tournamentBracket(array $fixtures, array $matches): array {
    if(!$fixtures) return [];
    $grouped=[];
    foreach($fixtures as $fixture) $grouped[$fixture['round']][]=$fixture;
    $rounds=[['round'=>1,'series'=>tournamentSeries($grouped[1],$matches),'feeds'=>[]]];
    for($round=2,$previous=count($rounds[0]['series']);$previous>1;$round++) {
        $feeds=tournamentPairSlots($previous,$round);
        $series=isset($grouped[$round]) ? tournamentSeries($grouped[$round],$matches) : [];
        $rounds[]=['round'=>$round,'series'=>$series,'feeds'=>$feeds];
        $previous=count($feeds);
    }
    return $rounds;
}

function tournamentRoundState(array $fixtures, array $matches, bool $knockout=false): array {
    $round=$fixtures ? $fixtures[array_key_last($fixtures)]['round'] : 0;
    $current=array_values(array_filter($fixtures,fn($f)=>$f['round']===$round));
    if($knockout) {
        $series=tournamentSeries($current,$matches);
        $ties=array_column(array_filter($series,fn($card)=>$card['total'] && $card['total'][0]===$card['total'][1]),'id');
        return ['number'=>$round,'series'=>$series,'ready'=>$round>0 && !in_array(false,array_column($series,'ready'),true),'ties'=>$ties];
    }
    $ready=$round>0;
    foreach($current as $fixture) {
        if($fixture['b']===null) continue;
        $match=$matches[$fixture['match_id']]??null;
        if(!$match || $match['void']) $ready=false;
    }
    return ['number'=>$round,'ready'=>$ready,'ties'=>[]];
}

function tournamentAdvance(array &$db, array &$league, array $in): void {
    if(leagueFormat($league)==='round_robin' || !$league['start']) fail('Il torneo non è in corso.',409);
    $fixtures=tournamentFixtures($db,$league['id']);
    $matches=array_column($db['matches'],null,'id');
    $format=leagueFormat($league);
    $current=tournamentRoundState($fixtures,$matches,$format!=='swiss');
    $round=$current['number'];
    if(($in['round']??null)!==$round) fail('Il turno è cambiato. Ricarica la pagina.',409);
    if(!$current['ready']) fail('Conferma tutti i risultati del turno prima di proseguire.',409);

    if($format==='swiss') {
        $players=leaguePlayers($db,$league['id']);
        $next=$round<$league['round_limit']
            ? tournamentSwissRound($round+1,tournamentSwissStandings($players,$fixtures,$matches),$fixtures) : [];
    } else {
        $choices=$in['winners']??[];
        if(!is_array($choices) || count($choices)!==count($current['ties'])) fail('Indica chi passa per ogni incontro in parità.');
        $winners=[];
        $qualifiers=[];
        foreach($current['series'] as $card) {
            $a=$card['a']; $b=$card['b'];
            $winner=$a;
            if($b!==null && $card['total'][1]>$card['total'][0]) $winner=$b;
            if(in_array($card['id'],$current['ties'],true)) {
                $winner=$choices[$card['id']]??null;
                if(!in_array($winner,[$a,$b],true)) fail('Indica chi passa per ogni incontro in parità.');
            }
            foreach($card['ids'] as $id) $winners[$id]=$winner;
            $qualifiers[]=$winner;
        }
        foreach($db['league_fixtures'] as &$fixture) if(isset($winners[$fixture['id']])) $fixture['winner']=$winners[$fixture['id']];
        unset($fixture);
        $next=count($qualifiers)>1 ? tournamentDraw($format,$round+1,$qualifiers) : [];
    }
    if(!$next) {
        $league['finished']=$league['closed']=date(DATE_ATOM);
        return;
    }
    foreach($next as $fixture) $db['league_fixtures'][]=$fixture+['league_id'=>$league['id']];
}
