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
    $places=tournamentBracketSize($count);
    check(count($bracket)===intdiv($places,2),'Wrong first knockout round size');
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
$bracket=tournamentFirstRound('knockout',$players,['c','e']);
$byes=array_column(array_filter($bracket,fn($fixture)=>$fixture['b']===null),'a');
check(count($byes)===3 && in_array('c',$byes,true) && in_array('e',$byes,true),'Chosen and drawn byes must all be assigned');
$league=['id'=>'knock','format'=>'knockout','start'=>'2026-11-25','closed'=>null,'paused'=>null,'finished'=>null];
$db=['league'=>[$league],'league_fixtures'=>array_map(fn($f)=>$f+['league_id'=>'knock'],$bracket),'matches'=>[]];
$active=&$db['league'][0];
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1]),409);
$played=array_key_first(array_filter($db['league_fixtures'],fn($f)=>$f['b']!==null));
$fixture=$db['league_fixtures'][$played];
$db['league_fixtures'][$played]['match_id']='tie';
$db['matches'][]=['id'=>'tie','void'=>false,'scoreA'=>55,'scoreB'=>55];
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1]),422);
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1,'winners'=>[$fixture['id']=>'outsider']]),422);
tournamentAdvance($db,$active,['round'=>1,'winners'=>[$fixture['id']=>$fixture['b']]]);
$semifinals=array_values(array_filter(tournamentFixtures($db,'knock'),fn($f)=>$f['round']===2));
check(count($semifinals)===2,'Semifinals missing');
$qualified=array_merge(array_column($semifinals,'a'),array_column($semifinals,'b'));
check(in_array($fixture['b'],$qualified,true) && !in_array($fixture['a'],$qualified,true),'Tiebreak not used for advancement');
check($db['matches'][0]['scoreA']===55 && $db['matches'][0]['scoreB']===55,'Tiebreak must preserve the played score');
check(isset(leagueMatchLocks($db)['tie']),'The preceding round must be locked');
rejects(fn()=>tournamentAdvance($db,$active,['round'=>1]),409);
for($round=2;$round<=3;$round++) {
    foreach($db['league_fixtures'] as &$f) if($f['round']===$round) {
        $f['match_id']='match-'.$f['id'];
        $db['matches'][]=['id'=>$f['match_id'],'void'=>false,'scoreA'=>10,'scoreB'=>20];
    }
    unset($f);
    tournamentAdvance($db,$active,['round'=>$round]);
}
$final=array_values(array_filter(tournamentFixtures($db,'knock'),fn($f)=>$f['round']===3))[0];
check($active['finished']!==null && $active['closed']!==null && $final['winner']===$final['b'],'Final winner and closure must persist');

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
    if($round===1) check($bye['points']===3 && $bye['played']===0 && $bye['diff']===0,'Swiss bye affects only tournament points');
    if($round<3) array_push($fixtures,...tournamentSwissRound($round+1,$standings,$fixtures));
}
echo "Tournament model passed\n";
