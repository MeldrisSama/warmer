<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
function checkParameter(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
$base=['version'=>'2026-11-12 23:45:38 · test','units'=>[['id'=>'000000242','abilities'=>[['name'=>'Deadly Demise','description'=>'Generic X rule']]]]];
$restored=builderRestoreRuleParameters($base);
checkParameter($restored['units'][0]['abilities'][0]['parameter']==='D3','Land Speeder value lost');
checkParameter(!isset($base['units'][0]['abilities'][0]['parameter']),'Input mutated');
checkParameter(builderRestoreRuleParameters($restored)===$restored,'Not idempotent');
$explicit=$base;$explicit['units'][0]['abilities'][0]['parameter']='D6';checkParameter(builderRestoreRuleParameters($explicit)===$explicit,'Explicit value replaced');
$future=$base;$future['version']='2027-01-01';checkParameter(builderRestoreRuleParameters($future)===$future,'Other snapshot changed');
$unknown=$base;$unknown['units'][0]['id']='unknown';checkParameter(builderRestoreRuleParameters($unknown)===$unknown,'Unknown unit guessed');
$path=getenv('BUILDER_CATALOG_PATH');
if($path&&is_file($path)){
    $catalog=json_decode(file_get_contents($path),true,40,JSON_THROW_ON_ERROR);$catalog=builderRestoreRuleParameters($catalog);
    $count=0;foreach($catalog['units'] as $u)foreach($u['abilities'] as $r)if(isset($r['parameter']))$count++;
    checkParameter($count===908,'Real catalog parameters missing, including Titan aliases');
    $unit=array_values(array_filter($catalog['units'],static fn($u)=>$u['name']==='Land Speeder Vengeance'))[0];
    checkParameter($unit['abilities'][0]['parameter']==='D3','Real unit parameter missing');
    echo json_encode(['count'=>$count,'unit'=>$unit],JSON_THROW_ON_ERROR);exit;
}
echo json_encode(['unit'=>$restored['units'][0]],JSON_THROW_ON_ERROR);
