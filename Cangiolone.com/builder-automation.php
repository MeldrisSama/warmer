<?php
declare(strict_types=1);

// Import-time interpretation is deliberately conservative. Unrecognised prose stays visible.
function builderRuleText(string $html): string {
    if (!str_contains($html,'<')) return trim($html);
    $dom=new DOMDocument();$previous=libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8"><div id="builder-text">'.$html.'</div>',LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);
    libxml_clear_errors();libxml_use_internal_errors($previous);$xpath=new DOMXPath($dom);
    foreach ($xpath->query('//script|//style|//*[contains(concat(" ",normalize-space(@class)," ")," ShowFluff ") or contains(concat(" ",normalize-space(@class)," ")," abLegend ") or contains(concat(" ",normalize-space(@class)," ")," abNameWrap ") or contains(concat(" ",normalize-space(@class)," ")," h_number ")]') as $node) $node->parentNode?->removeChild($node);
    $walk=function(DOMNode $node) use (&$walk): string {
        if ($node instanceof DOMText) return $node->nodeValue;
        $tag=strtolower($node->nodeName);if ($tag==='br') return "\n";
        $text='';foreach ($node->childNodes as $child) $text.=$walk($child);
        if ($tag==='li') return "\n• ".trim($text)."\n";
        if (in_array($tag,['p','div','ul','ol','table','tr','h1','h2','h3','h4','h5','h6'],true)) return "\n\n".trim($text)."\n\n";
        if (in_array($tag,['td','th'],true)) return trim($text).' | ';
        return $text;
    };
    $text=$walk($dom->getElementById('builder-text')??$dom);
    $text=preg_replace('/[\t \x{00a0}]+/u',' ',$text);
    $text=preg_replace('/ *\n */',"\n",$text);
    return trim(preg_replace('/\n{3,}/',"\n\n",$text));
}
function builderWeaponKey(string $name): string {
    return strtolower(preg_replace('/[^a-z0-9]/i','',str_replace(['’','‘'],"'",$name)));
}
function builderCompileLoadout(array $unit, callable $description): array {
    $weapons=[];$byName=[];
    foreach ($unit['weapons'] as $weapon) {
        if (!empty($weapon['enhancement_id'])||empty($weapon['name'])) continue;
        $name=preg_split('/\s+[-–—]\s+/u',$weapon['name'])[0];$key=builderWeaponKey($name);
        if (!isset($weapons[$key])) $weapons[$key]=['id'=>'w_'.$weapon['line'],'name'=>$name,'lines'=>[],'cost'=>0];
        $weapons[$key]['lines'][]=$weapon['line'];$byName[$key]=$weapons[$key]['id'];
    }
    foreach ($unit['abilities'] as $ability) if (($ability['type']??'')==='Wargear') {
        $key=builderWeaponKey($ability['name']);
        if (!isset($weapons[$key])) $weapons[$key]=['id'=>'gear_'.substr(md5($key),0,12),'name'=>$ability['name'],'lines'=>[],'cost'=>0,'ability'=>$ability['name']];
    }
    foreach ($unit['costs'] as $cost) if (preg_match('/^per (.+)$/i',$cost['description']??'',$m) && isset($weapons[builderWeaponKey($m[1])])) $weapons[builderWeaponKey($m[1])]['cost']=(int)($cost['cost']??0);
    $parts=static function(string $text) use ($weapons): ?array {
        $out=[];
        foreach (preg_split('/;|\band\b/i',trim($text," .\n•")) as $part) {
            $part=trim($part);if ($part==='') continue;
            preg_match('/^(?:(\d+)\s+)?(.+)$/',$part,$m);$name=builderWeaponKey($m[2]);
            $weapon=$weapons[$name]??$weapons[rtrim($name,'s')]??null;
            if (!$weapon) return null;
            $out[$weapon['id']]=(int)($m[1]?:1);
        }
        return $out?:null;
    };
    // A weapon name such as "Knives and Fists" must be matched before splitting a bundle.
    $parse=static function(string $text) use ($parts,$weapons): ?array {
        $text=trim($text," .\n•");preg_match('/^(?:(\d+)\s+)?(.+)$/',$text,$m);
        $key=builderWeaponKey($m[2]??'');if (isset($weapons[$key])) return [$weapons[$key]['id']=>(int)(($m[1]??'')?:1)];
        return $parts($text);
    };
    $models=[];$variable=0;
    foreach ($unit['composition'] as $row) {
        $composition=preg_replace('/\s*[–—-]\s*EPIC HERO$/u','',trim($description($row)));
        $composition=preg_replace('/\s+models?\.?$/i','',$composition);
        if (!preg_match('/^(\d+)(?:-(\d+))?\s+([^\n]+)$/i',$composition,$m)) continue;
        $isVariable=!empty($m[2]);$variable+=(int)$isVariable;
        $models[]=['id'=>'m'.count($models),'name'=>$m[3],'fixed'=>$isVariable?0:(int)$m[1],'variable'=>$isVariable];
    }
    if (!$models || $variable>1) return [];
    $groups=[];
    if (preg_match_all('/((?:Every|This|The) [^:.]{1,100}?) is equipped with:\s*(.+?)(?:\.\s|\.$|$)/i',$unit['loadout'],$defaults,PREG_SET_ORDER)) {
        foreach ($models as $model) foreach ($defaults as $default) {
            $target=preg_replace('/^(Every|This|The) /i','',$default[1]);
            $target=preg_replace('/\s+models?$/i','',$target);
            $targets=array_map(static fn($t)=>rtrim(builderWeaponKey(trim($t)),'s'),explode(' and ',$target));
            if (!in_array(strtolower($target),['model','models'],true)&&!in_array(rtrim(builderWeaponKey($model['name']),'s'),$targets,true)) continue;
            foreach (preg_split('/;|,/',$default[2]) as $item) {
            $bundle=$parse($item);if (!$bundle) continue;
            $id=$model['id'].'_'.count($groups);
            $groups[]=['id'=>$id,'model'=>$model['id'],'name'=>$model['name'].' · '.trim(preg_replace('/^\d+\s+/','',$item)),'per'=>0,'default'=>'base','choices'=>[['id'=>'base','name'=>trim(preg_replace('/^\d+\s+/','',$item)),'weapons'=>$bundle]]];
            }
        }
    }
    if (!$groups) return [];
    $covered=[];$optionTotal=0;
    foreach ($unit['options'] as $optionIndex=>$row) {
        $text=trim($description($row));$per=0;$target='';$from='';$alternatives=[];$add=false;
        // The source's no-options placeholder is not an equipment rule.
        if (preg_match('/^None\.?$/i',$text)) continue;
        $optionTotal++;
        if (preg_match('/^For every (\d+) models in this unit, 1 (?:(.+?) )?model can (?:have their (.+?) replaced with (.+)|be equipped with (.+))\.?$/is',$text,$m)) {
            $per=(int)$m[1];$target=($m[2]??'')?:'model';$from=$m[3]??'';$tail=($m[5]??'')?:($m[4]??'');$add=!empty($m[5]);
        } elseif (preg_match('/^Any number of models can each have their (.+?) replaced with (.+)$/is',$text,$m)) {
            $target='model';$from=$m[1];$tail=$m[2];
        } elseif (preg_match('/^(?:Any number of (.+?) models can each|The (.+?) can) have their (.+?) replaced with (.+)$/is',$text,$m)) {
            $target=($m[1]??'')?:$m[2];$from=$m[3];$tail=$m[4];
        } elseif (preg_match('/^This model[’\']s (.+?) can be replaced with (.+)$/isu',$text,$m)) {
            $target='model';$from=$m[1];$tail=$m[2];
        } elseif (preg_match('/^(?:This model|Any model|Any number of models) can (?:each )?have (?:its|their) (.+?) replaced with (.+)$/isu',$text,$m)) {
            $target='model';$from=$m[1];$tail=$m[2];
        } elseif (preg_match('/^This model can be equipped with (.+)$/isu',$text,$m)) {
            $target='model';$tail=$m[1];$add=true;
        } else continue;
        $tail=preg_replace('/\([^)]*\)/','',$tail);
        $tail=preg_replace('/^one of the following:\s*/i','',$tail);
        foreach (preg_split('/\n+|•/',$tail) as $option) { $bundle=$parse($option);if ($bundle) $alternatives[]=['id'=>'choice'.count($alternatives),'name'=>trim($option," .\n"),'weapons'=>$bundle]; }
        if (!$alternatives) continue;
        foreach ($models as $model) {
            if (!in_array(strtolower($target),['model','models'],true)&&rtrim(builderWeaponKey($target),'s')!==rtrim(builderWeaponKey($model['name']),'s')) continue;
            if ($add) {
                $groups[]=['id'=>$model['id'].'_extra'.count($groups),'model'=>$model['id'],'name'=>$model['name'].' · '.trim($tail),'per'=>0,'sharedKey'=>'option_'.$optionIndex,'sharedPer'=>$per,'default'=>'none','choices'=>array_merge([['id'=>'none','name'=>'Nessuna','weapons'=>[]]],$alternatives)];$covered[$optionIndex]=true;continue;
            }
            $original=$parse($from);if (!$original) continue;
            foreach ($groups as &$group) if ($group['model']===$model['id'] && $group['choices'][0]['weapons']===$original) {
                $group['choicePer']=$per;
                $group['sharedKey']='option_'.$optionIndex;$group['sharedPer']=$per;
                foreach ($alternatives as $choice) if (!in_array($choice['weapons'],array_column($group['choices'],'weapons'),true)) { $choice['id']='choice'.count($group['choices']);$group['choices'][]=$choice; }
                $covered[$optionIndex]=true;break;
            } unset($group);
        }
    }
    return ['version'=>1,'models'=>$models,'weapons'=>array_values($weapons),'groups'=>$groups,'optionsCovered'=>count($covered),'optionsTotal'=>$optionTotal];
}
function builderLoadoutCapacity(array $recipe,array $group,int $models): int {
    $fixed=array_sum(array_column(array_filter($recipe['models'],static fn($m)=>!$m['variable']),'fixed'));
    $model=array_column($recipe['models'],null,'id')[$group['model']];
    $available=$model['variable']?max(0,$models-$fixed):$model['fixed'];
    return $group['per']?min($available,(int)floor($models/$group['per'])):$available;
}
function builderLoadoutCounts(array $recipe,array $selections,int $models): array {
    $fixed=array_sum(array_column(array_filter($recipe['models'],static fn($m)=>!$m['variable']),'fixed'));
    if ($fixed>$models) builderInvalid('Taglia inferiore ai modelli obbligatori della dotazione.');
    $counts=[];$cost=0;$known=array_column($recipe['weapons'],null,'id');$clean=[];$shared=[];
    $groups=array_column($recipe['groups'],null,'id');
    foreach ($selections as $id=>$value) if (!isset($groups[$id])) builderInvalid('Gruppo dotazione sconosciuto.');
    foreach ($recipe['groups'] as $group) {
        $selected=$selections[$group['id']]??[$group['default']=>builderLoadoutCapacity($recipe,$group,$models)];
        if (!is_array($selected)) builderInvalid('Scelte dotazione non valide.');
        $choices=array_column($group['choices'],null,'id');$sum=0;
        foreach ($selected as $id=>$quantity) {
            if (!isset($choices[$id])) builderInvalid('Scelta dotazione sconosciuta.');
            $quantity=builderInt($quantity,'quantità dotazione',0,1000);$sum+=$quantity;
            foreach ($choices[$id]['weapons'] as $wid=>$perModel) {
                foreach ($known[$wid]['lines'] as $line) $counts[$line]=($counts[$line]??0)+$quantity*$perModel;
                $cost+=$quantity*$perModel*$known[$wid]['cost'];
            }
        }
        if ($sum!==builderLoadoutCapacity($recipe,$group,$models)) builderInvalid('Quantità incompatibili con la taglia nel gruppo '.$group['name']);
        if (!empty($group['choicePer']) && $sum-($selected[$group['default']]??0)>(int)floor($models/$group['choicePer'])) builderInvalid('Limite delle sostituzioni superato.');
        if (!empty($group['sharedPer'])) {
            $key=$group['sharedKey'];$shared[$key]=($shared[$key]??0)+$sum-($selected[$group['default']]??0);
            if ($shared[$key]>(int)floor($models/$group['sharedPer'])) builderInvalid('Limite delle sostituzioni condivise superato.');
        }
        $clean[$group['id']]=$selected;
    }
    foreach ($counts as $quantity) builderInt($quantity,'quantità arma derivata',0,1000);
    return ['selections'=>$clean,'weaponCounts'=>$counts,'cost'=>$cost];
}
function builderGearLimit(array $unit,string $line,int $models): int {
    $recipe=$unit['loadoutRecipe']??[];$weapon=null;
    foreach ($recipe['weapons']??[] as $candidate) if (in_array($line,$candidate['lines'],true)) {$weapon=$candidate;break;}
    if (!$weapon) return $models;
    $max=0;$seen=[];$found=false;
    foreach ($recipe['groups'] as $group) {
        $amount=0;$alternative=false;
        foreach ($group['choices'] as $choice) if (isset($choice['weapons'][$weapon['id']])) {$amount=max($amount,$choice['weapons'][$weapon['id']]);$alternative=$alternative||$choice['id']!==$group['default'];}
        if (!$amount) continue;$found=true;
        if (!empty($group['sharedPer'])&&$alternative) {if (isset($seen[$group['sharedKey']]))continue;$seen[$group['sharedKey']]=true;$max+=(int)floor($models/$group['sharedPer'])*$amount;}
        else $max+=builderLoadoutCapacity($recipe,$group,$models)*$amount;
    }
    return $found?$max:$models;
}
function builderCompileEffects(array $rows,callable $description): array {
    $out=[];
    foreach ($rows as $index=>$row) {
        $text=trim($description($row));$body=preg_replace('/^.{1,130}?models? only\.\s*/i','',$text);
        $effects=[];$scope='unit';$weaponType='';$condition='';
        if (preg_match('/^(?:While (?:this model|the bearer) is leading a unit,\s*)(.+)$/isu',$body,$m)) { $body=$m[1];$condition='leading'; }
        elseif (preg_match('/^((?:If|While) [^,\n]{1,160}),\s*(.+)$/isu',$body,$m)) {$condition=$m[1];$body=$m[2];}
        if (preg_match('/^(This unit[’\']s|This model[’\']s|The bearer[’\']s) (ranged |melee )?attacks have \[([a-z0-9 -]+)\]\.?$/iu',$body,$m)) {
            $scope=stripos($m[1],'unit')!==false?'unit':'bearer';$weaponType=trim($m[2]??'');$effects[]=['field'=>'keywords','operation'=>'keyword','value'=>strtoupper($m[3])];
        } elseif (preg_match('/^(This unit|This model|The bearer) has (\d)\+ (?:InSv|invulnerable save)\.?$/iu',$body,$m)) {
            $scope=stripos($m[1],'unit')!==false?'unit':'bearer';$effects[]=['field'=>'inv_sv','operation'=>'min','value'=>(int)$m[2]];
        } elseif (preg_match('/^The bearer has a Save characteristic of (\d)\+\.(?:\s|$)/iu',$body,$m)) {
            $scope='bearer';$effects[]=['field'=>'Sv','operation'=>'set','value'=>(int)$m[1]];
        } elseif (preg_match('/^Add (\d+) to the (Attacks|Strength|Damage) characteristic of (?:the bearer[’\']s|this model[’\']s) (melee|ranged) weapons\.?$/iu',$body,$m)) {
            $scope='bearer';$weaponType=strtolower($m[3]);$effects[]=['field'=>['attacks'=>'A','strength'=>'S','damage'=>'D'][strtolower($m[2])],'operation'=>'add','value'=>(int)$m[1]];
        } elseif (preg_match('/^Add (\d+) to the Strength and add (\d+) to the Attacks characteristics of the bearer[’\']s (melee|ranged) weapons\.?$/iu',$body,$m)) {
            $scope='bearer';$weaponType=strtolower($m[3]);$effects=[['field'=>'S','operation'=>'add','value'=>(int)$m[1]],['field'=>'A','operation'=>'add','value'=>(int)$m[2]]];
        } elseif (preg_match('/^(This unit[’\']s|This model[’\']s|The bearer[’\']s) (melee |ranged )?attacks have \+(\d+) ([ASD]|A, S and D)\.?$/iu',$body,$m)) {
            $scope=stripos($m[1],'unit')!==false?'unit':'bearer';$weaponType=trim($m[2]);
            foreach (str_contains($m[4],',')?['A','S','D']:[$m[4]] as $field) $effects[]=['field'=>$field,'operation'=>'add','value'=>(int)$m[3]];
        } elseif (preg_match('/^(?:This model|The bearer) has \+(\d+) ([WMT]|OC)\.?$/iu',$body,$m)) {
            $scope='bearer';$effects[]=['field'=>$m[2],'operation'=>'add','value'=>(int)$m[1]];
        } elseif (preg_match('/^Improve the Save characteristic of (?:the bearer|this model) by (\d)\.?$/iu',$body,$m)) {
            $scope='bearer';$effects[]=['field'=>'Sv','operation'=>'add','value'=>-(int)$m[1]];
        }
        if (($row['name']??'')==='Combat Doctrines'&&str_contains($text,'DEVASTATOR DOCTRINE')&&str_contains($text,'[ASSAULT]')) {
            $effects[]=['field'=>'keywords','operation'=>'keyword','value'=>'ASSAULT'];$condition='Devastator Doctrine attiva';$weaponType='ranged';
        }
        foreach ($effects as $effect) $out[]=$effect+['id'=>'effect_'.substr(hash('sha256',($row['name']??'Rule').'|'.$text.'|'.$effect['field'].'|'.$effect['value']),0,20),'source'=>$row['name']??'Rule','scope'=>$scope,'weaponType'=>$weaponType,'condition'=>$condition,'gear'=>($row['type']??'')==='Wargear'?($row['name']??''):'','text'=>$text];
    }
    return $out;
}
function builderBuildAllies(array $catalog): array {
    $units=$catalog['units'];$has=static fn($u,$key)=>in_array(strtolower($key),array_map('strtolower',array_map('trim',explode(',',$u['keywords']))),true);
    $select=static fn(callable $test)=>array_column(array_values(array_filter($units,$test)),'id');
    $factions=[];$imperium=['aoi','am','tl','gk','adm','qi','sm','ac','as'];$chaos=['csm','dg','ec','ts','we','qt','cd'];
    foreach ($catalog['factions'] as $faction) {
        $fid=$faction['id'];$grants=[];$marine=$fid==='sm'||str_starts_with($fid,'sm_');$imperial=$marine||in_array($fid,$imperium,true);
        $conditionalKeyword=['ts'=>'Scintillating Legions','dg'=>'Plague Legions','ec'=>'Legions of Excess','we'=>'Blood Legions'][$fid]??null;
        if ($conditionalKeyword) $faction['unitIds']=array_values(array_filter($faction['unitIds'],static fn($id)=>!$has(array_column($units,null,'id')[$id],$conditionalKeyword)));
        if ($fid==='ae') $faction['unitIds']=array_values(array_filter($faction['unitIds'],static fn($id)=>!$has(array_column($units,null,'id')[$id],'Ynnari')||$has(array_column($units,null,'id')[$id],'Asuryani')||$has(array_column($units,null,'id')[$id],'Harlequins')));
        $add=static function(string $id,string $name,array $ids,array $extra=[]) use (&$grants) {if ($ids) $grants[]=$extra+['id'=>$id,'name'=>$name,'unitIds'=>$ids,'detachmentIds'=>[],'excludedDetachmentIds'=>[],'points'=>[],'warlord'=>false,'enhancements'=>false,'kind'=>'points'];};
        $dids=static fn(string $name)=>array_column(array_filter($faction['detachments'],static fn($d)=>strcasecmp(str_replace('’',"'",$d['name']),str_replace('’',"'",$name))===0),'id');
        if ($imperial&&$fid!=='aoi') $add('assigned_agents','Assigned Agents',$select(static fn($u)=>($u['factionId']??'')==='aoi'),['kind'=>'agents','source'=>'https://wahapedia.ru/wh40k11ed/factions/imperial-agents/#Assigned-Agents']);
        if ($imperial&&$fid!=='qi') $add('freeblades','Freeblades',$select(static fn($u)=>($u['factionId']??'')==='qi'),['kind'=>'knights','source'=>'https://wahapedia.ru/wh40k11ed/factions/imperial-knights/#Freeblades']);
        if ($imperial&&$fid!=='tl') $add('titanic_support','Titanic Support',$select(static fn($u)=>($u['factionId']??'')==='tl'),['kind'=>'titan','source'=>'https://wahapedia.ru/wh40k11ed/factions/adeptus-titanicus/']);
        if (in_array($fid,$chaos,true)&&$fid!=='qt') $add('dreadblades','Dreadblades',$select(static fn($u)=>($u['factionId']??'')==='qt'),['kind'=>'knights','source'=>'https://wahapedia.ru/wh40k11ed/factions/chaos-knights/#Dreadblades']);
        if (in_array($fid,['csm','dg','ec','ts','we','qt'],true)) $add('daemonic_pact','Daemonic Pact',$select(static fn($u)=>($u['factionId']??'')==='cd'),['kind'=>'daemons','points'=>[1000=>250,2000=>500,3000=>750],'source'=>'https://wahapedia.ru/wh40k11ed/factions/chaos-daemons/#Daemonic-Pact']);
        if ($fid==='csm') $add('cult_marines','Cult Marines',$select(static fn($u)=>in_array(strtolower($u['name']),['khorne berzerkers','rubric marines','plague marines','noise marines'],true)),['points'=>[1000=>250,2000=>500,3000=>750],'source'=>'https://wahapedia.ru/wh40k11ed/factions/chaos-space-marines/']);
        if ($marine&&$dids('Deathwatch Support')) $add('deathwatch_support','Deathwatch Allies',$select(static fn($u)=>($u['factionId']??'')==='sm'&&$has($u,'Deathwatch')),['detachmentIds'=>$dids('Deathwatch Support'),'points'=>[1000=>500,2000=>500,3000=>500],'enhancements'=>true,'source'=>'https://wahapedia.ru/wh40k11ed/factions/space-marines/#Deathwatch-Support']);
        $special=[
            ['gc','Brood Brother Auxilia','brood_brothers','am',null,['Aircraft','Commissar','Epic Hero','Militarum Tempestus','Ogryn','Ratling','Tech-Priest Enginseer','Ministorum Priest']],
            ['gc','Final Day','star_children','tyr','Vanguard Invader',['Aircraft','Broodlord','Genestealers']],
            ['ts','Changehost of Deceit','changehost','ts','Scintillating Legions',[]],
            ['dg','Tallyband Summoners','tallyband','dg','Plague Legions',[]],
            ['ec','Carnival of Excess','carnival','ec','Legions of Excess',[]],
            ['we','Khorne Daemonkin','daemonkin','we','Blood Legions',[]],
            ['qt','Iconoclast Fiefdom','thralls','csm','Damned',[]],
            ['qi','Questor Forgepact','forgepact','adm',null,[]],
            ['cd','Shadow Legion','shadow_legion','csm',null,[]],
            ['dru',"Reaper's Wager",'reapers','ae','Harlequins',[]]
        ];
        foreach ($special as [$host,$detachment,$id,$from,$keyword,$exclude]) if ($host===$fid && $dids($detachment)) {
            $ids=$select(static function($u) use ($from,$keyword,$exclude,$has,$id) {
                if (($u['factionId']??'')!==$from || ($keyword&&!$has($u,$keyword))) return false;
                foreach ($exclude as $key) if ($has($u,$key)||strcasecmp($u['name'],$key)===0) return false;
                if ($id==='forgepact') return in_array(strtolower($u['name']),['tech-priest dominus','tech-priest manipulus','skitarii marshal','skitarii rangers','skitarii vanguard'],true);
                if ($id==='shadow_legion') return $has($u,'Damned')||in_array(strtolower($u['name']),['chaos lord','chaos lord in terminator armour','chaos lord with jump pack','chaos terminator squad','chosen','dark apostle','havocs','legionaries','master of possession','possessed','raptors','sorcerer','sorcerer in terminator armour','warp talons'],true);
                return true;
            });
            $add($id,$detachment,$ids,['detachmentIds'=>$dids($detachment),'points'=>in_array($id,['thralls','forgepact'],true)?[1000=>500,2000=>500,3000=>500]:[1000=>500,2000=>1000,3000=>1500],'enhancements'=>true,'source'=>'https://wahapedia.ru/wh40k11ed/factions/'.str_replace([' ','’',"'"],['-','',''],strtolower($faction['name'])).'/']);
        }
        if ($fid==='dru') $add('travelling_players','Corsairs and Travelling Players',$select(static fn($u)=>($u['factionId']??'')==='ae'&&($has($u,'Harlequins')||$has($u,'Anhrathe'))),['excludedDetachmentIds'=>$dids("Reaper's Wager"),'points'=>[1000=>250,2000=>500,3000=>750],'source'=>'https://wahapedia.ru/wh40k11ed/factions/drukhari/#Corsairs-and-Travelling-Players']);
        if ($fid==='ae'&&$dids('Devoted of Ynnead')) $add('ynnari','Servants of the Whispering God',$select(static fn($u)=>($u['factionId']??'')==='ae'&&$has($u,'Ynnari')&&!$has($u,'Asuryani')&&!$has($u,'Harlequins')),['detachmentIds'=>$dids('Devoted of Ynnead'),'kind'=>'ynnari','warlord'=>true,'enhancements'=>true,'source'=>'https://wahapedia.ru/wh40k11ed/factions/aeldari/']);
        if (in_array($fid,$chaos,true)) $add('titanicus_traitoris','Titanicus Traitoris',$select(static fn($u)=>($u['factionId']??'')==='traitoris'),['kind'=>'titan','source'=>'https://wahapedia.ru/wh40k11ed/factions/adeptus-titanicus/']);
        $faction['allies']=$grants;$factions[]=$faction;
    }
    return $factions;
}
function builderActiveAllyRules(array $faction,array $detachments): array {
    return array_values(array_filter($faction['allies']??[],static fn($r)=>(!$r['detachmentIds']||array_intersect($detachments,$r['detachmentIds']))&&!array_intersect($detachments,$r['excludedDetachmentIds'])));
}
function builderAllyIssues(array $catalog,array $army,array $prices): array {
    if (($catalog['featuresVersion']??0)<3) return [];
    $units=array_column($catalog['units'],null,'id');$faction=array_column($catalog['factions'],null,'id')[$army['factionId']];
    $rules=builderActiveAllyRules($faction,$army['detachmentIds']);$buckets=[];$issues=[];$size=$army['limit'];
    $has=static fn($u,$key)=>in_array(strtolower($key),array_map('strtolower',array_map('trim',explode(',',$u['keywords']))),true);
    foreach ($army['entries'] as $entry) {
        if (in_array($entry['unitId'],$faction['unitIds'],true)) continue;
        $matching=array_values(array_filter($rules,static fn($r)=>in_array($entry['unitId'],$r['unitIds'],true)));
        usort($matching,static fn($a,$b)=>(bool)$b['detachmentIds']<=>(bool)$a['detachmentIds']);
        $rule=$matching[0]??null;$unit=$units[$entry['unitId']];
        if (!$rule) {$issues[]=$unit['name'].': alleato non autorizzato dalla fazione e dai distaccamenti selezionati.';continue;}
        if ($entry['warlord']&&!$rule['warlord']) $issues[]=$unit['name'].': questo alleato non può essere Warlord.';
        if ($entry['enhancementIds']&&!$rule['enhancements']) $issues[]=$unit['name'].': questo contingente non ammette potenziamenti.';
        if ($rule['id']==='deathwatch_support'&&$has($unit,'Kill Team')) foreach ($army['entries'] as $member) if ($member['entryId']===$entry['entryId']||($member['attachedTo']??null)===$entry['entryId']) foreach ($member['enhancementIds'] as $eid) {
            $enhancement=array_column($units[$member['unitId']]['enhancements'],null,'id')[$eid];
            if (!in_array($enhancement['detachment_id']??'',$rule['detachmentIds'],true)) $issues[]=$unit['name'].': il Kill Team può usare solo potenziamenti Deathwatch Support.';
        }
        $buckets[$rule['id']]['rule']=$rule;$buckets[$rule['id']]['entries'][]=$entry;
    }
    foreach ($buckets as $bucket) {
        $rule=$bucket['rule'];$entries=$bucket['entries'];$total=array_sum(array_map(static fn($e)=>$prices[$e['entryId']]??0,$entries));
        $limit=$rule['points'][$size]??null;
        if ($rule['points']&&$limit===null) $issues[]=$rule['name'].': limite alleati non definito per questo formato personalizzato.';
        if ($limit!==null&&$total>$limit) $issues[]=$rule['name'].': '.$total.' / '.$limit.' punti alleati.';
        if ($rule['kind']==='titan'&&array_sum(array_column($entries,'models'))>1) $issues[]='Titanic Support: massimo un modello.';
        if ($rule['kind']==='knights') {
            $big=array_sum(array_column(array_filter($entries,static fn($e)=>$has($units[$e['unitId']],'Titanic')),'models'));
            $small=array_sum(array_column($entries,'models'))-$big;
            if (($big&&($big>1||$small))||$small>3) $issues[]=$rule['name'].': scegli un Titanic oppure fino a tre Armiger/War Dog.';
        }
        if ($rule['kind']==='agents') {
            $limits=match($size){1000=>[1,1,1],2000=>[2,2,1],3000=>[3,3,2],default=>null};$counts=[0,0,0];
            foreach ($entries as $entry) {
                $unit=$units[$entry['unitId']];
                if ($has($unit,'Requisitioned'))$counts[2]++;
                elseif ($has($unit,'Character'))$counts[1]++;
                elseif ($has($unit,'Retinue'))$counts[0]++;
                elseif (!$has($unit,'Dedicated Transport'))$issues[]=$unit['name'].': categoria Assigned Agents non risolta.';
            }
            foreach ($counts as $i=>$count) if ($limits&&$count>$limits[$i]) $issues[]='Assigned Agents: limite '.['Retinue','Character','Requisitioned'][$i].' superato.';
            if (!$limits) $issues[]='Assigned Agents: limiti non definiti per il formato personalizzato.';
        }
        if ($rule['kind']==='daemons') foreach (['Khorne','Tzeentch','Nurgle','Slaanesh'] as $god) {
            $battleline=0;$others=0;foreach ($entries as $entry) {$unit=$units[$entry['unitId']];if ($has($unit,$god)) {if ($has($unit,'Battleline'))$battleline++;else $others++;}}
            if ($others>$battleline) $issues[]='Daemonic Pact: serve un’unità Battleline '.$god.' per ogni altra unità '.$god.'.';
        }
    }
    foreach ($rules as $rule) if ($rule['id']==='shadow_legion') foreach ($army['entries'] as $entry) {
        $u=$units[$entry['unitId']];if ((stripos($u['name'],'Daemon Prince')!==false||$has($u,'Epic Hero'))&&!preg_match('/^Be[’\']lakor$/iu',$u['name'])) $issues[]='Shadow Legion: '.$u['name'].' non è ammesso.';
    }
    foreach ($rules as $rule) if ($rule['id']==='ynnari'&&!array_filter($army['entries'],static fn($e)=>$e['warlord']&&in_array($units[$e['unitId']]['name'],['Yvraine','The Yncarne'],true))) $issues[]='Devoted of Ynnead: Yvraine o The Yncarne deve essere il Warlord.';
    return array_values(array_unique($issues));
}
