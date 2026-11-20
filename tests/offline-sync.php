<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
function check(bool $value,string $message): void {if(!$value)throw new RuntimeException($message);}
function client(array $value): array {return json_decode(json_encode($value,JSON_THROW_ON_ERROR),true,40,JSON_THROW_ON_ERROR);}
$pdo=new PDO('sqlite::memory:');$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);builderSchema($pdo,'sqlite');
$me=['id'=>'owner','admin'=>true];$other=['id'=>'other','admin'=>false];
$raw=json_decode(file_get_contents(__DIR__.'/workbench-fixture.json'),true,40,JSON_THROW_ON_ERROR);
$import=builderHandle($pdo,'builderImport',$me,['catalog'=>$raw]);
$army=['id'=>'offline_first','schemaVersion'=>2,'name'=>'Prima lista offline','edition'=>'11','catalogId'=>$import['catalogId'],'factionId'=>'test','limit'=>2000,'dpLimit'=>3,'detachmentIds'=>['first'],'disposition'=>'Take and Hold','entries'=>[['entryId'=>'a','unitId'=>'squad','models'=>5,'manualPoints'=>null,'weaponCounts'=>['1'=>5],'enhancementIds'=>[],'attachedTo'=>null,'warlord'=>false,'notes'=>'']]];
function syncArmy(array $army,?string $base): array {global $pdo,$me;return client(builderSync($pdo,$me,['id'=>$army['id'],'army'=>$army,'baseRevision'=>$base,'operationId'=>substr(hash('sha256',json_encode([$army,$base])),0,24)]));}
$saved=syncArmy($army,null);check(!empty($saved['army']['revision']),'Missing revision');
$stored=$saved['army'];$base=$stored['revision'];
$retry=syncArmy($army,null);check(!isset($retry['conflict']),'Lost response retry creates a conflict');
$changed=$stored;$changed['name']='Modificata online';builderHandle($pdo,'builderSave',$me,$changed);
$local=$stored;$local['name']='Modificata offline';
$conflict=syncArmy($local,$base);check(($conflict['conflict']??false)&&$conflict['remote']['name']==='Modificata online','Concurrent edit is not preserved');
check(builderGetArmies($pdo,'owner')['armies'][0]['name']==='Modificata online','Conflict overwrites server');
$resolved=syncArmy($local,$conflict['revision']);check($resolved['army']['name']==='Modificata offline','Choosing local version failed');
$base=$resolved['army']['revision'];$stored=$resolved['army'];
// Catalog-only changes: points must refresh without creating a user-content conflict.
$raw['version']='updated-points';$raw['units'][0]['points'][0]['points']=123;
$next=builderHandle($pdo,'builderImport',$me,['catalog'=>$raw]);
$migrated=syncArmy($stored,$base);check(!isset($migrated['conflict'])&&$migrated['army']['catalogId']===$next['catalogId'],'Catalog failed to update automatically');
check($migrated['army']['revision']===$base,'Catalog update changed user-content revision');
check($migrated['validation']['points']===123,'New points are not applied');
$local=$stored;$local['name']='Edit dal vecchio catalogo';
$after=syncArmy($local,$base);check(!isset($after['conflict'])&&$after['army']['catalogId']===$next['catalogId'],'Catalog-only migration conflicted with offline edit');
// Another device removes the list, while this device changes it.
$stored=$after['army'];builderHandle($pdo,'builderDelete',$me,['id'=>$stored['id']]);
$stored['name']='Da recuperare';$deleted=syncArmy($stored,$stored['revision']);
check(($deleted['conflict']??false)&&$deleted['remote']===null,'Deletion vs editing lost the local version');
$restored=syncArmy($stored,null);check($restored['army']['name']==='Da recuperare','Choosing local after remote delete failed');
$base=$restored['army']['revision'];$changed=$restored['army'];$changed['name']='Nuova modifica online';builderHandle($pdo,'builderSave',$me,$changed);
$delete=builderSync($pdo,$me,['id'=>$stored['id'],'baseRevision'=>$base,'deleted'=>true]);check(($delete['conflict']??false),'Offline delete overwrites a remote edit');
$delete=builderSync($pdo,$me,['id'=>$stored['id'],'baseRevision'=>$delete['revision'],'deleted'=>true]);check(!empty($delete['deleted']),'Choosing local delete failed');
$retry=builderSync($pdo,$me,['id'=>$stored['id'],'baseRevision'=>$base,'deleted'=>true]);check(!empty($retry['deleted']),'Retrying delete is not idempotent');
// Keep every unit when the new catalog cannot represent it.
$army['id']='incompatible';$army['catalogId']=$next['catalogId'];$saved=syncArmy($army,null);
$raw['version']='removed-unit';$raw['units']=array_values(array_filter($raw['units'],fn($u)=>$u['id']!=='squad'));$raw['factions'][0]['unitIds']=array_values(array_filter($raw['factions'][0]['unitIds'],fn($id)=>$id!=='squad'));
builderHandle($pdo,'builderImport',$me,['catalog'=>$raw]);
$kept=syncArmy($saved['army'],$saved['army']['revision']);check(!isset($kept['conflict'])&&!empty($kept['catalogWarning']),'Incompatible update is not reported');
check($kept['army']['entries'][0]['unitId']==='squad'&&$kept['army']['catalogId']===$next['catalogId'],'Incompatible update loses a unit');
try{builderSync($pdo,$other,['id'=>'incompatible','baseRevision'=>null,'deleted'=>true]);throw new RuntimeException('Other account modified an army');}catch(BuilderInputError $e){}
try{builderSync($pdo,$me,['id'=>'incompatible','baseRevision'=>null,'deleted'=>true,'offlineOwner'=>'other']);throw new RuntimeException('Account mismatch ignored');}catch(BuilderInputError $e){}
try{builderSync($pdo,$me,['id'=>'incompatible','deleted'=>true]);throw new RuntimeException('Missing revision accepted');}catch(BuilderInputError $e){}
check(!$pdo->inTransaction(),'Failed operation leaves an open transaction');
echo "PASS: create, retry, edit/edit, edit/delete, delete/edit, explicit resolution, catalog points, incompatible catalog, ownership\n";
