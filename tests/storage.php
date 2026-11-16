<?php

declare(strict_types=1);

require dirname(__DIR__).'/Cangiolone.com/storage.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

require dirname(__DIR__).'/Cangiolone.com/league.php';

function ident(): string {
    return bin2hex(random_bytes(12));
}

foreach([8,9] as $count) {
    $players=array_map('strval',range(1,$count));
    $rounds=$count%2===0 ? $count-1 : $count;
    $fixtures=leagueSchedule($players);
    $pairings=[];
    $appearances=[];
    $byes=[];
    foreach($fixtures as $fixture) {
        $pair=[$fixture['a'],$fixture['b']];
        $round=$fixture['round'];
        foreach(array_filter($pair,fn($player)=>$player!==null) as $player) {
            check(!isset($appearances[$round][$player]),'A player appears only once each round');
            $appearances[$round][$player]=true;
        }
        if($fixture['b']===null) {
            $byes[]=$fixture['a'];
        } else {
            sort($pair);
            $pairings[]=implode(':',$pair);
        }
    }
    check(count($appearances)===$rounds,'Schedule has the right number of rounds');
    check(count($pairings)===$count*($count-1)/2 && count(array_unique($pairings))===count($pairings),'Each pair meets exactly once');
    sort($byes);
    sort($players);
    check($byes===($count%2===0 ? [] : $players),'Only an odd group has one bye per player');
}

$directory = $argv[1];
$legacyConfig = ['driver'=>'sqlite','path'=>$directory.'/legacy.sqlite'];
$legacy = new PDO('sqlite:'.$legacyConfig['path'],null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$legacy->exec("CREATE TABLE w40k_league (id TEXT PRIMARY KEY, name TEXT NOT NULL, start TEXT);
CREATE TABLE w40k_league_entries (player TEXT PRIMARY KEY, joined TEXT NOT NULL);
CREATE TABLE w40k_league_fixtures (id TEXT PRIMARY KEY, round INT, a TEXT, b TEXT, pending TEXT, match_id TEXT);
CREATE TABLE w40k_league_lineups (id TEXT PRIMARY KEY, fixture TEXT, player TEXT, text TEXT);
INSERT INTO w40k_league VALUES ('legacy', 'Campionato pubblicato', '2026-11-16');
INSERT INTO w40k_league_entries VALUES ('alice', '2026-11-16'), ('bob', '2026-11-16');
INSERT INTO w40k_league_fixtures VALUES ('fixture', 1, 'alice', 'bob', NULL, 'match');
INSERT INTO w40k_league_lineups VALUES ('fixture:alice', 'fixture', 'alice', 'Army list');");
$legacy = null;
$migrated = new SectorStorage($legacyConfig);
$seasons = $migrated->load('league');
check($seasons['league'][0]['closed']===null && $seasons['league'][0]['paused']===null,'Legacy season must stay open');
check(array_column($seasons['league_members'],'id')===['legacy:alice','legacy:bob'],'Legacy signups must carry over');
check($seasons['league_fixtures'][0]['league_id']==='legacy' && $seasons['league_fixtures'][0]['match_id']==='match','Legacy fixture and result link must carry over');
check($migrated->leagueLineupText('fixture:alice')==='Army list','Legacy list must remain readable');
$seasons['league'][]=['id'=>'new','name'=>'Nuovo campionato','start'=>null,'closed'=>null];
$migrated->save($seasons);
$seasons = (new SectorStorage($legacyConfig))->load('league');
check(count($seasons['league'])===2 && count($seasons['league_members'])===2,'The migration must not be reapplied');
unset($migrated);
$previous = new PDO('sqlite:'.$legacyConfig['path'],null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$previous->exec("ALTER TABLE w40k_league RENAME TO old_lifecycle;
CREATE TABLE w40k_league (id TEXT PRIMARY KEY, name TEXT NOT NULL, start TEXT, closed TEXT);
INSERT INTO w40k_league SELECT id, name, start, closed FROM old_lifecycle;
DROP TABLE old_lifecycle;
DELETE FROM w40k_schema_migrations WHERE id='league-pause';");
$previous = null;
$seasons = (new SectorStorage($legacyConfig))->load('league');
check(count($seasons['league'])===2 && $seasons['league'][1]['paused']===null,'Adding pause must preserve existing seasons');

$config = ['driver'=>'sqlite', 'path'=>$directory.'/storage.sqlite'];
$storage = new SectorStorage($config);
$data = $storage->load();
check($data === ['users'=>[], 'matches'=>[], 'lists'=>[], 'invites'=>[], 'attempts'=>[], 'mail_accounts'=>[]], 'New database must be empty');

$data['users'][] = ['id'=>'alice', 'username'=>'alice', 'name'=>'Alice', 'password'=>'hash', 'admin'=>true];
$data['matches'][] = ['id'=>'match', 'a'=>'alice', 'b'=>'bob', 'scoreA'=>80, 'scoreB'=>50, 'date'=>'2026-01-01', 'mission'=>'Test', 'photo'=>null, 'by'=>'alice', 'void'=>false, 'created'=>'2026-01-01T12:00:00+01:00', 'request'=>'request'];
$data['lists'][] = ['id'=>'list', 'owner'=>'alice', 'name'=>'Army', 'faction'=>'Orks', 'text'=>"Unità\n100 punti", 'date'=>'2026-01-01', 'size'=>16];
$data['invites'][] = ['hash'=>'invite', 'expires'=>2000000000, 'used'=>false];
$data['attempts']['ip'] = ['count'=>2, 'until'=>2000000000];
$storage->save($data);

$storage = new SectorStorage($config);
$loaded = $storage->load();
check($loaded['users'] === $data['users'], 'Users and boolean admin must survive reload');
check($loaded['matches'][0]['scoreA'] === 80 && $loaded['matches'][0]['void'] === false, 'Scores and void must preserve their types');
check($loaded['matches'][0]['photo'] === null, 'Missing photo must stay null');
check($loaded['lists'] === $data['lists'], 'List text and metadata must survive reload');
check($loaded['invites'] === $data['invites'], 'Invites must survive reload');
check($loaded['attempts'] === $data['attempts'], 'Attempts must remain keyed by IP');

$loaded['matches'][0]['void'] = true;
$loaded['invites'] = [];
$loaded['attempts'] = [];
$storage->save($loaded);
$storage->save($loaded);
$storage = new SectorStorage($config);
$loaded = $storage->load();
check(count($loaded['matches']) === 1 && $loaded['matches'][0]['void'] === true, 'Updates must not duplicate matches');
check($loaded['invites'] === [] && $loaded['attempts'] === [], 'Removed transient records must be deleted');

$invalid = $loaded;
$invalid['users'][] = ['id'=>'bob', 'username'=>'bob', 'name'=>'Bob', 'password'=>'hash', 'admin'=>false];
$invalid['users'][] = ['id'=>'duplicate', 'username'=>'alice', 'name'=>'Duplicate', 'password'=>'hash', 'admin'=>false];
$failed = false;
try {
    $storage->save($invalid);
} catch (PDOException $error) {
    $failed = true;
}
check($failed, 'Duplicate username must fail');
$afterFailure = (new SectorStorage($config))->load();
check($afterFailure['users'] === $loaded['users'], 'Failed transaction must roll back earlier inserts');
$loaded['users'][0]['name'] = 'Alice updated';
$storage->save($loaded);
check((new SectorStorage($config))->load()['users'][0]['name'] === 'Alice updated', 'Storage must remain usable after rollback');

$jobId = str_repeat('a',64);
$job = [$jobId,'test@example.test','{}',time()+3600,time()];
$storage->save(['mail_jobs'=>[$job]]);
$claimed = $storage->claimMail();
check($claimed['id']===$jobId && $storage->claimMail()===null,'A mail job must only be claimed once during its lease');
$storage->finishMail($claimed,false);
check($storage->claimMail()===null,'A failed job must wait before retry');
$queueDb = new PDO('sqlite:'.$config['path']);
$queueDb->exec("UPDATE w40k_mail_jobs SET next_attempt=0");
$retried = $storage->claimMail();
check((int)$retried['attempts']===1,'Retry must keep its attempt count');
$storage->finishMail($retried,true);
$storage->save(['mail_jobs'=>[$job]]);
check($storage->claimMail()===null,'A finished event must not be enqueued again');
check($queueDb->query("SELECT recipient FROM w40k_mail_jobs")->fetchColumn()===null,'A sent job must not retain the recipient');
$queueDb = null;

$wiki = $directory.'/LocalSettings.php';
file_put_contents($wiki, <<<'PHP'
<?php
throw new RuntimeException('This file must never be executed');
$wgDBserver = 'localhost';
$wgDBuser = 'wiki_user';
$wgDBpassword = 'a\'b\\c';
PHP);
check(wikiDatabaseCredentials($wiki) === ['$wgDBserver'=>'localhost', '$wgDBuser'=>'wiki_user', '$wgDBpassword'=>"a'b\\c"], 'Read literal settings without executing PHP');
file_put_contents($wiki, '<?php $wgDBpassword = getenv("SECRET");');
$failed = false;
try {
    wikiDatabaseCredentials($wiki);
} catch (RuntimeException $error) {
    $failed = true;
}
check($failed, 'Missing or computed credentials must be rejected');
echo "Storage persistence, rollback and credential parsing passed.\n";
