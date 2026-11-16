<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
$fixture=json_decode(file_get_contents(__DIR__.'/../Cangiolone.com/builder-example.json'),true,40,JSON_THROW_ON_ERROR);
$catalog=builderNormalizeCatalog($fixture);
if ($catalog['factions'][0]['units'][0]['points'][0]['points']!==80) throw new Exception('Data normalization failed');
$army=['factionId'=>'esploratori_stellari','detachmentId'=>'spedizione','limit'=>2000,
    'entries'=>[['unitId'=>'ricognitori','models'=>10,'quantity'=>2,'equipmentIds'=>['sensore']],['unitId'=>'vettore','models'=>1,'quantity'=>1,'equipmentIds'=>[]]]];
$validated=builderValidateArmy($catalog,$army);
if ($validated['points']!==480 || !$validated['valid']) throw new Exception('Point calculation incorrect');
$army['limit']=400;
$validated=builderValidateArmy($catalog,$army);
if ($validated['valid'] || count($validated['issues'])!==1) throw new Exception('Point limit validation failed');
$army['limit']=2000; $army['entries'][0]['quantity']=4;
$validated=builderValidateArmy($catalog,$army);
if ($validated['valid'] || !str_contains($validated['issues'][0],'Troppe copie')) throw new Exception('Copy limit validation failed');
$army['entries'][0]['quantity']=1;
$army['entries'][0]['equipmentIds']=['sensore','sensore'];
try {builderValidateArmy($catalog,$army);throw new Exception('Duplicate equipment was allowed');}
catch (BuilderInputError $e) {}
$broken=$fixture;
$broken['factions'][0]['units'][0]['points'][]=['models'=>5,'points'=>20];
try {builderNormalizeCatalog($broken);throw new Exception('Duplicate composition was allowed');}
catch (BuilderInputError $e) {}
$broken=$fixture;
$broken['factions'][0]['units'][0]['name']='<img src=x onerror=alert(1)>';
$catalog=builderNormalizeCatalog($broken); // untrusted text is escaped by UI, never executed
if (!str_contains($catalog['factions'][0]['units'][0]['name'],'<img')) throw new Exception('Escaping precondition failed');
echo "Builder data validation tests passed\n";
