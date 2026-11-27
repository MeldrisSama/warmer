<?php
declare(strict_types=1);
require_once __DIR__.'/league-tournament.php';

const LEAGUE_LIFECYCLE_ACTIONS=['leagueClose','leagueReopen','leaguePause','leagueResume'];

// Factions and chapters listed by Warhammer Community, checked 2026-11-17.
const LEAGUE_ARMIES=[
    'Xenos'=>[
        'aeldari'=>'Aeldari','drukhari'=>'Drukhari','genestealer_cults'=>'Genestealer Cults',
        'leagues_of_votann'=>'Leagues of Votann','necrons'=>'Necrons','orks'=>'Orks',
        'tau_empire'=>"T'au Empire",'tyranids'=>'Tyranids'
    ],
    'Chaos'=>[
        'chaos_daemons'=>'Chaos Daemons','chaos_knights'=>'Chaos Knights','chaos_space_marines'=>'Chaos Space Marines',
        'death_guard'=>'Death Guard','emperors_children'=>"Emperor's Children",'thousand_sons'=>'Thousand Sons','world_eaters'=>'World Eaters'
    ],
    'Imperium'=>[
        'adepta_sororitas'=>'Adepta Sororitas','adeptus_custodes'=>'Adeptus Custodes','adeptus_mechanicus'=>'Adeptus Mechanicus',
        'astra_militarum'=>'Astra Militarum','imperial_agents'=>'Imperial Agents','imperial_knights'=>'Imperial Knights'
    ],
    'Adeptus Astartes'=>[
        'space_marines'=>'Space Marines','black_templars'=>'Black Templars','blood_angels'=>'Blood Angels',
        'dark_angels'=>'Dark Angels','deathwatch'=>'Deathwatch','grey_knights'=>'Grey Knights','imperial_fists'=>'Imperial Fists',
        'iron_hands'=>'Iron Hands','raven_guard'=>'Raven Guard','salamanders'=>'Salamanders','space_wolves'=>'Space Wolves',
        'ultramarines'=>'Ultramarines','white_scars'=>'White Scars'
    ]
];

function leagueSummaries(array $db, string $player): array {
    $members=[];
    foreach($db['league_members'] as $entry) $members[$entry['league_id']][$entry['player']]=true;
    $leagues=array_map(function(array $league) use($members,$player): array {
        $entries=$members[$league['id']]??[];
        return $league+['joined'=>isset($entries[$player]),'entrants'=>count($entries)];
    },$db['league']);
    usort($leagues,fn($a,$b)=>($a['closed']!==null)<=>($b['closed']!==null)
        ?: ($a['paused']!==null)<=>($b['paused']!==null)
        ?: $b['entrants']<=>$a['entrants'] ?: ($b['start']!==null)<=>($a['start']!==null)
        ?: strcmp($a['id'],$b['id']));
    return $leagues;
}

function leagueIndex(array $leagues, ?string $id): int {
    $index=$id===null && count($leagues)===1 ? 0 : array_search($id,array_column($leagues,'id'),true);
    if($index===false) fail('Campionato non trovato.',404);
    return $index;
}

function leaguePlayers(array $db, string $id): array {
    return array_column(array_filter($db['league_members'],fn($entry)=>$entry['league_id']===$id),'player');
}

function leagueSchedule(array $players, bool $returnLeg=false): array {
    if(count($players)%2) $players[]=null;
    $size=count($players);
    $fixtures=[];
    for($round=1;$round<$size;$round++) {
        for($i=0;$i<$size/2;$i++) {
            $a=$players[$i];
            $b=$players[$size-1-$i];
            if($a===null || ($b!==null && ($round+$i)%2===0)) [$a,$b]=[$b,$a];
            $fixtures[]=['id'=>ident(),'round'=>$round,'a'=>$a,'b'=>$b,'pending'=>null,'match_id'=>null];
        }
        array_splice($players,1,0,[array_pop($players)]);
    }
    if(!$returnLeg) return $fixtures;
    $return=array_map(static function(array $fixture) use($size): array {
        $fixture['id']=ident();
        $fixture['round']+=$size-1;
        $fixture['leg']=2;
        if($fixture['b']!==null) [$fixture['a'],$fixture['b']]=[$fixture['b'],$fixture['a']];
        return $fixture;
    },$fixtures);
    return [...$fixtures,...$return];
}

function leagueState(array $db, array $me, ?string $id=null, bool $create=false): array {
    $myId=$me['id'];
    $leagues=leagueSummaries($db,$myId);
    $league=$create ? null : ($id===null ? ($leagues[0]??null) : $leagues[leagueIndex($leagues,$id)]);
    $matches=array_column($db['matches'],null,'id');
    $isTournament=$league && leagueIsTournament($league);
    $fixedList=$league && $league['entry_list_limit']>0;
    $entryLists=array_column($db['league_entry_lineups']??[],null,'id');
    $draw=$isTournament ? tournamentFixtures($db,$league['id']) : $db['league_fixtures'];
    $submitted=[];
    foreach($db['league_lineups'] as $list) $submitted[$list['fixture']][$list['player']]=true;
    $fixtures=[];
    foreach($draw as $fixture) {
        if($fixture['league_id']!==($league['id']??null)) continue;
        $players=[$fixture['a'],$fixture['b']];
        $mine=in_array($myId,$players,true) && $fixture['b']!==null;
        $decision=$fixture['decision']??null;
        $pending=$league['closed']!==null || $decision || $fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
        $match=$matches[$fixture['match_id']]??null;
        $lineups=$submitted[$fixture['id']]??[];
        if($fixedList && $fixture['b']!==null) foreach($players as $entrant) {
            if(isset($entryLists[$league['id'].':'.$entrant])) $lineups[$entrant]=true;
        }
        $fixtures[]=[
            'id'=>$fixture['id'],'round'=>$fixture['round'],'a'=>$fixture['a'],'b'=>$fixture['b'],
            'slot'=>$fixture['slot'],'leg'=>$fixture['leg'],'winner'=>$fixture['winner'],
            'decision'=>$decision,
            'result'=>$match ? array_intersect_key($match,array_flip(['id','scoreA','scoreB','date','mission','void']))+['photo'=>empty($match['photo']) ? null : 'api.php?action=photo&id='.rawurlencode($match['id'])] : null,
            'pending'=>$mine ? $pending : null,
            'awaiting'=>$pending!==null,
            'lineupCount'=>count($lineups),
            'listsReadable'=>isset($lineups[$fixture['a']],$lineups[$fixture['b']]),
            'lineups'=>$mine ? [
                'mine'=>isset($lineups[$myId]),
                'opponent'=>isset($lineups[$fixture['a']===$myId ? $fixture['b'] : $fixture['a']])
            ] : null
        ];
    }
    usort($fixtures,fn($a,$b)=>$a['round']<=>$b['round'] ?: $a['slot']<=>$b['slot'] ?: $a['leg']<=>$b['leg'] ?: strcmp($a['id'],$b['id']));
    $members=array_filter($db['league_members'],fn($entry)=>$entry['league_id']===($league['id']??null));
    $players=$league ? leaguePlayers($db,$league['id']) : [];
    $tournament=null;
    if($isTournament) {
        $swiss=leagueFormat($league)==='swiss';
        $round=tournamentRoundState($draw,$matches,!$swiss);
        $withdrawn=tournamentWithdrawals($db,$league['id']);
        $qualifying=array_filter($round['series'],fn($card)=>!$card['decision'] || $card['decision']['winner']!==null);
        $champions=array_values(array_unique(array_filter(array_column($round['series'],'winner'))));
        $standings=$swiss ? tournamentSwissStandings($players,$draw,$matches) : [];
        $rematches=$swiss ? tournamentSwissRematches($draw) : [];
        $final=$swiss ? ($round['number']===$league['round_limit'] || count($players)-count($withdrawn)<2) : count($qualifying)<=1;
        $nextRematches=0;
        if($swiss && $me['admin'] && $round['ready'] && !$final && !$league['paused'] && !$league['closed']) {
            $next=tournamentSwissRound($round['number']+1,tournamentActiveStandings($standings,$withdrawn),$draw,$league['round_limit']);
            $nextRematches=count(tournamentSwissRematches([...$draw,...$next]))-count($rematches);
        }
        $tournament=['round'=>$round['number'],'ready'=>$round['ready'],'revision'=>$round['revision'],
            'open'=>$round['open'],'resolved'=>$round['resolved'],
            'final'=>$final,'ties'=>$round['ties'],'withdrawn'=>array_keys($withdrawn),'rematches'=>$rematches,'nextRematches'=>$nextRematches,
            'withdrawnThisRound'=>array_keys(array_filter($withdrawn,fn($number)=>$number===$round['number'])),
            'signupRevision'=>tournamentSignupRevision($players),
            'standings'=>$standings,
            'bracket'=>$swiss ? [] : tournamentBracket($draw,$matches,$league['finished']!==null),
            'champion'=>!$swiss && $league['finished']!==null && count($champions)===1 ? $champions[0] : null];
    }
    return [
        'league'=>$league,'user'=>publicUser($me),'csrf'=>$_SESSION['csrf'],
        'today'=>date('Y-m-d'),'users'=>array_map('publicUser',$db['users']),
        'players'=>$players,
        'armies'=>array_column(array_values($members),'army','player'),
        'armyGroups'=>LEAGUE_ARMIES,
        'rosters'=>leagueRosterState($db,$league,$myId),
        'entryList'=>$fixedList ? ($entryLists[$league['id'].':'.$myId]??null) : null,
        'fixtures'=>$fixtures,
        'tournament'=>$tournament
    ];
}

function leagueFixture(array $fixtures, string $id, string $player): int {
    $index=array_search($id,array_column($fixtures,'id'),true);
    if($index===false || $fixtures[$index]['b']===null) fail('Incontro non trovato.',404);
    $fixture=$fixtures[$index];
    if($fixture['a']!==$player && $fixture['b']!==$player) fail('Solo i due giocatori possono gestire questo incontro.',403);
    return $index;
}

/** Only metadata is shared here; list text is read lazily through the authenticated endpoint. */
function leagueReadableLists(array $db): array {
    $submitted=[];
    foreach($db['league_lineups'] as $list) $submitted[$list['fixture']][$list['player']]=true;
    $leagues=array_column($db['league'],null,'id');
    $entryLists=array_column($db['league_entry_lineups']??[],null,'id');
    $matches=array_column($db['matches'],null,'id');
    $result=[];
    foreach($db['league_fixtures'] as $fixture) {
        $match=$matches[$fixture['match_id']]??null;
        if($fixture['b']===null || $match===null || $match['void']) continue;
        $league=$leagues[$fixture['league_id']];
        $fixed=($league['entry_list_limit']??0)>0;
        if($fixed ? !isset($entryLists[$league['id'].':'.$fixture['a']],$entryLists[$league['id'].':'.$fixture['b']])
            : !isset($submitted[$fixture['id']][$fixture['a']],$submitted[$fixture['id']][$fixture['b']])) continue;
        foreach([$fixture['a'],$fixture['b']] as $owner) $result[]=[
            'player'=>$owner,'fixture'=>$fixture['id'],'match'=>$fixture['match_id'],
            'title'=>($leagues[$fixture['league_id']]['name']??'Campionato').' · Turno '.$fixture['round'],
            'url'=>'api.php?action=leagueDownload&fixture='.rawurlencode($fixture['id']).'&player='.rawurlencode($owner)
        ];
    }
    return $result;
}

function leagueDownload(SectorStorage $storage, array $db, string $player): never {
    if(isset($_GET['entry'])) {
        $leagueId=$_GET['entry'];
        if(!is_string($leagueId) || !isset(array_column($db['league_entry_lineups']??[],null,'id')[$leagueId.':'.$player])) fail('Lista non trovata.',404);
        sendLeagueLineup($storage,$leagueId.':'.$player,$player,true);
    }
    $id=$_GET['fixture']??'';
    $owner=$_GET['player']??'';
    if(!is_string($id) || !is_string($owner)) fail('Lista non trovata.',404);
    $index=array_search($id,array_column($db['league_fixtures'],'id'),true);
    if($index===false || $db['league_fixtures'][$index]['b']===null) fail('Incontro non trovato.',404);
    $fixture=$db['league_fixtures'][$index];
    if(!in_array($owner,[$fixture['a'],$fixture['b']],true)) fail('Lista non trovata.',404);
    $league=array_column($db['league'],null,'id')[$fixture['league_id']];
    if(($league['entry_list_limit']??0)>0) {
        $lists=array_column($db['league_entry_lineups'],null,'id');
        $prefix=$league['id'].':';
        if(!isset($lists[$prefix.$fixture['a']],$lists[$prefix.$fixture['b']])) fail('Liste del torneo non disponibili.',404);
        sendLeagueLineup($storage,$prefix.$owner,$owner,true);
    }
    $lists=array_column($db['league_lineups'],null,'id');
    $requested=$lists[$id.':'.$owner]??null;
    if(!$requested) fail('Lista non trovata.',404);
    if(!isset($lists[$id.':'.$fixture['a']],$lists[$id.':'.$fixture['b']])) fail('Le liste saranno visibili dopo entrambe le consegne.',403);
    sendLeagueLineup($storage,$requested['id'],$owner,false);
}

function sendLeagueLineup(SectorStorage $storage,string $id,string $owner,bool $entry): never {
    $text=$storage->leagueLineupText($id,$entry);
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="lista-campionato-'.$owner.'.txt"');
    echo $text;
    exit;
}

function leagueResetFixtureResult(array &$db,array &$fixture,string $admin): void {
    if($fixture['match_id']===null && $fixture['pending']===null) fail('Non c’è un risultato da riaprire.',409);
    foreach($db['matches'] as &$match) if($match['id']===$fixture['match_id']) {
        $match['void']=true;
        $match['updatedBy']=$admin;
        $match['updated']=date(DATE_ATOM);
        break;
    }
    unset($match);
    $fixture['match_id']=$fixture['pending']=null;
}

function updateLeague(string $action, array $in, array $me, array &$db, ?array $mail, PDO $builder): ?string {
    $player=$me['id'];
    if($action==='leagueOpen') {
        if(!$me['admin']) fail('Solo l’amministratore può aprire le iscrizioni.',403);
        $name=field($in,'name',100);
        $format=$in['format']??'round_robin';
        if(!in_array($format,LEAGUE_FORMATS,true)) fail('Scegli un formato disponibile.');
        $tournament=leagueIsTournament(['format'=>$format]);
        $listLimit=$tournament ? builderInt($in['entryListLimit']??2000,'limite lista',100,5000) : 0;
        $matchLimit=$tournament ? 0 : builderInt($in['matchLimit']??2000,'limite partita',100,5000);
        $settings=null;
        if($tournament && (isset($in['rosterLimit']) || isset($in['matchLimit']))) fail('I nuovi tornei richiedono una lista unica all’iscrizione.');
        if(isset($in['rosterLimit'])) {
            $rosterLimit=builderInt($in['rosterLimit']??null,'limite roster',100,20000);
            if($matchLimit>$rosterLimit) builderInvalid('Il limite della partita non può superare quello del roster.');
            $settings=['rosterLimit'=>$rosterLimit,'matchLimit'=>$matchLimit,'windowOpen'=>false];
        }
        $id=field($in,'request',24,false) ?: ident();
        if(!preg_match('/^[a-f0-9]{24}$/D',$id)) fail('Richiesta non valida.');
        foreach($db['league'] as $league) if($league['id']===$id) {
            $stored=leagueRosterSettings($db,$id);
            if($league['name']!==$name || leagueFormat($league)!==$format || $league['entry_list_limit']!==$listLimit
                || ($league['match_point_limit'] ?: ($stored['matchLimit']??0))!==$matchLimit
                || ($stored['rosterLimit']??null)!==($settings['rosterLimit']??null)
                || ($stored['matchLimit']??null)!==($settings['matchLimit']??null)) fail('Richiesta già usata. Ricarica la pagina.',409);
            return $id;
        }
        if($settings) $db['league_roster_settings'][]=['id'=>$id,'payload'=>json_encode($settings,JSON_THROW_ON_ERROR)];
        $league=['id'=>$id,'name'=>$name,'start'=>null,'closed'=>null,'paused'=>null,
            'format'=>$format,'round_limit'=>0,'finished'=>null,'entry_list_limit'=>$listLimit,'match_point_limit'=>$matchLimit];
        $db['league'][]=$league;
        if(($in['notify']??false)===true) {
            if($mail===null) fail('Servizio email non disponibile.',503);
            notifyLeague($db,$mail,$league,array_column($db['users'],'id'),'invite:'.$id,
                'Iscrizioni aperte', 'Puoi iscriverti al nuovo campionato dalla pagina del torneo.', 'Iscriviti al campionato');
        }
        return $id;
    }
    $fixtureIndex=null;
    $id=field($in,'league',24,false) ?: null;
    $lifecycle=in_array($action,LEAGUE_LIFECYCLE_ACTIONS,true);
    $recovery=in_array($action,['leagueResetResult','leagueWalkover','leagueUndoWalkover'],true);
    $retirement=in_array($action,['leagueRetire','leagueUndoRetire'],true);
    if($recovery && !$me['admin']) fail('Solo l’amministratore può gestire gli esiti del torneo.',403);
    if(!$lifecycle && !$retirement && !in_array($action,['leagueJoin','leagueLeave','leagueStart','leagueAdvance','leagueAnnounce','leagueRosterSave','leagueRosterWindow'],true)) {
        $fixtureId=field($in,'fixture',24);
        $fixtureIndex=$recovery ? array_search($fixtureId,array_column($db['league_fixtures'],'id'),true)
            : leagueFixture($db['league_fixtures'],$fixtureId,$player);
        if($fixtureIndex===false || $db['league_fixtures'][$fixtureIndex]['b']===null) fail('Incontro non trovato.',404);
        $fixtureLeague=$db['league_fixtures'][$fixtureIndex]['league_id'];
        if($id!==null && $id!==$fixtureLeague) fail('Incontro non trovato.',404);
        $id=$fixtureLeague;
    }
    $index=leagueIndex($db['league'],$id);
    $league=&$db['league'][$index];
    if($action==='leagueAnnounce') {
        if(!$me['admin']) fail('Solo l’amministratore può scrivere agli iscritti.',403);
        if($mail===null) fail('Servizio email non disponibile.',503);
        $subject=field($in,'subject',140);
        if(preg_match('/[\r\n]/',$subject)) fail('Inserisci un oggetto su una sola riga.');
        $count=notifyLeague($db,$mail,$league,leaguePlayers($db,$league['id']),
            'announcement:'.$league['id'].':'.field($in,'request',64),$subject,field($in,'message',4000),'Apri il campionato');
        if(!$count) fail('Nessun iscritto ha un indirizzo email verificato.');
        return null;
    }
    if($lifecycle) {
        if(!$me['admin']) fail('Solo l’amministratore può cambiare lo stato del campionato.',403);
        if($action==='leagueClose') {
            $league['closed']??=date(DATE_ATOM);
            $league['paused']=null;
        } elseif($action==='leagueReopen') {
            if($league['finished']!==null) fail('Il risultato finale del torneo è già stato pubblicato.',409);
            $league['closed']=null;
        } else {
            if($league['closed']!==null) fail('Riapri il campionato prima di cambiarne lo stato.',409);
            $league['paused']=$action==='leaguePause' ? ($league['paused']??date(DATE_ATOM)) : null;
        }
        return null;
    }
    if($league['closed']!==null) fail('Il campionato è concluso.',409);
    if($league['paused']!==null) fail('Il campionato è in pausa.',409);
    $tournament=leagueIsTournament($league);
    $rosterSettings=leagueRosterSettings($db,$league['id']);
    if($action==='leagueRosterWindow') {
        if(!$me['admin']) fail('Solo l’amministratore può gestire la finestra dei roster.',403);
        if(!$rosterSettings || !$league['start']) fail('La finestra è disponibile dopo l’avvio di un campionato con roster.',409);
        if(!is_bool($in['open']??null)) fail('Stato della finestra non valido.');
        $rosterSettings['windowOpen']=$in['open'];
        foreach($db['league_roster_settings'] as &$row) if($row['id']===$league['id']) $row['payload']=json_encode($rosterSettings,JSON_THROW_ON_ERROR);
        unset($row);
        return null;
    }
    if($action==='leagueRosterSave') {
        if(!$rosterSettings) fail('Questo campionato non prevede roster.',409);
        leagueRosterSave($in,$me,$db,$league,$rosterSettings,$builder);
        return null;
    }
    if($action==='leagueLeave') {
        if($league['start']) fail('Le iscrizioni sono chiuse.',409);
        $db['league_members']=array_values(array_filter($db['league_members'],fn($row)=>$row['id']!==$league['id'].':'.$player));
        $db['league_rosters']=array_values(array_filter($db['league_rosters'],fn($row)=>$row['league_id']!==$league['id'] || $row['player']!==$player));
        $db['league_entry_lineups']=array_values(array_filter($db['league_entry_lineups'],fn($row)=>$row['id']!==$league['id'].':'.$player));
        return null;
    }
    if($action==='leagueJoin') {
        $memberId=$league['id'].':'.$player;
        if(in_array($memberId,array_column($db['league_members'],'id'),true)) return null;
        if($league['start']) fail('Le iscrizioni sono chiuse.',409);
        $army=field($in,'army',64);
        $armies=array_merge(...array_values(LEAGUE_ARMIES));
        if(!isset($armies[$army])) fail('Scegli un esercito dall’elenco.');
        if($league['entry_list_limit']>0) {
            $db['league_entry_lineups'][]=['id'=>$memberId]+leagueBuildEntryList($builder,$player,$in['builderArmyId']??null,$armies[$army],$league['entry_list_limit']);
        }
        $db['league_members'][]=['id'=>$memberId,'league_id'=>$league['id'],'player'=>$player,'joined'=>date(DATE_ATOM),'army'=>$army];
        if($rosterSettings) leagueRosterSave($in+['baseVersion'=>''],$me,$db,$league,$rosterSettings,$builder);
        notifyLeague($db,$mail,$league,[$player],'joined:'.$memberId,'Iscrizione confermata',
            'La tua iscrizione con '.$armies[$army].' è confermata. Troverai il calendario nella pagina del campionato quando verrà pubblicato.','Apri il campionato');
        return null;
    }
    if($action==='leagueStart') {
        if(!$me['admin']) fail('Solo l’amministratore può pubblicare il calendario.',403);
        if($league['start']) fail('Il calendario è già stato pubblicato.',409);
        $players=leaguePlayers($db,$league['id']);
        if(count($players)<2) fail('Servono almeno due iscritti.');
        if($tournament && ($in['signupRevision']??null)!==tournamentSignupRevision($players)) {
            fail('Gli iscritti sono cambiati. Controlla il sorteggio aggiornato e conferma di nuovo.',409);
        }
        if($rosterSettings) foreach($players as $entrant) if(!leagueRosterVersions($db,$league['id'],$entrant)) fail('Tutti gli iscritti devono consegnare il roster prima dell’avvio.',409);
        if($league['entry_list_limit']>0) {
            $lists=array_column($db['league_entry_lineups'],null,'id');
            foreach($players as $entrant) if(!isset($lists[$league['id'].':'.$entrant])) fail('Tutti gli iscritti devono consegnare la lista prima dell’avvio.',409);
        }
        shuffle($players);
        $format=leagueFormat($league);
        if($format==='swiss') {
            $maxRounds=count($players)-1+count($players)%2;
            $rounds=$in['rounds']??min(3,$maxRounds);
            if(!is_int($rounds) || $rounds<1 || $rounds>$maxRounds) fail('Scegli un numero di turni compatibile con gli iscritti.');
            $league['round_limit']=$rounds;
        }
        $schedule=$tournament ? tournamentFirstRound($format,$players,$in['byes']??[])
            : leagueSchedule($players,$format==='round_robin_legs');
        foreach($schedule as $fixture) $db['league_fixtures'][]=$fixture+['league_id'=>$league['id']];
        $league['start']=date('Y-m-d');
        return null;
    }
    if($action==='leagueAdvance') {
        if(!$me['admin']) fail('Solo l’amministratore può pubblicare il turno o il risultato finale.',403);
        if(!is_string($in['revision']??null)) fail('Aggiorna la pagina prima di pubblicare il turno.',409);
        tournamentAdvance($db,$league,$in);
        queueRoundReport($db,$mail,$league,$in['round']);
        return null;
    }

    if($retirement) {
        if(!$me['admin']) fail('Solo l’amministratore può registrare il ritiro.',403);
        if(!$tournament || !$league['start']) fail('Il torneo non è in corso.',409);
        $draw=tournamentFixtures($db,$league['id']);
        $round=$draw[array_key_last($draw)]['round'];
        if(($in['round']??null)!==$round) fail('Il turno è cambiato. Ricarica la pagina.',409);
        $retiring=field($in,'player',24);
        $eligible=leagueFormat($league)==='swiss' || array_filter($draw,fn($f)=>$f['round']===$round && in_array($retiring,[$f['a'],$f['b']],true));
        if(!$eligible) fail('Il giocatore non è più nel tabellone.',409);
        $id=$league['id'].':'.$retiring;
        foreach($db['league_members'] as &$member) if($member['id']===$id) {
            if($action==='leagueUndoRetire') {
                if($member['withdrawn_round']!==$round) fail('Puoi revocare solo un ritiro del turno da pubblicare.',409);
                $member['withdrawn_round']=0;
            } else {
                $member['withdrawn_round']=$member['withdrawn_round'] ?: $round;
            }
            return null;
        }
        fail('Giocatore non iscritto.',404);
    }

    $fixture=&$db['league_fixtures'][$fixtureIndex];
    if($tournament) {
        $draw=tournamentFixtures($db,$league['id']);
        $drawById=array_column($draw,null,'id');
        $projected=$drawById[$fixture['id']];
        if($recovery) {
            $current=tournamentRoundState($draw,array_column($db['matches'],null,'id'),leagueFormat($league)!=='swiss');
            if($fixture['round']!==$current['number'] || ($in['revision']??null)!==$current['revision']) {
                fail('Gli incontri del turno sono cambiati. Controlla lo stato aggiornato.',409);
            }
            tournamentRecoverFixture($db,$fixture,$projected,$action,$in,$player);
            return null;
        }
        if($fixture['round']!==$draw[array_key_last($draw)]['round'] || $projected['decision']) fail('L’incontro è già stato risolto.',409);
    } elseif($action==='leagueResetResult') {
        if($fixture['match_id']===null || $fixture['match_id']!==($in['match']??null)) {
            fail('Il risultato è cambiato. Controlla lo stato aggiornato.',409);
        }
        leagueResetFixtureResult($db,$fixture,$player);
        return null;
    } elseif($recovery) {
        fail('Questa azione è disponibile nei tornei.',409);
    }
    if($rosterSettings && $action==='leaguePropose') {
        $submitted=array_column($db['league_lineups'],null,'id');
        if(!isset($submitted[$fixture['id'].':'.$fixture['a']],$submitted[$fixture['id'].':'.$fixture['b']])) fail('Entrambi i giocatori devono consegnare la lista verificata prima del risultato.',409);
    }
    if($action==='leagueLineup') {
        if($league['entry_list_limit']>0) fail('In questo torneo vale la lista consegnata all’iscrizione.',409);
        $id=$fixture['id'].':'.$player;
        $opponent=$fixture['a']===$player ? $fixture['b'] : $fixture['a'];
        $lists=array_column($db['league_lineups'],null,'id');
        // A revealed list stays fixed so neither player can react to the opponent’s list.
        if(isset($lists[$id],$lists[$fixture['id'].':'.$opponent])) fail('Le liste sono già state rivelate.',409);
        $text=listText($in,false);
        $lists[$id]=['id'=>$id,'fixture'=>$fixture['id'],'player'=>$player,'text'=>$text];
        $db['league_lineups']=array_values($lists);
        if(isset($lists[$fixture['id'].':'.$opponent])) {
            notifyLeague($db,$mail,$league,[$opponent],'lineups:'.$fixture['id'],'La lista avversaria è disponibile',
                $me['name'].' ha consegnato la sua lista. Ora puoi leggere entrambe le liste nella pagina dell’incontro.',
                'Leggi le liste',$fixture['id']);
        }
        return null;
    }

    if($fixture['match_id']!==null) fail('Il risultato dell’incontro è già stato confermato.',409);
    $pending=$fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
    if($action==='leaguePropose') {
        if($pending) fail('C’è già un risultato in attesa.',409);
        $scores=matchDetails($in);
        $token=ident();
        $fixture['pending']=json_encode($scores+['by'=>$player,'token'=>$token],JSON_THROW_ON_ERROR);
        $opponent=$fixture['a']===$player ? $fixture['b'] : $fixture['a'];
        notifyLeague($db,$mail,$league,[$opponent],'proposal:'.$token,'Risultato da confermare',
            $me['name'].' ha inserito il risultato del vostro incontro. Apri la partita per verificarlo.',
            'Verifica il risultato',$fixture['id']);
        return null;
    }
    if(!$pending || $pending['token']!==field($in,'proposal',24)) fail('Il risultato è cambiato. Aggiorna la pagina.',409);
    if($action==='leagueWithdraw') {
        if($pending['by']!==$player) fail('Solo chi ha proposto il risultato può ritirarlo.',403);
    } else {
        if($pending['by']===$player) fail('Il risultato deve essere verificato dall’avversario.',403);
        if($action==='leagueConfirm') {
            $matchId=ident();
            $db['matches'][]=[
                'id'=>$matchId,'a'=>$fixture['a'],'b'=>$fixture['b'],
                'scoreA'=>$pending['scoreA'],'scoreB'=>$pending['scoreB'],'date'=>$pending['date'],
                'mission'=>$pending['mission'],'photo'=>null,'by'=>$pending['by'],'void'=>false,
                'created'=>date(DATE_ATOM),'request'=>'league:'.$fixture['id']
            ];
            $fixture['match_id']=$matchId;
            if(!$tournament) queueRoundReport($db,$mail,$league,$fixture['round']);
        }
    }
    $fixture['pending']=null;
    return null;
}

function leagueMatchLocks(array $db): array {
    $seasons=[];$progress=[];$rounds=[];
    foreach($db['league'] as $league) {
        if($league['closed']!==null) $seasons[$league['id']]='Il risultato appartiene a un campionato concluso.';
        elseif($league['paused']!==null) $seasons[$league['id']]='Il risultato appartiene a un campionato in pausa.';
        if(leagueIsTournament($league)) $progress[$league['id']]=true;
    }
    foreach($db['league_fixtures'] as $fixture) {
        $id=$fixture['league_id'];
        if(isset($progress[$id])) $rounds[$id]=max($rounds[$id]??0,$fixture['round']);
    }
    $matches=[];
    $linked=[];
    foreach($db['league_fixtures'] as $fixture) {
        if($fixture['match_id']!==null) $linked[$fixture['match_id']]=true;
        if($fixture['match_id']!==null && isset($seasons[$fixture['league_id']])) {
            $matches[$fixture['match_id']]=$seasons[$fixture['league_id']];
        } elseif($fixture['match_id']!==null && $fixture['round']<($rounds[$fixture['league_id']]??0)) {
            $matches[$fixture['match_id']]='Il risultato è già stato usato per il turno successivo del torneo.';
        } elseif($fixture['match_id']!==null && isset($progress[$fixture['league_id']])) {
            $matches[$fixture['match_id']]='Le correzioni si gestiscono dall’incontro nella pagina del torneo.';
        }
    }
    foreach($db['matches'] as $match) if(!isset($linked[$match['id']]) && str_starts_with($match['request']??'','league:')) {
        $matches[$match['id']]='Il risultato è stato archiviato dopo la riapertura dell’incontro.';
    }
    return $matches;
}
