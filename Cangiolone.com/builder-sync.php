<?php
declare(strict_types=1);

// User content only: a catalog/points update must never ask the user to resolve a conflict.
function builderRevision(array $army): string {
    foreach (['catalogId','revision','updated','created','factionName','catalogWarning','_syncOperation'] as $key) unset($army[$key]);
    if(($army['schemaVersion']??null)===2)unset($army['detachmentId']);
    $sort=function(mixed $value) use (&$sort): mixed {
        if (is_object($value)) $value=(array)$value;
        if (!is_array($value)) return $value;
        if (!array_is_list($value)) ksort($value);
        return array_map($sort,$value);
    };
    return hash('sha256',json_encode($sort($army),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
}

function builderSync(PDO $pdo,array $me,array $data): array {
    if(isset($data['offlineOwner'])&&$data['offlineOwner']!==$me['id'])builderInvalid('Accedi con l’account delle liste offline.');
    $id=builderId($data['id']??null,'armata');
    if (!array_key_exists('baseRevision',$data) || ($data['baseRevision']!==null && !preg_match('/^[a-f0-9]{64}$/D',(string)$data['baseRevision']))) builderInvalid('Revisione di sincronizzazione non valida.');
    $operation=isset($data['operationId'])?builderId($data['operationId'],'operazione'):null;
    $deleted=($data['deleted']??false)===true;
    // A migration may inspect both old and current catalogs; release them before saving.
    $memory=trim((string)ini_get('memory_limit'));$factor=match(strtolower(substr($memory,-1))){'k'=>1024,'m'=>1048576,'g'=>1073741824,default=>1};
    if($memory!=='-1'&&(int)$memory*$factor<268435456)ini_set('memory_limit','256M');
    $pdo->beginTransaction();
    try {
        $lock=$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':'';
        $stmt=$pdo->prepare('SELECT owner,payload,updated FROM w40k_builder_armies WHERE id=?'.$lock);$stmt->execute([$id]);$row=$stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && $row['owner']!==$me['id']) builderInvalid('Non puoi modificare questa armata.');
        $remote=$row?json_decode($row['payload'],true,20,JSON_THROW_ON_ERROR):null;
        $revision=$remote?builderRevision($remote):null;
        if ($remote) {$remote['updated']=$row['updated'];$remote['revision']=$revision;}
        if(!$deleted&&$operation!==null&&$remote&&($remote['_syncOperation']??null)===$operation){$pdo->commit();return ['ok'=>true,'army'=>$remote,'validation'=>['errors'=>[]],'catalogWarning'=>$remote['catalogWarning']??null];}
        $army=$data['army']??null;
        if (!$deleted && (!is_array($army)||($army['id']??null)!==$id)) builderInvalid('Armata da sincronizzare non valida.');
        // A retry after a lost response is safe: the requested content is already on the server.
        $identical=!$deleted && $remote && builderRevision($army)===$revision;
        if ($data['baseRevision']!==$revision && !$identical && !($deleted && !$remote)) {
            $pdo->commit();return ['conflict'=>true,'remote'=>$remote,'revision'=>$revision];
        }
        if ($deleted) {
            if ($remote) builderHandle($pdo,'builderDelete',$me,['id'=>$id]);
            $pdo->commit();return ['ok'=>true,'deleted'=>true];
        }
        $warning=null;
        $active=builderCatalogRow($pdo,builderEdition($army['edition']??null));
        if (empty($army['rosterSource']) && $active && $active['id']!==($army['catalogId']??null) && ($army['schemaVersion']??null)===2) {
            $candidate=$army;$candidate['catalogId']=$active['id'];
            try {
                $catalog=json_decode($active['payload'],true,40,JSON_THROW_ON_ERROR);
                $oldRow=builderCatalogRow($pdo,$army['edition'],$army['catalogId']);
                $oldCatalog=$oldRow?json_decode($oldRow['payload'],true,40,JSON_THROW_ON_ERROR):[];
                $oldUnits=array_column($oldCatalog['units']??[],null,'id');$newUnits=array_column($catalog['units']??[],null,'id');
                foreach($army['entries'] as $entry){
                    $old=$oldUnits[$entry['unitId']]??null;$new=$newUnits[$entry['unitId']]??null;
                    if(!$old||!$new)builderInvalid('Una scheda non è più disponibile.');
                    if(($entry['manualPoints']??null)===null&&!in_array($entry['models'],array_column($new['points'],'models'),true))builderInvalid('Una taglia della squadra non è più disponibile.');
                    $oldModels=array_column($old['models'],null,'line');$newModels=array_column($new['models'],null,'line');
                    foreach($entry['enhancementModels']??[] as $line)if(($oldModels[$line]['name']??null)!==($newModels[$line]['name']??null))builderInvalid('Il portatore di un potenziamento è cambiato.');
                    $weapons=array_column($new['weapons'],null,'line');
                    foreach($old['weapons'] as $weapon)if(($entry['weaponCounts'][$weapon['line']]??0)>0&&($weapons[$weapon['line']]['name']??null)!==$weapon['name'])builderInvalid('Una dotazione è cambiata nel nuovo catalogo.');
                    if(isset($entry['loadoutSelections'])&&($old['loadoutRecipe']??null)!==($new['loadoutRecipe']??null))builderInvalid('Le scelte di equipaggiamento sono cambiate.');
                }
                builderValidateArmy($catalog,$candidate);
                $army=$candidate;
            } catch (BuilderInputError $e) {
                // Keep every selection and the old catalog if a unit/option no longer exists.
                $warning='Catalogo aggiornato: rivedi questa lista prima di applicarlo. '.$e->getMessage();
            }
        }
        unset($catalog,$oldCatalog,$oldUnits,$newUnits,$oldRow,$old,$new,$weapons,$oldModels,$newModels);
        $result=builderHandle($pdo,'builderSave',$me,$army);
        $result['army']['_syncOperation']=$operation;
        if($warning)$result['army']['catalogWarning']=$warning;
        $payload=json_encode($result['army'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $pdo->prepare('UPDATE w40k_builder_armies SET payload=? WHERE id=? AND owner=?')->execute([$payload,$id,$me['id']]);
        $result['army']['revision']=builderRevision($result['army']);
        $result['catalogWarning']=$warning;
        $pdo->commit();return $result;
    } catch (Throwable $e) {if ($pdo->inTransaction()) $pdo->rollBack();throw $e;}
}
