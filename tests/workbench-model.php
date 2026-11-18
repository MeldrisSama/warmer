<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
function check(bool $condition,string $why): void {if (!$condition) throw new RuntimeException($why);}
function rejected(callable $call): void {try {$call();} catch (BuilderInputError $e) {return;} throw new RuntimeException('Invalid input accepted');}
$raw=json_decode(file_get_contents(__DIR__.'/workbench-fixture.json'),true,40,JSON_THROW_ON_ERROR);
$catalog=builderNormalizeCatalog($raw);
function entry(string $id,string $unit,int $models=1,?string $attached=null): array {return ['entryId'=>$id,'unitId'=>$unit,'models'=>$models,'manualPoints'=>null,'weaponCounts'=>[],'enhancementIds'=>[],'attachedTo'=>$attached,'warlord'=>$unit==='leader','notes'=>''];}
$army=['name'=>'Test','edition'=>'11','catalogId'=>'catalog_test','factionId'=>'test','limit'=>2000,'dpLimit'=>3,'detachmentIds'=>['first'],'disposition'=>'Take and Hold','entries'=>[entry('a','squad',5),entry('b','squad',5),entry('c','squad',5),entry('d','leader',1,'a'),entry('e','support',1,'a')]];
$army['entries'][0]['weaponCounts']=['1'=>5];
$r=builderValidateArmy($catalog,$army);
check($r['points']===340,'Tiered totals or attachment double counting');
check($r['entries'][3]['attachedTo']==='a','Attachment lost');
$invalid=$army;$invalid['detachmentIds']=['first','second'];rejected(fn()=>builderValidateArmy($catalog,$invalid));
$invalid=$army;$invalid['disposition']='Purge the Foe';rejected(fn()=>builderValidateArmy($catalog,$invalid));
$invalid=$army;$invalid['entries'][0]['attachedTo']='d';rejected(fn()=>builderValidateArmy($catalog,$invalid));
$invalid=$army;$invalid['entries'][1]['entryId']='a';rejected(fn()=>builderValidateArmy($catalog,$invalid));
$invalid=$army;$invalid['entries'][0]['weaponCounts']=['unknown'=>5];rejected(fn()=>builderValidateArmy($catalog,$invalid));
$invalid=$raw;$invalid['units'][0]['weapons'][0]['line']='1" onclick="x';rejected(fn()=>builderNormalizeCatalog($invalid));
$manual=$army;$manual['entries'][0]['models']=7;
check(str_contains(implode(' ',builderValidateArmy($catalog,$manual)['issues']),'costo'),'Unknown cost silently counted');
$manual['entries'][0]['manualPoints']=120;check(builderValidateArmy($catalog,$manual)['points']===380,'Manual price ignored');
$pdo=new PDO('sqlite::memory:');$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);builderSchema($pdo,'sqlite');
$me=['id'=>'owner','admin'=>true];$import=builderHandle($pdo,'builderImport',$me,['catalog'=>$raw]);$army['catalogId']=$import['catalogId'];
$saved=builderHandle($pdo,'builderSave',$me,$army);check($saved['army']['entries'][4]['attachedTo']==='a','Save drops support');
$response=builderHandle($pdo,'builderArmies',$me);
check(is_object($response['armies'][0]['entries'][1]['weaponCounts']),'Empty weapon map became an array');
$read=json_decode(json_encode($response,JSON_THROW_ON_ERROR),true,40,JSON_THROW_ON_ERROR)['armies'][0];check($read['dpLimit']===3 && $read['detachmentIds']===['first'] && $read['disposition']==='Take and Hold','Configuration roundtrip');
check($read['entries'][0]['weaponCounts']['1']===5,'Weapons roundtrip');
$other=['id'=>'other','admin'=>false];$read['name']='Hijacked';rejected(fn()=>builderHandle($pdo,'builderSave',$other,$read));
echo "Workbench model passed\n";
