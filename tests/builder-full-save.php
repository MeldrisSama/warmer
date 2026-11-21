<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
require_once __DIR__.'/../Cangiolone.com/league-roster.php';
$pdo=new PDO('sqlite::memory:');$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);builderSchema($pdo,'sqlite');
$json=file_get_contents($argv[1]);$pdo->prepare('INSERT INTO w40k_builder_catalogs VALUES (?,?,?,?,?,?,?)')->execute(['real','11','snapshot','Wahapedia','test',$json,'test']);unset($json);
if(isset($argv[2])){
    $army=json_decode(file_get_contents($argv[2]),true,40,JSON_THROW_ON_ERROR);
    $mode=$argv[3]??'normal';
    if($mode==='sync'){
        $army['id']='offline_pool';$army['purpose']='pool';
        $result=builderSync($pdo,['id'=>'owner'],['id'=>$army['id'],'army'=>$army,'baseRevision'=>null]);
        if(($result['army']['purpose']??null)!=='pool')throw new RuntimeException('Sync discarded pool purpose');
        foreach($result['army']['entries'] as $entry)if(!array_key_exists('rosterPaidOptions',$entry))throw new RuntimeException('Sync discarded pool reserves');
    }else $result=builderHandle($pdo,'builderSave',['id'=>'owner'],$mode==='pool'?($army+['purpose'=>'pool']):$army);
    echo json_encode(['mode'=>$mode,'saved'=>!empty($result['army']['id']),'peakMiB'=>round(memory_get_peak_usage(true)/1048576,1)],JSON_THROW_ON_ERROR)."\n";exit;
}
$catalog=builderGetCatalog($pdo,'11','real')['catalog'];$entries=[];
foreach(['Lucius the Eternal','Fulgrim','Lord Exultant','Lord Kakophonist','Sorcerer','Daemon Prince of Slaanesh with Wings'] as $name){
    $unit=array_values(array_filter($catalog['units'],static fn($u)=>$u['factionId']==='ec'&&$u['name']===$name))[0];
    $models=$unit['points'][0]['models'];$state=builderLoadoutCounts($unit['loadoutRecipe'],[],$models);
    $entries[]=['entryId'=>'entry'.count($entries),'unitId'=>$unit['id'],'models'=>$models,'weaponCounts'=>$state['weaponCounts'],'loadoutSelections'=>$state['selections'],'manualPoints'=>null,'enhancementIds'=>[],'warlord'=>false,'attachedTo'=>null,'notes'=>'','rosterPaidOptions'=>[]];
}
unset($catalog,$unit,$state);gc_collect_cycles();
$army=['name'=>'Salvataggio reale','edition'=>'11','catalogId'=>'real','factionId'=>'ec','limit'=>3000,'dpLimit'=>5,'detachmentIds'=>[],'disposition'=>'','entries'=>$entries];
$normal=builderHandle($pdo,'builderSave',['id'=>'owner'],$army);if(empty($normal['army']['id']))throw new RuntimeException('Normal army not saved');
$pool=leaguePoolSave($pdo,['id'=>'owner'],$army+['purpose'=>'pool']);if(($pool['army']['purpose']??null)!=='pool')throw new RuntimeException('Pool not saved');
echo json_encode(['saved'=>2,'normalPoints'=>$normal['validation']['points'],'poolPoints'=>$pool['validation']['points'],'peakMiB'=>round(memory_get_peak_usage(true)/1048576,1)],JSON_THROW_ON_ERROR)."\n";
