<?php
declare(strict_types=1);

const LEAGUE_TOURNAMENT_FORMATS=['knockout','knockout_legs','swiss'];
const LEAGUE_FORMATS=['round_robin','round_robin_legs',...LEAGUE_TOURNAMENT_FORMATS];

function leagueFormat(array $league): string {
    return $league['format']??'round_robin';
}

function leagueIsTournament(array $league): bool {
    return in_array(leagueFormat($league),LEAGUE_TOURNAMENT_FORMATS,true);
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

function tournamentDraw(string $format, int $round, array $players, array $byeHistory=[]): array {
    if(count($players)%2 && $byeHistory) {
        $preferred=$round%2===0 ? $players : array_reverse($players);
        $bye=$preferred[0];
        foreach($preferred as $player) {
            if(($byeHistory[$player]??0)<($byeHistory[$bye]??0)) $bye=$player;
        }
        $players=array_values(array_diff($players,[$bye]));
        if($round%2===0) array_unshift($players,$bye);
        else $players[]=$bye;
    }
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
    $withdrawn=tournamentWithdrawals($db,$leagueId);
    $swiss=leagueFormat(array_column($db['league']??[],null,'id')[$leagueId]??[])==='swiss';
    $matches=array_column($db['matches']??[],null,'id');
    $decisions=[]; $projected=[];
    foreach($fixtures as $fixture) {
        $round=$fixture['round']; $slot=$fixture['slot'];
        $a=$fixture['a']; $b=$fixture['b'];
        $outA=isset($withdrawn[$a]) && $withdrawn[$a]<=$round;
        $outB=$b!==null && isset($withdrawn[$b]) && $withdrawn[$b]<=$round;
        if($fixture['leg']===1) {
            $match=$matches[$fixture['match_id']]??null;
            $walkover=$fixture['walkover']??null;
            $keepSwissOutcome=$swiss && ($walkover!==null || ($match && !$match['void']));
            if(($outA || $outB) && !$keepSwissOutcome) {
                $decisions[$round][$slot]=['kind'=>'withdrawal','winner'=>$outA ? ($outB ? null : $b) : $a];
            } elseif($walkover!==null) {
                $decisions[$round][$slot]=['kind'=>'walkover','winner'=>$walkover];
            }
        }
        $projected[]=$fixture+['withdrawn'=>[$outA,$outB],'decision'=>$decisions[$round][$slot]??null];
    }
    return $projected;
}

function tournamentWithdrawals(array $db, string $leagueId): array {
    $players=[];
    foreach($db['league_members']??[] as $member) {
        if($member['league_id']===$leagueId && !empty($member['withdrawn_round'])) $players[$member['player']]=$member['withdrawn_round'];
    }
    return $players;
}

function tournamentSignupRevision(array $players): string {
    sort($players,SORT_STRING);
    return hash('sha256',implode(':',$players));
}

function tournamentSwissStandings(array $players, array $fixtures, array $matches): array {
    $rows=[];
    foreach($players as $id) $rows[$id]=['id'=>$id,'wins'=>0,'draws'=>0,'losses'=>0,'diff'=>0,'byes'=>0];
    foreach($fixtures as $fixture) {
        $a=$fixture['a']; $b=$fixture['b'];
        $decision=$fixture['decision']??null;
        if($decision && $b!==null) {
            $winner=$decision['winner'];
            if($winner!==null) {
                $rows[$winner]['wins']++;
                $rows[$winner===$a?$b:$a]['losses']++;
            }
            continue;
        }
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

function tournamentSwissUnplayedPairs(array $players, array $opponents, int &$attempts, ?callable $accept=null, array $pairs=[]): ?array {
    if(!$players) return !$accept || $accept($pairs) ? $pairs : null;
    if(--$attempts<0) return null;
    $first=array_shift($players);
    foreach($players as $index=>$other) {
        if(isset($opponents[$first][$other])) continue;
        $remaining=$players;
        unset($remaining[$index]);
        $tail=tournamentSwissUnplayedPairs($remaining,$opponents,$attempts,$accept,[...$pairs,[$first,$other]]);
        if($tail!==null) return $tail;
        if($attempts<0) break;
    }
    return null;
}

/** Maximum cardinality matching (Edmonds' blossom algorithm) on pairs that have not met. */
function tournamentMaximumUnplayed(array $players, array $opponents): array {
    $players=array_values($players);
    $n=count($players);
    $edges=$mate=array_fill(0,$n,-1);
    foreach($players as $i=>$a) {
        $edges[$i]=[];
        foreach($players as $j=>$b) if($i!==$j && !isset($opponents[$a][$b])) $edges[$i][]=$j;
    }
    for($root=0;$root<$n;$root++) {
        if($mate[$root]>=0) continue;
        $parents=array_fill(0,$n,-1);
        $base=range(0,$n-1);
        $used=array_fill(0,$n,false);
        $used[$root]=true;
        $queue=[$root];
        for($head=0;$head<count($queue);$head++) {
            $v=$queue[$head];
            foreach($edges[$v] as $u) {
                if($base[$v]===$base[$u] || $mate[$v]===$u) continue;
                if($u===$root || ($mate[$u]>=0 && $parents[$mate[$u]]>=0)) {
                    // Contract the two paths to their common base, then continue the search.
                    $path=[]; $x=$v; $y=$u;
                    while(true) {
                        $x=$base[$x]; $path[$x]=true;
                        if($mate[$x]<0) break;
                        $x=$parents[$mate[$x]];
                    }
                    while(!isset($path[$base[$y]])) $y=$parents[$mate[$base[$y]]];
                    $common=$base[$y];
                    $contracted=[];
                    foreach([[$v,$u],[$u,$v]] as [$x,$child]) {
                        while($base[$x]!==$common) {
                            $paired=$mate[$x];
                            $contracted[$base[$x]]=$contracted[$base[$paired]]=true;
                            $parents[$x]=$child;
                            $child=$paired;
                            $x=$parents[$paired];
                        }
                    }
                    foreach($base as $i=>$group) if(isset($contracted[$group])) {
                        $base[$i]=$common;
                        if(!$used[$i]) {
                            $used[$i]=true;
                            $queue[]=$i;
                        }
                    }
                } elseif($parents[$u]<0) {
                    $parents[$u]=$v;
                    if($mate[$u]<0) {
                        while($u>=0) {
                            $p=$parents[$u]; $next=$mate[$p];
                            $mate[$u]=$p; $mate[$p]=$u;
                            $u=$next;
                        }
                        break 2;
                    }
                    $used[$mate[$u]]=true;
                    $queue[]=$mate[$u];
                }
            }
        }
    }
    $pairs=$unpaired=[];
    foreach($mate as $i=>$j) {
        if($j<0) $unpaired[]=$players[$i];
        elseif($j>$i) $pairs[]=[$players[$i],$players[$j]];
    }
    return [$pairs,$unpaired];
}

function tournamentSwissByeCandidates(array $standings): array {
    if(count($standings)%2===0) return [null];
    $fewest=min(array_column($standings,'byes'));
    return array_column(array_filter(array_reverse($standings),fn($row)=>$row['byes']===$fewest),'id');
}

function tournamentSwissRound(int $round, array $standings, array $fixtures, ?int $limit=null): array {
    $players=array_column($standings,'id');
    $byeCandidates=tournamentSwissByeCandidates($standings);
    $opponents=[];
    foreach($fixtures as $fixture) if($fixture['b']!==null) {
        $opponents[$fixture['a']][$fixture['b']]=true;
        $opponents[$fixture['b']][$fixture['a']]=true;
    }
    $pairs=null; $bye=$byeCandidates[0];
    $attempts=2000;
    // Prefer nearby ranks, and for small fields avoid draws that immediately force a rematch.
    if($round<($limit??$round+1) && count($players)<=20) foreach($byeCandidates as $candidate) {
        if($attempts<=0) break;
        $nextStandings=$standings;
        foreach($nextStandings as &$row) if($row['id']===$candidate) $row['byes']++;
        unset($row);
        $nextByes=tournamentSwissByeCandidates($nextStandings);
        $accept=function(array $pairs) use($players,$opponents,$nextByes): bool {
            foreach($pairs as [$a,$b]) $opponents[$a][$b]=$opponents[$b][$a]=true;
            foreach($nextByes as $nextBye) {
                [, $unpaired]=tournamentMaximumUnplayed(array_diff($players,[$nextBye]),$opponents);
                if(!$unpaired) return true;
            }
            return false;
        };
        $pairs=tournamentSwissUnplayedPairs(array_diff($players,[$candidate]),$opponents,$attempts,$accept);
        if($pairs!==null) { $bye=$candidate; break; }
    }
    $attempts=20000;
    $fewest=count($players)+1;
    if($pairs===null) foreach($byeCandidates as $candidate) {
        if($fewest===0) break;
        $pairable=array_diff($players,[$candidate]);
        $preferred=$attempts>0 ? tournamentSwissUnplayedPairs($pairable,$opponents,$attempts) : null;
        [$matched,$unpaired]=$preferred!==null ? [$preferred,[]] : tournamentMaximumUnplayed($pairable,$opponents);
        if(count($unpaired)<$fewest) {
            $bye=$candidate;
            $fewest=count($unpaired);
            $pairs=[...$matched,...array_chunk($unpaired,2)];
        }
    }
    if($bye!==null) $pairs[]=[$bye,null];
    return array_map(fn($slot,$pair)=>tournamentFixture($round,$slot,...$pair),array_keys($pairs),$pairs);
}

function tournamentSwissRematches(array $fixtures): array {
    $opponents=[]; $rematches=[];
    foreach($fixtures as $fixture) if($fixture['b']!==null) {
        $a=$fixture['a']; $b=$fixture['b'];
        if(isset($opponents[$a][$b])) $rematches[]=$fixture['id'];
        $opponents[$a][$b]=$opponents[$b][$a]=true;
    }
    return $rematches;
}

function tournamentActiveStandings(array $standings, array $withdrawn): array {
    return array_values(array_filter($standings,fn($row)=>!isset($withdrawn[$row['id']])));
}

function tournamentSeries(array $fixtures, array $matches): array {
    $series=[];
    foreach($fixtures as $fixture) {
        $slot=$fixture['slot'];
        $leg=$fixture['leg'];
        if($leg===1) $series[$slot]=['id'=>$fixture['id'],'slot'=>$slot,'a'=>$fixture['a'],'b'=>$fixture['b'],
            'winner'=>$fixture['winner'],'decision'=>$fixture['decision']??null,'scores'=>[],'ids'=>[],'ready'=>true];
        $card=&$series[$slot];
        $card['ids'][]=$fixture['id'];
        if($fixture['b']!==null) {
            $result=$matches[$fixture['match_id']]??null;
            $valid=$result && !$result['void'];
            if(!$valid && !$card['decision']) $card['ready']=false;
            $card['scores'][]=$valid ? ($leg===1 ? [$result['scoreA'],$result['scoreB']] : [$result['scoreB'],$result['scoreA']]) : null;
        }
        unset($card);
    }
    foreach($series as &$card) {
        $points=$card['scores'];
        $card['total']=$points && !in_array(null,$points,true)
            ? [array_sum(array_column($points,0)),array_sum(array_column($points,1))] : null;
    }
    unset($card);
    return array_values($series);
}

function tournamentBracket(array $fixtures, array $matches, bool $finished=false): array {
    if(!$fixtures) return [];
    $grouped=[];
    foreach($fixtures as $fixture) $grouped[$fixture['round']][]=$fixture;
    $rounds=[['round'=>1,'series'=>tournamentSeries($grouped[1],$matches),'feeds'=>[]]];
    $lastRound=max(array_keys($grouped));
    for($round=2,$previous=count($rounds[0]['series']);$round<=$lastRound || (!$finished && $previous>1);$round++) {
        $prior=$rounds[$round-2];
        $previous=count($prior['series'] ?: $prior['feeds']);
        $series=isset($grouped[$round]) ? tournamentSeries($grouped[$round],$matches) : [];
        if($series) {
            $slots=array_column($prior['series'],'slot','winner');
            $feeds=array_map(fn($card)=>array_map(fn($id)=>$slots[$id],array_filter([$card['a'],$card['b']])), $series);
        } else {
            if($previous<=1) break;
            $feeds=tournamentPairSlots($previous,$round);
        }
        $rounds[]=['round'=>$round,'series'=>$series,'feeds'=>$feeds];
        $previous=count($feeds);
    }
    return $rounds;
}

function tournamentRoundState(array $fixtures, array $matches, bool $knockout=false): array {
    $round=$fixtures ? $fixtures[array_key_last($fixtures)]['round'] : 0;
    $current=array_values(array_filter($fixtures,fn($f)=>$f['round']===$round));
    $open=0; $resolved=0; $revision=[];
    foreach($current as $fixture) {
        $match=$matches[$fixture['match_id']]??null;
        $decision=$fixture['decision']??null;
        $revision[]=[$fixture['id'],$fixture['match_id'],$match['void']??null,$fixture['pending'],$decision,$fixture['withdrawn']??null];
        if($fixture['b']===null) continue;
        if($decision || ($match && !$match['void'])) $resolved++;
        else $open++;
    }
    $series=$knockout ? tournamentSeries($current,$matches) : [];
    $ties=array_column(array_filter($series,fn($card)=>!$card['decision'] && $card['total'] && $card['total'][0]===$card['total'][1]),'id');
    return ['number'=>$round,'series'=>$series,'ready'=>$round>0 && $open===0,'ties'=>$ties,
        'open'=>$open,'resolved'=>$resolved,
        'revision'=>hash('sha256',json_encode($revision,JSON_THROW_ON_ERROR))];
}

function tournamentRecoverFixture(array &$db, array &$fixture, array $projected, string $action, array $in, string $admin): void {
    if(($projected['decision']['kind']??null)==='withdrawal') fail('L’esito è determinato da un ritiro.',409);
    if($action==='leagueResetResult') {
        if($projected['decision']) fail('Annulla prima la decisione a tavolino.',409);
        leagueResetFixtureResult($db,$fixture,$admin);
        return;
    }
    if($fixture['leg']!==1) fail('Gestisci l’esito dalla prima partita dell’incontro.',409);
    if($action==='leagueUndoWalkover') {
        if(!$projected['decision']) fail('L’incontro non ha un esito a tavolino.',409);
        $fixture['walkover']=null;
        return;
    }
    if($projected['decision']) fail('L’esito a tavolino è già stato registrato.',409);
    $winner=$in['winner']??null;
    if(!in_array($winner,[$fixture['a'],$fixture['b']],true)) fail('Scegli il giocatore a cui assegnare la vittoria.');
    $matches=array_column($db['matches'],null,'id');
    $legs=[];
    foreach($db['league_fixtures'] as $index=>$leg) {
        if($leg['league_id']===$fixture['league_id'] && $leg['round']===$fixture['round'] && $leg['slot']===$fixture['slot']) $legs[]=$index;
    }
    $complete=true;
    foreach($legs as $index) {
        $match=$matches[$db['league_fixtures'][$index]['match_id']]??null;
        if(!$match || $match['void']) $complete=false;
    }
    if($complete) fail('Tutti i risultati sono già confermati. Riapri il risultato da correggere.',409);
    foreach($legs as $index) $db['league_fixtures'][$index]['pending']=null;
    $fixture['walkover']=$winner;
}

function tournamentAdvance(array &$db, array &$league, array $in): void {
    if(!leagueIsTournament($league) || !$league['start']) fail('Il torneo non è in corso.',409);
    $fixtures=tournamentFixtures($db,$league['id']);
    $matches=array_column($db['matches'],null,'id');
    $format=leagueFormat($league);
    $current=tournamentRoundState($fixtures,$matches,$format!=='swiss');
    $round=$current['number'];
    if(($in['round']??null)!==$round) fail('Il turno è cambiato. Ricarica la pagina.',409);
    if(isset($in['revision']) && $in['revision']!==$current['revision']) fail('Gli incontri del turno sono cambiati. Controlla i risultati aggiornati.',409);
    if(!$current['ready']) fail('Conferma tutti i risultati del turno prima di proseguire.',409);

    if($format==='swiss') {
        $players=leaguePlayers($db,$league['id']);
        $withdrawn=tournamentWithdrawals($db,$league['id']);
        $standings=tournamentActiveStandings(tournamentSwissStandings($players,$fixtures,$matches),$withdrawn);
        $next=$round<$league['round_limit'] && count($standings)>1
            ? tournamentSwissRound($round+1,$standings,$fixtures,$league['round_limit']) : [];
    } else {
        $choices=$in['winners']??[];
        if(!is_array($choices) || count($choices)!==count($current['ties'])) fail('Indica chi passa per ogni incontro in parità.');
        $winners=[];
        $qualifiers=[];
        foreach($current['series'] as $card) {
            $a=$card['a']; $b=$card['b'];
            $winner=$card['decision'] ? $card['decision']['winner'] : $a;
            if(!$card['decision'] && $b!==null && $card['total'][1]>$card['total'][0]) $winner=$b;
            if(in_array($card['id'],$current['ties'],true)) {
                $winner=$choices[$card['id']]??null;
                if(!in_array($winner,[$a,$b],true)) fail('Indica chi passa per ogni incontro in parità.');
            }
            foreach($card['ids'] as $id) $winners[$id]=$winner;
            if($winner!==null) $qualifiers[]=$winner;
        }
        foreach($db['league_fixtures'] as &$fixture) if(array_key_exists($fixture['id'],$winners)) $fixture['winner']=$winners[$fixture['id']];
        unset($fixture);
        $byes=[];
        foreach($fixtures as $f) if($f['b']===null) $byes[$f['a']]=($byes[$f['a']]??0)+1;
        $next=count($qualifiers)>1 ? tournamentDraw($format,$round+1,$qualifiers,$byes) : [];
    }
    if(!$next) {
        $league['finished']=$league['closed']=date(DATE_ATOM);
        return;
    }
    foreach($next as $fixture) $db['league_fixtures'][]=$fixture+['league_id'=>$league['id']];
}
