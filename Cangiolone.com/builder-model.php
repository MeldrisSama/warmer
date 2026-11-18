<?php
declare(strict_types=1);

/** Army Builder: independent, versioned catalogs. No proprietary game data bundled. */
final class BuilderInputError extends RuntimeException {}
require_once __DIR__.'/builder-v2.php';

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
        'armies'=>'`id` VARCHAR(24) PRIMARY KEY, `owner` VARCHAR(24) NOT NULL, `name` VARCHAR(100) NOT NULL, `edition` VARCHAR(2) NOT NULL, `catalog_id` VARCHAR(24) NOT NULL, `payload` LONGTEXT NOT NULL, `updated` VARCHAR(40) NOT NULL'
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
    return ['catalog'=>$catalog+['catalogId'=>$row['id'],'created'=>$row['created']]];
}
function builderGetArmies(PDO $pdo, string $user): array {
    $stmt=$pdo->prepare('SELECT id,name,edition,catalog_id,payload,updated FROM w40k_builder_armies WHERE owner=? ORDER BY updated DESC');
    $stmt->execute([$user]);
    $armies=[];
    foreach ($stmt as $row) {
        $army=json_decode($row['payload'],true,20,JSON_THROW_ON_ERROR);
        if (($army['schemaVersion']??null)===2) {
            // Preserve an empty JSON map: [] would turn later numeric weapon keys into an array.
            foreach ($army['entries'] as &$entry) $entry['weaponCounts']=(object)($entry['weaponCounts']??[]);
            unset($entry);
        }
        $armies[]=$army+['id'=>$row['id'],'updated'=>$row['updated']];
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
function builderHandle(PDO $pdo, string $action, array $me, array $data=[]): array {
    if ($action==='builderCatalog') {
        $edition=builderEdition($_GET['edition']??'10');
        $catalogId=isset($_GET['catalogId']) ? builderId($_GET['catalogId'],'catalogo') : null;
        return builderGetCatalog($pdo,$edition,$catalogId);
    }
    if ($action==='builderArmies') return builderGetArmies($pdo,$me['id']);
    if ($action==='builderImport') {
        if (!$me['admin']) builderInvalid('Solo un amministratore può importare cataloghi.');
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
        $catalogRow=builderCatalogRow($pdo,$edition,$catalogId);
        if (!$catalogRow) builderInvalid('Catalogo non trovato.');
        $catalog=json_decode($catalogRow['payload'],true,40,JSON_THROW_ON_ERROR);
        $name=builderString($data['name']??null,'nome armata',100);
        $validation=builderValidateArmy($catalog,$data);
        $id=isset($data['id']) && $data['id']!==null ? builderId($data['id'],'armata') : bin2hex(random_bytes(12));
        $check=$pdo->prepare('SELECT owner FROM w40k_builder_armies WHERE id=?');
        $check->execute([$id]);
        $existing=$check->fetchColumn();
        if ($existing!==false && $existing!==$me['id']) builderInvalid('Non puoi modificare questa armata.');
        if ($existing===false) {
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
        $payload=json_encode($army,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $updated=date(DATE_ATOM);
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
