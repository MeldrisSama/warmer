<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
$path=$argv[1]??throw new RuntimeException('Specify catalog path.');
$raw=json_decode(file_get_contents($path),true,40,JSON_THROW_ON_ERROR);$catalog=builderNormalizeCatalog($raw);
$units=array_column($catalog['units'],null,'id');$factions=array_column($catalog['factions'],null,'id');
function checkCatalog(bool $ok,string $message): void {if (!$ok)throw new RuntimeException($message);}
$recipes=0;$effects=0;$grants=0;$sizes=0;
foreach ($units as $unit) {
    $effects+=count($unit['effects']??[]);
    if (empty($unit['loadoutRecipe']['groups']))continue;$recipes++;
    foreach (array_unique(array_column($unit['points'],'models')) as $models) {
        $result=builderLoadoutCounts($unit['loadoutRecipe'],[],$models);$sizes++;
        foreach ($result['weaponCounts'] as $quantity)checkCatalog($quantity>=0&&$quantity<=1000,'Bad quantity: '.$unit['name']);
    }
}
foreach ($factions as $faction) foreach ($faction['allies'] as $grant) {checkCatalog(count($grant['unitIds'])>0,'Empty ally grant');foreach($grant['unitIds'] as $id)checkCatalog(isset($units[$id]),'Unknown ally ID');$grants++;}
$dark=$factions['sm_dark_angels'];$support=array_values(array_filter($dark['detachments'],fn($d)=>$d['name']==='Deathwatch Support'))[0]??null;
checkCatalog($support!==null,'Deathwatch Support missing for Dark Angels');
checkCatalog(count(array_filter(builderActiveAllyRules($dark,[$support['id']]),fn($r)=>$r['id']==='deathwatch_support'))===1,'DW not unlocked');
checkCatalog(count(array_filter(builderActiveAllyRules($dark,[]),fn($r)=>$r['id']==='deathwatch_support'))===0,'DW available without detachment');
foreach (['ts'=>'changehost','dg'=>'tallyband','ec'=>'carnival','we'=>'daemonkin','gc'=>'brood_brothers','qi'=>'forgepact','cd'=>'shadow_legion','qt'=>'thralls','ae'=>'ynnari','dru'=>'reapers'] as $fid=>$grantId)checkCatalog(count(array_filter($factions[$fid]['allies'],fn($r)=>$r['id']===$grantId))===1,'Missing special allies '.$fid);
foreach (['ts'=>'Scintillating Legions','dg'=>'Plague Legions','ec'=>'Legions of Excess','we'=>'Blood Legions'] as $fid=>$keyword)foreach ($factions[$fid]['unitIds'] as $id)checkCatalog(!str_contains($units[$id]['keywords'],$keyword),'Daemon legion leaked into native catalog');
$terminator=array_values(array_filter($units,fn($u)=>$u['name']==='Terminator Squad'))[0];$recipe=$terminator['loadoutRecipe'];$state=builderLoadoutCounts($recipe,[],5);
$group=array_values(array_filter($recipe['groups'],fn($g)=>str_starts_with($g['name'],'Terminator · Power Fist')))[0];$choice=array_values(array_filter($group['choices'],fn($c)=>str_contains($c['name'],'Chainfist')))[0];
$state['selections'][$group['id']]['base']--;$state['selections'][$group['id']][$choice['id']]=1;$changed=builderLoadoutCounts($recipe,$state['selections'],5);
$names=array_column($terminator['weapons'],'name','line');foreach ($changed['weaponCounts'] as $line=>$count)if(str_starts_with($names[$line],'Chainfist'))checkCatalog($count===1,'Chainfist modes not linked');
$deep=array_values(array_filter($terminator['abilities'],fn($a)=>$a['name']==='Deep Strike'))[0];$texts=array_column($catalog['texts'],'description','id');$deepText=$deep['description']??$texts[$deep['descriptionRef']];
checkCatalog(strlen($deepText)>100&&!str_contains($deepText,'DEEP STRIKE24.09'),'Deep Strike not resolved');
if (!empty($catalog['coreRules'])) {
    $core=array_column($catalog['coreRules'],null,'name');
    checkCatalog(count($core)===count($catalog['coreRules']),'Duplicate core rule names');
    foreach (['LEADER','SUPPORT','CLEAVE','ANTI','LETHAL HITS','SUSTAINED HITS','DEEP STRIKE'] as $name)checkCatalog(strlen($core[$name]['description']??'')>50,'Missing core rule '.$name);
    checkCatalog(($core['LEADER']['reference']??'')==='24.22','Wrong Leader reference');
    foreach ($core as $rule)checkCatalog(!str_contains($rule['description'],'ShowFluff')&&!str_contains($rule['name'],'24.'),'Raw heading or lore markup in core library');
}
echo json_encode(['units'=>count($units),'recipes'=>$recipes,'testedSizes'=>$sizes,'abilityEffects'=>$effects,'allyGrants'=>$grants,'coreRules'=>count($catalog['coreRules']??[]),'peakMiB'=>round(memory_get_peak_usage(true)/1048576,1)],JSON_THROW_ON_ERROR)."\n";
