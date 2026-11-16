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
    private const LEAGUE_KEYS=['league'=>'id','league_members'=>'id','league_fixtures'=>'id','league_lineups'=>'id'];
    private const KEYS=['users'=>'id','matches'=>'id','lists'=>'id','invites'=>'hash','attempts'=>'ip'];
    private const BOOLS=['users'=>['admin'],'matches'=>['void'],'invites'=>['used']];
    private const INTS=['matches'=>['scoreA','scoreB'],'lists'=>['size'],'invites'=>['expires'],'attempts'=>['count','until'],'league_fixtures'=>['round']];
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
            $stmt=$this->pdo->prepare('SELECT GET_LOCK(?, 10)');$stmt->execute(['w40k_'.$config['name']]);
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
            'league_members'=>'`id` VARCHAR(49) PRIMARY KEY, `league_id` VARCHAR(24) NOT NULL, `player` VARCHAR(24) NOT NULL, `joined` VARCHAR(40) NOT NULL',
            'schema_migrations'=>'`id` VARCHAR(64) PRIMARY KEY',
            'league_fixtures'=>'`id` VARCHAR(24) PRIMARY KEY, `round` INT NOT NULL, `a` VARCHAR(24) NOT NULL, `b` VARCHAR(24), `pending` TEXT, `match_id` VARCHAR(24), `league_id` VARCHAR(24) NOT NULL',
            'league_lineups'=>'`id` VARCHAR(49) PRIMARY KEY, `fixture` VARCHAR(24) NOT NULL, `player` VARCHAR(24) NOT NULL, `text` MEDIUMTEXT NOT NULL'
        ];
        foreach($definitions as $name=>$columns) $this->pdo->exec('CREATE TABLE IF NOT EXISTS `w40k_'.$name.'` ('.$columns.')'.($this->driver==='mysql'?' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci':''));
        $this->migrateLeagues();
    }
    private function migrateLeagues(): void {
        $marker='league-pause';
        $check=$this->pdo->prepare('SELECT 1 FROM w40k_schema_migrations WHERE id=?');
        $check->execute([$marker]);
        if($check->fetchColumn()) return;

        $sqlite=$this->driver==='sqlite';
        if($sqlite) $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $check->execute([$marker]);
            if(!$check->fetchColumn()) {
                // MySQL DDL commits implicitly; check each column so a retry can resume.
                foreach([['league','closed','VARCHAR(40)'],['league_fixtures','league_id','VARCHAR(24)'],['league','paused','VARCHAR(40)']] as [$name,$column,$type]) {
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

    public function beginLeagueUpdate(): void {
        if($this->driver==='sqlite') {
            $this->pdo->exec('BEGIN IMMEDIATE');
            $this->sqliteWrite=true;
        }
    }

    public function load(string $scope='archive'): array {
        $keys=match($scope) {
            'league'=>['users'=>'id','matches'=>'id']+self::LEAGUE_KEYS,
            'state'=>self::KEYS+array_intersect_key(self::LEAGUE_KEYS,['league'=>true,'league_members'=>true,'league_fixtures'=>true]),
            default=>self::KEYS
        };
        $data=[];
        foreach($keys as $table=>$key) {
            $data[$table]=[];
            $columns=$table==='league_lineups' ? '`id`, `fixture`, `player`' : '*';
            foreach($this->pdo->query('SELECT '.$columns.' FROM `w40k_'.$table.'`') as $row) {
                foreach(self::BOOLS[$table]??[] as $c) $row[$c]=(bool)$row[$c];
                foreach(self::INTS[$table]??[] as $c) $row[$c]=(int)$row[$c];
                $this->snapshot[$table][$row[$key]]=$row;
                if($table==='attempts') { $ip=$row['ip'];unset($row['ip']);$data[$table][$ip]=$row; } else $data[$table][]=$row;
            }
        }
        return $data;
    }
    public function leagueLineupText(string $id): string {
        $statement=$this->pdo->prepare('SELECT `text` FROM `w40k_league_lineups` WHERE `id`=?');
        $statement->execute([$id]);
        $text=$statement->fetchColumn();
        if(!is_string($text)) throw new RuntimeException('League lineup missing');
        return $text;
    }

    public function save(array $data): void {
        if(!$this->sqliteWrite) $this->pdo->beginTransaction();
        try {
            foreach(array_intersect_key(self::KEYS+self::LEAGUE_KEYS,$data) as $table=>$key) {
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