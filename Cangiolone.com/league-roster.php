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

function leagueRosterEntry(array $unit, array $entry, int $ordinal, array $declared): array {
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
    foreach ($options as $id=>$option) if (($equipped[$id]??0)>($paid[$id]??0)) {
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
    $validation=builderValidateArmy($catalog,$army);
    $units=array_column($catalog['units'],null,'id');$counts=[];$out=[];$total=0;
    $known=array_column($entries,null,'entryId');
    foreach ($paidOptions as $id=>$options) if (!isset($known[$id]) || !is_array($options)) builderInvalid('Opzioni del roster non valide.');
    foreach ($validation['entries'] as $entry) {
        $id=$entry['entryId'];$uid=$entry['unitId'];$counts[$uid]=($counts[$uid]??0)+1;
        $row=leagueRosterEntry($units[$uid],$entry,$counts[$uid],$paidOptions[$id]??[]);
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

function leagueRosterValidateLineup(array $catalog, array $army, array $roster, int $limit): array {
    if ($army['factionId']!==$roster['factionId']) builderInvalid('La fazione della lista deve coincidere con il roster.');
    $army['limit']=$limit;
    $validation=builderValidateArmy($catalog,$army);
    if ($validation['issues']) builderInvalid('Lista dell’incontro da correggere: '.implode(' ',$validation['issues']));
    if (!$validation['entries']) builderInvalid('La lista dell’incontro è vuota.');
    $units=array_column($catalog['units'],null,'id');$edges=[];
    foreach ($validation['entries'] as $i=>$entry) {
        if (($entry['manualPoints']??null)!==null) builderInvalid('I punti manuali non sono ammessi nel campionato.');
        $equipped=leagueRosterEquipped($units[$entry['unitId']],$entry);$edges[$i]=[];
        foreach ($roster['entries'] as $j=>$reserved) if (leagueRosterMatches($reserved,$entry,$equipped)) $edges[$i][]=$j;
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
    $source=builderCatalogRow($pdo,$row['edition'],$row['catalog_id']);
    if (!$source) builderInvalid('Catalogo storico non disponibile.');
    return ['army'=>json_decode($row['payload'],true,40,JSON_THROW_ON_ERROR),
        'catalog'=>json_decode($source['payload'],true,40,JSON_THROW_ON_ERROR),'catalogId'=>$row['catalog_id'],'edition'=>$row['edition']];
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
        foreach ($options as &$option) $option['quantity']=$equipped[$option['id']]??0;
        unset($option);
        $ordinals[$unit['id']]=($ordinals[$unit['id']]??0)+1;
        $paid=[];foreach($options as $option)$paid[$option['id']]=$option['quantity'];
        $row=leagueRosterEntry($unit,$entry,$ordinals[$unit['id']],$paid);
        $rows[]=$row;
        $rows[count($rows)-1]['options']=array_values($options);
    }
    return ['name'=>$army['name'],'entries'=>$rows];
}

function leagueRosterSave(array $in, array $me, array &$db, array $league, array $settings, PDO $pdo): void {
    $player=$me['id'];
    if (!in_array($player,leaguePlayers($db,$league['id']),true)) fail('Iscriviti al campionato prima di consegnare il roster.',403);
    if ($league['start'] && !$settings['windowOpen']) fail('La finestra di modifica dei roster è chiusa.',409);
    $versions=leagueRosterVersions($db,$league['id'],$player);$previous=$versions[0]??null;
    if (($in['baseVersion']??null)!==($previous['id']??'')) fail('Il roster è cambiato. Ricarica la pagina prima di salvarlo.',409);
    $source=leagueRosterSavedArmy($pdo,$player,builderId($in['builderArmyId']??null,'armata'));
    $members=array_column($db['league_members'],null,'id');$member=$members[$league['id'].':'.$player];
    $groups=array_merge(...array_values(LEAGUE_ARMIES));
    $faction=array_column($source['catalog']['factions'],null,'id')[$source['army']['factionId']];
    $key=static fn($name)=>strtolower(preg_replace('/[^a-z0-9]/i','',$name));
    if ($key($faction['name'])!==$key($groups[$member['army']]??'')) builderInvalid('La fazione del roster deve coincidere con quella dichiarata all’iscrizione.');
    $paid=$in['paidOptions']??[];
    if (!is_array($paid)) builderInvalid('Opzioni del roster non valide.');
    $roster=leagueRosterBuild($source['catalog'],$source['army'],$paid,$settings['rosterLimit']);
    $roster+=['catalogId'=>$source['catalogId'],'edition'=>$source['edition'],'name'=>$source['army']['name']];
    $db['league_rosters'][]=['id'=>ident(),'league_id'=>$league['id'],'player'=>$player,'version'=>($previous['version']??0)+1,
        'created'=>date(DATE_ATOM),'payload'=>json_encode($roster,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)];
}

function leagueRosterCheckDelivery(array $in, array $me, array &$db, PDO $pdo): void {
    $index=leagueFixture($db['league_fixtures'],field($in,'fixture',24),$me['id']);$fixture=$db['league_fixtures'][$index];
    $settings=leagueRosterSettings($db,$fixture['league_id']);
    if (!$settings) return; // Seasons created before rosters preserve their existing workflow.
    $lists=array_column($db['league_lineups'],null,'id');$id=$fixture['id'].':'.$me['id'];
    if ($fixture['match_id']!==null) fail('Il risultato dell’incontro è già stato confermato.',409);
    if (isset($lists[$fixture['id'].':'.$fixture['a']],$lists[$fixture['id'].':'.$fixture['b']])) fail('Le liste sono già definitive.',409);
    $version=leagueRosterVersions($db,$fixture['league_id'],$me['id'])[0]??null;
    if (!$version) fail('Consegna il roster prima della lista dell’incontro.',409);
    if (empty($in['builderArmyId'])) builderInvalid('Questo campionato richiede una lista dal builder per verificare il roster.');
    $source=leagueRosterSavedArmy($pdo,$me['id'],builderId($in['builderArmyId'],'armata'));
    $roster=json_decode($version['payload'],true,40,JSON_THROW_ON_ERROR);
    if ($source['catalogId']!==$roster['catalogId']) builderInvalid('Usa lo stesso catalogo della versione attuale del roster.');
    $validation=leagueRosterValidateLineup($source['catalog'],$source['army'],$roster,$settings['matchLimit']);
    $rows=array_column($db['league_roster_lineups'],null,'id');
    $rows[$id]=['id'=>$id,'roster_id'=>$version['id'],'payload'=>json_encode($validation,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)];
    $db['league_roster_lineups']=array_values($rows);
}
