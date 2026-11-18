<?php
declare(strict_types=1);
// Read-only audit; the source config and application database are never loaded.
require __DIR__.'/../Cangiolone.com/builder-model.php';
$catalog=json_decode(file_get_contents($argv[1]??throw new RuntimeException('Specify catalog JSON.')),true,40,JSON_THROW_ON_ERROR);
$texts=array_column($catalog['texts'],'description','id');$description=static fn($r)=>($r['description']??'')?:($texts[$r['descriptionRef']??'']??'');
$missing=[];$without=[];$invalid=[];$counts=['units'=>0,'guided'=>0,'allOptionRows'=>0,'partial'=>0,'missing'=>0];
foreach($catalog['units'] as $unit){
    $counts['units']++;$recipe=builderCompileLoadout($unit,$description);
    if(!$recipe){$counts['missing']++;$without[]=['id'=>$unit['id'],'name'=>$unit['name'],'composition'=>array_map($description,$unit['composition']),'loadout'=>$unit['loadout']];continue;}
    foreach(array_unique(array_column($unit['points']??[],'models')) as $models)try{builderLoadoutCounts($recipe,[],$models);}catch(BuilderInputError $e){$invalid[]=['id'=>$unit['id'],'name'=>$unit['name'],'models'=>$models,'error'=>$e->getMessage()];}
    $counts['guided']++;$complete=$recipe['optionsCovered']===$recipe['optionsTotal'];$counts[$complete?'allOptionRows':'partial']++;
    if($complete)continue;
    foreach($unit['options'] as $index=>$option){if(!in_array($index,$recipe['uncoveredOptions'],true))continue;$missing[]=['unit'=>$unit['id'],'name'=>$unit['name'],'index'=>$index,'text'=>$description($option)];}
}
$report=['counts'=>$counts,'missingOptions'=>$missing,'withoutRecipes'=>$without,'invalidDefaults'=>$invalid];
if(isset($argv[2]))file_put_contents($argv[2],json_encode($report,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
echo json_encode($counts,JSON_THROW_ON_ERROR)."\n";
foreach($invalid as $row)echo 'INVALID DEFAULT | '.$row['name'].' | '.$row['models'].' | '.$row['error']."\n";
$families=[];foreach($missing as $row){$prefix=preg_replace('/\d+/','#',implode(' ',array_slice(preg_split('/\s+/',$row['text']),0,7)));$families[$prefix]??=['count'=>0,'example'=>$row['text']];$families[$prefix]['count']++;}
uasort($families,static fn($a,$b)=>$b['count']<=>$a['count']);foreach(array_slice($families,0,18,true) as $prefix=>$family)echo $family['count'].' | '.$prefix.' | '.substr(str_replace("\n",' ',$family['example']),0,230)."\n";
