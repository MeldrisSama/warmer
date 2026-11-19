<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
if(isset($argv[1])) {
    $catalog=json_decode(file_get_contents($argv[1]),true,40,JSON_THROW_ON_ERROR);
    $catalog['factions']=builderBuildAllies($catalog);
    echo json_encode($catalog,JSON_THROW_ON_ERROR);exit;
}
function checkAlly(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
$raw=json_decode(file_get_contents(__DIR__.'/workbench-fixture.json'),true,40,JSON_THROW_ON_ERROR);
$template=$raw['units'][1];$raw['featuresVersion']=3;$raw['units']=[];$raw['factions']=[];
$add=function($id,$name,$faction,$keywords) use(&$raw,$template) {
    $u=$template;$u['id']=$id;$u['name']=$name;$u['factionId']=$faction;$u['keywords']=$keywords;
    $u['sourceUrl']='https://example.test/'.$id;$u['composition']=[];$u['options']=[];$u['loadout']='';$u['enhancements']=[];$u['abilities']=[];
    $u['points']=[['models'=>1,'points'=>100,'first'=>1,'last'=>200]];
    $raw['units'][]=$u;
};
foreach([
    ['cult','Hybrid','gc','Genestealer Cults'],['guard','Cadian Squad','am','Astra Militarum'],['guard_alias','Cadian Squad','gc','Genestealer Cults, Astra Militarum'],
    ['lictor','Lictor','tyr','Tyranids, Vanguard Invader'],['lictor_alias','Lictor','gc','Genestealer Cults, Tyranids, Vanguard Invader'],['forbidden','Commissar','gc','Astra Militarum, Commissar'],
    ['archon','Archon','dru','Drukhari, Character'],['troupe','Troupe','ae','Harlequins'],['troupe_alias','Troupe','dru','Drukhari, Harlequins'],['corsair','Corsairs','ae','Anhrathe'],['corsair_alias','Corsairs','dru','Drukhari, Anhrathe'],
    ['knight','Knight','qi','Imperial Knights'],['rangers','Skitarii Rangers','adm','Adeptus Mechanicus'],['rangers_alias','Skitarii Rangers','qi','Imperial Knights, Adeptus Mechanicus'],
    ['chaos_knight','Chaos Knight','qt','Chaos Knights'],['cultist','Cultists','csm','Damned'],['cultist_alias','Cultists','qt','Chaos Knights, Damned'],
    ['daemon','Daemon','cd','Legiones Daemonica'],['lord','Chaos Lord','csm','Heretic Astartes, Character'],['lord_alias','Chaos Lord','cd','Legiones Daemonica, Heretic Astartes, Character'],
    ['marine','Marine','sm','Adeptus Astartes'],['deathwatch','DW Squad','sm','Adeptus Astartes, Deathwatch, Kill Team']
] as $row)$add(...$row);
foreach([
    ['gc',['cult','guard_alias','lictor_alias','forbidden'],['brood'=>'Brood Brother Auxilia','final'=>'Final Day']],
    ['dru',['archon','troupe_alias','corsair_alias'],['reapers'=>"Reaper's Wager"]],
    ['qi',['knight','rangers_alias'],['forge'=>'Questor Forgepact']],
    ['qt',['chaos_knight','cultist_alias'],['fief'=>'Iconoclast Fiefdom']],
    ['cd',['daemon','lord_alias'],['shadow'=>'Shadow Legion']],
    ['sm_dark_angels',['marine','deathwatch'],['support'=>'Deathwatch Support']],
    ['sm_deathwatch',['marine','deathwatch'],['support'=>'Deathwatch Support']]
] as [$id,$ids,$detachments]) {
    $ds=[];foreach($detachments as $did=>$name)$ds[]=['id'=>$did,'name'=>$name,'dp'=>'1'];
    $raw['factions'][]=['id'=>$id,'name'=>$id,'unitIds'=>$ids,'detachments'=>$ds];
}
$catalog=builderNormalizeCatalog($raw);
$army=static fn($fid,$uid,$dets=[])=>['factionId'=>$fid,'name'=>'Allies','limit'=>2000,'detachmentIds'=>$dets,'entries'=>[['entryId'=>'one','unitId'=>$uid,'models'=>1,'weaponCounts'=>[],'enhancementIds'=>[]]]];
foreach([['gc','guard_alias','brood'],['gc','lictor_alias','final'],['qi','rangers_alias','forge'],['qt','cultist_alias','fief'],['cd','lord_alias','shadow'],['sm_dark_angels','deathwatch','support']] as [$fid,$uid,$det]) {
    checkAlly(count(builderValidateV2($catalog,$army($fid,$uid))['errors'])>0,'Alias bypasses detachment: '.$uid);
    checkAlly(builderValidateV2($catalog,$army($fid,$uid,[$det]))['errors']===[],'Authorized alias rejected: '.$uid);
}
checkAlly(count(builderValidateV2($catalog,$army('gc','forbidden',['brood']))['errors'])>0,'Forbidden Brood Brother allowed');
checkAlly(builderValidateV2($catalog,$army('dru','troupe_alias'))['errors']===[],'Travelling Players lost');
checkAlly(count(builderValidateV2($catalog,$army('dru','corsair_alias',['reapers']))['errors'])>0,'Reapers allows Corsairs');
$over=$army('dru','troupe_alias');$over['entries'][0]['manualPoints']=501;
checkAlly(count(builderValidateV2($catalog,$over)['errors'])>0,'Host alias bypasses ally points cap');
checkAlly(builderValidateV2($catalog,$army('sm_deathwatch','deathwatch'))['errors']===[],'Native Deathwatch army lost its units');
// Simulate an old imported payload with a leaked native ID. Read/save repair
// permissions at runtime without rewriting catalogs or existing army entries.
$old=$catalog;$old['factions'][0]['unitIds'][]='guard_alias';
checkAlly(count(builderValidateV2($old,$army('gc','guard_alias'))['errors'])>0,'Stored catalog bypasses validation');
$pdo=new PDO('sqlite::memory:');builderSchema($pdo,'sqlite');$me=['id'=>'owner','admin'=>true];
$id=builderHandle($pdo,'builderImport',$me,['catalog'=>$raw])['catalogId'];
$payload=json_encode($old,JSON_THROW_ON_ERROR);$pdo->prepare('UPDATE w40k_builder_catalogs SET payload=? WHERE id=?')->execute([$payload,$id]);
$loaded=builderGetCatalog($pdo,'11',$id)['catalog'];
checkAlly(!in_array('guard_alias',$loaded['factions'][0]['unitIds'],true),'Stored catalog leaks native alias to browser');
checkAlly($pdo->query('SELECT payload FROM w40k_builder_catalogs')->fetchColumn()===$payload,'Catalog history rewritten');
echo json_encode($catalog,JSON_THROW_ON_ERROR);
