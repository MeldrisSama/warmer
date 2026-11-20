<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
require __DIR__.'/../Cangiolone.com/league-roster.php';
$catalog=json_decode(file_get_contents($argv[1]),true,40,JSON_THROW_ON_ERROR);$out=[];
foreach($catalog['units'] as $unit) {
    if($unit['name']!=='Defiler')continue;
    $options=leagueRosterOptions($unit,1);$paid=[];
    foreach($options as $option)if(in_array($option['name'],['Hades lascannon','Heavy reaper autocannon'],true))$paid[$option['id']]=1;
    if(count($paid)!==2)throw new RuntimeException('Defiler paid options missing: '.$unit['id']);
    $entry=['entryId'=>'defiler','unitId'=>$unit['id'],'models'=>1,'enhancementIds'=>[],
        'loadoutSelections'=>builderLoadoutCounts($unit['loadoutRecipe'],[],1)['selections']];
    $reserved=leagueRosterEntry($unit,$entry,1,$paid);
    if($reserved['equipmentPoints']!==15)throw new RuntimeException('Defiler must reserve 15 points, not 30');
    $out[]=['id'=>$unit['id'],'base'=>$reserved['basePoints'],'extra'=>$reserved['equipmentPoints'],'total'=>$reserved['points']];
}
if(!$out)throw new RuntimeException('No Defiler in supplied catalog');
echo json_encode($out,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);
