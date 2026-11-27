<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/league.php';

function ident(): string { static $id=0; return sprintf('%024x',++$id); }
function fail(string $reason, int $status=422): never { throw new RuntimeException($reason,$status); }
function check(bool $condition, string $reason): void { if(!$condition) throw new RuntimeException($reason); }
function rejects(callable $run, int $status): void {
    try { $run(); }
    catch(RuntimeException $error) {
        check($error->getCode()===$status,'Unexpected failure: '.$error->getMessage());
        return;
    }
    throw new RuntimeException('Expected rejection');
}

for($count=2;$count<=40;$count++) {
    $players=array_map(fn($index)=>'p'.$index,range(1,$count));
    $bracket=tournamentFirstRound('knockout',$players,[]);
    check(count($bracket)===intdiv($count+1,2),'Wrong first knockout round size');
    check(count(array_filter($bracket,fn($f)=>$f['b']===null))===$count%2,'Wrong number of initial byes');
    $seen=[];
    foreach($bracket as $fixture) {
        $seen[]=$fixture['a'];
        if($fixture['b']!==null) $seen[]=$fixture['b'];
    }
    sort($players);sort($seen);
    check($players===$seen,'Each player must appear exactly once');
}

$players=['a','b','c','d','e'];
rejects(fn()=>tournamentFirstRound('knockout',$players,['a','a']),422);
rejects(fn()=>tournamentFirstRound('knockout',$players,['outsider']),422);
rejects(fn()=>tournamentFirstRound('swiss',$players,['a','b']),422);
$bracket=tournamentFirstRound('knockout',$players,['e']);
$byes=array_column(array_filter($bracket,fn($fixture)=>$fixture['b']===null),'a');
check($byes===['e'],'Only the chosen player should receive a bye');
$league=['id'=>'knock','format'=>'knockout','start'=>'2026-11-25','closed'=>null,'paused'=>null,'finished'=>null];
$db=['league'=>[$league],'league_fixtures'=>array_map(fn($f)=>$f+['league_id'=>'knock'],$bracket),'matches'=>[]];
$active=&$db['league'][0];
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1]),409);
$played=array_key_first(array_filter($db['league_fixtures'],fn($f)=>$f['b']!==null));
$fixture=$db['league_fixtures'][$played];
$db['league_fixtures'][$played]['match_id']='tie';
$db['matches'][]=['id'=>'tie','void'=>false,'scoreA'=>55,'scoreB'=>55];
$db['league_fixtures'][1]['match_id']='second';
$db['matches'][]=['id'=>'second','void'=>false,'scoreA'=>60,'scoreB'=>40];
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1]),422);
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1,'winners'=>[$fixture['id']=>'outsider']]),422);
tournamentAdvance($db,$active,['round'=>1,'winners'=>[$fixture['id']=>$fixture['b']]]);
$semifinals=array_values(array_filter(tournamentFixtures($db,'knock'),fn($f)=>$f['round']===2));
check(count($semifinals)===2 && $semifinals[0]['b']===null && $semifinals[0]['a']!==$byes[0],'Three qualifiers require a single bye for a different player');
$qualified=array_merge(array_column($semifinals,'a'),array_column($semifinals,'b'));
check(in_array($fixture['b'],$qualified,true) && !in_array($fixture['a'],$qualified,true),'Tiebreak not used for advancement');
check($db['matches'][0]['scoreA']===55 && $db['matches'][0]['scoreB']===55,'Tiebreak must preserve the played score');
check(isset(leagueMatchLocks($db)['tie']),'The preceding round must be locked');
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1]),409);
for($round=2;$round<=3;$round++) {
    foreach($db['league_fixtures'] as &$f) if($f['round']===$round && $f['b']!==null) {
        $f['match_id']='match-'.$f['id'];
        $db['matches'][]=['id'=>$f['match_id'],'void'=>false,'scoreA'=>10,'scoreB'=>20];
    }
    unset($f);
    tournamentAdvance($db,$active,['round'=>$round]);
}
$final=array_values(array_filter(tournamentFixtures($db,'knock'),fn($f)=>$f['round']===3))[0];
check($active['finished']!==null && $active['closed']!==null && $final['winner']===$final['b'],'Final winner and closure must persist');

$draw=tournamentFirstRound('knockout_legs',['a','b','c'],['c']);
check(count($draw)===3 && $draw[0]['leg']===1 && $draw[1]['leg']===2 && $draw[1]['a']===$draw[0]['b'],'Two legs must reverse seats and share a slot');
check($draw[2]['b']===null && $draw[2]['leg']===1,'A bye does not have a return leg');
$legLeague=['id'=>'legs','format'=>'knockout_legs','start'=>'2026-11-25','closed'=>null,'paused'=>null,'finished'=>null];
$legDb=['league_fixtures'=>array_map(fn($f)=>$f+['league_id'=>'legs'],$draw),'matches'=>[['id'=>'out','void'=>false,'scoreA'=>60,'scoreB'=>50]]];
$legDb['league_fixtures'][0]['match_id']='out';
rejects(fn()=>tournamentAdvance($legDb,$legLeague,['round'=>1]),409);
$legDb['league_fixtures'][1]['match_id']='return';
$legDb['matches'][]=['id'=>'return','void'=>false,'scoreA'=>60,'scoreB'=>50];
rejects(fn()=>tournamentAdvance($legDb,$legLeague,['round'=>1]),422);
$legDb['matches'][1]['scoreA']=55;
$draw=tournamentFixtures($legDb,'legs');
$view=tournamentBracket($draw,array_column($legDb['matches'],null,'id'));
check($view[0]['series'][0]['total']===[110,105] && $view[1]['feeds']===[[0,1]],'Bracket totals and connections must match the draw');
tournamentAdvance($legDb,$legLeague,['round'=>1]);
check($legDb['league_fixtures'][0]['winner']==='a' && $legDb['league_fixtures'][1]['winner']==='a','Advance the aggregate winner, not the last result');

$fixtures=tournamentFirstRound('swiss',$players,['e']);
$swissByes=array_values(array_filter($fixtures,fn($f)=>$f['b']===null));
check(count($fixtures)===3 && array_column($swissByes,'a')===['e'],'The chosen Swiss bye must appear once');
$matches=[];
$pairs=[];
$rested=[];
for($round=1;$round<=3;$round++) {
    foreach($fixtures as &$f) if($f['round']===$round) {
        if($f['b']===null) {
            check(!isset($rested[$f['a']]),'A player rested twice while others had not rested');
            $rested[$f['a']]=true;
            continue;
        }
        $pair=[$f['a'],$f['b']];sort($pair);$key=implode('-',$pair);
        check(!isset($pairs[$key]),'Avoidable rematch');
        $pairs[$key]=true;
        $f['match_id']='r'.$f['id'];
        $matches[$f['match_id']]=['void'=>false,'scoreA'=>60,'scoreB'=>40];
    }
    unset($f);
    $standings=tournamentSwissStandings($players,$fixtures,$matches);
    $bye=array_column($standings,null,'id')['e'];
    if($round===1) check($bye['wins']===0 && $bye['draws']===0 && $bye['losses']===0 && $bye['diff']===0 && !isset($bye['points']),'Swiss byes do not affect the competitive record');
    if($round<3) array_push($fixtures,...tournamentSwissRound($round+1,$standings,$fixtures));
}
$ranked=tournamentSwissStandings(['a','b','c','d'],[
    ['a'=>'a','b'=>'b','match_id'=>'large'],['a'=>'c','b'=>'d','match_id'=>'small']
],[
    'large'=>['void'=>false,'scoreA'=>50,'scoreB'=>30],
    'small'=>['void'=>false,'scoreA'=>40,'scoreB'=>30]
]);
check(array_column($ranked,'id')===['a','c','d','b'],'Point differential must break a tie on the match record');

$bye=tournamentDraw('knockout',3,['p2','p4','p9'],['p9'=>1]);
check($bye[1]['b']===null && $bye[1]['a']==='p4','A former bye must give way to a player with fewer byes');

// Exhaustive search provides an independent oracle for small general graphs.
function maximumPairs(array $players, array $opponents): int {
    if(!$players) return 0;
    $first=array_shift($players);
    $best=maximumPairs($players,$opponents);
    foreach($players as $index=>$second) if(!isset($opponents[$first][$second])) {
        $remaining=$players;
        unset($remaining[$index]);
        $best=max($best,1+maximumPairs($remaining,$opponents));
    }
    return $best;
}
mt_srand(193);
for($size=2;$size<=10;$size++) {
    $players=array_map(fn($number)=>'p'.$number,range(1,$size));
    for($trial=0;$trial<32;$trial++) {
        $opponents=[];
        foreach($players as $index=>$a) foreach(array_slice($players,$index+1) as $b) {
            if(mt_rand(0,99)<55) $opponents[$a][$b]=$opponents[$b][$a]=true;
        }
        [$pairs,$unpaired]=tournamentMaximumUnplayed($players,$opponents);
        check(count($pairs)===maximumPairs($players,$opponents),'Must minimize rematches in non-bipartite history');
        $assigned=$unpaired;
        foreach($pairs as [$a,$b]) {
            check(!isset($opponents[$a][$b]),'Maximum matching contains a rematch');
            array_push($assigned,$a,$b);
        }
        sort($assigned); $expected=$players; sort($expected);
        check($assigned===$expected,'Maximum matching must assign each entrant exactly once');
    }
}
echo "Tournament model passed\n";
