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
$config = ['driver'=>'sqlite', 'path'=>$directory.'/storage.sqlite'];
$storage = new SectorStorage($config);
$data = $storage->load();
check($data === ['users'=>[], 'matches'=>[], 'lists'=>[], 'invites'=>[], 'attempts'=>[]], 'New database must be empty');

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
