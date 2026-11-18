<?php
declare(strict_types=1);

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
function builderNormalizeV2(array $raw): array {
    if (($raw['edition']??null)!=='11') builderInvalid('Il nuovo catalogo richiede la 11ª edizione.');
    $out=['schemaVersion'=>2,'edition'=>'11','version'=>builderString($raw['version']??null,'versione',60),'source'=>builderString($raw['source']??null,'fonte',100),'license'=>'Uso locale'];
    $out['texts']=builderRecords($raw['texts']??[],10000);
    $out['stratagems']=builderRecords($raw['stratagems']??[],10000);
    $units=$raw['units']??null;
    if (!is_array($units) || !array_is_list($units) || count($units)>2000 || !$units) builderInvalid('Unità catalogo non valide.');
    $known=[]; $out['units']=[];
    foreach ($units as $u) {
        $id=builderId($u['id']??null,'unità');
        if (isset($known[$id])) builderInvalid('Unità duplicata.');
        $known[$id]=true;
        $clean=['id'=>$id,'name'=>builderString($u['name']??null,'unità',200),'category'=>builderString($u['category']??'Altro','categoria',100),'maxCopies'=>builderInt($u['maxCopies']??3,'copie',1,20),'support'=>($u['support']??false)===true];
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
    return $out;
}
function builderValidateV2(array $catalog, array $in): array {
    $factionId=builderId($in['factionId']??null,'fazione');
    $factions=array_column($catalog['factions'],null,'id');
    $faction=$factions[$factionId]??null;
    if (!$faction) builderInvalid('Fazione sconosciuta.');
    $units=array_column($catalog['units'],null,'id');
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
    $clean=[]; $seen=[]; $counts=[]; $total=0; $issues=[]; $warlords=0;
    foreach ($entries as $entry) {
        if (!is_array($entry)) builderInvalid('Unità non valida.');
        $eid=builderId($entry['entryId']??null,'istanza'); $uid=builderId($entry['unitId']??null,'unità');
        if (isset($seen[$eid]) || !isset($units[$uid])) builderInvalid('Istanza duplicata o unità non disponibile.');
        if (!in_array($uid,$faction['unitIds'],true)) $issues[]=$units[$uid]['name'].': alleato da verificare.';
        $seen[$eid]=true; $u=$units[$uid]; $ordinal=($counts[$uid]??0)+1; $counts[$uid]=$ordinal;
        $models=builderInt($entry['models']??null,'modelli',1,200);
        $manual=$entry['manualPoints']??null;
        if ($manual!==null) $manual=builderInt($manual,'punti manuali',0,20000);
        $price=null;
        foreach ($u['points'] as $p) if ($p['models']===$models && $ordinal>=$p['first'] && $ordinal<=$p['last']) $price=$p['points'];
        if ($manual!==null) $price=$manual;
        if ($price===null) $issues[]=$u['name'].': costo da inserire manualmente.';
        $total+=$price??0;
        $weapons=$entry['weaponCounts']??[];
        if (!is_array($weapons) || count($weapons)>200) builderInvalid('Armi non valide.');
        $knownWeapons=array_column($u['weapons'],null,'line'); $wc=[];
        foreach ($weapons as $key=>$value) { if (!isset($knownWeapons[(string)$key])) builderInvalid('Arma sconosciuta.'); $wc[(string)$key]=builderInt($value,'quantità arma',0,1000); }
        $enhancements=$entry['enhancementIds']??[];
        if (!is_array($enhancements) || !array_is_list($enhancements) || count($enhancements)>20 || count(array_unique($enhancements,SORT_REGULAR))!==count($enhancements)) builderInvalid('Potenziamenti non validi.');
        $knownEnhancements=array_column($u['enhancements'],null,'id');
        foreach ($enhancements as $id) { builderId($id,'potenziamento'); if (!isset($knownEnhancements[$id])) builderInvalid('Potenziamento sconosciuto.'); $total+=(int)$knownEnhancements[$id]['cost']; }
        $attached=$entry['attachedTo']??null; if ($attached!==null) builderId($attached,'unità attached');
        $notes=$entry['notes']??''; if (!is_string($notes) || strlen($notes)>4000 || !preg_match('//u',$notes)) builderInvalid('Note non valide.');
        $warlord=($entry['warlord']??false)===true; $warlords+=(int)$warlord;
        if ($u['support'] && $attached===null) $issues[]=$u['name'].': associa il support a un’unità.';
        $clean[]=['entryId'=>$eid,'unitId'=>$uid,'models'=>$models,'manualPoints'=>$manual,'weaponCounts'=>(object)$wc,'enhancementIds'=>$enhancements,'attachedTo'=>$attached,'warlord'=>$warlord,'notes'=>$notes];
    }
    $byId=array_column($clean,null,'entryId');
    foreach ($clean as $entry) {
        if ($entry['attachedTo']===null) continue;
        $target=$byId[$entry['attachedTo']]??null;
        if (!$target || $target['entryId']===$entry['entryId'] || $target['attachedTo']!==null) builderInvalid('Gruppo attached non valido.');
        if (!in_array($target['unitId'],$units[$entry['unitId']]['leads'],true)) $issues[]=$units[$entry['unitId']]['name'].': attachment da verificare manualmente.';
    }
    if ($total>$limit) $issues[]='La lista supera il limite di punti.';
    if ($dp>$dpLimit) $issues[]='Budget Detachment Points superato.';
    if (!$detachmentIds) $issues[]='Seleziona i distaccamenti.';
    if (!$disposition) $issues[]='Seleziona la Force Disposition.';
    if ($warlords!==1) $issues[]='Indica un solo Warlord.';
    $enhancementCount=array_sum(array_map(static fn($e)=>count($e['enhancementIds']),$clean));
    if ($enhancementCount>($limit<=1000?2:4)) $issues[]='Limite potenziamenti superato.';
    foreach ($counts as $id=>$count) {
        $max=$limit<=1000?max(1,(int)floor($units[$id]['maxCopies']*2/3)):$units[$id]['maxCopies'];
        if ($count>$max) $issues[]='Troppe copie di '.$units[$id]['name'].'.';
    }
    return ['points'=>$total,'limit'=>$limit,'dpLimit'=>$dpLimit,'valid'=>false,'issues'=>$issues,'manualReview'=>true,'entries'=>$clean,'factionId'=>$factionId,'detachmentId'=>$detachmentIds[0]??'none','detachmentIds'=>$detachmentIds,'disposition'=>$disposition];
}
