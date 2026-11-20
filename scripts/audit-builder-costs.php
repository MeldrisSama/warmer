<?php
declare(strict_types=1);
// Read-only: explicit source catalog, never deployment config or database.
require __DIR__.'/../Cangiolone.com/builder-model.php';
$path=$argv[1]??throw new RuntimeException('Specify catalog JSON.');
$raw=json_decode(file_get_contents($path),true,40,JSON_THROW_ON_ERROR);
$catalog=builderRestoreCatalogCosts($raw);$changes=[];$missing=[];$factions=[];$checked=0;
foreach($catalog['units'] as $i=>$unit){
    if($unit['points']!==$raw['units'][$i]['points']){
        $changes[]=['id'=>$unit['id'],'name'=>$unit['name'],'factionId'=>$unit['factionId'],'before'=>$raw['units'][$i]['points'],'after'=>$unit['points']];
        $factions[$unit['factionId']]=($factions[$unit['factionId']]??0)+1;
    }
    if(!$unit['points'])$missing[]=['id'=>$unit['id'],'name'=>$unit['name'],'factionId'=>$unit['factionId']];
    $tiers=[];foreach($unit['points'] as $p)$tiers[$p['models'].':'.$p['first'].':'.$p['last']]=$p;
    foreach($tiers as $p){
        $state=builderLoadoutCounts($unit['loadoutRecipe'],[],$p['models']);
        $entry=['models'=>$p['models'],'loadoutSelections'=>$state['selections']];
        $layouts=$unit['loadoutRecipe']['layouts']??[];
        if(array_filter($layouts,static fn($l)=>isset($l['prices'])))continue; // audited individually below
        foreach(array_unique([$p['first'],$p['last']]) as $ordinal){
            if(builderEntryBasePrice($unit,$entry,$ordinal)!==$p['points'])throw new RuntimeException('Wrong price: '.$unit['name']);
            $checked++;
        }
    }
    foreach($unit['loadoutRecipe']['layouts']??[] as $layout)foreach($layout['prices']??[] as $p){
        $entry=['models'=>array_sum($layout['counts']),'loadoutSelections'=>['_models'=>$layout['counts']]];
        foreach(array_unique([$p['first'],$p['last']]) as $ordinal){
            if(builderEntryBasePrice($unit,$entry,$ordinal)!==$p['points'])throw new RuntimeException('Wrong formation price: '.$unit['name']);
            $checked++;
        }
    }
}
$names=array_column($catalog['factions'],'name','id');
$report=['units'=>count($catalog['units']),'checkedPrices'=>$checked,'repairedUnits'=>count($changes),'factions'=>array_map(static fn($id,$count)=>['id'=>$id,'name'=>$names[$id]??$id,'units'=>$count],array_keys($factions),$factions),'missing'=>$missing,'changes'=>$changes];
if(isset($argv[2]))file_put_contents($argv[2],json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
unset($report['changes']);echo json_encode($report,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
