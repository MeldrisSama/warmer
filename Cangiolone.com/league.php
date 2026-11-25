<?php
declare(strict_types=1);
require_once __DIR__.'/calendar-model.php';

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

function leagueSchedule(array $players): array {
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
    return $fixtures;
}

function leagueState(array $db, array $me, ?string $id=null, bool $create=false): array {
    $myId=$me['id'];
    $leagues=leagueSummaries($db,$myId);
    $league=$create ? null : ($id===null ? ($leagues[0]??null) : $leagues[leagueIndex($leagues,$id)]);
    $matches=array_column($db['matches'],null,'id');
    $submitted=[];
    foreach($db['league_lineups'] as $list) $submitted[$list['fixture']][$list['player']]=true;
    $fixtures=[];
    foreach($db['league_fixtures'] as $fixture) {
        if($fixture['league_id']!==($league['id']??null)) continue;
        $players=[$fixture['a'],$fixture['b']];
        $mine=in_array($myId,$players,true) && $fixture['b']!==null;
        $pending=$league['closed']!==null || $fixture['pending']===null ? null : json_decode($fixture['pending'],true,16,JSON_THROW_ON_ERROR);
        $match=$matches[$fixture['match_id']]??null;
        $lineups=$submitted[$fixture['id']]??[];
        $fixtures[]=[
            'id'=>$fixture['id'],'round'=>$fixture['round'],'a'=>$fixture['a'],'b'=>$fixture['b'],
            'schedule'=>calendarSchedule($db,$fixture['id']),
            'scheduleProposal'=>$mine ? calendarProposalState($db,$fixture['id'],$myId) : null,
            'result'=>$match ? array_intersect_key($match,array_flip(['scoreA','scoreB','date','mission','void']))+['photo'=>empty($match['photo']) ? null : 'api.php?action=photo&id='.rawurlencode($match['id'])] : null,
            'pending'=>$mine ? $pending : null,
            'awaiting'=>$pending!==null,
            'listsReadable'=>isset($lineups[$fixture['a']],$lineups[$fixture['b']]),
            'lineups'=>$mine ? [
                'mine'=>isset($lineups[$myId]),
                'opponent'=>isset($lineups[$fixture['a']===$myId ? $fixture['b'] : $fixture['a']])
            ] : null
        ];
    }
    usort($fixtures,fn($a,$b)=>$a['round']<=>$b['round'] ?: strcmp($a['id'],$b['id']));
    $members=array_filter($db['league_members'],fn($entry)=>$entry['league_id']===($league['id']??null));
    return [
        'league'=>$league,'user'=>publicUser($me),'csrf'=>$_SESSION['csrf'],
        'today'=>date('Y-m-d'),'users'=>array_map('publicUser',$db['users']),
        'players'=>$league ? leaguePlayers($db,$league['id']) : [],
        'armies'=>array_column(array_values($members),'army','player'),
        'armyGroups'=>LEAGUE_ARMIES,
        'rosters'=>leagueRosterState($db,$league,$myId),
        'fixtures'=>$fixtures
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
    $matches=array_column($db['matches'],null,'id');
    $result=[];
    foreach($db['league_fixtures'] as $fixture) {
        $match=$matches[$fixture['match_id']]??null;
        if($fixture['b']===null || $match===null || $match['void']) continue;
        if(!isset($submitted[$fixture['id']][$fixture['a']],$submitted[$fixture['id']][$fixture['b']])) continue;
        foreach([$fixture['a'],$fixture['b']] as $owner) $result[]=[
            'player'=>$owner,'fixture'=>$fixture['id'],'match'=>$fixture['match_id'],
            'title'=>($leagues[$fixture['league_id']]['name']??'Campionato').' · Turno '.$fixture['round'],
            'url'=>'api.php?action=leagueDownload&fixture='.rawurlencode($fixture['id']).'&player='.rawurlencode($owner)
        ];
    }
    return $result;
}

function leagueDownload(SectorStorage $storage, array $db, string $player): never {
    $id=$_GET['fixture']??'';
    $owner=$_GET['player']??'';
    if(!is_string($id) || !is_string($owner)) fail('Lista non trovata.',404);
    $index=array_search($id,array_column($db['league_fixtures'],'id'),true);
    if($index===false || $db['league_fixtures'][$index]['b']===null) fail('Incontro non trovato.',404);
    $fixture=$db['league_fixtures'][$index];
    if(!in_array($owner,[$fixture['a'],$fixture['b']],true)) fail('Lista non trovata.',404);
    $lists=array_column($db['league_lineups'],null,'id');
    $requested=$lists[$id.':'.$owner]??null;
    if(!$requested) fail('Lista non trovata.',404);
    if(!isset($lists[$id.':'.$fixture['a']],$lists[$id.':'.$fixture['b']])) fail('Le liste saranno visibili dopo entrambe le consegne.',403);
    $text=$storage->leagueLineupText($requested['id']);
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="lista-campionato-'.$requested['player'].'.txt"');
    echo $text;
    exit;
}

function updateLeague(string $action, array $in, array $me, array &$db, ?array $mail, PDO $builder): ?string {
    $player=$me['id'];
    if($action==='leagueOpen') {
        if(!$me['admin']) fail('Solo l’amministratore può aprire le iscrizioni.',403);
        $name=field($in,'name',100);
        $id=field($in,'request',24,false) ?: ident();
        if(!preg_match('/^[a-f0-9]{24}$/D',$id)) fail('Richiesta non valida.');
        foreach($db['league'] as $league) if($league['id']===$id) {
            if($league['name']!==$name) fail('Richiesta già usata. Ricarica la pagina.',409);
            return $id;
        }
        if(isset($in['rosterLimit']) || isset($in['matchLimit'])) {
            $rosterLimit=builderInt($in['rosterLimit']??null,'limite roster',100,20000);
            $matchLimit=builderInt($in['matchLimit']??null,'limite partita',100,5000);
            if($matchLimit>$rosterLimit) builderInvalid('Il limite della partita non può superare quello del roster.');
            $db['league_roster_settings'][]=['id'=>$id,'payload'=>json_encode(['rosterLimit'=>$rosterLimit,'matchLimit'=>$matchLimit,'windowOpen'=>false],JSON_THROW_ON_ERROR)];
        }
        $league=['id'=>$id,'name'=>$name,'start'=>null,'closed'=>null,'paused'=>null];
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
    if(!$lifecycle && !in_array($action,['leagueJoin','leagueStart','leagueAnnounce','leagueRosterSave','leagueRosterWindow'],true)) {
        $fixtureIndex=leagueFixture($db['league_fixtures'],field($in,'fixture',24),$player);
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
            $league['closed']=null;
        } else {
            if($league['closed']!==null) fail('Riapri il campionato prima di cambiarne lo stato.',409);
            $league['paused']=$action==='leaguePause' ? ($league['paused']??date(DATE_ATOM)) : null;
        }
        return null;
    }
    if($league['closed']!==null) fail('Il campionato è concluso.',409);
    if($league['paused']!==null) fail('Il campionato è in pausa.',409);
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
    if($action==='leagueJoin') {
        $memberId=$league['id'].':'.$player;
        if(in_array($memberId,array_column($db['league_members'],'id'),true)) return null;
        if($league['start']) fail('Le iscrizioni sono chiuse.',409);
        $army=field($in,'army',64);
        $armies=array_merge(...array_values(LEAGUE_ARMIES));
        if(!isset($armies[$army])) fail('Scegli un esercito dall’elenco.');
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
        if($rosterSettings) foreach($players as $entrant) if(!leagueRosterVersions($db,$league['id'],$entrant)) fail('Tutti gli iscritti devono consegnare il roster prima dell’avvio.',409);
        shuffle($players);
        foreach(leagueSchedule($players) as $fixture) $db['league_fixtures'][]=$fixture+['league_id'=>$league['id']];
        $league['start']=date('Y-m-d');
        return null;
    }

    $fixture=&$db['league_fixtures'][$fixtureIndex];
    if($rosterSettings && $action==='leaguePropose') {
        $submitted=array_column($db['league_lineups'],null,'id');
        if(!isset($submitted[$fixture['id'].':'.$fixture['a']],$submitted[$fixture['id'].':'.$fixture['b']])) fail('Entrambi i giocatori devono consegnare la lista verificata prima del risultato.',409);
    }
    if($action==='leagueLineup') {
        $id=$fixture['id'].':'.$player;
        $opponent=$fixture['a']===$player ? $fixture['b'] : $fixture['a'];
        $lists=array_column($db['league_lineups'],null,'id');
        // A revealed list stays fixed so neither player can react to the opponent’s list.
        if(isset($lists[$id],$lists[$fixture['id'].':'.$opponent])) fail('Le liste sono già state rivelate.',409);
        $text=listText($in,false);
        // shortcut: validates file format only; check army rules when the list builder is available.
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
            queueRoundReport($db,$mail,$league,$fixture['round']);
        }
    }
    $fixture['pending']=null;
    return null;
}

function leagueMatchLocks(array $db): array {
    $seasons=[];
    foreach($db['league'] as $league) {
        if($league['closed']!==null) $seasons[$league['id']]='Il risultato appartiene a un campionato concluso.';
        elseif($league['paused']!==null) $seasons[$league['id']]='Il risultato appartiene a un campionato in pausa.';
    }
    $matches=[];
    foreach($db['league_fixtures'] as $fixture) {
        if($fixture['match_id']!==null && isset($seasons[$fixture['league_id']])) {
            $matches[$fixture['match_id']]=$seasons[$fixture['league_id']];
        }
    }
    return $matches;
}

