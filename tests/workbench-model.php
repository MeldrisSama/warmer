<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
function check(bool $condition,string $why): void {if (!$condition) throw new RuntimeException($why);}
function rejected(callable $call): void {try {$call();} catch (BuilderInputError $e) {return;} throw new RuntimeException('Invalid input accepted');}
function clientArmy(array $army): array {return json_decode(json_encode($army,JSON_THROW_ON_ERROR),true,40,JSON_THROW_ON_ERROR);}
$raw=json_decode(file_get_contents(__DIR__.'/workbench-fixture.json'),true,40,JSON_THROW_ON_ERROR);
$catalog=builderNormalizeCatalog($raw);
function entry(string $id,string $unit,int $models=1,?string $attached=null): array {return ['entryId'=>$id,'unitId'=>$unit,'models'=>$models,'manualPoints'=>null,'weaponCounts'=>[],'enhancementIds'=>[],'attachedTo'=>$attached,'warlord'=>$unit==='leader','notes'=>''];}
$army=['name'=>'Test','edition'=>'11','catalogId'=>'catalog_test','factionId'=>'test','limit'=>2000,'dpLimit'=>3,'detachmentIds'=>['first'],'disposition'=>'Take and Hold','entries'=>[entry('a','squad',5),entry('b','squad',5),entry('c','squad',5),entry('d','leader',1,'a'),entry('e','support',1,'a')]];
$army['entries'][0]['weaponCounts']=['1'=>5];
$r=builderValidateArmy($catalog,$army);
check($r['points']===340,'Tiered totals or attachment double counting');
check($r['entries'][3]['attachedTo']==='a','Attachment lost');
$missingSupport=$army;$missingSupport['entries'][4]['attachedTo']=null;
check(count(builderValidateArmy($catalog,$missingSupport)['errors'])===1,'Unattached Support has no explicit error');
$incursionCatalog=$catalog;$incursionCatalog['factions'][0]['detachments'][0]['dp']='3';
$incursion=$army;$incursion['limit']=1000;$incursion['detachmentIds']=['first'];
check(!in_array('Budget Detachment Points superato.',builderValidateArmy($incursionCatalog,$incursion)['issues'],true),'Incursion single 3 DP exception rejected');
$incursion['detachmentIds']=['first','third'];$incursion['disposition']='';
check(in_array('Budget Detachment Points superato.',builderValidateArmy($incursionCatalog,$incursion)['issues'],true),'Incursion exception allowed multiple detachments');
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
check(!empty($saved['army']['created']),'New army has no creation date');
$changed=clientArmy($saved['army']);$created=$changed['created'];$changed['created']='1900-01-01';$changed['name']='Changed';
$changed=clientArmy(builderHandle($pdo,'builderSave',$me,$changed)['army']);
check($changed['created']===$created,'Client changed creation date');
$historical=$changed;unset($historical['created']);
$pdo->prepare('UPDATE w40k_builder_armies SET payload=? WHERE id=?')->execute([json_encode($historical,JSON_THROW_ON_ERROR),$historical['id']]);
$historical['created']='2000-01-01';
$historical=clientArmy(builderHandle($pdo,'builderSave',$me,$historical)['army']);
check($historical['created']===null,'Historical creation date was invented');
$copy=$historical;unset($copy['id']);$copy['created']='1900-01-01';
$copy=builderHandle($pdo,'builderSave',$me,$copy)['army'];
check($copy['created']!==null&&$copy['created']!=='1900-01-01','Copy inherited creation date');
$response=builderHandle($pdo,'builderArmies',$me);
check(count($response['armies'])===2,'Creating a copy removed an existing list');
check($response['armies'][0]['factionName']===$raw['factions'][0]['name'],'Archive faction name missing');
check(is_object($response['armies'][0]['entries'][1]['weaponCounts']),'Empty weapon map became an array');
$read=json_decode(json_encode($response,JSON_THROW_ON_ERROR),true,40,JSON_THROW_ON_ERROR)['armies'][0];check($read['dpLimit']===3 && $read['detachmentIds']===['first'] && $read['disposition']==='Take and Hold','Configuration roundtrip');
check($read['entries'][0]['weaponCounts']['1']===5,'Weapons roundtrip');
$other=['id'=>'other','admin'=>false];$read['name']='Hijacked';rejected(fn()=>builderHandle($pdo,'builderSave',$other,$read));
check(builderHandle($pdo,'builderArmies',$other)['armies']===[],'Archive exposes another user lists');
$unbound=$raw;$unbound['factions'][0]['name']='Unbound Adversaries';
$unboundImport=builderHandle($pdo,'builderImport',$me,['catalog'=>$unbound]);
$invalid=$army;$invalid['catalogId']=$unboundImport['catalogId'];
rejected(fn()=>builderHandle($pdo,'builderSave',$me,$invalid));
echo "Workbench model passed\n";
