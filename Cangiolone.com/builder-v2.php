<?php
declare(strict_types=1);
require_once __DIR__.'/builder-automation.php';

// Text from the catalog is data: the browser always renders it through escaping.
function builderRecords(mixed $rows, int $max=200): array {
    if (!is_array($rows) || !array_is_list($rows) || count($rows)>$max) builderInvalid('Elenco catalogo non valido.');
    foreach ($rows as $row) {
        if (!is_array($row) || count($row)>30) builderInvalid('Record catalogo non valido.');
        foreach ($row as $key=>$value) {
            if (!is_string($key) || !preg_match('/^[a-zA-Z_][a-zA-Z_0-9]*$/D',$key) || !is_string($value) || strlen($value)>100000 || !preg_match('//u',$value)) builderInvalid('Testo catalogo non valido.');
            if (($key==='id' || (str_ends_with($key,'_id') && $key!=='faction_id')) && $value!=='') builderId($value,'riferimento catalogo');
            if ($key==='line' && !preg_match('/^\d{1,5}$/D',$value)) builderInvalid('Profilo non valido.');
        }
    }
    return $rows;
}
function builderCharacterModels(array $unit): array {
    // The source CSV incorrectly spreads Character to every Ravenwing model.
    if(($unit['id']??'')==='000002748'||($unit['name']??'')==='Ravenwing Command Squad')return array_values(array_filter($unit['models'],static fn($m)=>strcasecmp($m['name'],'Ravenwing Champion')===0));
    return array_values(array_filter($unit['models'],static fn($m)=>preg_match('/\bCharacter\b/i',$m['keywords']??$unit['keywords']??'')));
}
function builderNormalizeV2(array $raw): array {
    if (($raw['edition']??null)!=='11') builderInvalid('Il nuovo catalogo richiede la 11ª edizione.');
    $out=['schemaVersion'=>2,'edition'=>'11','version'=>builderString($raw['version']??null,'versione',60),'source'=>builderString($raw['source']??null,'fonte',100),'license'=>'Uso locale'];
    $enriched=($raw['featuresVersion']??0)>=3;if ($enriched) $out['featuresVersion']=3;
    $out['texts']=builderRecords($raw['texts']??[],10000);
    $out['stratagems']=builderRecords($raw['stratagems']??[],10000);
    // Optional, versioned reference library: older saved catalogs remain readable.
    if (isset($raw['coreRules'])) $out['coreRules']=builderRecords($raw['coreRules'],100);
    $units=$raw['units']??null;
    if (!is_array($units) || !array_is_list($units) || count($units)>2000 || !$units) builderInvalid('Unità catalogo non valide.');
    $known=[]; $out['units']=[];
    foreach ($units as $u) {
        $id=builderId($u['id']??null,'unità');
        if (isset($known[$id])) builderInvalid('Unità duplicata.');
        $known[$id]=true;
        $clean=['id'=>$id,'name'=>builderString($u['name']??null,'unità',200),'category'=>builderString($u['category']??'Altro','categoria',100),'maxCopies'=>builderInt($u['maxCopies']??3,'copie',1,20),'support'=>($u['support']??false)===true];
        if ($enriched) {
            $clean['factionId']=builderId($u['factionId']??null,'fazione unità');$clean['legends']=($u['legends']??false)===true;
            $clean['sourceUrl']=builderString($u['sourceUrl']??'https://wahapedia.ru/wh40k11ed/','fonte unità',500);
        }
        foreach (['models','weapons','abilities','options','composition','costs','enhancements','stratagems'] as $field) $clean[$field]=builderRecords($u[$field]??[]);
        foreach (['loadout','leaderText','keywords'] as $field) {
            $v=$u[$field]??'';
            if (!is_string($v) || strlen($v)>100000 || !preg_match('//u',$v)) builderInvalid('Testo unità non valido.');
            $clean[$field]=$v;
        }
        $clean['leads']=[];
        if (!is_array($u['leads']??[]) || count($u['leads']??[])>200) builderInvalid('Associazioni non valide.');
        foreach ($u['leads']??[] as $target) $clean['leads'][]=builderId($target,'unità associata');
        $clean['points']=[];
        if (!is_array($u['points']??[]) || count($u['points']??[])>100) builderInvalid('Costi non validi.');
        foreach ($u['points']??[] as $p) $clean['points'][]=['models'=>builderInt($p['models']??null,'modelli',1,200),'points'=>builderInt($p['points']??null,'punti',0,10000),'first'=>builderInt($p['first']??1,'prima copia',1,200),'last'=>builderInt($p['last']??200,'ultima copia',1,200)];
        if ($enriched) {
            $clean=builderApplySourceFixes($clean);
            $texts=array_column($out['texts'],'description','id');
            $description=static fn($r)=>$r['description']??($texts[$r['descriptionRef']??'']??'');
            $clean['loadoutRecipe']=builderCompileLoadout($clean,$description);
            $gearNames=array_column(array_filter($clean['loadoutRecipe']['weapons']??[],static fn($w)=>isset($w['ability'])),'ability');
            foreach($clean['abilities'] as &$ability)if(($ability['type']??'')==='Datasheet'&&in_array($ability['name'],$gearNames,true))$ability['type']='Wargear';unset($ability);
            $clean['effects']=builderCompileEffects($clean['abilities'],$description);
            foreach ($clean['enhancements'] as &$enhancement) $enhancement['effectsJson']=json_encode(builderCompileEffects([$enhancement],$description),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
            unset($enhancement);
        }
        $out['units'][]=$clean;
    }
    $factions=$raw['factions']??null;
    if (!is_array($factions) || !array_is_list($factions) || !$factions || count($factions)>100) builderInvalid('Fazioni non valide.');
    $seen=[]; $out['factions']=[];
    foreach ($factions as $f) {
        $id=builderId($f['id']??null,'fazione');
        if (isset($seen[$id])) builderInvalid('Fazione duplicata.');
        $seen[$id]=true;
        if (!is_array($f['unitIds']??null) || count($f['unitIds'])>2000) builderInvalid('Unità della fazione non valide.');
        $ids=[];
        foreach ($f['unitIds'] as $uid) { $uid=builderId($uid,'unità'); if (!isset($known[$uid])) builderInvalid('Unità sconosciuta.'); $ids[]=$uid; }
        $ds=builderRecords($f['detachments']??[],300); $seenDetachments=[];
        foreach ($ds as &$d) {
            $did=builderId($d['id']??null,'distaccamento');
            if (isset($seenDetachments[$did])) builderInvalid('Distaccamento duplicato.');
            $seenDetachments[$did]=true;
            $d['name']=builderString($d['name']??null,'distaccamento',200);
            if (!preg_match('/^\d{1,2}$/D',$d['dp']??'')) builderInvalid('Costo DP non valido.');
        } unset($d);
        $out['factions'][]=['id'=>$id,'name'=>builderString($f['name']??null,'fazione'),'unitIds'=>array_values(array_unique($ids)),'detachments'=>$ds];
    }
    if ($enriched) $out['factions']=builderBuildAllies($out);
    return $out;
}
function builderValidateV2(array $catalog, array $in): array {
    if(($catalog['featuresVersion']??0)>=3)$catalog['factions']=builderBuildAllies($catalog);
    $factionId=builderId($in['factionId']??null,'fazione');
    $factions=array_column($catalog['factions'],null,'id');
    $faction=$factions[$factionId]??null;
    if (!$faction) builderInvalid('Fazione sconosciuta.');
    $units=array_column($catalog['units'],null,'id');$ruleTexts=array_column($catalog['texts']??[],'description','id');
    $limit=builderInt($in['limit']??null,'limite',100,5000);
    $dpLimit=$limit===1000?2:($limit===2000?3:builderInt($in['dpLimit']??3,'budget DP',0,20));
    $detachmentIds=$in['detachmentIds']??[];
    if (!is_array($detachmentIds) || !array_is_list($detachmentIds) || count($detachmentIds)>10 || count(array_unique($detachmentIds,SORT_REGULAR))!==count($detachmentIds)) builderInvalid('Distaccamenti non validi.');
    $detachments=array_column($faction['detachments'],null,'id'); $dp=0;
    $tags=[]; $dispositions=[];
    foreach ($detachmentIds as $id) {
        builderId($id,'distaccamento'); if (!isset($detachments[$id])) builderInvalid('Distaccamento sconosciuto.');
        $d=$detachments[$id]; $dp+=(int)$d['dp']; $tag=trim($d['unique']??'');
        if ($tag!=='' && isset($tags[$tag])) builderInvalid('Distaccamenti incompatibili: '.$tag.'.');
        if ($tag!=='') $tags[$tag]=true;
        foreach (explode(',',$d['force_disposition']??'') as $value) if (trim($value)!=='') $dispositions[]=trim($value);
    }
    $disposition=$in['disposition']??'';
    if (!is_string($disposition) || strlen($disposition)>100 || !preg_match('//u',$disposition)) builderInvalid('Force Disposition non valida.');
    if ($disposition!=='' && !in_array($disposition,$dispositions,true)) builderInvalid('Force Disposition non disponibile nei distaccamenti scelti.');
    $entries=$in['entries']??null;
    if (!is_array($entries) || !array_is_list($entries) || count($entries)>200) builderInvalid('Unità non valide.');
    $clean=[]; $seen=[]; $counts=[]; $total=0; $issues=[]; $errors=[]; $warlords=0;$prices=[];
    foreach ($entries as $entry) {
        if (!is_array($entry)) builderInvalid('Unità non valida.');
        $eid=builderId($entry['entryId']??null,'istanza'); $uid=builderId($entry['unitId']??null,'unità');
        if (isset($seen[$eid]) || !isset($units[$uid])) builderInvalid('Istanza duplicata o unità non disponibile.');
        if (($catalog['featuresVersion']??0)<3&&!in_array($uid,$faction['unitIds'],true)) $issues[]=$units[$uid]['name'].': alleato da verificare.';
        $seen[$eid]=true; $u=$units[$uid]; $ordinal=($counts[$uid]??0)+1; $counts[$uid]=$ordinal;
        $models=builderInt($entry['models']??null,'modelli',1,200);
        if (!empty($u['loadoutRecipe']['models'])&&!array_filter($u['loadoutRecipe']['models'],static fn($m)=>$m['variable'])&&$models!==array_sum(array_column($u['loadoutRecipe']['models'],'fixed')))builderInvalid('Il numero di modelli è fisso per '.$u['name']);
        $manual=$entry['manualPoints']??null;
        if ($manual!==null) $manual=builderInt($manual,'punti manuali',0,20000);
        $price=builderEntryBasePrice($u,$entry,$ordinal);
        if ($manual!==null) $price=$manual;
        if ($price===null) $issues[]=$u['name'].': costo da inserire manualmente.';
        $total+=$price??0;$entryPrice=$price??0;
        $weapons=$entry['weaponCounts']??[];
        if (!is_array($weapons) || count($weapons)>200) builderInvalid('Armi non valide.');
        $knownWeapons=array_column($u['weapons'],null,'line'); $wc=[];
        foreach ($weapons as $key=>$value) { if (!isset($knownWeapons[(string)$key])) builderInvalid('Arma sconosciuta.'); $wc[(string)$key]=builderInt($value,'quantità arma',0,1000); }
        $selections=$entry['loadoutSelections']??null;$loadout=null;
        if ($selections!==null) {
            if (!is_array($selections)||empty($u['loadoutRecipe'])) builderInvalid('Dotazione guidata non disponibile.');
            $loadout=builderLoadoutCounts($u['loadoutRecipe'],$selections,$models);
            $managed=[];foreach ($u['loadoutRecipe']['groups'] as $group) foreach ($group['choices'] as $choice) foreach ($choice['weapons'] as $id=>$n) $managed[$id]=true;
            foreach ($u['loadoutRecipe']['weapons'] as $weapon) if (isset($managed[$weapon['id']])) foreach ($weapon['lines'] as $line) $wc[$line]=0;
            foreach ($loadout['weaponCounts'] as $line=>$quantity) $wc[$line]=$quantity;
            if ($manual===null) {$total+=$loadout['cost'];$entryPrice+=$loadout['cost'];}
        }
        $enhancements=$entry['enhancementIds']??[];
        if (!is_array($enhancements) || !array_is_list($enhancements) || count($enhancements)>20 || count(array_unique($enhancements,SORT_REGULAR))!==count($enhancements)) builderInvalid('Potenziamenti non validi.');
        $knownEnhancements=array_column($u['enhancements'],null,'id');
        foreach ($enhancements as $id) { builderId($id,'potenziamento'); if (!isset($knownEnhancements[$id])) builderInvalid('Potenziamento sconosciuto.'); $total+=(int)$knownEnhancements[$id]['cost'];$entryPrice+=(int)$knownEnhancements[$id]['cost']; }
        foreach ($wc as $line=>$quantity) if ($quantity>0&&!empty($knownWeapons[$line]['enhancement_id'])&&!in_array($knownWeapons[$line]['enhancement_id'],$enhancements,true)) builderInvalid('Arma dedicata senza il potenziamento richiesto.');
        foreach ($knownWeapons as $line=>$weapon) {
            if (!empty($weapon['enhancement_id'])) {if (in_array($weapon['enhancement_id'],$enhancements,true))$wc[$line]=1;}
            elseif (($wc[$line]??0)>builderGearLimit($u,(string)$line,$models,$loadout['selections']['_models']??[])) builderInvalid('Limite equipaggiamento superato: '.$weapon['name']);
        }
        $enhancementModels=$entry['enhancementModels']??[];
        if (!is_array($enhancementModels)||count($enhancementModels)>20)builderInvalid('Portatori dei potenziamenti non validi.');
        $upgradeIds=array_column(array_filter($u['enhancements'],static fn($e)=>($e['upgrade']??'')==='true'),'id');
        foreach($upgradeIds as $upgradeId)unset($enhancementModels[$upgradeId]);
        $profiles=array_column($u['models'],null,'line');
        $eligible=builderCharacterModels($u);$eligibleLines=array_column($eligible,'line');
        foreach ($enhancementModels as $id=>$line)if(!in_array($id,$enhancements,true)||!is_string($line)||!isset($profiles[$line])||!in_array($line,$eligibleLines,true))builderInvalid('Modello portatore non valido.');
        foreach ($enhancements as $id) {
            if(in_array($id,$upgradeIds,true))continue;
            if ($models===1||count($eligible)===1)$enhancementModels[$id]=($eligible[0]??$u['models'][0])['line'];
            elseif (!isset($enhancementModels[$id])&&array_filter($u['weapons'],static fn($w)=>($w['enhancement_id']??'')===$id)){$message=$u['name'].': scegli il modello portatore del potenziamento.';$issues[]=$message;$errors[]=$message;}
        }
        $prices[$eid]=$entryPrice;
        $attached=$entry['attachedTo']??null; if ($attached!==null) builderId($attached,'unità attached');
        $notes=$entry['notes']??''; if (!is_string($notes) || strlen($notes)>4000 || !preg_match('//u',$notes)) builderInvalid('Note non valide.');
        $warlord=($entry['warlord']??false)===true; $warlords+=(int)$warlord;
        if ($warlord&&!preg_match('/\bCharacter\b/i',$u['keywords'])) builderInvalid('Solo un Character può essere Warlord.');
        if (!$warlord)foreach(array_merge($u['abilities'],$u['composition']) as $rule){$text=($rule['description']??'')?:($ruleTexts[$rule['descriptionRef']??'']??'');if(preg_match('/If this (?:model|unit) is in your army,?\s+it must be your Warlord\b/i',$text)){$message=$u['name'].': questa unità deve essere il Warlord.';$issues[]=$message;$errors[]=$message;break;}}
        if ($u['support'] && $attached===null) {
            $message=$u['name'].': un Support deve essere associato a un’unità compatibile.';
            $issues[]=$message;$errors[]=$message;
        }
        $clean[]=['entryId'=>$eid,'unitId'=>$uid,'models'=>$models,'manualPoints'=>$manual,'weaponCounts'=>(object)$wc,'enhancementIds'=>$enhancements,'attachedTo'=>$attached,'warlord'=>$warlord,'notes'=>$notes];
        if ($enhancementModels)$clean[count($clean)-1]['enhancementModels']=$enhancementModels;
        if ($loadout!==null) $clean[count($clean)-1]['loadoutSelections']=$loadout['selections'];
    }
    $allyIssues=builderAllyIssues($catalog,['factionId'=>$factionId,'limit'=>$limit,'detachmentIds'=>$detachmentIds,'entries'=>$clean],$prices);
    array_push($issues,...$allyIssues);array_push($errors,...$allyIssues);
    $byId=array_column($clean,null,'entryId');
    foreach ($clean as $entry) {
        if ($entry['attachedTo']===null) continue;
        $target=$byId[$entry['attachedTo']]??null;
        if (!$target || $target['entryId']===$entry['entryId'] || $target['attachedTo']!==null) builderInvalid('Gruppo attached non valido.');
        if (!in_array($target['unitId'],$units[$entry['unitId']]['leads'],true)) $issues[]=$units[$entry['unitId']]['name'].': attachment da verificare manualmente.';
    }
    if ($total>$limit) $issues[]='La lista supera il limite di punti.';
    $incursionException=$limit===1000 && count($detachmentIds)===1 && $dp===3;
    if ($dp>$dpLimit && !$incursionException) $issues[]='Budget Detachment Points superato.';
    if (!$detachmentIds) $issues[]='Seleziona i distaccamenti.';
    if (!$disposition) $issues[]='Seleziona la Force Disposition.';
    if ($warlords!==1) $issues[]='Indica un solo Warlord.';
    $enhancementCount=0;$seenUpgrades=[];$seenEnhancements=[];
    foreach ($clean as $entry) foreach ($entry['enhancementIds'] as $id) {
        $enhancement=array_column($units[$entry['unitId']]['enhancements'],null,'id')[$id];
        if (($enhancement['upgrade']??'false')==='true') {$seenUpgrades[$id]=($seenUpgrades[$id]??0)+1;if($seenUpgrades[$id]===1)$enhancementCount++;if($seenUpgrades[$id]>3)$issues[]='Massimo tre copie dello stesso Upgrade.';}
        else {$enhancementCount++;if(isset($seenEnhancements[$id]))$issues[]='Lo stesso Enhancement non può essere assegnato due volte.';$seenEnhancements[$id]=true;}
    }
    $groupEnhancements=[];
    foreach ($clean as $entry) {
        $root=$entry['attachedTo']??$entry['entryId'];$groupEnhancements[$root]=($groupEnhancements[$root]??0)+count($entry['enhancementIds']);
        if (count($entry['enhancementIds'])>1) $issues[]='Ogni unità può avere un solo Enhancement o Upgrade.';
    }
    foreach ($groupEnhancements as $count) if ($count>1) $issues[]='Un gruppo attached non può avere più di un Enhancement o Upgrade.';
    if ($enhancementCount>($limit<=1000?2:4)) $issues[]='Limite potenziamenti superato.';
    foreach ($counts as $id=>$count) {
        $max=$limit<=1000?max(1,(int)floor($units[$id]['maxCopies']*2/3)):$units[$id]['maxCopies'];
        if ($count>$max) $issues[]='Troppe copie di '.$units[$id]['name'].'.';
    }
    return ['points'=>$total,'limit'=>$limit,'dpLimit'=>$dpLimit,'valid'=>false,'issues'=>$issues,'errors'=>$errors,'manualReview'=>true,'entries'=>$clean,'factionId'=>$factionId,'detachmentId'=>$detachmentIds[0]??'none','detachmentIds'=>$detachmentIds,'disposition'=>$disposition];
}
