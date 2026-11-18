<?php
declare(strict_types=1);

// php scripts/import-wahapedia.php /path/to/csv /path/to/catalog.json /path/to/faction-pages [/path/to/core-rules.html]
require __DIR__.'/../Cangiolone.com/builder-model.php';
$directory=$argv[1]??throw new InvalidArgumentException('Specifica cartella CSV e JSON di destinazione.');
$destination=$argv[2]??throw new InvalidArgumentException('Specifica JSON di destinazione.');
$rulesDirectory=$argv[3]??throw new InvalidArgumentException('Specifica le pagine HTML delle fazioni per verificare Unique.');
function exportRows(string $name): array {
    global $directory;
    $f=fopen($directory.'/'.$name.'.csv','rb');
    if (!$f) throw new RuntimeException('CSV assente: '.$name);
    $header=fgetcsv($f,0,'|','"',''); $header[0]=str_replace("\xEF\xBB\xBF",'',$header[0]); $out=[];
    while (($row=fgetcsv($f,0,'|','"',''))!==false) {
        if ($row===[null]) continue;
        // Wahapedia also emits unquoted multiline descriptions; join until the trailing delimiter.
        while (count($row)<count($header) && ($next=fgetcsv($f,0,'|','"',''))!==false) {
            $row[count($row)-1].="\n".array_shift($next);
            array_push($row,...$next);
        }
        if (count($row)!==count($header)) throw new RuntimeException('Riga CSV irregolare: '.$name);
        $record=array_combine($header,$row); unset($record['']); $out[]=$record;
    }
    fclose($f); return $out;
}
function exportGroup(string $table, string $key='datasheet_id'): array {
    $out=[];
    foreach (exportRows($table) as $row) $out[$row[$key]][]=$row;
    return $out;
}
function exportText(string $text): string {
    return builderRuleText($text);
}
function exportCosts(array $rows): array {
    usort($rows,static fn($a,$b)=>(int)$a['line']<=>(int)$b['line']);
    $first=1; $last=200; $out=[]; $usable=true;
    foreach ($rows as $r) {
        $description=trim($r['description']);
        if ($r['cost']==='') {
            $usable=true; $first=1; $last=200;
            if ($description==='YOUR UNIT COSTS') continue;
            if (preg_match('/^YOUR (\d+)(?:ST|ND|RD|TH) TO (\d+)(?:ST|ND|RD|TH) UNITS? COSTS?$/',$description,$m)) { $first=(int)$m[1]; $last=(int)$m[2]; }
            elseif (preg_match('/^YOUR (\d+)(?:ST|ND|RD|TH)(\+)? UNITS? COSTS?$/',$description,$m)) { $first=(int)$m[1]; $last=empty($m[2])?$first:200; }
            else $usable=false;
        } elseif ($usable && preg_match('/^(\d+) models?$/',$description,$m) && ctype_digit($r['cost'])) {
            $out[]=['models'=>(int)$m[1],'points'=>(int)$r['cost'],'first'=>$first,'last'=>$last];
        }
    }
    return $out;
}
$groups=[];
foreach (['models','wargear','abilities','options','unit_composition','models_cost','keywords','enhancements','stratagems'] as $table) $groups[$table]=exportGroup('Datasheets_'.$table);
$abilities=array_column(exportRows('Abilities'),null,'id');
$enhancements=array_column(exportRows('Enhancements'),null,'id');
$enhancementWeapons=exportGroup('Enhancements_wargear','enhancement_id');
$stratagems=array_column(exportRows('Stratagems'),null,'id');
$detachmentRules=exportGroup('Detachment_abilities','detachment_id');
$unique=[];
foreach (glob($rulesDirectory.'/*.html') as $path) {
    $html=file_get_contents($path);
    preg_match_all('/<div class="H2Unique">(.*?)<\/div>\s*<h2\b[^>]*>(.*?)<\/h2>/s',$html,$matches,PREG_SET_ORDER);
    if (count($matches)!==substr_count($html,'<div class="H2Unique">')) throw new RuntimeException('Formato Unique cambiato: '.$path);
    foreach ($matches as $m) {
        $name=exportText(preg_replace('/<span\b.*$/s','',$m[2]));
        $unique[$name]=trim(exportText($m[1]));
    }
}
if (!$unique) throw new RuntimeException('Nessun tag Unique trovato nelle pagine delle fazioni.');
$dpOverrides=exportGroup('Detachments_chapter_dp','detachment_id');
$leader=exportGroup('Datasheets_leader','leader_id');
$sources=array_column(exportRows('Source'),null,'id');$sourceEditions=array_column($sources,'edition','id');
$chapterDetachments=[
    'Black Templars'=>['000001209','000001230','000001231'], 'Blood Angels'=>['000001004','000001214','000001215'],
    'Dark Angels'=>['000000835','000001059','000001205'], 'Deathwatch'=>['000000808'],
    'Imperial Fists'=>['000001146'], 'Iron Hands'=>['000001232'], 'Raven Guard'=>['000001104'],
    'Salamanders'=>['000001086'], 'Space Wolves'=>['000001008','000001070','000001126'],
    'Ultramarines'=>['000001120'], 'White Scars'=>['000001119']
];
$factions=[];
foreach (exportRows('Factions') as $f) $factions[$f['id']]=['id'=>strtolower($f['id']),'name'=>$f['name'],'unitIds'=>[],'detachments'=>[]];
$units=[]; $chapters=[]; $excluded=0;
foreach (exportRows('Datasheets') as $sheet) {
    $id=$sheet['id']; $fid=$sheet['faction_id'];
    if ($sheet['virtual']==='true' || ($sourceEditions[$sheet['source_id']]??'')==='10' || !isset($factions[$fid])) { $excluded++; continue; }
    $keys=array_column($groups['keywords'][$id]??[],'keyword');
    $chapters[$id]=array_values(array_intersect($keys,array_keys($chapterDetachments)));
    $rules=[];
    foreach ($groups['abilities'][$id]??[] as $a) {
        $ref=$abilities[$a['ability_id']]??[];
        $rules[]=['name'=>$a['name']?:($ref['name']??$a['type']),'description'=>$a['description']?:($ref['description']??$a['parameter']),'model'=>$a['model'],'type'=>$a['type']];
    }
    if ($sheet['damaged_description']) $rules[]=['name'=>'Damaged '.$sheet['damaged_w'],'description'=>$sheet['damaged_description'],'type'=>'Datasheet'];
    $upgrades=[];
    foreach ($groups['enhancements'][$id]??[] as $r) if (isset($enhancements[$r['enhancement_id']])) $upgrades[]=$enhancements[$r['enhancement_id']];
    $strats=[];
    foreach ($groups['stratagems'][$id]??[] as $r) if (isset($stratagems[$r['stratagem_id']])&&!preg_match('/boarding|combat patrol/i',$stratagems[$r['stratagem_id']]['type'])) $strats[]=$stratagems[$r['stratagem_id']];
    $weapons=$groups['wargear'][$id]??[];
    $modelProfiles=$groups['models'][$id]??[];
    foreach ($modelProfiles as &$profile) $profile['keywords']=implode(', ',array_column(array_filter($groups['keywords'][$id]??[],static fn($k)=>$k['model']===''||strcasecmp($k['model'],$profile['name'])===0),'keyword'));
    unset($profile);
    $nextLine=max(array_map('intval',array_column($weapons,'line'))?:[0]);
    foreach ($upgrades as $upgrade) foreach ($enhancementWeapons[$upgrade['id']]??[] as $weapon) { $weapon['line']=(string)++$nextLine; $weapons[]=$weapon; }
    $units[]=['id'=>$id,'name'=>$sheet['name'],'factionId'=>strtolower($fid),'sourceUrl'=>$sheet['link'],'legends'=>stripos($sources[$sheet['source_id']]['name']??'','Legends')!==false,'category'=>$sheet['role']?:'Altro','maxCopies'=>in_array('Epic Hero',$keys,true)?1:((in_array('Battleline',$keys,true)||$sheet['role']==='Dedicated Transport')?6:3),
        'support'=>$sheet['is_support']==='true','loadout'=>$sheet['loadout'],'leaderText'=>$sheet['leader_head']."\n".$sheet['leader_footer'],'keywords'=>implode(', ',$keys),
        'leads'=>array_column($leader[$id]??[],'attached_id'),'models'=>$modelProfiles,'weapons'=>$weapons,
        'abilities'=>$rules,'options'=>$groups['options'][$id]??[],'composition'=>$groups['unit_composition'][$id]??[],
        'costs'=>$groups['models_cost'][$id]??[],'points'=>exportCosts($groups['models_cost'][$id]??[]),'enhancements'=>$upgrades,'stratagems'=>$strats];
    $factions[$fid]['unitIds'][]=$id;
}
$dedicated=array_merge(...array_values($chapterDetachments));
$detachments=exportRows('Detachments');
foreach ($detachments as &$d) {
    if (!is_file($rulesDirectory.'/'.$d['faction_id'].'.html')) throw new RuntimeException('Pagina della fazione assente: '.$d['faction_id']);
    $d['description']=implode("\n\n",array_map(static fn($r)=>$r['name']."\n".$r['description'],$detachmentRules[$d['id']]??[]));
    $d['unique']=$unique[$d['name']]??'';
    $d['uniqueChecked']='true';
} unset($d);
foreach ($detachments as $d) if ($d['type']!=='Boarding Actions' && isset($factions[$d['faction_id']]) && !in_array($d['id'],$dedicated,true)) $factions[$d['faction_id']]['detachments'][]=$d;
$marineIds=$factions['SM']['unitIds'];
$factions['SM']['unitIds']=array_values(array_filter($marineIds,static fn($id)=>empty($chapters[$id])));
foreach ($chapterDetachments as $name=>$ids) {
    $f=$factions['SM']; $f['id']='sm_'.str_replace(' ','_',strtolower($name)); $f['name']=$name;
    $f['unitIds']=array_values(array_filter($marineIds,static fn($id)=>empty($chapters[$id]) || in_array($name,$chapters[$id],true)));
    foreach ($detachments as $d) if (in_array($d['id'],$ids,true)) $f['detachments'][]=$d;
    foreach ($f['detachments'] as &$d) foreach ($dpOverrides[$d['id']]??[] as $override) if ($override['keyword']===$name) $d['dp']=$override['dp'];
    unset($d); $factions[$f['id']]=$f;
}
$texts=[]; $stratagemLibrary=[];
foreach ($units as $unit) if ($unit['factionId']==='tl') {
    $traitor=$unit;$traitor['id'].='_traitoris';$traitor['name'].=' (Titanicus Traitoris)';$traitor['factionId']='traitoris';
    $traitor['keywords']=str_replace(['Imperium','Adeptus Titanicus'],['Chaos','Titanicus Traitoris'],$traitor['keywords']);$units[]=$traitor;
}
foreach ($units as &$u) {
    foreach (['models','weapons','abilities','options','composition','costs','enhancements','stratagems'] as $field) {
        foreach ($u[$field] as $recordIndex=>&$record) {
            unset($record['legend'],$record['datasheet_id'],$record['faction_id']);
            if (isset($record['line']) && !ctype_digit($record['line'])) $record['line']=(string)($recordIndex+1);
            foreach ($record as &$value) $value=exportText($value);
            unset($value);
            if (strlen($record['description']??'')>100) {
                $ref=md5($record['description']); $texts[$ref]=['id'=>$ref,'description'=>$record['description']];
                $record['descriptionRef']=$ref; $record['description']='';
            }
            if ($field==='stratagems') { $stratagemLibrary[$record['id']]=$record; $record=['id'=>$record['id']]; }
            if ($field==='enhancements') $record=array_intersect_key($record,array_flip(['id','name','cost','detachment_id','description','descriptionRef','upgrade','support_leader']));
            unset($record['line_in_wargear'],$record['dice']);
            $record=array_filter($record,static fn($value)=>$value!=='');
        } unset($record);
    }
    foreach (['loadout','leaderText','keywords'] as $field) $u[$field]=exportText($u[$field]);
} unset($u);
foreach ($factions as &$f) foreach ($f['detachments'] as &$d) { unset($d['legend']); $d['description']=exportText($d['description']); } unset($f,$d);
$coreRules=[];
if (isset($argv[4])) {
    $html=file_get_contents($argv[4]);
    if ($html===false || !str_contains($html,'wh40k11ed')) throw new RuntimeException('Pagina Core Rules 11ª non valida.');
    $doc=new DOMDocument();$previous=libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8">'.$html);libxml_clear_errors();libxml_use_internal_errors($previous);
    $xpath=new DOMXPath($doc);
    foreach ($xpath->query('//*[contains(concat(" ",normalize-space(@class)," ")," abWrap ")]') as $block) {
        $title=$xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," abName ")]',$block)->item(0);
        $references=$xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," h_number ")]',$block);
        $reference=$references->item(0);
        if (!$title || $references->length!==1) continue;
        $number=trim($reference->textContent);$name=trim(str_replace($number,'',$title->textContent),' []');
        if (!preg_match('/^24\.\d{2}$/D',$number)) continue;
        $id='core_'.str_replace('.','_',$number);
        // First occurrence is the reference chapter; repeated tooltip copies are ignored.
        if (!isset($coreRules[$id])) $coreRules[$id]=['id'=>$id,'name'=>$name,'reference'=>$number,'description'=>exportText($doc->saveHTML($block)),'sourceUrl'=>'https://wahapedia.ru/wh40k11ed/the-rules/core-rules/'];
    }
    if (count($coreRules)<30) throw new RuntimeException('Libreria Core Rules incompleta: verificare la struttura della fonte.');
}
$catalog=builderNormalizeCatalog(['schemaVersion'=>2,'featuresVersion'=>3,'edition'=>'11','version'=>exportRows('Last_update')[0]['last_update'].' · b6-'.substr(hash('sha256',file_get_contents(__FILE__).file_get_contents(__DIR__.'/../Cangiolone.com/builder-automation.php').file_get_contents(__DIR__.'/../Cangiolone.com/builder-loadout-rules.php').file_get_contents(__DIR__.'/../Cangiolone.com/builder-source-fixes.php')),0,8),'source'=>'Wahapedia','units'=>$units,'factions'=>array_values($factions),'texts'=>array_values($texts),'stratagems'=>array_values($stratagemLibrary),'coreRules'=>array_values($coreRules)]);
$json=json_encode($catalog,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
if (strlen($json)>28000000) throw new RuntimeException('Catalogo oltre 28 MB.');
if (file_put_contents($destination,$json)===false) throw new RuntimeException('Scrittura catalogo fallita.');
echo count($units).' schede, '.$excluded.' escluse (virtuali, fonte 10ª o fazione assente), '.strlen($json)." byte\n";
