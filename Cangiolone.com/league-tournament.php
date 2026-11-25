<?php
declare(strict_types=1);

const LEAGUE_FORMATS=['round_robin','knockout','swiss'];

function leagueFormat(array $league): string {
    return $league['format']??'round_robin';
}

function tournamentBracketSize(int $players): int {
    $size=2;
    while($size<$players) $size*=2;
    return $size;
}

function tournamentFixture(int $round, int $slot, string $a, ?string $b): array {
    return ['id'=>ident(),'round'=>$round,'slot'=>$slot,'a'=>$a,'b'=>$b,
        'pending'=>null,'match_id'=>null,'winner'=>null];
}

function tournamentFirstRound(string $format, array $players, mixed $selected): array {
    $number=count($players);
    $size=$format==='knockout' ? tournamentBracketSize($number) : $number+$number%2;
    $byeCount=$size-$number;
    if(!is_array($selected) || !array_is_list($selected) || count($selected)>$byeCount) {
        fail('Numero di riposi del primo turno non valido.');
    }
    $byes=[];
    foreach($selected as $player) {
        if(!is_string($player) || !in_array($player,$players,true) || in_array($player,$byes,true)) {
            fail('Scegli giocatori iscritti diversi per i riposi.');
        }
        $byes[]=$player;
    }
    $players=array_values(array_diff($players,$byes));
    while(count($byes)<$byeCount) $byes[]=array_shift($players);

    $slotCount=intdiv($size,2);
    $byeSlots=[];
    for($i=0;$i<$byeCount;$i++) {
        // Fill separate halves of adjacent pairs before placing two byes together.
        $evenSlots=intdiv($slotCount+1,2);
        $slot=$i<$evenSlots ? $i*2 : ($i-$evenSlots)*2+1;
        $byeSlots[$slot]=$byes[$i];
    }
    $fixtures=[];
    for($slot=0;$slot<$slotCount;$slot++) {
        if(isset($byeSlots[$slot])) $fixtures[]=tournamentFixture(1,$slot,$byeSlots[$slot],null);
        else $fixtures[]=tournamentFixture(1,$slot,array_shift($players),array_shift($players));
    }
    return $fixtures;
}

function tournamentFixtures(array $db, string $leagueId): array {
    $fixtures=array_values(array_filter($db['league_fixtures'],fn($f)=>$f['league_id']===$leagueId));
    usort($fixtures,fn($a,$b)=>$a['round']<=>$b['round'] ?: $a['slot']<=>$b['slot']);
    return $fixtures;
}

function tournamentSwissStandings(array $players, array $fixtures, array $matches): array {
    $rows=[];
    foreach($players as $id) $rows[$id]=['id'=>$id,'played'=>0,'points'=>0,'diff'=>0,'byes'=>0];
    foreach($fixtures as $fixture) {
        $a=$fixture['a']; $b=$fixture['b'];
        if($b===null) {
            $rows[$a]['byes']++;
            $rows[$a]['points']+=3;
            continue;
        }
        $match=$matches[$fixture['match_id']]??null;
        if(!$match || $match['void']) continue;
        $diff=$match['scoreA']-$match['scoreB'];
        $rows[$a]['played']++;
        $rows[$b]['played']++;
        $rows[$a]['points']+=$diff>0?3:($diff===0?1:0);
        $rows[$b]['points']+=$diff<0?3:($diff===0?1:0);
        $rows[$a]['diff']+=$diff;
        $rows[$b]['diff']-=$diff;
    }
    usort($rows,fn($a,$b)=>$b['points']<=>$a['points'] ?: $b['diff']<=>$a['diff'] ?: strcmp($a['id'],$b['id']));
    $previous=null;
    foreach($rows as $index=>&$row) {
        $row['rank']=$previous && $row['points']===$previous['points'] && $row['diff']===$previous['diff']
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

function tournamentRoundState(array $fixtures, array $matches): array {
    $round=$fixtures ? $fixtures[array_key_last($fixtures)]['round'] : 0;
    $current=array_values(array_filter($fixtures,fn($f)=>$f['round']===$round));
    $ready=$round>0;
    $ties=[];
    foreach($current as $fixture) {
        if($fixture['b']===null) continue;
        $match=$matches[$fixture['match_id']]??null;
        if(!$match || $match['void']) $ready=false;
        elseif($match['scoreA']===$match['scoreB']) $ties[]=$fixture['id'];
    }
    return ['number'=>$round,'fixtures'=>$current,'ready'=>$ready,'ties'=>$ties];
}

function tournamentAdvance(array &$db, array &$league, array $in): void {
    if(leagueFormat($league)==='round_robin' || !$league['start']) fail('Il torneo non è in corso.',409);
    $fixtures=tournamentFixtures($db,$league['id']);
    $matches=array_column($db['matches'],null,'id');
    $current=tournamentRoundState($fixtures,$matches);
    $round=$current['number'];
    if(($in['round']??null)!==$round) fail('Il turno è cambiato. Ricarica la pagina.',409);
    if(!$current['ready']) fail('Conferma tutti i risultati del turno prima di proseguire.',409);

    if(leagueFormat($league)==='swiss') {
        $players=leaguePlayers($db,$league['id']);
        $next=$round<$league['round_limit']
            ? tournamentSwissRound($round+1,tournamentSwissStandings($players,$fixtures,$matches),$fixtures) : [];
    } else {
        $choices=$in['winners']??[];
        if(!is_array($choices) || count($choices)!==count($current['ties'])) fail('Indica chi passa per ogni incontro in parità.');
        $winners=[];
        foreach($current['fixtures'] as $fixture) {
            $a=$fixture['a']; $b=$fixture['b'];
            $match=$matches[$fixture['match_id']]??null;
            $winner=$a;
            if($b!==null && $match['scoreB']>$match['scoreA']) $winner=$b;
            if(in_array($fixture['id'],$current['ties'],true)) {
                $winner=$choices[$fixture['id']]??null;
                if(!in_array($winner,[$a,$b],true)) fail('Indica chi passa per ogni incontro in parità.');
            }
            $winners[$fixture['id']]=$winner;
        }
        foreach($db['league_fixtures'] as &$fixture) if(isset($winners[$fixture['id']])) $fixture['winner']=$winners[$fixture['id']];
        unset($fixture);
        $next=[];
        $qualifiers=array_values($winners);
        for($i=0;$i+1<count($qualifiers);$i+=2) {
            $next[]=tournamentFixture($round+1,intdiv($i,2),$qualifiers[$i],$qualifiers[$i+1]);
        }
    }
    if(!$next) {
        $league['finished']=$league['closed']=date(DATE_ATOM);
        return;
    }
    foreach($next as $fixture) $db['league_fixtures'][]=$fixture+['league_id'=>$league['id']];
}
