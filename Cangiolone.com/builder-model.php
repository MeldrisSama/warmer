<?php
declare(strict_types=1);

/** Army Builder: independent, versioned catalogs. No proprietary game data bundled. */
final class BuilderInputError extends RuntimeException {}
require_once __DIR__.'/builder-v2.php';
require_once __DIR__.'/builder-sync.php';

function builderInvalid(string $message): never { throw new BuilderInputError($message); }
function builderString(mixed $value, string $label, int $max=100): string {
    if (!is_string($value) || trim($value)==='' || mbSafeLength($value)>$max || !preg_match('//u', $value)) {
        builderInvalid('Campo non valido: '.$label);
    }
    return trim($value);
}
function mbSafeLength(string $value): int { return strlen($value); }
function builderId(mixed $value, string $label): string {
    if (!is_string($value) || !preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/D', $value)) builderInvalid('Identificativo non valido: '.$label);
    return $value;
}
function builderInt(mixed $value, string $label, int $min, int $max): int {
    if (!is_int($value) || $value<$min || $value>$max) builderInvalid('Valore non valido: '.$label);
    return $value;
}
function builderEdition(mixed $value): string {
    if (!in_array($value,['10','11'],true)) builderInvalid('Edizione non valida.');
    return $value;
}
function builderSchema(PDO $pdo, string $driver): void {
    $tables=[
        'catalogs'=>'`id` VARCHAR(24) PRIMARY KEY, `edition` VARCHAR(2) NOT NULL, `version` VARCHAR(60) NOT NULL, `source` VARCHAR(100) NOT NULL, `license` VARCHAR(120) NOT NULL, `payload` LONGTEXT NOT NULL, `created` VARCHAR(40) NOT NULL',
        'active'=>'`edition` VARCHAR(2) PRIMARY KEY, `catalog_id` VARCHAR(24) NOT NULL',
        'armies'=>'`id` VARCHAR(24) PRIMARY KEY, `owner` VARCHAR(24) NOT NULL, `name` VARCHAR(100) NOT NULL, `edition` VARCHAR(2) NOT NULL, `catalog_id` VARCHAR(24) NOT NULL, `payload` LONGTEXT NOT NULL, `updated` VARCHAR(40) NOT NULL',
        'defaults'=>'`owner` VARCHAR(24) NOT NULL, `unit_id` VARCHAR(64) NOT NULL, `catalog_id` VARCHAR(24) NOT NULL, `payload` LONGTEXT NOT NULL, PRIMARY KEY (`owner`,`unit_id`)'
    ];
    foreach ($tables as $name=>$fields) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS `w40k_builder_'.$name.'` ('.$fields.')'.($driver==='mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : ''));
    }
}
function builderNormalizeCatalog(array $raw): array {
    if (($raw['schemaVersion']??null)===2) return builderNormalizeV2($raw);
    $edition=builderEdition($raw['edition']??null);
    $version=builderString($raw['version']??null,'versione',60);
    $source=builderString($raw['source']??null,'fonte',100);
    $license=builderString($raw['license']??null,'licenza o autorizzazione',120);
    $factions=$raw['factions']??null;
    if (!is_array($factions) || !array_is_list($factions) || !$factions || count($factions)>100) builderInvalid('Il catalogo deve avere da 1 a 100 fazioni.');
    $knownFactions=[]; $out=[]; $total=0;
    foreach ($factions as $faction) {
        if (!is_array($faction)) builderInvalid('Fazione non valida.');
        $id=builderId($faction['id']??null,'fazione');
        if (isset($knownFactions[$id])) builderInvalid('Fazione duplicata: '.$id);
        $knownFactions[$id]=true;
        $detachments=$faction['detachments']??null;
        if (!is_array($detachments) || !array_is_list($detachments) || !$detachments || count($detachments)>100) builderInvalid('Distaccamenti non validi.');
        $knownDetachments=[]; $cleanDetachments=[];
        foreach ($detachments as $detachment) {
            if (!is_array($detachment)) builderInvalid('Distaccamento non valido.');
            $did=builderId($detachment['id']??null,'distaccamento');
            if (isset($knownDetachments[$did])) builderInvalid('Distaccamento duplicato.');
            $knownDetachments[$did]=true;
            $cleanDetachments[]=['id'=>$did,'name'=>builderString($detachment['name']??null,'nome distaccamento')];
        }
        $units=$faction['units']??null;
        if (!is_array($units) || !array_is_list($units) || count($units)>1500) builderInvalid('Elenco unità non valido.');
        $knownUnits=[]; $cleanUnits=[];
        foreach ($units as $unit) {
            if (!is_array($unit)) builderInvalid('Unità non valida.');
            $uid=builderId($unit['id']??null,'unità');
            if (isset($knownUnits[$uid])) builderInvalid('Unità duplicata: '.$uid);
            $knownUnits[$uid]=true;
            $points=$unit['points']??null;
            if (!is_array($points) || !array_is_list($points) || !$points || count($points)>30) builderInvalid('Composizione non valida: '.$uid);
            $cleanPoints=[]; $seenModels=[];
            foreach ($points as $choice) {
                if (!is_array($choice)) builderInvalid('Punti non validi: '.$uid);
                $models=builderInt($choice['models']??null,'miniature',1,200);
                $cost=builderInt($choice['points']??null,'punti',1,10000);
                if (isset($seenModels[$models])) builderInvalid('Composizione duplicata: '.$uid);
                $seenModels[$models]=true;
                $cleanPoints[]=['models'=>$models,'points'=>$cost];
            }
            usort($cleanPoints,static fn($a,$b)=>$a['models']<=>$b['models']);
            $gear=$unit['equipment']??[];
            if (!is_array($gear) || !array_is_list($gear) || count($gear)>100) builderInvalid('Equipaggiamento non valido: '.$uid);
            $cleanGear=[]; $seenGear=[];
            foreach ($gear as $equipment) {
                if (!is_array($equipment)) builderInvalid('Equipaggiamento non valido.');
                $gid=builderId($equipment['id']??null,'equipaggiamento');
                if (isset($seenGear[$gid])) builderInvalid('Equipaggiamento duplicato.');
                $seenGear[$gid]=true;
                $cleanGear[]=['id'=>$gid,'name'=>builderString($equipment['name']??null,'equipaggiamento'),'points'=>builderInt($equipment['points']??0,'costo equipaggiamento',0,1000)];
            }
            $cleanUnits[]=[
                'id'=>$uid,'name'=>builderString($unit['name']??null,'nome unità'),
                'category'=>builderString($unit['category']??'Altro','categoria',50),
                'maxCopies'=>builderInt($unit['maxCopies']??3,'limite copie',1,20),
                'points'=>$cleanPoints,'equipment'=>$cleanGear
            ];
            if (++$total>5000) builderInvalid('Massimo 5000 unità per catalogo.');
        }
        $out[]=['id'=>$id,'name'=>builderString($faction['name']??null,'nome fazione'),'detachments'=>$cleanDetachments,'units'=>$cleanUnits];
    }
    return ['edition'=>$edition,'version'=>$version,'source'=>$source,'license'=>$license,'factions'=>$out];
}
function builderCatalogRow(PDO $pdo, string $edition, ?string $id=null): ?array {
    // Reads and saves need the same budget as importing a complete catalog.
    $memory=trim((string)ini_get('memory_limit'));$factor=match(strtolower(substr($memory,-1))){'k'=>1024,'m'=>1048576,'g'=>1073741824,default=>1};
    if($memory!=='-1'&&(int)$memory*$factor<268435456&&ini_set('memory_limit','256M')===false)builderInvalid('Memoria del server insufficiente per aprire e salvare il catalogo completo.');
    if ($id!==null) {
        $stmt=$pdo->prepare('SELECT * FROM w40k_builder_catalogs WHERE id=? AND edition=?');
        $stmt->execute([$id,$edition]);
    } else {
        $stmt=$pdo->prepare('SELECT c.* FROM w40k_builder_catalogs c JOIN w40k_builder_active a ON a.catalog_id=c.id WHERE a.edition=?');
        $stmt->execute([$edition]);
    }
    $row=$stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}
function builderGetCatalog(PDO $pdo, string $edition, ?string $catalogId=null): array {
    $row=builderCatalogRow($pdo,$edition,$catalogId);
    if (!$row) return ['catalog'=>null];
    $catalog=json_decode($row['payload'],true,40,JSON_THROW_ON_ERROR);
    if(($catalog['featuresVersion']??0)>=3){$catalog=builderRestoreRuleParameters($catalog);$catalog=builderRefreshEnhancementEffects($catalog);$catalog['factions']=builderBuildAllies($catalog);}
    return ['catalog'=>$catalog+['catalogId'=>$row['id'],'created'=>$row['created']]];
}
function builderGetArmies(PDO $pdo, string $user): array {
    $stmt=$pdo->prepare('SELECT id,name,edition,catalog_id,payload,updated FROM w40k_builder_armies WHERE owner=? ORDER BY updated DESC');
    $stmt->execute([$user]);
    $armies=[];
    $factionNames=[];
    foreach ($stmt as $row) {
        $army=json_decode($row['payload'],true,20,JSON_THROW_ON_ERROR);
        if (!isset($factionNames[$row['catalog_id']])) {
            $catalogRow=builderCatalogRow($pdo,$row['edition'],$row['catalog_id']);
            $catalog=$catalogRow ? json_decode($catalogRow['payload'],true,40,JSON_THROW_ON_ERROR) : [];
            $factionNames[$row['catalog_id']]=array_column($catalog['factions']??[],'name','id');
            unset($catalog);
        }
        if (($army['schemaVersion']??null)===2) {
            // Preserve an empty JSON map: [] would turn later numeric weapon keys into an array.
            foreach ($army['entries'] as &$entry) $entry['weaponCounts']=(object)($entry['weaponCounts']??[]);
            unset($entry);
        }
        $army['revision']=builderRevision($army);
        $armies[]=$army+['id'=>$row['id'],'updated'=>$row['updated'],'created'=>null,
            'factionName'=>$factionNames[$row['catalog_id']][$army['factionId']]??$army['factionId']];
    }
    return ['armies'=>$armies];
}
function builderValidateArmy(array $catalog, array $in): array {
    if (($catalog['schemaVersion']??null)===2) return builderValidateV2($catalog,$in);
    $factionId=builderId($in['factionId']??null,'fazione');
    $detachmentId=builderId($in['detachmentId']??null,'distaccamento');
    $limit=builderInt($in['limit']??null,'limite punti',100,5000);
    $faction=null;
    foreach ($catalog['factions'] as $candidate) if ($candidate['id']===$factionId) $faction=$candidate;
    if ($faction===null) builderInvalid('La fazione non esiste nel catalogo selezionato.');
    if (!in_array($detachmentId,array_column($faction['detachments'],'id'),true)) builderInvalid('Distaccamento non valido per questa fazione.');
    $entries=$in['entries']??null;
    if (!is_array($entries) || !array_is_list($entries) || count($entries)>200) builderInvalid('Elenco unità non valido.');
    $units=array_column($faction['units'],null,'id');
    $total=0; $counts=[]; $clean=[];
    foreach ($entries as $entry) {
        if (!is_array($entry)) builderInvalid('Riga unità non valida.');
        $unitId=builderId($entry['unitId']??null,'unità');
        $unit=$units[$unitId]??null;
        if (!$unit) builderInvalid('Unità non presente nella fazione: '.$unitId);
        $models=builderInt($entry['models']??null,'numero miniature',1,200);
        $quantity=builderInt($entry['quantity']??null,'numero squadre',1,20);
        $costByModels=array_column($unit['points'],'points','models');
        if (!isset($costByModels[$models])) builderInvalid('Composizione non disponibile per '.$unit['name']);
        $selected=$entry['equipmentIds']??[];
        if (!is_array($selected) || !array_is_list($selected) || count($selected)>100) builderInvalid('Equipaggiamenti non validi.');
        $gear=array_column($unit['equipment'],null,'id');
        $equipmentIds=[]; $gearCost=0;
        foreach ($selected as $gid) {
            $gid=builderId($gid,'equipaggiamento');
            if (!isset($gear[$gid]) || in_array($gid,$equipmentIds,true)) builderInvalid('Selezione equipaggiamento non valida.');
            $equipmentIds[]=$gid;
            $gearCost+=$gear[$gid]['points'];
        }
        $total+=($costByModels[$models]+$gearCost)*$quantity;
        $counts[$unitId]=($counts[$unitId]??0)+$quantity;
        $clean[]=['unitId'=>$unitId,'models'=>$models,'quantity'=>$quantity,'equipmentIds'=>$equipmentIds];
    }
    $issues=[];
    if ($total>$limit) $issues[]='La lista supera il limite di punti.';
    foreach ($counts as $uid=>$count) {
        if ($count>$units[$uid]['maxCopies']) $issues[]='Troppe copie di '.$units[$uid]['name'].' (massimo '.$units[$uid]['maxCopies'].').';
    }
    return ['points'=>$total,'limit'=>$limit,'valid'=>count($issues)===0,'issues'=>$issues,'entries'=>$clean,'factionId'=>$factionId,'detachmentId'=>$detachmentId];
}
function builderSavedArmyText(PDO $pdo,string $owner,string $id): string {
    builderId($id,'armata');
    $stmt=$pdo->prepare('SELECT * FROM w40k_builder_armies WHERE id=? AND owner=?');$stmt->execute([$id,$owner]);$row=$stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) builderInvalid('Armata non disponibile nel tuo profilo.');
    $army=json_decode($row['payload'],true,40,JSON_THROW_ON_ERROR);$source=builderCatalogRow($pdo,$row['edition'],$row['catalog_id']);
    if (!$source) builderInvalid('Catalogo della lista non disponibile.');
    $catalog=builderRestoreCatalogCosts(json_decode($source['payload'],true,40,JSON_THROW_ON_ERROR));$units=array_column($catalog['units'],null,'id');$faction=array_column($catalog['factions'],null,'id')[$army['factionId']]??[];
    $total=0;$unknown=false;$counts=[];
    foreach($army['entries'] as $entry){
        $u=$units[$entry['unitId']]??[];$ordinal=($counts[$entry['unitId']]??0)+1;$counts[$entry['unitId']]=$ordinal;$points=$entry['manualPoints']??null;
        if($points===null)$points=builderEntryBasePrice($u,$entry,$ordinal);
        $quantity=$entry['quantity']??1;
        if($points===null)$unknown=true;else $total+=$points*$quantity;
        foreach($u['equipment']??[] as $gear)if(in_array($gear['id'],$entry['equipmentIds']??[],true))$total+=$gear['points']*$quantity;
        if(!isset($entry['manualPoints'])&&!empty($entry['loadoutSelections'])&&!empty($u['loadoutRecipe']))$total+=builderLoadoutCounts($u['loadoutRecipe'],$entry['loadoutSelections'],$entry['models'])['cost'];
        foreach($u['enhancements']??[] as $e)if(in_array($e['id'],$entry['enhancementIds']??[],true))$total+=(int)$e['cost'];
    }
    $lines=[$army['name'].' ('.$total.($unknown?' + unknown':'').' Points)',($faction['name']??'').' · '.($army['limit']??'').' Points'];
    $detachments=$army['detachmentIds']??[$army['detachmentId']??''];
    foreach ($faction['detachments']??[] as $d) if (in_array($d['id'],$detachments,true))$lines[]=$d['name'];
    if (!empty($army['disposition']))$lines[]='Force Disposition: '.$army['disposition'];
    $entries=array_column($army['entries'],null,'entryId');
    foreach ($army['entries'] as $entry) {
        $u=$units[$entry['unitId']]??null;if (!$u)builderInvalid('Scheda della lista non disponibile.');
        $lines[]='';$lines[]=($entry['models']??$entry['count']??1).'x '.$u['name'].(($entry['quantity']??1)>1?' · '.$entry['quantity'].' units':'').(!empty($entry['warlord'])?' [Warlord]':'');
        foreach($u['equipment']??[] as $gear)if(in_array($gear['id'],$entry['equipmentIds']??[],true))$lines[]='  '.$gear['name'];
        if (!empty($entry['attachedTo']))$lines[]='  Attached to: '.($units[$entries[$entry['attachedTo']]['unitId']]['name']??'');
        if (isset($entry['manualPoints']))$lines[]='  Points override: '.$entry['manualPoints'];
        foreach ($u['enhancements']??[] as $enhancement)if(in_array($enhancement['id'],$entry['enhancementIds']??[],true))$lines[]='  '.(($enhancement['upgrade']??'')==='true'?'Upgrade: ':'Enhancement: ').$enhancement['name'].' ('.$enhancement['cost'].' Points)';
        $recipe=$u['loadoutRecipe']??[];$gearRows=[];$managed=[];
        foreach ($recipe['groups']??[] as $group)foreach($group['choices'] as $choice)foreach($choice['weapons'] as $wid=>$per){
            $n=($entry['loadoutSelections'][$group['id']][$choice['id']]??0)*$per;if(!$n)continue;
            $gear=array_column($recipe['weapons'],null,'id')[$wid];$model=array_column($recipe['models'],null,'id')[$group['model']]['name'];
            $key=$model.'|'.$wid;$gearRows[$key]=['name'=>$gear['name'],'model'=>$model,'n'=>($gearRows[$key]['n']??0)+$n];
            foreach($gear['lines'] as $line)$managed[$line]=true;
        }
        foreach($gearRows as $gear)$lines[]='  '.$gear['n'].'x '.$gear['name'].' · '.$gear['model'];
        foreach ($u['weapons']??[] as $weapon) {
            if (isset($managed[$weapon['line']]))continue;
            $n=$entry['weaponCounts'][$weapon['line']]??0;
            if (!empty($weapon['enhancement_id'])&&in_array($weapon['enhancement_id'],$entry['enhancementIds']??[],true))$n=1;
            if ($n>0){$bearer=$entry['enhancementModels'][$weapon['enhancement_id']??'']??null;$model=$bearer?(array_column($u['models'],null,'line')[$bearer]['name']??''):'';$lines[]='  '.$n.'x '.$weapon['name'].($model?' · '.$model:'');}
        }
        if (!empty($entry['notes']))$lines[]='  Notes: '.$entry['notes'];
    }
    return implode("\n",$lines);
}
function builderHandle(PDO $pdo, string $action, array $me, array $data=[], ?array $preparedCatalog=null): array {
    if($action==='builderSave'&&($data['purpose']??'')==='pool'){
        require_once __DIR__.'/league-roster.php';
        return leaguePoolSave($pdo,$me,$data);
    }
    if ($action==='builderSync') return builderSync($pdo,$me,$data);
    if ($action==='builderCatalog') {
        $edition=builderEdition($_GET['edition']??'10');
        $catalogId=isset($_GET['catalogId']) ? builderId($_GET['catalogId'],'catalogo') : null;
        if(($_GET['metadata']??'')==='1'){
            $row=builderCatalogRow($pdo,$edition,$catalogId);if(!$row)return ['catalog'=>null];
            $hash=hash_init('sha256');hash_update($hash,$row['payload']);
            // Read-time repairs can change a catalog without changing its stored ID.
            foreach(['builder-model.php','builder-v2.php','builder-automation.php','builder-loadout-rules.php','builder-source-fixes.php','builder-rule-parameters.json'] as $file){$path=__DIR__.'/'.$file;hash_update($hash,$file.(is_file($path)?hash_file('sha256',$path):'missing'));}
            return ['catalog'=>['catalogId'=>$row['id'],'edition'=>$row['edition'],'version'=>$row['version'],'revision'=>hash_final($hash)]];
        }
        return builderGetCatalog($pdo,$edition,$catalogId);
    }
    if ($action==='builderArmies') return builderGetArmies($pdo,$me['id']);
    if ($action==='builderArmyText') return ['text'=>builderSavedArmyText($pdo,$me['id'],builderId($_GET['id']??null,'armata'))];
    if ($action==='builderDefaults') {
        $stmt=$pdo->prepare('SELECT unit_id,catalog_id,payload FROM w40k_builder_defaults WHERE owner=?');$stmt->execute([$me['id']]);$defaults=[];
        foreach ($stmt as $row) $defaults[]=['unitId'=>$row['unit_id'],'catalogId'=>$row['catalog_id'],'entry'=>json_decode($row['payload'],true,20,JSON_THROW_ON_ERROR)];
        return ['defaults'=>$defaults];
    }
    if (in_array($action,['builderDefaultSave','builderDefaultDelete'],true)) {
        $unitId=builderId($data['unitId']??null,'unità');
        if ($action==='builderDefaultDelete') {$pdo->prepare('DELETE FROM w40k_builder_defaults WHERE owner=? AND unit_id=?')->execute([$me['id'],$unitId]);return ['ok'=>true];}
        $catalogId=builderId($data['catalogId']??null,'catalogo');$catalogRow=builderCatalogRow($pdo,'11',$catalogId);
        if (!$catalogRow) builderInvalid('Catalogo non disponibile.');
        $catalog=builderRestoreCatalogCosts(json_decode($catalogRow['payload'],true,40,JSON_THROW_ON_ERROR));$unit=array_column($catalog['units'],null,'id')[$unitId]??null;
        if (!$unit) builderInvalid('Unità non disponibile.');
        $entry=$data['entry']??null;if (!is_array($entry)||($entry['unitId']??null)!==$unitId) builderInvalid('Default non valido.');
        if (!is_array($entry['weaponCounts']??[])) builderInvalid('Quantità armi del default non valide.');
        if (!in_array($entry['models']??null,array_column($unit['points'],'models'),true)) builderInvalid('La taglia del default non è disponibile nel catalogo.');
        $factionId=$data['factionId']??null;
        $entry['attachedTo']=null;$entry['enhancementIds']=[];$entry['enhancementModels']=[];$entry['notes']='';$entry['warlord']=false;$entry['manualPoints']=null;
        foreach ($unit['weapons'] as $weapon) if (!empty($weapon['enhancement_id'])) unset($entry['weaponCounts'][$weapon['line']]);
        $validation=builderValidateV2($catalog,['factionId'=>$factionId,'limit'=>2000,'detachmentIds'=>[],'disposition'=>'','entries'=>[$entry]]);
        $clean=$validation['entries'][0];$payload=json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $pdo->beginTransaction();
        try {$pdo->prepare('DELETE FROM w40k_builder_defaults WHERE owner=? AND unit_id=?')->execute([$me['id'],$unitId]);$pdo->prepare('INSERT INTO w40k_builder_defaults (owner,unit_id,catalog_id,payload) VALUES (?,?,?,?)')->execute([$me['id'],$unitId,$catalogId,$payload]);$pdo->commit();}
        catch (Throwable $e) {$pdo->rollBack();throw $e;}
        return ['ok'=>true];
    }
    if ($action==='builderImport') {
        if (!$me['admin']) builderInvalid('Solo un amministratore può importare cataloghi.');
        // Normalisation holds the incoming and generated catalogs plus the JSON payload.
        $memory=trim((string)ini_get('memory_limit'));$factor=match(strtolower(substr($memory,-1))){'k'=>1024,'m'=>1048576,'g'=>1073741824,default=>1};
        if($memory!=='-1'&&(int)$memory*$factor<268435456&&ini_set('memory_limit','256M')===false)builderInvalid('Memoria del server insufficiente per importare il catalogo.');
        $raw=$data['catalog']??null;
        if (!is_array($raw) || strlen(json_encode($raw,JSON_THROW_ON_ERROR))>28000000) builderInvalid('Catalogo JSON non valido o superiore a 28 MB.');
        $catalog=builderNormalizeCatalog($raw);
        $id=bin2hex(random_bytes(12));
        $payload=json_encode($catalog,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $pdo->beginTransaction();
        try {
            $stmt=$pdo->prepare('INSERT INTO w40k_builder_catalogs (id,edition,version,source,license,payload,created) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([$id,$catalog['edition'],$catalog['version'],$catalog['source'],$catalog['license'],$payload,date(DATE_ATOM)]);
            $stmt=$pdo->prepare('UPDATE w40k_builder_active SET catalog_id=? WHERE edition=?');
            $stmt->execute([$id,$catalog['edition']]);
            if ($stmt->rowCount()===0) {
                $exists=$pdo->prepare('SELECT 1 FROM w40k_builder_active WHERE edition=?');
                $exists->execute([$catalog['edition']]);
                if (!$exists->fetchColumn()) $pdo->prepare('INSERT INTO w40k_builder_active (edition,catalog_id) VALUES (?,?)')->execute([$catalog['edition'],$id]);
            }
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        return ['ok'=>true,'catalogId'=>$id,'edition'=>$catalog['edition']];
    }
    if ($action==='builderSave') {
        $edition=builderEdition($data['edition']??null);
        $catalogId=builderId($data['catalogId']??null,'catalogo');
        if($preparedCatalog!==null){
            if(($preparedCatalog['catalogId']??null)!==$catalogId)builderInvalid('Catalogo non corrispondente alla lista.');
            $catalog=$preparedCatalog;
        }else{
            $catalogRow=builderCatalogRow($pdo,$edition,$catalogId);
            if (!$catalogRow) builderInvalid('Catalogo non trovato.');
            $catalog=json_decode($catalogRow['payload'],true,40,JSON_THROW_ON_ERROR);
            unset($catalogRow);
        }
        $name=builderString($data['name']??null,'nome armata',100);
        $validation=builderValidateArmy($catalog,$data);
        $id=isset($data['id']) && $data['id']!==null ? builderId($data['id'],'armata') : bin2hex(random_bytes(12));
        $check=$pdo->prepare('SELECT owner,payload FROM w40k_builder_armies WHERE id=?');
        $check->execute([$id]);
        $existing=$check->fetch(PDO::FETCH_ASSOC);
        if ($existing!==false && $existing['owner']!==$me['id']) builderInvalid('Non puoi modificare questa armata.');
        if ($existing===false) {
            $faction=array_column($catalog['factions'],null,'id')[$validation['factionId']];
            if (($catalog['schemaVersion']??null)===2 && preg_match('/^Unbound Adversaries$/i',trim($faction['name']))) builderInvalid('Unbound Adversaries non è una fazione giocabile.');
            $count=$pdo->prepare('SELECT COUNT(*) FROM w40k_builder_armies WHERE owner=?');
            $count->execute([$me['id']]);
            if ((int)$count->fetchColumn()>=100) builderInvalid('Hai raggiunto il limite di 100 armate.');
        }
        $army=['id'=>$id,'name'=>$name,'edition'=>$edition,'catalogId'=>$catalogId,
            'factionId'=>$validation['factionId'],'detachmentId'=>$validation['detachmentId'],
            'limit'=>$validation['limit'],'entries'=>$validation['entries']];
        if (($catalog['schemaVersion']??null)===2) {
            $army['schemaVersion']=2;
            $army['detachmentIds']=$validation['detachmentIds'];
            $army['disposition']=$validation['disposition'];
            $army['dpLimit']=$validation['dpLimit'];
        }
        $updated=date(DATE_ATOM);
        // Creation belongs to the server; unknown historical dates stay unknown.
        $previous=$existing!==false ? json_decode($existing['payload'],true,20,JSON_THROW_ON_ERROR) : [];
        $army['created']=$existing===false ? $updated : ($previous['created']??null);
        $rosterSource=$data['rosterSource']??$previous['rosterSource']??null;
        if($rosterSource!==null) {
            require_once __DIR__.'/league-roster.php';
            if(!is_array($rosterSource)) builderInvalid('Riferimento roster non valido.');
            $army['rosterSource']=leagueRosterDraftSource($pdo,$me['id'],builderId($rosterSource['id']??null,'roster'));
            leagueRosterDraftCheck($catalog,$army,$army['rosterSource'],$validation['points']);
        }
        $payload=json_encode($army,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        if ($existing!==false) {
            $stmt=$pdo->prepare('UPDATE w40k_builder_armies SET name=?, edition=?, catalog_id=?, payload=?, updated=? WHERE id=? AND owner=?');
            $stmt->execute([$name,$edition,$catalogId,$payload,$updated,$id,$me['id']]);
        } else {
            $stmt=$pdo->prepare('INSERT INTO w40k_builder_armies (id,owner,name,edition,catalog_id,payload,updated) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([$id,$me['id'],$name,$edition,$catalogId,$payload,$updated]);
        }
        return ['ok'=>true,'army'=>$army+['updated'=>$updated],'validation'=>array_diff_key($validation,['entries'=>true,'factionId'=>true,'detachmentId'=>true])];
    }
    if ($action==='builderDelete') {
        $id=builderId($data['id']??null,'armata');
        $stmt=$pdo->prepare('DELETE FROM w40k_builder_armies WHERE id=? AND owner=?');
        $stmt->execute([$id,$me['id']]);
        if ($stmt->rowCount()===0) builderInvalid('Armata inesistente o non autorizzata.');
        return ['ok'=>true];
    }
    builderInvalid('Azione builder sconosciuta.');
}
