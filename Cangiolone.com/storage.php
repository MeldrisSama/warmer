<?php

declare(strict_types=1);



// Read only literal database settings; never execute the wiki configuration.

function wikiDatabaseCredentials(string $path): array {

    $tokens=token_get_all(file_get_contents($path)); $values=[];

    $wanted=['$wgDBserver','$wgDBuser','$wgDBpassword'];

    for($i=0;$i<count($tokens);$i++) {

        if(!is_array($tokens[$i]) || $tokens[$i][0]!==T_VARIABLE || !in_array($tokens[$i][1],$wanted,true)) continue;

        $key=$tokens[$i][1]; $j=$i+1;

        while(isset($tokens[$j]) && is_array($tokens[$j]) && in_array($tokens[$j][0],[T_WHITESPACE,T_COMMENT,T_DOC_COMMENT],true)) $j++;

        if(($tokens[$j]??null)!=='=') continue; $j++;

        while(isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0]===T_WHITESPACE) $j++;

        if(!isset($tokens[$j]) || !is_array($tokens[$j]) || $tokens[$j][0]!==T_CONSTANT_ENCAPSED_STRING) continue;

        $literal=$tokens[$j][1]; $end=$j+1;

        while(isset($tokens[$end]) && is_array($tokens[$end]) && $tokens[$end][0]===T_WHITESPACE) $end++;

        if(($tokens[$end]??null)!==';') continue;

        $inner=substr($literal,1,-1);

        $values[$key]=$literal[0]==="'"?str_replace(["\\'","\\\\"],["'","\\"],$inner):stripcslashes($inner);

    }

    if(count($values)!==3) throw new RuntimeException('Database settings unavailable');

    return $values;

}



final class SectorStorage {

    private PDO $pdo;

    private string $driver;

    private array $snapshot=[];

    private bool $sqliteWrite=false;
    private ?string $mysqlLock=null;
    private const LEAGUE_KEYS=['league'=>'id','league_members'=>'id','league_fixtures'=>'id','league_lineups'=>'id','league_roster_settings'=>'id','league_rosters'=>'id','league_roster_lineups'=>'id','calendar_events'=>'id','calendar_proposals'=>'id','calendar_lineups'=>'id'];
    private const KEYS=['users'=>'id','matches'=>'id','lists'=>'id','invites'=>'hash','attempts'=>'ip'];

    private const BOOLS=['users'=>['admin'],'matches'=>['void'],'invites'=>['used'],'calendar_events'=>['cancelled'],'calendar_lineups'=>['active']];

    private const INTS=['matches'=>['scoreA','scoreB'],'lists'=>['size'],'invites'=>['expires'],'attempts'=>['count','until'],'league_fixtures'=>['round'],'league_rosters'=>['version'],'calendar_events'=>['version'],'calendar_proposals'=>['version']];
    public function __construct(array $config) {

        $this->driver=$config['driver']??'mysql';

        if($this->driver==='sqlite') {

            $this->pdo=new PDO('sqlite:'.$config['path']);

            $this->pdo->exec('PRAGMA busy_timeout=5000');

        } else {

            $credentials=wikiDatabaseCredentials(dirname(__DIR__).'/wiki/LocalSettings.php');

            if($credentials['$wgDBuser']!==$config['user'] || $credentials['$wgDBserver']!==$config['host']) throw new RuntimeException('Unexpected database account');

            $this->pdo=new PDO('mysql:host='.$config['host'].';dbname='.$config['name'].';charset=utf8mb4',$config['user'],$credentials['$wgDBpassword'],[PDO::ATTR_TIMEOUT=>10]);

        }

        $this->pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);

        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);

        $this->pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES,false);

        if($this->driver==='mysql') {

            $this->mysqlLock='w40k_'.$config['name'];
            $stmt=$this->pdo->prepare('SELECT GET_LOCK(?, 10)');$stmt->execute([$this->mysqlLock]);

            if((int)$stmt->fetchColumn()!==1) throw new RuntimeException('Database busy');

        }

        $definitions=[

            'users'=>'`id` VARCHAR(24) PRIMARY KEY, `username` VARCHAR(32) NOT NULL UNIQUE, `name` VARCHAR(60) NOT NULL UNIQUE, `password` VARCHAR(255) NOT NULL, `admin` INT NOT NULL',

            'matches'=>'`id` VARCHAR(24) PRIMARY KEY, `a` VARCHAR(24) NOT NULL, `b` VARCHAR(24) NOT NULL, `scoreA` INT NOT NULL, `scoreB` INT NOT NULL, `date` VARCHAR(10) NOT NULL, `mission` VARCHAR(120) NOT NULL, `photo` VARCHAR(255), `by` VARCHAR(24) NOT NULL, `void` INT NOT NULL, `created` VARCHAR(40) NOT NULL, `request` VARCHAR(64) NOT NULL, `updatedBy` VARCHAR(24), `updated` VARCHAR(40)',

            'lists'=>'`id` VARCHAR(24) PRIMARY KEY, `owner` VARCHAR(24) NOT NULL, `name` VARCHAR(100) NOT NULL, `faction` VARCHAR(80) NOT NULL, `text` MEDIUMTEXT NOT NULL, `date` VARCHAR(10) NOT NULL, `size` INT NOT NULL',

            'invites'=>'`hash` VARCHAR(64) PRIMARY KEY, `expires` BIGINT NOT NULL, `used` INT NOT NULL',

            'attempts'=>'`ip` VARCHAR(64) PRIMARY KEY, `count` INT NOT NULL, `until` BIGINT NOT NULL',
            'league'=>'`id` VARCHAR(24) PRIMARY KEY, `name` VARCHAR(100) NOT NULL, `start` VARCHAR(10), `closed` VARCHAR(40), `paused` VARCHAR(40)',
            'league_entries'=>'`player` VARCHAR(24) PRIMARY KEY, `joined` VARCHAR(40) NOT NULL',
            'league_members'=>'`id` VARCHAR(49) PRIMARY KEY, `league_id` VARCHAR(24) NOT NULL, `player` VARCHAR(24) NOT NULL, `joined` VARCHAR(40) NOT NULL, `army` VARCHAR(64)',
            'mail_accounts'=>'`id` VARCHAR(24) PRIMARY KEY, `email` VARCHAR(254) UNIQUE, `pending_email` VARCHAR(254), `verify_hash` VARCHAR(64), `verify_until` BIGINT NOT NULL, `reset_hash` VARCHAR(64), `reset_until` BIGINT NOT NULL, `version` INT NOT NULL',
            'mail_jobs'=>'`id` VARCHAR(64) PRIMARY KEY, `recipient` VARCHAR(254), `payload` MEDIUMTEXT, `expires` BIGINT NOT NULL, `next_attempt` BIGINT NOT NULL, `attempts` INT NOT NULL',
            'schema_migrations'=>'`id` VARCHAR(64) PRIMARY KEY',
            'calendar_proposals'=>'`id` VARCHAR(24) PRIMARY KEY, `payload` TEXT, `version` INT NOT NULL',
            'calendar_lineups'=>'`id` VARCHAR(49) PRIMARY KEY, `event` VARCHAR(24) NOT NULL, `player` VARCHAR(24) NOT NULL, `text` MEDIUMTEXT NOT NULL, `active` INT NOT NULL',
            'calendar_events'=>'`id` VARCHAR(24) PRIMARY KEY, `date` VARCHAR(10) NOT NULL, `time` VARCHAR(5) NOT NULL, `a` VARCHAR(24) NOT NULL, `b` VARCHAR(24), `owner` VARCHAR(24) NOT NULL, `fixture` VARCHAR(24) UNIQUE, `location` VARCHAR(160) NOT NULL, `notes` TEXT NOT NULL, `cancelled` INT NOT NULL, `version` INT NOT NULL, `created` VARCHAR(40) NOT NULL',
            'league_fixtures'=>'`id` VARCHAR(24) PRIMARY KEY, `round` INT NOT NULL, `a` VARCHAR(24) NOT NULL, `b` VARCHAR(24), `pending` TEXT, `match_id` VARCHAR(24), `league_id` VARCHAR(24) NOT NULL',
            'league_roster_settings'=>'`id` VARCHAR(24) PRIMARY KEY, `payload` TEXT NOT NULL',
            'league_rosters'=>'`id` VARCHAR(24) PRIMARY KEY, `league_id` VARCHAR(24) NOT NULL, `player` VARCHAR(24) NOT NULL, `version` INT NOT NULL, `created` VARCHAR(40) NOT NULL, `payload` MEDIUMTEXT NOT NULL',
            'league_roster_lineups'=>'`id` VARCHAR(49) PRIMARY KEY, `roster_id` VARCHAR(24) NOT NULL, `payload` MEDIUMTEXT NOT NULL',
            'league_lineups'=>'`id` VARCHAR(49) PRIMARY KEY, `fixture` VARCHAR(24) NOT NULL, `player` VARCHAR(24) NOT NULL, `text` MEDIUMTEXT NOT NULL'
        ];

        foreach($definitions as $name=>$columns) $this->pdo->exec('CREATE TABLE IF NOT EXISTS `w40k_'.$name.'` ('.$columns.')'.($this->driver==='mysql'?' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci':''));

        $this->migrateLeagues();
        $columns=$this->pdo->query($this->driver==='sqlite'?'PRAGMA table_info(w40k_users)':'SHOW COLUMNS FROM w40k_users')->fetchAll();
        if(!in_array('avatar',array_column($columns,$this->driver==='sqlite'?'name':'Field'),true)) {
            $this->pdo->exec('ALTER TABLE w40k_users ADD COLUMN avatar MEDIUMTEXT');
        }
    }

    private function migrateLeagues(): void {
        $marker='league-army';
        $check=$this->pdo->prepare('SELECT 1 FROM w40k_schema_migrations WHERE id=?');
        $check->execute([$marker]);
        if($check->fetchColumn()) return;

        $sqlite=$this->driver==='sqlite';
        if($sqlite) $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $check->execute([$marker]);
            if(!$check->fetchColumn()) {
                // MySQL DDL commits implicitly; check each column so a retry can resume.
                foreach([['league','closed','VARCHAR(40)'],['league_fixtures','league_id','VARCHAR(24)'],['league','paused','VARCHAR(40)'],['league_members','army','VARCHAR(64)']] as [$name,$column,$type]) {
                    $table='w40k_'.$name;
                    $columns=$sqlite ? $this->pdo->query('PRAGMA table_info('.$table.')') : $this->pdo->query('SHOW COLUMNS FROM `'.$table.'`');
                    if(!in_array($column,array_column($columns->fetchAll(),$sqlite?'name':'Field'),true)) {
                        $this->pdo->exec('ALTER TABLE `'.$table.'` ADD COLUMN `'.$column.'` '.$type);
                    }
                }

                if(!$sqlite) $this->pdo->beginTransaction();
                $check->execute(['multiple-leagues']);
                if(!$check->fetchColumn()) $this->migrateLegacyLeague();
                $this->pdo->prepare('INSERT INTO w40k_schema_migrations (id) VALUES (?)')->execute([$marker]);
            }
            if($sqlite) $this->pdo->exec('COMMIT');
            elseif($this->pdo->inTransaction()) $this->pdo->commit();
        } catch(Throwable $error) {
            if($sqlite) $this->pdo->exec('ROLLBACK');
            elseif($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    private function migrateLegacyLeague(): void {
        $seasonIds=$this->pdo->query('SELECT id FROM w40k_league')->fetchAll(PDO::FETCH_COLUMN);
        if(count($seasonIds)>1) throw new RuntimeException('Ambiguous legacy season');
        $legacy=$this->pdo->query('SELECT player, joined FROM w40k_league_entries')->fetchAll();
        if(!$seasonIds && ($legacy || $this->pdo->query('SELECT COUNT(*) FROM w40k_league_fixtures')->fetchColumn())) {
            throw new RuntimeException('Missing legacy season');
        }
        if($seasonIds) {
            $season=$seasonIds[0];
            $copy=$this->pdo->prepare('INSERT INTO w40k_league_members (id,league_id,player,joined) VALUES (?,?,?,?)');
            foreach($legacy as $entry) $copy->execute([$season.':'.$entry['player'],$season,$entry['player'],$entry['joined']]);
            $this->pdo->prepare('UPDATE w40k_league_fixtures SET league_id=? WHERE league_id IS NULL')->execute([$season]);
        }
        $this->pdo->exec("INSERT INTO w40k_schema_migrations (id) VALUES ('multiple-leagues')");
    }

    /** Reuse the established, authenticated database connection for builder tables. */
    public function builderConnection(): PDO { return $this->pdo; }
    public function builderDriver(): string { return $this->driver; }

    public function beginLeagueUpdate(): void {
        if($this->driver==='sqlite') {
            $this->pdo->exec('BEGIN IMMEDIATE');
            $this->sqliteWrite=true;
        }
    }

    public function load(string $scope='archive'): array {
        $keys=match($scope) {
            'league'=>['users'=>'id','matches'=>'id']+self::LEAGUE_KEYS,
            'state'=>self::KEYS+self::LEAGUE_KEYS,
            default=>self::KEYS
        };
        $data=[];

        foreach($keys+['mail_accounts'=>'id'] as $table=>$key) {
            $data[$table]=[];

            $columns=match($table) {
                'league_lineups'=>'`id`, `fixture`, `player`',
                'calendar_lineups'=>'*',
                default=>'*'
            };
            foreach($this->pdo->query('SELECT '.$columns.' FROM `w40k_'.$table.'`') as $row) {
                foreach(self::BOOLS[$table]??[] as $c) $row[$c]=(bool)$row[$c];

                foreach(self::INTS[$table]??[] as $c) $row[$c]=(int)$row[$c];

                $this->snapshot[$table][$row[$key]]=$row;

                if($table==='attempts') { $ip=$row['ip'];unset($row['ip']);$data[$table][$ip]=$row; } else $data[$table][]=$row;

            }

        }

        return $data;

    }

    public function releaseApplicationLock(): void {
        if($this->mysqlLock!==null) {
            $this->pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$this->mysqlLock]);
            $this->mysqlLock=null;
        }
    }

    public function discardOldMail(): void {
        $this->pdo->prepare('UPDATE w40k_mail_jobs SET recipient=NULL, payload=NULL WHERE payload IS NOT NULL AND (expires<=? OR attempts>0)')->execute([time()]);
    }

    public function takeMail(string $id): ?array {
        $now=time();
        $select=$this->pdo->prepare('SELECT id,recipient,payload FROM w40k_mail_jobs WHERE id=? AND payload IS NOT NULL AND expires>? AND attempts=0');
        $select->execute([$id,$now]);
        $job=$select->fetch();
        if(!$job) return null;
        // Consume the attempt before SMTP so a disconnect cannot trigger a second send.
        $claim=$this->pdo->prepare('UPDATE w40k_mail_jobs SET recipient=NULL, payload=NULL, attempts=1 WHERE id=? AND payload IS NOT NULL AND expires>? AND attempts=0');
        $claim->execute([$id,$now]);
        return $claim->rowCount()===1 ? $job : null;
    }

    public function leagueLineupText(string $id): string {
        $statement=$this->pdo->prepare('SELECT `text` FROM `w40k_league_lineups` WHERE `id`=?');
        $statement->execute([$id]);
        $text=$statement->fetchColumn();
        if(!is_string($text)) throw new RuntimeException('League lineup missing');
        return $text;
    }

    public function calendarLineupText(string $id): string {
        $statement=$this->pdo->prepare('SELECT `text` FROM w40k_calendar_lineups WHERE id=? AND active=1');
        $statement->execute([$id]);
        $text=$statement->fetchColumn();
        if(!is_string($text)) throw new RuntimeException('Calendar lineup missing');
        return $text;
    }

    public function save(array $data): void {

        if(!$this->sqliteWrite) $this->pdo->beginTransaction();
        try {
            $pending=$this->snapshot;

            foreach(array_intersect_key(self::KEYS+self::LEAGUE_KEYS+['mail_accounts'=>'id'],$data) as $table=>$key) {
                $next=[];

                foreach($data[$table] as $index=>$row) {

                    if($table==='attempts') $row['ip']=$index;

                    $id=$row[$key];$next[$id]=$row;

                    if(($this->snapshot[$table][$id]??null)===$row) continue;

                    $columns=array_keys($row);

                    $quoted=array_map(fn($c)=>'`'.$c.'`',$columns);

                    $sql='INSERT INTO `w40k_'.$table.'` ('.implode(',',$quoted).') VALUES ('.implode(',',array_fill(0,count($columns),'?')).')';

                    $updates=array_map(fn($c)=>'`'.$c.'`='.($this->driver==='mysql'?'VALUES(`'.$c.'`)':'excluded.`'.$c.'`'),array_filter($columns,fn($c)=>$c!==$key));

                    $sql.=($this->driver==='mysql'?' ON DUPLICATE KEY UPDATE ':' ON CONFLICT (`'.$key.'`) DO UPDATE SET ').implode(',',$updates);

                    $this->pdo->prepare($sql)->execute(array_map(fn($v)=>is_bool($v)?(int)$v:$v,array_values($row)));

                }

                if(in_array($table,['attempts','invites'],true)) foreach($this->snapshot[$table]??[] as $id=>$row) if(!isset($next[$id])) $this->pdo->prepare('DELETE FROM `w40k_'.$table.'` WHERE `'.$key.'`=?')->execute([$id]);

                $pending[$table]=$next;

            }

            if(!empty($data['mail_jobs'])) {
                $sql='INSERT INTO w40k_mail_jobs (id,recipient,payload,expires,next_attempt,attempts) VALUES (?,?,?,?,?,0)';
                $sql.=$this->driver==='mysql'?' ON DUPLICATE KEY UPDATE id=id':' ON CONFLICT (id) DO NOTHING';
                $enqueue=$this->pdo->prepare($sql);
                foreach($data['mail_jobs'] as $job) $enqueue->execute($job);
            }
            if($this->sqliteWrite) $this->pdo->exec('COMMIT');
            else $this->pdo->commit();
            $this->snapshot=$pending;
        } catch(Throwable $e) {
            if($this->sqliteWrite) $this->pdo->exec('ROLLBACK');
            elseif($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        } finally {
            $this->sqliteWrite=false;
        }
    }

}

