<?php
declare(strict_types=1);
require_once __DIR__.'/builder-loadout-rules.php';
require_once __DIR__.'/builder-source-fixes.php';

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
    $unit=builderApplySourceFixes($unit);
    $sourceOptions=$unit['options'];$sourceRows=[];$expanded=[];$additionalLimits=[];$choiceFamilies=[];$choiceLinks=[];$familyWeapons=[];
    foreach($sourceOptions as $i=>$row){
        $text=trim($description($row));
        if(preg_match('/^You can select one of the following options:\s*• Up to one (.+?) can replace their (.+?) with (.+?)\.\s*• Up to two (.+?) each equipped with (.+?) can form a weapons team\. If they do, one model[’\']s (.+?) is replaced with (.+?), and one model[’\']s (.+?) is replaced with (.+?)\.\s*$/isu',$text,$m)){
            $family=['id'=>'family_'.$i,'max'=>2,'name'=>$text];$start=count($expanded);
            foreach([[$m[2],$m[3]],[$m[6],$m[7]],[$m[8],$m[9]]] as [$from,$to]){$choiceFamilies[count($expanded)]=$family;$expanded[]=['description'=>'1 '.$m[1].' can have their '.$from.' replaced with '.$to];$sourceRows[]=$i;}
            $choiceLinks[]=['a'=>'option_'.($start+1),'b'=>'option_'.($start+2)];$familyWeapons[$family['id']]=$m[3];
        }elseif(preg_match('/^Up to (\d+) (.+?) can each have their (.+?) replaced with (.+?), or can be equipped with (.+)$/is',$text,$m)){
            $family=['id'=>'family_'.$i,'max'=>(int)$m[1],'name'=>$text];
            $choiceFamilies[count($expanded)]=$family;$expanded[]=['description'=>'Up to '.$m[1].' '.$m[2].' can each have their '.$m[3].' replaced with '.$m[4]];$sourceRows[]=$i;
            $choiceFamilies[count($expanded)]=$family;$expanded[]=['description'=>'Up to '.$m[1].' '.$m[2].' can each be equipped with '.$m[5]];$sourceRows[]=$i;
        }elseif(preg_match('/^This model can be equipped with (.+?) or can replace (.+?) with (.+?)\.?$/is',$text,$m)&&rtrim($m[1],'.')===rtrim($m[3],'.')){
            $expanded[]=['description'=>'This model can be equipped with '.$m[1]];$sourceRows[]=$i;
            $expanded[]=['description'=>"This model's ".$m[2].' can be replaced with '.$m[3]];$sourceRows[]=$i;$additionalLimits[$i]=$m[1];
        }elseif(preg_match('/^(For every \d+ models in (?:this|the) unit|If this unit contains \d+(?: or (?:fewer|more))? models):\s*\n(.*)$/is',$text,$m)){
            foreach(preg_split('/\n*•\s*/',$m[2]) as $part){if(trim($part)==='')continue;$expanded[]=['description'=>$m[1].', '.trim($part)];$sourceRows[]=$i;}
        }else{$expanded[]=$row;$sourceRows[]=$i;}
    }
    $unit['options']=$expanded;
    $weapons=[];$byName=[];
    foreach ($unit['weapons'] as $weapon) {
        if (!empty($weapon['enhancement_id'])||empty($weapon['name'])) continue;
        $name=preg_split('/\s+[-–—]\s+/u',$weapon['name'])[0];$key=builderWeaponKey($name);
        if (!isset($weapons[$key])) $weapons[$key]=['id'=>'w_'.$weapon['line'],'name'=>$name,'lines'=>[],'cost'=>0];
        if(!in_array($weapon['line'],$weapons[$key]['lines'],true))$weapons[$key]['lines'][]=$weapon['line'];$byName[$key]=$weapons[$key]['id'];$byName[builderWeaponKey($weapon['name'])]=$weapons[$key]['id'];
    }
    $optionNames=builderWeaponKey($unit['loadout']."\n".implode("\n",array_map($description,$unit['options'])));
    foreach ($unit['abilities'] as $ability) if (($ability['type']??'')==='Wargear'||(($ability['type']??'')==='Datasheet'&&str_contains($optionNames,builderWeaponKey(preg_replace('/\s*\([^)]*\)\s*$/i','',$ability['name']))))) {
        $key=builderWeaponKey(preg_replace('/\s*\([^)]*\)\s*$/i','',$ability['name']));
        if (!isset($weapons[$key])) $weapons[$key]=['id'=>'gear_'.substr(md5($key),0,12),'name'=>$ability['name'],'lines'=>[],'cost'=>0,'ability'=>$ability['name']];
    }
    // Companions/tokens listed as equipment do not have a weapon profile of their own.
    $equipmentText=$unit['loadout']."\n".implode("\n",array_map($description,$unit['options']));
    if(preg_match_all('/\b(?:gun drones?|marker drones?|shield drones?|guardian drones?|missile drones?|Ratling Battlemutt|Drakolithe|Watcher in the Dark|Grav-chutes|Grapnel Launchers|Plasmacyte|Tidewall defence platform|Haywire Mine)\b/i',$equipmentText,$gearNames))foreach(array_unique($gearNames[0]) as $name){
        $key=builderWeaponKey($name);if(!isset($weapons[$key]))$weapons[$key]=['id'=>'gear_'.substr(md5($key),0,12),'name'=>$name,'lines'=>[],'cost'=>0];
    }
    foreach ($unit['costs'] as $cost) if (preg_match('/^per (.+)$/i',$cost['description']??'',$m) && isset($weapons[builderWeaponKey($m[1])])) $weapons[builderWeaponKey($m[1])]['cost']=(int)($cost['cost']??0);
    // Longest exact match first: "Knives and Fists" is one weapon, not two items.
    $aliases=builderLoadoutAliases($unit,$weapons);
    $parse=static function(string $text) use (&$parse,$weapons,$byName,$aliases): ?array {
        $text=trim($text," .\n•\t\r");
        preg_match('/^(?:(\d+)\s+)?(.+)$/s',$text,$m);
        $key=builderWeaponKey($m[2]??'');
        foreach($weapons as $candidateKey=>$weapon)if($key===$candidateKey||rtrim($key,'s')===rtrim($candidateKey,'s')||preg_replace('/ies$/','y',$key)===$candidateKey)return [$weapon['id']=>(int)(($m[1]??'')?:1)];
        if(isset($byName[$key]))return [$byName[$key]=>(int)(($m[1]??'')?:1)];
        if(isset($aliases[$key]))return array_map(static fn($n)=>$n*(int)(($m[1]??'')?:1),$aliases[$key]);
        if(str_ends_with($key,'fire')&&isset($weapons[substr($key,0,-4)]))return [$weapons[substr($key,0,-4)]['id']=>(int)(($m[1]??'')?:1)];
        $typos=['demilklaives'=>'demiklaives','twinlightingclaws'=>'twinlightningclaws','autochpattemcombibolter'=>'autochpatterncombibolter','tribade'=>'triblade','mastercrafter'=>'mastercrafted','artificier'=>'artificer','heliforged'=>'hellforged','chainswordandgunbutt'=>'chainswordandgunbut','simulacrumimperialis'=>'simulacrumimperials'];
        foreach($typos as $typo=>$correct)if(str_contains($key,$typo)){ $corrected=str_replace($typo,$correct,$key);if(isset($weapons[$corrected]))return [$weapons[$corrected]['id']=>(int)(($m[1]??'')?:1)];}
        if(preg_match('/^(\d+ )?(?:the |an? |additional )(.+)$/is',$text,$a))return $parse(($a[1]??'').$a[2]);
        if(preg_match_all('/;|,|\band\b/i',$text,$breaks,PREG_OFFSET_CAPTURE))foreach($breaks[0] as [$separator,$offset]){
            $a=$parse(substr($text,0,$offset));$b=$parse(substr($text,$offset+strlen($separator)));
            if($a&&$b)return builderLoadoutSum($a,$b);
        }
        return null;
    };
    $models=[];$variable=0;$compositions=[];$variants=[[]];$flexible=false;$compositionRules=[];$layouts=$unit['guidedLayouts']??[];
    if(isset($unit['composition'][0])&&preg_match('/^One of the following:/i',trim($description($unit['composition'][0]))))return [];
    foreach($unit['composition'] as $row){
        $text=trim($description($row));
        if(preg_match('/^\d+\s+MODELS?\s+MAXIMUM\.?$/i',$text))continue;
        if(preg_match('/^(?:OR|or:)$/i',$text)){$variants[]=[];continue;}
        $pieces=preg_split('/,\s*(?=\d)|\s+and\s+(?=\d)/',$text);
        foreach($pieces as $piece)$variants[count($variants)-1][]=$piece;
    }
    foreach($variants[0] as $composition) {
        $composition=preg_replace('/\s*[–—-]\s*EPIC HERO$/u','',trim($composition));
        $composition=preg_replace('/\s+models?\.?$/i','',$composition);
        $composition=rtrim($composition,'.*');
        if (!preg_match('/^(\d+)(?:-(\d+))?\s+([^\n]+)$/i',$composition,$m)) continue;
        $isVariable=!empty($m[2]);$variable+=(int)$isVariable;
        $models[]=['id'=>'m'.count($models),'name'=>$m[3],'fixed'=>$isVariable?0:(int)$m[1],'variable'=>$isVariable,'min'=>(int)$m[1],'max'=>$isVariable?(int)$m[2]:(int)$m[1]];
    }
    if(!$models)return [];
    if(count($variants)>1&&$variable===0){
        $variantLayouts=[];
        foreach($variants as $variant){$layout=[];foreach($variant as $line)if(preg_match('/^(\d+) (.+?)\.?$/',$line,$m))$layout[builderLoadoutName($m[2])]=(int)$m[1];
            if(count($layout)!==count($models))return [];$variantLayouts[array_sum($layout)]=$layout;
        }
        foreach($models as &$model){$model['variable']=true;$model['countsBySize']=[];foreach($variantLayouts as $size=>$layout){if(!isset($layout[builderLoadoutName($model['name'])]))return [];$model['countsBySize'][$size]=$layout[builderLoadoutName($model['name'])];}}unset($model);
    }elseif($variable>1){
        $minimum=array_sum(array_column($models,'min'));$maximum=array_sum(array_column($models,'max'));$ratio=$maximum/$minimum;
        foreach($models as $model)if(!$model['min']||$model['max']/$model['min']!=$ratio)$flexible=true;
        $sizes=array_unique(array_column($unit['points']??[],'models'));if(!$sizes)$sizes=[$minimum,$maximum];
        foreach($sizes as $size)if($size<$minimum||$size>$maximum)return [];
        foreach($models as &$model){$model['countsBySize']=[];foreach($sizes as $size){$n=$model['min']*$size/$minimum;if($n!=floor($n)||$n<$model['min']||$n>$model['max'])$flexible=true;$model['countsBySize'][$size]=(int)$n;}}unset($model);
        if($flexible)foreach($models as &$model)unset($model['countsBySize']);unset($model);
        if(preg_match_all('/This unit can only contain (\d+) (.+?) if it (?:also )?contains (\d+) ([^.\n]+)\.?/i',$unit['loadout'],$matches,PREG_SET_ORDER))foreach($matches as $match){
            $a=null;$b=null;foreach($models as $model){if(builderLoadoutName($model['name'])===builderLoadoutName($match[2]))$a=$model['id'];if(builderLoadoutName($model['name'])===builderLoadoutName($match[4]))$b=$model['id'];}
            if($a!==null&&$b!==null)$compositionRules[]=['model'=>$a,'count'=>(int)$match[1],'requires'=>$b,'minimum'=>(int)$match[3]];
        }
    }
    if($layouts)$flexible=true;
    $groups=[];$defaultIssues=[];
    $loadoutText=preg_replace_callback('/^(One|Two|Three|Four) /mi',static fn($m)=>['one'=>1,'two'=>2,'three'=>3,'four'=>4][strtolower($m[1])].' ',$unit['loadout']);
    if (preg_match_all('/(?:^|\n)((?:(?:Every|Each|This|The|A|An) )?[^:.\n]{1,240}?) (?:is(?: additionally)?|are(?: both)?) equipped with:\s*(.+?)(?=\n\s*\n|$)/is',$loadoutText,$defaults,PREG_SET_ORDER)) {
        $expandedModels=[];
        foreach($models as $model){
            $numbered=[];
            foreach($defaults as $i=>$default)if(preg_match('/^(\d+) (?:other )?(.+)$/i',trim($default[1]),$m)&&builderLoadoutName($m[2])===builderLoadoutName($model['name']))$numbered[]=['index'=>$i,'count'=>(int)$m[1],'name'=>$m[2],'gear'=>$default[2]];
            if(!$model['variable']&&$numbered&&array_sum(array_column($numbered,'count'))<$model['fixed'])foreach($defaults as $i=>$default)if(preg_match('/^(?:Every|Each) other (.+)$/i',trim($default[1]),$m)&&(in_array(strtolower($m[1]),['model','models'],true)||builderLoadoutName($m[1])===builderLoadoutName($model['name'])))$numbered[]=['index'=>$i,'count'=>$model['fixed']-array_sum(array_column($numbered,'count')),'name'=>$model['name'],'gear'=>$default[2]];
            if(!$model['variable']&&count($numbered)>=1&&array_sum(array_column($numbered,'count'))===$model['fixed']){
                foreach($numbered as $part){$copy=$model;$copy['id']=$model['id'].'_role'.$part['index'];$copy['baseName']=$model['name'];$copy['defaultIndex']=$part['index'];$copy['fixed']=$copy['min']=$copy['max']=$part['count'];$copy['name']=$part['name'].' · '.trim(explode(';',$part['gear'])[0]);$expandedModels[]=$copy;}
            }else $expandedModels[]=$model;
        }
        $models=$expandedModels;
        foreach ($models as $model) foreach ($defaults as $defaultIndex=>$default) {
            if(isset($model['defaultIndex'])&&$model['defaultIndex']!==$defaultIndex)continue;
            if(!isset($model['defaultIndex'])&&preg_match('/^(?:Every|Each) other models?$/i',trim($default[1]))&&array_filter($defaults,static fn($d)=>preg_match('/^(?:The|This) (.+)$/i',trim($d[1]),$m)&&builderLoadoutName($m[1])===builderLoadoutName($model['name'])))continue;
            if(preg_match('/^\d+ /',trim($default[1]))&&($model['defaultIndex']??null)!==$defaultIndex)continue;
            $target=preg_replace('/^(Every|Each|This|The|A|An) /i','',$default[1]);
            $target=preg_replace('/^\d+ (?:other )?/i','',$target);
            $target=preg_replace('/^other /i','',$target);
            $target=preg_replace('/\s+models?$/i','',$target);
            $targets=array_map('builderLoadoutName',explode(' and ',$target));
            $modelName=$model['baseName']??$model['name'];
            $inherits=builderLoadoutName($modelName)==='aberranthypermorph'&&builderLoadoutName($target)==='aberrant';
            if (!$inherits&&!in_array(strtolower($target),['model','models','unit'],true)&&builderLoadoutName($target)!==builderLoadoutName($modelName)&&!in_array(builderLoadoutName($modelName),$targets,true)) continue;
            foreach (preg_split('/;|,/',$default[2]) as $item) {
            $bundle=strcasecmp(trim($item," ."),'nothing')===0?[]:$parse($item);if ($bundle===null){$defaultIssues[]=$model['name'].' · '.trim($item);continue;}
            $id=$model['id'].'_'.count($groups);
            $groups[]=['id'=>$id,'model'=>$model['id'],'name'=>$model['name'].' · '.trim(preg_replace('/^\d+\s+/','',$item)),'per'=>0,'default'=>'base','choices'=>[['id'=>'base','name'=>trim(preg_replace('/^\d+\s+/','',$item)),'weapons'=>$bundle]]];
            }
        }
    }
    if(!$groups&&trim($unit['loadout'])===''&&!array_filter($unit['weapons'],static fn($w)=>!empty($w['name'])))foreach($models as $model)$groups[]=['id'=>$model['id'].'_none','model'=>$model['id'],'name'=>$model['name'],'per'=>0,'default'=>'base','choices'=>[['id'=>'base','name'=>'Nessun equipaggiamento','weapons'=>[]]]];
    if (!$groups) return [];
    $covered=[];$optionTotal=0;$rules=[];$notes=[];$noteUsed=[];$modelLimits=[];$uniqueLimits=[];$optionalMax=[];
    foreach($unit['options'] as $i=>$row){
        $text=trim($description($row));if(!str_starts_with($text,'*')&&preg_match('/^\*+$/',$row['button']??''))$text=$row['button'].' '.$text;
        if(!preg_match('/^(\*+)\s*(.+)$/s',$text,$m))continue;
        $body=str_replace('’',"'",$m[2]);$note=['index'=>$i,'mark'=>$m[1]];
        if(preg_match('/^You cannot select the same (?:weapon|option).*?more than (once|twice)\s+per unit/i',$body,$n)){
            $note['duplicateLimit']=$n[1]==='once'?1:2;
            if(preg_match('/(?:contains|contains? only|contains? exactly) (\d+) models.*?more than twice\s+per unit/i',$body,$n))$note['maxAt']=['models'=>(int)$n[1],'max'=>2];
        }elseif(preg_match('/^(?:That|This) model\'s (.+?) cannot be replaced\.?$/i',$body,$n))$note['locks']=$n[1];
        elseif(preg_match('/^This weapon cannot be replaced\.?$/i',$body))$note['selfLock']=true;
        elseif(preg_match('/^That (.+?) cannot then be replaced\.?$/i',$body,$n))$note['locks']=$n[1];
        elseif(preg_match('/^(?:(?:This|Each) model cannot have duplicates of these pieces of wargear|Maximum 1 per model)\.?$/i',$body))$note['uniquePerModel']=true;
        elseif(preg_match('/^(?:A model can only take one of these options|You cannot select both of these options for the same model|The (?:some|same) model cannot be equipped with more than one of these wargear options|These options cannot be taken on the same model)\.?$/i',$body))$note['exclusive']=true;
        elseif(preg_match('/^Designer\'s Note:.*?single model for all rules purposes\.?$/is',$body))$note['informational']=true;
        elseif(preg_match('/^To a maximum of 1 per (\d+) models in this unit\.?$/i',$body,$n)){$note['duplicateLimit']=1;$note['duplicatePer']=(int)$n[1];}
        elseif(preg_match('/^A model can only take one of these options, and cannot be equipped with (.+?) or (.+?)\.?$/i',$body,$n)){$note['exclusive']=true;$note['forbidden']=$n[1].' or '.$n[2];}
        elseif(preg_match('/^A model cannot be equipped with more than (?:one|1) (.+?) or more than (?:one|1) (.+?)\.?$/i',$body,$n)){
            $a=$parse($n[1]);$b=$parse($n[2]);if(!$a||!$b)continue;$note['modelLimits']=[['weights'=>array_fill_keys(array_keys($a),1),'max'=>1],['weights'=>array_fill_keys(array_keys($b),1),'max'=>1]];
        }elseif(preg_match('/^This model cannot be equipped with both (?:a |an )?(.+?) and (?:a |an )?(.+?)\. This model cannot be equipped with more than 1 (.+?), and it cannot be equipped with more than 1 (.+?)\.?$/i',$body,$n)){
            $a=$parse($n[1]);$b=$parse($n[2]);$c=$parse($n[3]);$d=$parse($n[4]);if(!$a||!$b||$a!==$d||$b!==$c)continue;$note['modelLimit']=['weights'=>array_fill_keys(array_keys(array_replace($a,$b)),1),'max'=>1];
        }
        elseif(preg_match('/^Each model cannot be equipped with more than (\d+) ranged weapons\.?$/i',$body,$n)){
            $weights=[];foreach($weapons as $weapon)foreach($weapon['lines'] as $line)foreach($unit['weapons'] as $profile)if($profile['line']===$line&&strtolower($profile['type']??'')==='ranged')$weights[$weapon['id']]=1;
            $note['modelLimit']=['weights'=>$weights,'max'=>(int)$n[1]];
        }elseif(preg_match('/^No model can be equipped with both (?:a |an )?(.+?) and (.+?) at the same time\.?$/i',$body,$n)){
            $a=$parse($n[1]);$b=$parse($n[2]);if(!$a||!$b)continue;$note['modelLimit']=['weights'=>array_fill_keys(array_keys(array_replace($a,$b)),1),'max'=>1];
        }
        else continue;
        $notes[]=$note;
    }
    for($pass=0;$pass<2;$pass++)foreach ($unit['options'] as $optionIndex=>$row) {
        if(isset($covered[$optionIndex]))continue;
        $text=trim($description($row));$alternatives=[];
        // The source's no-options placeholder is not an equipment rule.
        if (preg_match('/^None\.?$/i',$text)) continue;
        $optionTotal++;
        $perItem='';
        if(preg_match('/^For each (.+?) this model is equipped with, it can be equipped with (.+)$/is',$text,$m)){
            $perItem=$m[1];$rule=builderLoadoutRule('This model can be equipped with '.$m[2]);
        }else $rule=builderLoadoutRule($text);
        if(!$rule)continue;
        if($perItem!==''){
            $need=$parse($perItem);if(!$need)continue;$wid=array_key_first($need);$maximum=0;
            foreach($models as $model){$n=0;foreach($groups as $g)if($g['model']===$model['id'])$n+=max(array_map(static fn($c)=>$c['weapons'][$wid]??0,$g['choices']));$maximum=max($maximum,$n);}
            if(!$maximum||$maximum>4)continue;$rule['slots']=$maximum;$rule['duplicates']=true;$rule['requires']=$perItem;
        }
        if(isset($rule['perTarget'])){foreach($models as $model)if(builderLoadoutName($model['name'])===builderLoadoutName($rule['perTarget']))$rule['perModel']=$model['id'];if(!isset($rule['perModel']))continue;}
        $tail=$rule['tail'];$duplicateLimit=null;$duplicatePer=0;$maxAt=null;$rowNotes=[];
        $tail=preg_replace('/\.\s*((?:That|This) model[’\']s .+? cannot be replaced)\.?$/iu',' ($1)',$tail);
        $common=[];
        if(preg_match('/^(.+?) and (one|\d+) of the following(.*)$/is',$tail,$m)){$common=$parse($m[1]);if(!$common)continue;$n=$m[2]==='one'?1:(int)$m[2];if($n>1){$rule['slots']=$rule['minimumSlots']=$n;$rule['duplicates']=true;}$tail='1 of the following'.$m[3];}
        preg_match_all('/\*+/',$text,$markers);$markers=array_unique($markers[0]);
        foreach($notes as $note)if(in_array($note['mark'],$markers,true)){
            $rowNotes[]=$note;
            if(isset($note['duplicateLimit'])){$duplicateLimit=$note['duplicateLimit'];$maxAt=$note['maxAt']??null;$duplicatePer=$note['duplicatePer']??0;}
            if(isset($note['forbidden']))$rule['forbidden']=trim($rule['forbidden'].($rule['forbidden']!==''?' or ':'').$note['forbidden']);
        }
        $rule['exclusive']=array_map(static fn($n)=>'note_'.$n['index'],array_values(array_filter($rowNotes,static fn($n)=>!empty($n['exclusive']))));
        if(isset($choiceFamilies[$optionIndex]))$rule['exclusive'][]=$choiceFamilies[$optionIndex]['id'];
        if($rule['add'])foreach($unit['options'] as $other){$otherRule=builderLoadoutRule($description($other));if($otherRule&&!empty($otherRule['other'])&&builderLoadoutName($otherRule['target'])===builderLoadoutName($rule['target'])){$rule['exclusive'][]='other_'.builderLoadoutName($rule['target']);break;}}
        if(str_contains($tail,'(duplicates are not allowed)')){$duplicateLimit=1;$tail=str_replace('(duplicates are not allowed)','',$tail);}
        if(str_contains($tail,'(you cannot select the same option more than once)')){$duplicateLimit=1;$tail=str_replace('(you cannot select the same option more than once)','',$tail);}
        // Keep other conditions in the audit instead of claiming unsupported restrictions.
        $inline=preg_match('/^(?:one|1) of the following[^\n]*[:;]/i',$tail)&&!str_contains($tail,'•');
        $tail=preg_replace('/^(?:one|1) of the following(?: options)?\**[:;]?\s*/i','',$tail);
        $tail=preg_replace('/^:\s*/','',$tail);
        $complete=true;
        foreach(preg_split($inline?'/,\s*/':'/\n+|•/',$tail) as $option){
            $option=trim($option);if($option==='')continue;
            $locks=[];$itemUnique=false;
            if(preg_match('/\(a model cannot be equipped with more than (?:one|1) (.+?)\)/i',$option,$m)){
                $limit=$parse($m[1]);if(!$limit){$complete=false;continue;}$modelLimits[]=['weights'=>array_fill_keys(array_keys($limit),1),'max'=>1,'source'=>$optionIndex];$option=str_replace($m[0],'',$option);
            }
            if(str_contains($option,'(it cannot take duplicates of this piece of wargear)')){$itemUnique=true;$option=str_replace('(it cannot take duplicates of this piece of wargear)','',$option);}
            $optionMarkers=[];preg_match_all('/\*+/',$option,$optionMarkers);
            foreach($rowNotes as $note)if(in_array($note['mark'],$optionMarkers[0],true)||str_contains(explode("\n",$rule['tail'])[0],$note['mark'])){
                if(isset($note['locks'])){$lock=$parse($note['locks']);if($lock)$locks=array_replace($locks,$lock);else $complete=false;}
            }
            // Strip only markers with a parsed note; unknown footnotes stay incomplete.
            foreach($rowNotes as $note)$option=preg_replace('/(?<!\*)'.preg_quote($note['mark'],'/').'(?!\*)/','',$option);
            if(trim($option)==='')continue;
            if(preg_match('/[\[(](?:(?:that|this) model[’\']s|these models[’\']) (.+?) cannot be replaced[\])]/iu',$option,$m)){
                $locks=$parse($m[1]);if(!$locks){$complete=false;continue;}$option=str_replace($m[0],'',$option);
            }
            $bundle=$parse($option);if(!$bundle){$complete=false;continue;}
            if($rule['slots']===1)$bundle=builderLoadoutSum($bundle,$common);
            foreach($rowNotes as $note)if(!empty($note['selfLock'])&&in_array($note['mark'],$optionMarkers[0],true))$locks=array_replace($locks,$bundle);
            $unique=$itemUnique;foreach($rowNotes as $note)if(!empty($note['uniquePerModel'])&&in_array($note['mark'],$optionMarkers[0],true))$unique=true;
            if($unique)foreach($bundle as $id=>$n)$uniqueLimits[$id]=['weights'=>[$id=>1],'max'=>1,'source'=>$optionIndex];
            $alternatives[]=['id'=>'choice'.count($alternatives),'name'=>trim($option," .\n"),'weapons'=>$bundle,'locks'=>$locks,'uniquePerModel'=>$unique];
        }
        if(!$alternatives)continue;
        if($rule['slots']>1){
            $items=$alternatives;$alternatives=[];$seen=[];
            if(count($items)===1&&count($items[0]['weapons'])===1&&preg_match('/\bup to\b/i',$text)&&!str_contains(strtolower($text),'additional')){$wid=array_key_first($items[0]['weapons']);if($items[0]['weapons'][$wid]===1)$optionalMax[$wid]=max($optionalMax[$wid]??0,$rule['slots']);}
            $expand=function(array $bundle,array $names,int $start,int $left,array $used,array $locks)use(&$expand,&$alternatives,&$seen,$items,$rule){
                if($bundle&&count($names)>=($rule['minimumSlots']??1)){$key=json_encode($bundle);if(!isset($seen[$key])){$seen[$key]=true;$alternatives[]=['id'=>'choice'.count($alternatives),'name'=>implode(' + ',$names),'weapons'=>$bundle,'locks'=>$locks];}}
                if(!$left||count($alternatives)>256)return;
                for($i=$start;$i<count($items);$i++){
                    if(!empty($items[$i]['uniquePerModel'])&&in_array($i,$used,true))continue;
                    $expand(builderLoadoutSum($bundle,$items[$i]['weapons']),array_merge($names,[$items[$i]['name']]),!empty($rule['duplicates'])?$i:$i+1,$left-1,array_merge($used,[$i]),array_replace($locks,$items[$i]['locks']??[]));
                }
            };
            $expand([],[],0,$rule['slots'],[],[]);if(count($alternatives)>256)continue;
            if($common)foreach($alternatives as &$alternative){$alternative['weapons']=builderLoadoutSum($alternative['weapons'],$common);$alternative['name']=implode('; ',array_map(static fn($id,$n)=>$n.'× '.(array_column($weapons,'name','id')[$id]??$id),array_keys($alternative['weapons']),array_values($alternative['weapons'])));}unset($alternative);
        }
        $rule['requiresBundle']=$rule['requires']!==''?$parse($rule['requires']):[];if($rule['requiresBundle']===null)continue;
        if($perItem!=='')foreach($alternatives as &$alternative){$number=0;foreach($alternative['weapons'] as $count)$number+=$count;$alternative['locks']=array_map(static fn($n)=>$n*$number,$rule['requiresBundle']);}unset($alternative);
        $rule['forbiddenBundle']=[];$forbiddenKnown=true;
        foreach($rule['forbidden']!==''?preg_split('/\s+or\s+/i',preg_replace('/^either /i','',$rule['forbidden'])):[] as $part){$bundle=$parse($part);if(!$bundle){$forbiddenKnown=false;break;}$rule['forbiddenBundle']=array_replace($rule['forbiddenBundle'],$bundle);}
        if(!$forbiddenKnown)continue;
        $originals=$rule['add']?[[]]:array_map($parse,preg_split('/\s+or\s+(?:its |their )?/i',$rule['from']));
        if(strcasecmp(trim($rule['from']),'ranged weapon')===0){$originals=[];foreach($weapons as $weapon)foreach($unit['weapons'] as $profile)if(in_array($profile['line'],$weapon['lines'],true)&&strtolower($profile['type']??'')==='ranged'){$originals[]=[$weapon['id']=>1];break;}}
        if(in_array(null,$originals,true))continue;
        $tag='option_'.$optionIndex;
        if(isset($choiceFamilies[$optionIndex]))foreach($alternatives as &$alternative)$alternative['rules']=[$choiceFamilies[$optionIndex]['id']];unset($alternative);
        if($duplicateLimit!==null)foreach($alternatives as $i=>&$alternative)$alternative['rules']=[$tag.'_alternative_'.$i];unset($alternative);
        $applied=false;foreach($originals as $original)$applied=builderLoadoutApply($groups,$models,$rule,$original,$alternatives,$tag,array_column($weapons,'name','id'))||$applied;
        // Both sides of an unrestricted replacement describe legal loadouts. Some source
        // cards give the replacement as standard; retain that default and expose the other side.
        if(!$applied&&!$rule['add']&&$rule['max']===null&&!$rule['per']&&!$rule['requiresBundle']&&!$rule['forbiddenBundle'])foreach($originals as $original)foreach($alternatives as $alternative){
            $inverse=['id'=>'choice0','name'=>implode('; ',array_map(static fn($id,$n)=>$n.'× '.(array_column($weapons,'name','id')[$id]??$id),array_keys($original),array_values($original))),'weapons'=>$original];
            $applied=builderLoadoutApply($groups,$models,$rule,$alternative['weapons'],[$inverse],$tag,array_column($weapons,'name','id'))||$applied;
        }
        if($applied){
            $compiledRule=['id'=>$tag,'name'=>'Opzione di equipaggiamento '.($sourceRows[$optionIndex]+1),'per'=>$rule['per'],'max'=>$rule['max'],'all'=>$rule['all'],'minimum'=>$rule['minimum'],'maximum'=>$rule['maximum']];if(isset($rule['perModel']))$compiledRule['perModel']=$rule['perModel'];$rules[]=$compiledRule;
            if($duplicateLimit!==null)foreach($alternatives as $i=>$alternative)$rules[]=['id'=>$tag.'_alternative_'.$i,'name'=>$alternative['name'],'max'=>$duplicateLimit,'maxAt'=>$maxAt,'per'=>$duplicatePer];
            if($complete){$covered[$optionIndex]=true;foreach($rowNotes as $note)$noteUsed[$note['index']]=true;}
        }
    }
    foreach($notes as $note)if(isset($note['modelLimit'])&&isset($noteUsed[$note['index']]))$modelLimits[]=array_merge($note['modelLimit'],['source'=>$note['index']]);
    foreach(array_column($choiceFamilies,null,'id') as $family){$family['name']='Opzioni alternative';$rules[]=$family;}
    foreach($familyWeapons as $family=>$equipment){$bundle=$parse($equipment);if(!$bundle)continue;foreach($bundle as $id=>$n){$rules[]=['id'=>$family.'_weapon_'.$id,'weapon'=>$id,'name'=>$equipment,'max'=>1];foreach($groups as &$group)foreach($group['choices'] as &$choice)if(!empty($choice['weapons'][$id]))$choice['rules']=array_values(array_unique(array_merge($choice['rules']??[],[$family])));unset($choice,$group);}}
    foreach($notes as $note)if(isset($note['modelLimits'])&&isset($noteUsed[$note['index']]))foreach($note['modelLimits'] as $limit)$modelLimits[]=array_merge($limit,['source'=>$note['index']]);
    foreach($additionalLimits as $source=>$equipment){$need=$parse($equipment);if($need)$modelLimits[]=['weights'=>array_fill_keys(array_keys($need),1),'max'=>1,'source'=>array_search($source,$sourceRows,true)];}
    foreach($optionalMax as $wid=>$maximum)$modelLimits[]=['weights'=>[$wid=>1],'max'=>$maximum,'source'=>-1];
    $activeTags=array_column(array_filter($rules,static fn($r)=>isset($r['max'])||!empty($r['per'])||!empty($r['all'])||!empty($r['minimum'])||isset($r['maximum'])),'id');
    foreach(array_merge(array_values($uniqueLimits),$modelLimits) as $limit)if(!builderLoadoutConstrain($groups,$models,$limit['weights'],$limit['max'],array_column($weapons,'name','id'),$activeTags))unset($covered[$limit['source']],$noteUsed[$limit['source']]);
    foreach($noteUsed as $i=>$_)$covered[$i]=true;
    $uncovered=[];foreach($unit['options'] as $i=>$row)if(!isset($covered[$i])&&!preg_match('/^None\.?$/i',trim($description($row))))$uncovered[]=$sourceRows[$i];
    $uncovered=array_values(array_unique($uncovered));$optionTotal=count(array_filter($sourceOptions,static fn($row)=>!preg_match('/^None\.?$/i',trim($description($row)))));
    foreach($models as $model)if(!array_filter($groups,static fn($g)=>$g['model']===$model['id']))$defaultIssues[]=$model['name'].' · dotazione iniziale non riconosciuta';
    $rules=array_values(array_filter($rules,static fn($r)=>in_array($r['id'],$activeTags,true)));
    $keptTags=array_unique(array_merge($activeTags,array_column($choiceLinks,'a'),array_column($choiceLinks,'b')));
    foreach($groups as &$group)foreach($group['choices'] as &$choice)if(isset($choice['rules']))$choice['rules']=array_values(array_intersect($choice['rules'],$keptTags));unset($choice,$group);
    if(!$flexible)foreach($models as &$model)unset($model['min'],$model['max']);unset($model);
    return array_filter(['version'=>2,'models'=>$models,'weapons'=>array_values($weapons),'groups'=>$groups,'rules'=>$rules,'links'=>$choiceLinks,'layouts'=>$layouts,'flexibleModels'=>$flexible,'compositionRules'=>$compositionRules,'defaultIssues'=>array_values(array_unique($defaultIssues)),'uncoveredOptions'=>$uncovered,'optionsCovered'=>$optionTotal-count($uncovered),'optionsTotal'=>$optionTotal],static fn($v,$k)=>in_array($k,['models','weapons','groups'],true)||($v!==[]&&$v!==false),ARRAY_FILTER_USE_BOTH);
}
function builderLoadoutCapacity(array $recipe,array $group,int $models,array $modelCounts=[]): int {
    if(!empty($group['unitGear'])){$population=isset($group['perModel'])?builderLoadoutCapacity($recipe,['model'=>$group['perModel'],'per'=>0],$models,$modelCounts):$models;return !empty($group['per'])?(int)floor($population/$group['per']):1;}
    $fixed=array_sum(array_column(array_filter($recipe['models'],static fn($m)=>!$m['variable']),'fixed'));
    $model=array_column($recipe['models'],null,'id')[$group['model']];
    if(isset($model['countsBySize'])&&!isset($model['countsBySize'][$models]))builderInvalid('Taglia non prevista dalla composizione.');
    if(!empty($recipe['flexibleModels'])&&!$modelCounts)$modelCounts=builderLoadoutModelCounts($recipe,$models);
    $available=$modelCounts[$model['id']]??$model['countsBySize'][$models]??($model['variable']?max(0,$models-$fixed):$model['fixed']);
    return $group['per']?min($available,(int)floor($models/$group['per'])):$available;
}
function builderLoadoutCounts(array $recipe,array $selections,int $models): array {
    $fixed=array_sum(array_column(array_filter($recipe['models'],static fn($m)=>!$m['variable']),'fixed'));
    if ($fixed>$models) builderInvalid('Taglia inferiore ai modelli obbligatori della dotazione.');
    if(isset($selections['_models'])&&!is_array($selections['_models']))builderInvalid('Composizione dei modelli non valida.');
    $modelCounts=builderLoadoutModelCounts($recipe,$models,$selections['_models']??null);
    $counts=[];$cost=0;$known=array_column($recipe['weapons'],null,'id');$clean=$modelCounts?['_models'=>$modelCounts]:[];$shared=[];
    $groups=array_column($recipe['groups'],null,'id');
    foreach ($selections as $id=>$value) if (!isset($groups[$id])&&($id!=='_models'||empty($recipe['flexibleModels']))) builderInvalid('Gruppo dotazione sconosciuto.');
    foreach ($recipe['groups'] as $group) {
        $selected=$selections[$group['id']]??[$group['default']=>builderLoadoutCapacity($recipe,$group,$models,$modelCounts)];
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
        if ($sum!==builderLoadoutCapacity($recipe,$group,$models,$modelCounts)) builderInvalid('Quantità incompatibili con la taglia nel gruppo '.$group['name']);
        if (!empty($group['choicePer']) && $sum-($selected[$group['default']]??0)>(int)floor($models/$group['choicePer'])) builderInvalid('Limite delle sostituzioni superato.');
        if (!empty($group['sharedPer'])) {
            $key=$group['sharedKey'];$shared[$key]=($shared[$key]??0)+$sum-($selected[$group['default']]??0);
            if ($shared[$key]>(int)floor($models/$group['sharedPer'])) builderInvalid('Limite delle sostituzioni condivise superato.');
        }
        $clean[$group['id']]=$selected;
    }
    foreach(builderLoadoutRuleErrors($recipe,$clean,$models) as $error)builderInvalid($error);
    foreach ($counts as $quantity) builderInt($quantity,'quantità arma derivata',0,1000);
    return ['selections'=>$clean,'weaponCounts'=>$counts,'cost'=>$cost];
}
function builderGearLimit(array $unit,string $line,int $models,array $modelCounts=[]): int {
    $recipe=$unit['loadoutRecipe']??[];$weapon=null;
    foreach ($recipe['weapons']??[] as $candidate) if (in_array($line,$candidate['lines'],true)) {$weapon=$candidate;break;}
    if (!$weapon) return $models;
    $max=0;$seen=[];$found=false;
    foreach ($recipe['groups'] as $group) {
        $amount=0;$alternative=false;
        foreach ($group['choices'] as $choice) if (isset($choice['weapons'][$weapon['id']])) {$amount=max($amount,$choice['weapons'][$weapon['id']]);$alternative=$alternative||$choice['id']!==$group['default'];}
        if (!$amount) continue;$found=true;
        $base=array_column($group['choices'],'weapons','id')[$group['default']][$weapon['id']]??0;
        if (!empty($group['sharedPer'])&&$alternative&&!$base) {if (isset($seen[$group['sharedKey']]))continue;$seen[$group['sharedKey']]=true;$max+=(int)floor($models/$group['sharedPer'])*$amount;}
        else $max+=builderLoadoutCapacity($recipe,$group,$models,$modelCounts)*$amount;
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
        } elseif (preg_match('/^(?:The bearer|This model) has a Move characteristic of (\d+)["”](?:\.| and\b)/iu',$body,$m)) {
            $scope='bearer';$effects[]=['field'=>'M','operation'=>'set','value'=>(int)$m[1]];
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
    $byId=array_column($units,null,'id');
    $select=static fn(callable $test)=>array_column(array_values(array_filter($units,$test)),'id');
    $factions=[];$imperium=['aoi','am','tl','gk','adm','qi','sm','ac','as'];$chaos=['csm','dg','ec','ts','we','qt','cd'];
    foreach ($catalog['factions'] as $faction) {
        $fid=$faction['id'];$grants=[];$marine=$fid==='sm'||str_starts_with($fid,'sm_');$imperial=$marine||in_array($fid,$imperium,true);
        // The export repeats allies under the host faction. CSV faction_id and
        // the host keyword on these copies do not authorize native recruitment.
        $borrowed=static function($u) use ($fid,$marine,$has): bool {
            return match($fid) {
                'gc'=>$has($u,'Astra Militarum')||$has($u,'Tyranids'),
                'dru'=>$has($u,'Harlequins')||$has($u,'Anhrathe'),
                'qi'=>$has($u,'Adeptus Mechanicus'),
                'qt'=>$has($u,'Heretic Astartes')||$has($u,'Damned'),
                'cd'=>$has($u,'Heretic Astartes'),
                'csm'=>in_array(strtolower($u['name']),['khorne berzerkers','rubric marines','plague marines','noise marines'],true),
                default=>$marine&&$fid!=='sm_deathwatch'&&$has($u,'Deathwatch')
            };
        };
        $faction['unitIds']=array_values(array_filter($faction['unitIds'],static fn($id)=>!$borrowed($byId[$id])));
        $belongs=static function($u,$from) use($fid,$has): bool {
            if(($u['factionId']??'')===$from)return true;
            if(($u['factionId']??'')!==$fid)return false;
            $keys=['am'=>['Astra Militarum'],'tyr'=>['Tyranids'],'adm'=>['Adeptus Mechanicus'],'csm'=>['Heretic Astartes','Damned'],'ae'=>['Harlequins','Anhrathe']][$from]??[];
            foreach($keys as $key)if($has($u,$key))return true;
            return false;
        };
        $conditionalKeyword=['ts'=>'Scintillating Legions','dg'=>'Plague Legions','ec'=>'Legions of Excess','we'=>'Blood Legions'][$fid]??null;
        if ($conditionalKeyword) $faction['unitIds']=array_values(array_filter($faction['unitIds'],static fn($id)=>!$has(array_column($units,null,'id')[$id],$conditionalKeyword)));
        if ($fid==='ae') $faction['unitIds']=array_values(array_filter($faction['unitIds'],static fn($id)=>!$has(array_column($units,null,'id')[$id],'Ynnari')||$has(array_column($units,null,'id')[$id],'Asuryani')||$has(array_column($units,null,'id')[$id],'Harlequins')));
        $add=static function(string $id,string $name,array $ids,array $extra=[]) use (&$grants) {if ($ids) $grants[]=$extra+['id'=>$id,'name'=>$name,'unitIds'=>$ids,'detachmentIds'=>[],'excludedDetachmentIds'=>[],'points'=>[],'warlord'=>false,'enhancements'=>false,'kind'=>'points'];};
        $dids=static fn(string $name)=>array_column(array_filter($faction['detachments'],static fn($d)=>strcasecmp(str_replace('’',"'",$d['name']),str_replace('’',"'",$name))===0),'id');
        if ($imperial&&$fid!=='aoi') $add('assigned_agents','Assigned Agents',$select(static fn($u)=>($u['factionId']??'')==='aoi'),['kind'=>'agents','source'=>'https://wahapedia.ru/wh40k11ed/factions/imperial-agents/#Assigned-Agents']);
        if ($imperial&&$fid!=='qi') $add('freeblades','Freeblades',$select(static fn($u)=>($u['factionId']??'')==='qi'&&!$has($u,'Adeptus Mechanicus')),['kind'=>'knights','source'=>'https://wahapedia.ru/wh40k11ed/factions/imperial-knights/#Freeblades']);
        if ($imperial&&$fid!=='tl') $add('titanic_support','Titanic Support',$select(static fn($u)=>($u['factionId']??'')==='tl'),['kind'=>'titan','source'=>'https://wahapedia.ru/wh40k11ed/factions/adeptus-titanicus/']);
        if (in_array($fid,$chaos,true)&&$fid!=='qt') $add('dreadblades','Dreadblades',$select(static fn($u)=>($u['factionId']??'')==='qt'&&!$has($u,'Damned')&&!$has($u,'Heretic Astartes')),['kind'=>'knights','source'=>'https://wahapedia.ru/wh40k11ed/factions/chaos-knights/#Dreadblades']);
        if (in_array($fid,['csm','dg','ec','ts','we','qt'],true)) $add('daemonic_pact','Daemonic Pact',$select(static fn($u)=>($u['factionId']??'')==='cd'&&!$has($u,'Heretic Astartes')),['kind'=>'daemons','points'=>[1000=>250,2000=>500,3000=>750],'source'=>'https://wahapedia.ru/wh40k11ed/factions/chaos-daemons/#Daemonic-Pact']);
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
            $ids=$select(static function($u) use ($from,$keyword,$exclude,$has,$id,$belongs) {
                if (!$belongs($u,$from) || ($keyword&&!$has($u,$keyword))) return false;
                foreach ($exclude as $key) if ($has($u,$key)||strcasecmp($u['name'],$key)===0) return false;
                if ($id==='forgepact') return in_array(strtolower($u['name']),['tech-priest dominus','tech-priest manipulus','skitarii marshal','skitarii rangers','skitarii vanguard'],true);
                if ($id==='shadow_legion') return $has($u,'Damned')||in_array(strtolower($u['name']),['chaos lord','chaos lord in terminator armour','chaos lord with jump pack','chaos terminator squad','chosen','dark apostle','havocs','legionaries','master of possession','possessed','raptors','sorcerer','sorcerer in terminator armour','warp talons'],true);
                return true;
            });
            $add($id,$detachment,$ids,['detachmentIds'=>$dids($detachment),'points'=>in_array($id,['thralls','forgepact'],true)?[1000=>500,2000=>500,3000=>500]:[1000=>500,2000=>1000,3000=>1500],'enhancements'=>true,'source'=>'https://wahapedia.ru/wh40k11ed/factions/'.str_replace([' ','’',"'"],['-','',''],strtolower($faction['name'])).'/']);
        }
        if ($fid==='dru') $add('travelling_players','Corsairs and Travelling Players',$select(static fn($u)=>$belongs($u,'ae')&&($has($u,'Harlequins')||$has($u,'Anhrathe'))),['excludedDetachmentIds'=>$dids("Reaper's Wager"),'points'=>[1000=>250,2000=>500,3000=>750],'source'=>'https://wahapedia.ru/wh40k11ed/factions/drukhari/#Corsairs-and-Travelling-Players']);
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
