<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
$catalog=builderNormalizeCatalog(json_decode(file_get_contents($argv[1]),true,40,JSON_THROW_ON_ERROR));$units=array_column($catalog['units'],null,'id');
$file=fopen($argv[2],'rb');$tested=0;
function positiveCounts(array $counts): array {$counts=array_filter($counts,static fn($n)=>$n!==0);ksort($counts);return $counts;}
while(($line=fgets($file))!==false){
    $case=json_decode($line,true,40,JSON_THROW_ON_ERROR);$u=$units[$case['unit']];$tested++;
    try{
        $result=builderLoadoutCounts($u['loadoutRecipe'],$case['selections'],$case['models']);
        if(positiveCounts($result['weaponCounts'])!==positiveCounts($case['counts']))throw new RuntimeException('Client/server weapon quantities differ.');
        if($result['cost']!==$case['cost'])throw new RuntimeException('Client/server gear cost differs.');
        $entry=['models'=>$case['models'],'loadoutSelections'=>$case['selections']];
        if(builderEntryBasePrice($u,$entry,1)!==$case['price'])throw new RuntimeException('Client/server base price differs.');
        foreach($result['weaponCounts'] as $weapon=>$quantity)if($quantity>builderGearLimit($u,(string)$weapon,$case['models'],$result['selections']['_models']??[]))throw new RuntimeException('Generated choice exceeds gear limit for '.$weapon);
    }catch(Throwable $error){throw new RuntimeException($u['name'].' / '.$case['models'].' models / case '.$tested.': '.$error->getMessage(),0,$error);}
}
fclose($file);echo json_encode(['verified'=>$tested,'peakMiB'=>round(memory_get_peak_usage(true)/1048576,1)],JSON_THROW_ON_ERROR)."\n";
