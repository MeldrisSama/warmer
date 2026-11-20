<?php
declare(strict_types=1);

// Rebuild the narrow recovery map from the same CSV snapshot as the old catalogs.
// php scripts/build-builder-rule-parameters.php <csv-directory> <output.json>
$directory=$argv[1]??throw new InvalidArgumentException('Specifica la cartella CSV.');
$destination=$argv[2]??throw new InvalidArgumentException('Specifica il JSON di destinazione.');
function parameterRows(string $path): array {
    $file=fopen($path,'rb');if(!$file)throw new RuntimeException('CSV assente.');
    $header=fgetcsv($file,0,'|','"','');$header[0]=str_replace("\xEF\xBB\xBF",'',$header[0]);$rows=[];
    while(($row=fgetcsv($file,0,'|','"',''))!==false){
        if($row===[null])continue;
        while(count($row)<count($header)&&($next=fgetcsv($file,0,'|','"',''))!==false){$row[count($row)-1].="\n".array_shift($next);array_push($row,...$next);}
        if(count($row)!==count($header))throw new RuntimeException('Riga CSV non valida.');
        $rows[]=array_combine($header,$row);
    }
    fclose($file);return $rows;
}
$snapshot=parameterRows($directory.'/Last_update.csv')[0]['last_update'];
if($snapshot!=='2026-11-12 23:45:38')throw new RuntimeException('La mappa di recupero richiede lo snapshot del 12 novembre 2026.');
$names=array_column(parameterRows($directory.'/Abilities.csv'),'name','id');$groups=[];
foreach(parameterRows($directory.'/Datasheets_abilities.csv') as $row){
    $parameter=trim($row['parameter']);if($parameter==='')continue;
    $name=$row['name']?:($names[$row['ability_id']]??'');if($name==='')continue;
    $key=json_encode([$name,$parameter,$row['model']],JSON_THROW_ON_ERROR);
    $groups[$key]??=['name'=>$name,'parameter'=>$parameter,'model'=>$row['model'],'unitIds'=>[]];
    $groups[$key]['unitIds'][]=$row['datasheet_id'];
}
file_put_contents($destination,json_encode(['snapshot'=>$snapshot,'groups'=>array_values($groups)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n");
