<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
function checkCosts(bool $condition,string $message): void {if(!$condition)throw new RuntimeException($message);}
$rows=[['line'=>'1','description'=>'YOUR 1ST UNIT COSTS'],['line'=>'2','description'=>'1 model','cost'=>' 45 '],['line'=>'3','description'=>'YOUR 2ND+ UNITS COST'],['line'=>'4','description'=>'Composition caption'],['line'=>'5','description'=>'1 model','cost'=>' 60'],['line'=>'6','description'=>'per sword','cost'=>'10']];
checkCosts(builderCostsFromRows($rows)===[['models'=>1,'points'=>45,'first'=>1,'last'=>1],['models'=>1,'points'=>60,'first'=>2,'last'=>200]],'Whitespace, captions, copy brackets or surcharge handling');
$range=builderCostsFromRows([['description'=>'YOUR UNIT COSTS'],['description'=>'1 captain, 4 soldiers'],['description'=>'5 models','cost'=>'70'],['description'=>'1 captain, 5-9 soldiers'],['description'=>'6-10 models','cost'=>'140']]);
checkCosts(array_column($range,'models')===[5,6,7,8,9,10],'Range prices lost');
checkCosts(array_column($range,'points')===[70,140,140,140,140,140],'Range price altered');
checkCosts(builderCostsFromRows([['description'=>'YOUR UNKNOWN COSTS'],['description'=>'1 model','cost'=>'50']])===[],'Unknown header guessed');
$unit=['points'=>[['models'=>2,'points'=>90,'first'=>1,'last'=>200]],'costs'=>[['description'=>'1 model','cost'=>' 45'],['description'=>'2 models','cost'=>'100']]];
$fixed=builderFillMissingCosts($unit);
checkCosts($fixed['points'][0]['models']===1&&$fixed['points'][1]['points']===90,'Lost existing price or smallest default');
checkCosts(builderFillMissingCosts($fixed)===$fixed,'Repair not idempotent');
checkCosts(builderRestoreCatalogCosts(['featuresVersion'=>3,'version'=>'different snapshot','units'=>[$unit]])['units'][0]===$unit,'Historical snapshot altered');
if(isset($argv[1])){
    $raw=json_decode(file_get_contents($argv[1]),true,40,JSON_THROW_ON_ERROR);$fixed=builderRestoreCatalogCosts($raw);
    checkCosts(builderRestoreCatalogCosts($fixed)===$fixed,'Full catalog repair not idempotent');
    $units=array_column($fixed['units'],null,'id');
    checkCosts($units['000000568']['points'][0]['points']===120,'Eldrad price missing');
    checkCosts(array_column($units['000002532']['points'],'models')===[5,6,7,8,9,10],'Corsair sizes missing');
    checkCosts($units['000000587']['points'][0]['models']===1,'Warlock default is not smallest');
    // Read the old stored payload through the actual runtime endpoint, without rewriting it.
    $pdo=new PDO('sqlite::memory:');builderSchema($pdo,'sqlite');
    $payload=json_encode($raw,JSON_THROW_ON_ERROR);
    $pdo->prepare('INSERT INTO w40k_builder_catalogs VALUES (?,?,?,?,?,?,?)')->execute(['test','11',$raw['version'],$raw['source'],'test',$payload,'test']);
    $runtime=builderGetCatalog($pdo,'11','test')['catalog'];
    checkCosts(array_column($runtime['units'],null,'id')['000000568']['points'][0]['points']===120,'Stored catalog not repaired on read');
    checkCosts($pdo->query('SELECT payload FROM w40k_builder_catalogs')->fetchColumn()===$payload,'Stored payload was rewritten');
    $state=builderLoadoutCounts($units['000000568']['loadoutRecipe'],[],1);
    $validation=builderValidateV2($raw,['factionId'=>'ae','limit'=>2000,'detachmentIds'=>[],'disposition'=>'','entries'=>[['entryId'=>'eldrad','unitId'=>'000000568','models'=>1,'manualPoints'=>null,'weaponCounts'=>$state['weaponCounts'],'loadoutSelections'=>$state['selections'],'enhancementIds'=>[],'attachedTo'=>null,'warlord'=>true,'notes'=>'']]]);
    checkCosts($validation['points']===120,'Server save still treats Eldrad as unknown cost');
    unset($runtime,$raw,$units,$payload); // Each simulated request loads its own full catalog.
    $default=json_decode(json_encode($validation['entries'][0],JSON_THROW_ON_ERROR),true,40,JSON_THROW_ON_ERROR);
    builderHandle($pdo,'builderDefaultSave',['id'=>'owner'],['catalogId'=>'test','unitId'=>'000000568','factionId'=>'ae','entry'=>$default]);
    checkCosts((int)$pdo->query('SELECT COUNT(*) FROM w40k_builder_defaults')->fetchColumn()===1,'Repaired default not saved');
    $army=$validation+['name'=>'Eldrad test','schemaVersion'=>2,'catalogId'=>'test'];
    $pdo->prepare('INSERT INTO w40k_builder_armies VALUES (?,?,?,?,?,?,?)')->execute(['army','owner','Eldrad test','11','test',json_encode($army,JSON_THROW_ON_ERROR),'test']);
    checkCosts(str_starts_with(builderSavedArmyText($pdo,'owner','army'),'Eldrad test (120 Points)'),'Saved army export still reports unknown price');
    echo json_encode($fixed,JSON_THROW_ON_ERROR);exit;
}
echo "ok\n";
