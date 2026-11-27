<?php
declare(strict_types=1);

// Roster prices reserve optional equipment; match prices still charge equipped items normally.
function leagueRosterOptions(array $unit, int $models, array $modelCounts=[]): array {
    $recipe=$unit['loadoutRecipe']??null;
    if (!$recipe) builderInvalid('Serve una dotazione guidata per '.$unit['name'].'.');
    $options=[];
    foreach ($recipe['weapons'] as $weapon) {
        if (($weapon['cost']??0)<=0) continue;
        $maximum=0;
        foreach ($recipe['groups'] as $group) {
            $perChoice=0;
            foreach ($group['choices'] as $choice) $perChoice=max($perChoice,$choice['weapons'][$weapon['id']]??0);
            $maximum+=$perChoice*builderLoadoutCapacity($recipe,$group,$models,$modelCounts);
        }
        if ($maximum) $options[$weapon['id']]=['id'=>$weapon['id'],'name'=>$weapon['name'],'cost'=>(int)$weapon['cost'],'maximum'=>$maximum];
    }
    return $options;
}

function leagueRosterEquipped(array $unit, array $entry): array {
    if (!isset($entry['loadoutSelections']) || !is_array($entry['loadoutSelections'])) {
        builderInvalid($unit['name'].': applica la dotazione guidata prima di usare questa unità nel campionato.');
    }
    $recipe=$unit['loadoutRecipe']??[];
    $loadout=builderLoadoutCounts($recipe,$entry['loadoutSelections'],$entry['models']);
    $counts=[];
    // Count equipment IDs, not profile lines: Frag/Krak and gear without a weapon profile count once.
    foreach ($recipe['groups'] as $group) foreach ($group['choices'] as $choice) {
        $quantity=$loadout['selections'][$group['id']][$choice['id']]??0;
        foreach ($choice['weapons'] as $id=>$perModel) $counts[$id]=($counts[$id]??0)+$quantity*$perModel;
    }
    return array_filter($counts,static fn($n)=>$n>0);
}

function leagueRosterEntry(array $unit, array $entry, int $ordinal, array $declared, bool $requireEquipped=true): array {
    if (($entry['manualPoints']??null)!==null) builderInvalid('I punti manuali non sono ammessi nei roster.');
    $base=builderEntryBasePrice($unit,$entry,$ordinal);
    if ($base===null) builderInvalid($unit['name'].': costo base non disponibile.');
    $options=leagueRosterOptions($unit,$entry['models'],$entry['loadoutSelections']['_models']??[]);
    $equipped=leagueRosterEquipped($unit,$entry);
    // Already equipped paid items must be explicitly reserved too.
    $budget=0;$paid=[];
    foreach ($declared as $id=>$quantity) {
        if (!isset($options[$id])) builderInvalid($unit['name'].': opzione a pagamento sconosciuta.');
        $quantity=builderInt($quantity,'quantità riservata',0,$options[$id]['maximum']);
        if (!$quantity) continue;
        $paid[$id]=$quantity;
        $budget=max($budget,$options[$id]['cost']*$quantity);
    }
    foreach ($options as $id=>$option) if ($requireEquipped && ($equipped[$id]??0)>($paid[$id]??0)) {
        builderInvalid($unit['name'].': riserva '.$option['name'].' nel roster prima di utilizzarlo.');
    }
    return ['entryId'=>$entry['entryId'],'unitId'=>$entry['unitId'],'name'=>$unit['name'],'models'=>$entry['models'],
        'basePoints'=>$base,'equipmentPoints'=>$budget,
        'points'=>$base+$budget,'paidOptions'=>(object)$paid,'options'=>array_values($options),
        'modelCounts'=>$entry['loadoutSelections']['_models']??[]];
}

function leagueRosterBuild(array $catalog, array $army, array $paidOptions, int $limit): array {
    if (($catalog['schemaVersion']??null)!==2) builderInvalid('I roster richiedono il builder con dotazioni guidate.');
    $entries=$army['entries']??[];
    if (!$entries) builderInvalid('Il roster deve contenere almeno un’unità.');
    // Reuse structural validation, without requiring a pool to be a playable match army.
    $structure=$army;$structure['limit']=min(5000,$army['limit']);
    $validation=builderValidateArmy($catalog,$structure);
    $units=array_column($catalog['units'],null,'id');$counts=[];$out=[];$total=0;
    $known=array_column($entries,null,'entryId');
    foreach ($paidOptions as $id=>$options) if (!isset($known[$id]) || !is_array($options)) builderInvalid('Opzioni del roster non valide.');
    foreach ($validation['entries'] as $entry) {
        $id=$entry['entryId'];$uid=$entry['unitId'];$counts[$uid]=($counts[$uid]??0)+1;
        $declared=$paidOptions[$id]??$known[$id]['rosterPaidOptions']??[];
        if(!is_array($declared)) builderInvalid('Opzioni del pool non valide.');
        $row=leagueRosterEntry($units[$uid],$entry,$counts[$uid],$declared,($army['purpose']??'')!=='pool');
        $total+=$row['points'];$out[]=$row;
    }
    if ($total>$limit) builderInvalid('Il roster supera il limite di '.$limit.' punti (totale '.$total.').');
    return ['factionId'=>$army['factionId'],'points'=>$total,'entries'=>$out];
}

function leagueRosterMatches(array $rosterEntry, array $entry, array $equipped): bool {
    if ($rosterEntry['unitId']!==$entry['unitId'] || $rosterEntry['models']!==$entry['models']) return false;
    if (($rosterEntry['modelCounts']??[])!=($entry['loadoutSelections']['_models']??[])) return false;
    $paid=(array)$rosterEntry['paidOptions'];
    foreach ($rosterEntry['options'] as $option) if (($equipped[$option['id']]??0)>($paid[$option['id']]??0)) return false;
    return true;
}

function leagueRosterUnitKey(array $entry,array $modelCounts): string {
    ksort($modelCounts,SORT_STRING);
    return json_encode([$entry['unitId'],$entry['models'],$modelCounts],JSON_THROW_ON_ERROR);
}

function leagueRosterCopies(array $roster): array {
    $copies=[];
    foreach($roster['entries'] as $index=>$entry) $copies[leagueRosterUnitKey($entry,$entry['modelCounts']??[])][]=$index;
    return $copies;
}

function leagueRosterCandidate(array $army,array $roster,array $copies): void {
    if(($army['purpose']??'')==='pool' || $army['factionId']!==$roster['factionId']) builderInvalid('Serve una lista da partita della stessa fazione del roster.');
    if(empty($army['entries'])) builderInvalid('La lista dell’incontro è vuota.');
    $used=[];
    foreach($army['entries'] as $entry) {
        if(isset($entry['manualPoints'])) builderInvalid('I punti manuali non sono ammessi nelle liste del campionato.');
        $key=leagueRosterUnitKey($entry,$entry['loadoutSelections']['_models']??[]);
        $used[$key]=($used[$key]??0)+1;
        if($used[$key]>count($copies[$key]??[])) builderInvalid('Una copia, taglia o composizione non è disponibile nel roster.');
    }
}

function leagueRosterValidateLineup(array $catalog, array $army, array $roster, int $limit, ?array $copies=null): array {
    if ($army['factionId']!==$roster['factionId']) builderInvalid('La fazione della lista deve coincidere con il roster.');
    $army['limit']=$limit;
    $validation=builderValidateArmy($catalog,$army);
    if ($validation['issues']) builderInvalid('Lista dell’incontro da correggere: '.implode(' ',$validation['issues']));
    if (!$validation['entries']) builderInvalid('La lista dell’incontro è vuota.');
    $units=array_column($catalog['units'],null,'id');$edges=[];
    $copies??=leagueRosterCopies($roster);
    foreach ($validation['entries'] as $i=>$entry) {
        if (($entry['manualPoints']??null)!==null) builderInvalid('I punti manuali non sono ammessi nel campionato.');
        $equipped=leagueRosterEquipped($units[$entry['unitId']],$entry);$edges[$i]=[];
        $key=leagueRosterUnitKey($entry,$entry['loadoutSelections']['_models']??[]);
        foreach($copies[$key]??[] as $j) if(leagueRosterMatches($roster['entries'][$j],$entry,$equipped)) $edges[$i][]=$j;
    }
    // Augmenting paths avoid greedy failures when two identical units reserve different options.
    $assigned=[];
    $assign=function(int $i,array &$visited) use (&$assign,&$assigned,$edges): bool {
        foreach ($edges[$i] as $j) {
            if (isset($visited[$j])) continue;
            $visited[$j]=true;
            if (!isset($assigned[$j]) || $assign($assigned[$j],$visited)) {$assigned[$j]=$i;return true;}
        }
        return false;
    };
    foreach ($validation['entries'] as $i=>$entry) {
        $visited=[];
        if (!$assign($i,$visited)) builderInvalid($units[$entry['unitId']]['name'].': copia, taglia o opzioni a pagamento non disponibili nel roster.');
    }
    return $validation;
}

function leagueRosterSavedArmy(PDO $pdo, string $owner, string $id): array {
    $stmt=$pdo->prepare('SELECT * FROM w40k_builder_armies WHERE id=? AND owner=?');$stmt->execute([$id,$owner]);$row=$stmt->fetch();
    if (!$row) builderInvalid('Armata non disponibile nel tuo profilo.');
    $catalog=builderGetCatalog($pdo,$row['edition'],$row['catalog_id'])['catalog'];
    if (!$catalog) builderInvalid('Catalogo storico non disponibile.');
    return ['army'=>json_decode($row['payload'],true,40,JSON_THROW_ON_ERROR),
        'catalog'=>$catalog,'catalogId'=>$row['catalog_id'],'edition'=>$row['edition']];
}

function leagueFactionKey(string $name): string {
    return strtolower(preg_replace('/[^a-z0-9]/i','',$name));
}

function leagueBuildEntryList(PDO $pdo,string $owner,mixed $id,string $faction,int $limit): array {
    $source=leagueRosterSavedArmy($pdo,$owner,builderId($id,'lista da partita'));
    $army=$source['army']; $catalog=$source['catalog'];
    if(($army['purpose']??'')==='pool' || !$army['entries']) builderInvalid('Scegli una lista da partita con almeno un’unità.');
    $factions=array_column($catalog['factions'],'name','id');
    if(leagueFactionKey($factions[$army['factionId']]??'')!==leagueFactionKey($faction)) builderInvalid('La fazione della lista deve coincidere con quella dichiarata.');
    foreach($army['entries'] as $entry) if(isset($entry['manualPoints'])) builderInvalid('I punti manuali non sono ammessi nelle liste del torneo.');
    $army['limit']=$limit;
    $validation=builderValidateArmy($catalog,$army);
    if($validation['issues']) builderInvalid('Lista del torneo da correggere: '.implode(' ',$validation['issues']));
    $army['entries']=$validation['entries'];
    return ['name'=>$army['name'],'points'=>$validation['points'],'text'=>builderArmyText($catalog,$army)];
}

function leagueRosterSettings(array $db, string $league): ?array {
    foreach ($db['league_roster_settings']??[] as $row) if ($row['id']===$league) return json_decode($row['payload'],true,20,JSON_THROW_ON_ERROR);
    return null;
}

function leagueRosterVersions(array $db, string $league, string $player): array {
    $rows=array_values(array_filter($db['league_rosters']??[],static fn($r)=>$r['league_id']===$league && $r['player']===$player));
    usort($rows,static fn($a,$b)=>$b['version']<=>$a['version']);
    return $rows;
}

function leagueRosterState(array $db, ?array $league, string $player): array {
    if (!$league) return ['settings'=>null,'versions'=>[],'submitted'=>[]];
    $versions=leagueRosterVersions($db,$league['id'],$player);
    return ['settings'=>leagueRosterSettings($db,$league['id']),
        'versions'=>array_map(static fn($row)=>['id'=>$row['id'],'version'=>$row['version'],'created'=>$row['created'],'roster'=>json_decode($row['payload'],true,40,JSON_THROW_ON_ERROR)],$versions),
        'submitted'=>array_values(array_unique(array_column(array_filter($db['league_rosters']??[],static fn($r)=>$r['league_id']===$league['id']),'player')))];
}

function leagueRosterPreview(PDO $pdo, string $owner, string $id): array {
    $source=leagueRosterSavedArmy($pdo,$owner,$id);$army=$source['army'];$units=array_column($source['catalog']['units'],null,'id');$rows=[];
    if (($source['catalog']['schemaVersion']??null)!==2) builderInvalid('Scegli una lista con dotazioni guidate.');
    $ordinals=[];
    foreach ($army['entries'] as $entry) {
        $unit=$units[$entry['unitId']];$options=leagueRosterOptions($unit,$entry['models'],$entry['loadoutSelections']['_models']??[]);$equipped=leagueRosterEquipped($unit,$entry);
        foreach ($options as &$option) $option['quantity']=($army['purpose']??'')==='pool'?($entry['rosterPaidOptions'][$option['id']]??0):($equipped[$option['id']]??0);
        unset($option);
        $ordinals[$unit['id']]=($ordinals[$unit['id']]??0)+1;
        $paid=[];foreach($options as $option)$paid[$option['id']]=$option['quantity'];
        $row=leagueRosterEntry($unit,$entry,$ordinals[$unit['id']],$paid,($army['purpose']??'')!=='pool');
        $rows[]=$row;
        $rows[count($rows)-1]['options']=array_values($options);
    }
    return ['name'=>$army['name'],'entries'=>$rows,'revision'=>builderRevision($army)];
}

function leagueRosterSave(array $in, array $me, array &$db, array $league, array $settings, PDO $pdo): void {
    $player=$me['id'];
    if (!in_array($player,leaguePlayers($db,$league['id']),true)) fail('Iscriviti al campionato prima di consegnare il roster.',403);
    if ($league['start'] && !$settings['windowOpen']) fail('La finestra di modifica dei roster è chiusa.',409);
    $versions=leagueRosterVersions($db,$league['id'],$player);$previous=$versions[0]??null;
    if (($in['baseVersion']??null)!==($previous['id']??'')) fail('Il roster è cambiato. Ricarica la pagina prima di salvarlo.',409);
    $source=leagueRosterSavedArmy($pdo,$player,builderId($in['builderArmyId']??null,'armata'));
    if(isset($in['poolRevision']) && $in['poolRevision']!==builderRevision($source['army'])) fail('Il pool è cambiato. Controlla il nuovo riepilogo e conferma di nuovo.',409);
    $members=array_column($db['league_members'],null,'id');$member=$members[$league['id'].':'.$player];
    $groups=array_merge(...array_values(LEAGUE_ARMIES));
    $faction=array_column($source['catalog']['factions'],null,'id')[$source['army']['factionId']];
    if (leagueFactionKey($faction['name'])!==leagueFactionKey($groups[$member['army']]??'')) builderInvalid('La fazione del roster deve coincidere con quella dichiarata all’iscrizione.');
    $paid=$in['paidOptions']??[];
    if (!is_array($paid)) builderInvalid('Opzioni del roster non valide.');
    $roster=leagueRosterBuild($source['catalog'],$source['army'],$paid,$settings['rosterLimit']);
    $roster+=['catalogId'=>$source['catalogId'],'edition'=>$source['edition'],'name'=>$source['army']['name']];
    $db['league_rosters'][]=['id'=>ident(),'league_id'=>$league['id'],'player'=>$player,'version'=>($previous['version']??0)+1,
        'created'=>date(DATE_ATOM),'payload'=>json_encode($roster,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)];
}

function leagueRosterCheckDelivery(array $in, array $me, array &$db, PDO $pdo): ?string {
    $index=leagueFixture($db['league_fixtures'],field($in,'fixture',24),$me['id']);$fixture=$db['league_fixtures'][$index];
    $requested=field($in,'league',24,false);
    if($requested!=='' && $requested!==$fixture['league_id']) fail('Incontro non trovato.',404);
    $league=$db['league'][leagueIndex($db['league'],$fixture['league_id'])];
    if($league['closed']!==null) fail('Il campionato è concluso.',409);
    if($league['paused']!==null) fail('Il campionato è in pausa.',409);
    if(($league['entry_list_limit']??0)>0) fail('In questo torneo vale la lista consegnata all’iscrizione.',409);
    $settings=leagueRosterSettings($db,$fixture['league_id']);
    if (!$settings) {
        $pointLimit=$league['match_point_limit']??0;
        if(!$pointLimit) return null;
        if(empty($in['builderArmyId'])) builderInvalid('Questo campionato ha un limite in punti. Consegna una lista salvata nel Builder.');
        return builderSavedArmyText($pdo,$me['id'],builderId($in['builderArmyId'],'armata'),$pointLimit);
    }
    $lists=array_column($db['league_lineups'],null,'id');$id=$fixture['id'].':'.$me['id'];
    if ($fixture['match_id']!==null) fail('Il risultato dell’incontro è già stato confermato.',409);
    if (isset($lists[$fixture['id'].':'.$fixture['a']],$lists[$fixture['id'].':'.$fixture['b']])) fail('Le liste sono già definitive.',409);
    $version=leagueRosterVersions($db,$fixture['league_id'],$me['id'])[0]??null;
    if (!$version) fail('Consegna il roster prima della lista dell’incontro.',409);
    if(isset($in['rosterVersion']) && $in['rosterVersion']!==$version['id']) fail('Il roster è cambiato. Scegli di nuovo una lista compatibile.',409);
    if (empty($in['builderArmyId'])) builderInvalid('Questo campionato richiede una lista dal builder per verificare il roster.');
    $source=leagueRosterSavedArmy($pdo,$me['id'],builderId($in['builderArmyId'],'armata'));
    if(($source['army']['purpose']??'')==='pool') builderInvalid('Il pool è il bacino del campionato. Per l’incontro scegli una lista da partita.');
    $roster=json_decode($version['payload'],true,40,JSON_THROW_ON_ERROR);
    if ($source['catalogId']!==$roster['catalogId']) builderInvalid('Usa lo stesso catalogo della versione attuale del roster.');
    $validation=leagueRosterValidateLineup($source['catalog'],$source['army'],$roster,$settings['matchLimit']);
    $rows=array_column($db['league_roster_lineups'],null,'id');
    $rows[$id]=['id'=>$id,'roster_id'=>$version['id'],'payload'=>json_encode($validation,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)];
    $db['league_roster_lineups']=array_values($rows);
    $army=$source['army'];
    $army['limit']=$settings['matchLimit'];
    $army['entries']=$validation['entries'];
    return builderArmyText($source['catalog'],$army);
}

function leagueRosterCompatibility(PDO $pdo,array $db,array $me,array $query): array {
    $league=$db['league'][leagueIndex($db['league'],builderId($query['league']??null,'campionato'))];
    $settings=leagueRosterSettings($db,$league['id']);
    if(!$settings) fail('Il campionato non prevede un roster.',409);
    $owner=$me['id'];
    $catalog=null;
    if(isset($query['pool'])) {
        if($league['closed'] || $league['paused'] || ($league['start'] && !$settings['windowOpen'])) fail('La consegna del roster è chiusa.',409);
        $source=leagueRosterSavedArmy($pdo,$owner,builderId($query['pool'],'pool'));
        if(($source['army']['purpose']??'')!=='pool') builderInvalid('Scegli un pool del campionato.');
        if(isset($query['revision']) && $query['revision']!==builderRevision($source['army'])) fail('Il pool è cambiato durante la verifica. Ricarica la pagina.',409);
        $catalog=$source['catalog'];
        $roster=leagueRosterBuild($catalog,$source['army'],[],$settings['rosterLimit'])
            + ['edition'=>$source['edition'],'catalogId'=>$source['catalogId']];
    } else {
        $queryVersion=$pdo->prepare('SELECT id,payload FROM w40k_league_rosters WHERE league_id=? AND player=? ORDER BY version DESC LIMIT 1');
        $queryVersion->execute([$league['id'],$owner]);
        $version=$queryVersion->fetch();
        if(!$version || ($query['version']??null)!==$version['id']) fail('Il roster attivo è cambiato. Ricarica il campionato.',409);
        $roster=json_decode($version['payload'],true,40,JSON_THROW_ON_ERROR);
    }
    $ids=$query['lists']??'';
    if(!is_string($ids) || strlen($ids)>800) builderInvalid('Elenco di liste non valido.');
    $ids=array_values(array_unique(array_filter(explode(',',$ids))));
    if(count($ids)>12) builderInvalid('Verifica al massimo 12 liste per richiesta.');
    if(!$ids) return ['lists'=>[]];
    foreach($ids as $id) builderId($id,'lista');
    $placeholders=implode(',',array_fill(0,count($ids),'?'));
    $statement=$pdo->prepare('SELECT id,payload FROM w40k_builder_armies WHERE owner=? AND catalog_id=? AND id IN ('.$placeholders.')');
    $statement->execute([$owner,$roster['catalogId'],...$ids]);
    $copies=leagueRosterCopies($roster);
    $results=[];
    foreach($statement as $row) {
        $army=json_decode($row['payload'],true,40,JSON_THROW_ON_ERROR);
        try {
            leagueRosterCandidate($army,$roster,$copies);
            $catalog??=builderGetCatalog($pdo,$roster['edition'],$roster['catalogId'])['catalog'];
            if(!$catalog) builderInvalid('Catalogo storico non disponibile.');
            $validated=leagueRosterValidateLineup($catalog,$army,$roster,$settings['matchLimit'],$copies);
            $results[]=['id'=>$row['id'],'points'=>$validated['points']];
        } catch(BuilderInputError $error) {
            $results[]=['id'=>$row['id'],'reason'=>$error->getMessage()];
        }
    }
    return ['lists'=>$results];
}

function leaguePoolSave(PDO $pdo, array $me, array $in): array {
    $edition=builderEdition($in['edition']??null);$catalogId=builderId($in['catalogId']??null,'catalogo');
    $catalog=builderGetCatalog($pdo,$edition,$catalogId)['catalog'];
    if(!$catalog)builderInvalid('Catalogo non disponibile.');
    if(($catalog['schemaVersion']??null)!==2) builderInvalid('Il pool richiede un catalogo con dotazioni guidate.');
    $limit=builderInt($in['limit']??null,'limite pool',100,20000);
    $data=$in;unset($data['purpose']);$data['limit']=min(5000,$limit);$data['detachmentIds']=[];$data['disposition']='';$data['dpLimit']=0;
    $entries=$in['entries']??null;
    if(!is_array($entries)||!array_is_list($entries))builderInvalid('Unità del pool non valide.');
    $data['entries']=[];
    foreach($entries as $entry) {
        if(!is_array($entry))builderInvalid('Unità del pool non valida.');
        $entry['enhancementIds']=[];$entry['enhancementModels']=[];$entry['warlord']=false;$entry['attachedTo']=null;
        $data['entries'][]=$entry;
    }
    $validation=builderValidateArmy($catalog,$data);$units=array_column($catalog['units'],null,'id');
    $original=array_column($in['entries'],null,'entryId');$ordinals=[];$total=0;
    foreach($validation['entries'] as &$entry) {
        $uid=$entry['unitId'];$ordinals[$uid]=($ordinals[$uid]??0)+1;
        $paid=$original[$entry['entryId']]['rosterPaidOptions']??[];
        if(!is_array($paid))builderInvalid('Opzioni del pool non valide.');
        $reserved=leagueRosterEntry($units[$uid],$entry,$ordinals[$uid],$paid,false);
        $entry['rosterPaidOptions']=$reserved['paidOptions'];$total+=$reserved['points'];
    }
    unset($entry);
    $ownsTransaction=!$pdo->inTransaction();
    if($ownsTransaction)$pdo->beginTransaction();
    try {
        $saved=builderHandle($pdo,'builderSave',$me,$data,$catalog);
        $saved['army']['purpose']='pool';$saved['army']['limit']=$limit;$saved['army']['dpLimit']=0;$saved['army']['entries']=$validation['entries'];
        $pdo->prepare('UPDATE w40k_builder_armies SET payload=? WHERE id=? AND owner=?')->execute([
            json_encode($saved['army'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$saved['army']['id'],$me['id']]);
        $issues=$total>$limit?['Il pool supera il limite di punti.']:[];
        $saved['validation']=['points'=>$total,'limit'=>$limit,'issues'=>$issues,'errors'=>$issues,'valid'=>false,'manualReview'=>true];
        if($ownsTransaction)$pdo->commit();return $saved;
    } catch(Throwable $e) {if($ownsTransaction)$pdo->rollBack();throw $e;}
}
