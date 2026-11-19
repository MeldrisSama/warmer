<?php
declare(strict_types=1);

function builderLoadoutName(string $name): string {
    $name=preg_replace('/\s+models?$/i','',trim($name));
    $name=preg_replace('/^(?:the|every|each|a|an) /i','',$name);
    $name=preg_replace('/^Saint /i','',$name);
    $name=preg_replace_callback('/\b[a-z]{4,}\b/i',static function($m){$word=strtolower($m[0]);if($word==='chaos')return $word;if($word==='knives')return 'knife';if($word==='wolves')return 'wolf';if(str_ends_with($word,'men'))return substr($word,0,-3).'man';if(str_ends_with($word,'heroes'))return substr($word,0,-2);if(str_ends_with($word,'ies'))return substr($word,0,-3).'y';return rtrim($word,'s');},$name);
    $key=builderWeaponKey($name);
    $key=preg_replace('/men$/','man',$key);$key=preg_replace('/ies$/','y',$key);$key=preg_replace('/heroes$/','hero',$key);
    $key=str_replace('hastariifusiller','hastariifusilier',$key);
    return rtrim($key,'s');
}
function builderLoadoutAliases(array $unit,array $weapons): array {
    // Reviewed name discrepancies in the 11th-edition source; never fuzzy-match weapons.
    // Chronomancer: /wh40k11ed/factions/necrons/datasheets.html
    // Huron: /wh40k11ed/factions/chaos-space-marines/Huron-Blackheart
    $maps=[
        '000002354'=>['Chronomancer’s stave'=>['Aeonstave']],
        '000000925'=>['Tyrant’s Claw'=>['Tyrant’s Claw heavy flamer'],'exalted weapon'=>['Tyrant’s Claw and exalted power weapon']],
        '000003816'=>['Storm Shield'=>['Astartes Shield']],
        '000000727'=>['Militarum multi-laser'=>['Multi-laser']],
        '000004264'=>['Militarum multi-laser'=>['Multi-laser']],
        '000000508'=>['force stave'=>['Magus stave']],
        '000000513'=>['Leader’s cult weapons'=>['Leader’s bio-weapons']],
        '000002792'=>['Servitor Combat Weapon'=>['Close combat weapon']],
        '000003706'=>['hunting blades'=>['Close combat weapon'],'Rampager fists'=>['Krootox fists']],
        '000001115'=>['Juggernaut’s bladed horn'=>['Bladed horn']],
        '000004107'=>['Juggernaut’s bladed horn'=>['Bladed horn']],
        '000004036'=>['Astartes chainsword'=>['Astartes chainblade']],
        '000000929'=>['Astartes chainsword'=>['Astartes chainblade']],
        '000001526'=>['arc lance'=>['Galvanic caster']],
        '000002780'=>['Astartes Grenade Launcher'=>['Grenade Launcher']],
        '000004174'=>['Grenade Launcher'=>['Astartes Grenade Launcher'],'Storm Shield'=>['Astartes Shield']],
        '000003833'=>['Astartes Chainsword'=>['Chainsword']],
    ];
    $aliases=[];
    foreach($maps[$unit['id']??'']??[] as $from=>$targets){
        $bundle=[];foreach($targets as $target){$weapon=$weapons[builderWeaponKey($target)]??null;if(!$weapon){$bundle=[];break;}$bundle[$weapon['id']]=1;}
        if($bundle)$aliases[builderWeaponKey($from)]=$bundle;
    }
    return $aliases;
}

// Parse syntax separately from applying it. Unparsed clauses are never silently discarded.
function builderLoadoutRule(string $text): ?array {
    $rule=['per'=>0,'max'=>null,'all'=>false,'target'=>'model','from'=>'','tail'=>'','add'=>false,'slots'=>1,'minimum'=>0,'maximum'=>null,'requires'=>'','forbidden'=>''];
    $text=str_replace(['’','‘',"\u{2011}"],["'","'",'-'],trim($text));
    $text=preg_replace('/[ \t]+/',' ',$text);
    $text=preg_replace('/\bwith:/i','with ',$text);
    $text=str_replace(' in addition to any other weapons','',$text);
    $text=preg_replace('/^(\d+) model in this unit /i','$1 model ',$text);
    $text=preg_replace('/^If this unit\'s (.+?) is equipped with /i','If the $1 is equipped with ',$text);
    $text=preg_replace_callback('/\b(one|two|three|four)\b/i',static fn($m)=>['one'=>1,'two'=>2,'three'=>3,'four'=>4][strtolower($m[1])],$text);
    if(preg_match('/^(?:Each of|Any number of) this model\'s (.+?) can (?:each )?be replaced with (.+)$/is',$text,$m)){$rule['repeat']=true;$text="This model's ".$m[1].' can be replaced with '.$m[2];}
    if(preg_match('/^Each model can have each (.+?) it is equipped with replaced with (.+)$/is',$text,$m)){$rule['repeat']=true;$text='Any number of models can each have their '.$m[1].' replaced with '.$m[2];}
    $text=preg_replace('/^(\d+|Both) of this model\'s (.+?) can be replaced with /is',"This model's $1 $2 can be replaced with ",$text);
    $text=preg_replace('/^This model\'s Both /i',"This model's 2 ",$text);
    if(preg_match('/^For every (\d+) models in (?:this|the) unit,\s*(.+)$/is',$text,$m)){$rule['per']=(int)$m[1];$text=$m[2];}
    elseif(preg_match('/^For every (\d+) (.+?) in this unit,\s*(.+)$/is',$text,$m)){$rule['per']=(int)$m[1];$rule['perTarget']=$m[2];$text=$m[3];}
    if(preg_match('/^If this unit contains (?:only )?(\d+) models,\s*(.+)$/is',$text,$m)){$rule['minimum']=$rule['maximum']=(int)$m[1];$text=$m[2];}
    if(preg_match('/^If this unit contains (\d+) or (fewer|more) models,\s*(.+)$/is',$text,$m)){$rule[$m[2]==='fewer'?'maximum':'minimum']=(int)$m[1];$text=$m[3];}
    if(preg_match('/^(?:it|this unit) can (?:have|be equipped with) (.+)$/is',$text,$m)){$rule['unit']=true;$text='This model can be equipped with '.$m[1];$rule['max']=1;}
    if(preg_match('/^If this model is equipped with (.+?), (?:it|its (.+?)) can (?:be equipped with (.+)|be replaced with (.+))$/is',$text,$m)){
        $rule['requires']=$m[1];$text=empty($m[2])?'This model can be equipped with '.$m[3]:"This model's ".$m[2].' can be replaced with '.$m[4];
    }
    if(preg_match('/^If (this model|the (.+?)) is (not )?equipped with (.+?), (?:it|its (.+?)) can (?:be equipped with (.+)|be replaced with (.+))$/is',$text,$m)){
        $rule[!empty($m[3])?'forbidden':'requires']=$m[4];$subject=empty($m[2])?'This model':'The '.$m[2];
        $text=empty($m[5])?$subject.' can be equipped with '.$m[6]:$subject."'s ".$m[5].' can be replaced with '.$m[7];
    }
    if(preg_match('/^((?:(?!\bcan\b).)+?) (?:that is )?not equipped with (.+?) can (.+)$/is',$text,$m)){$rule['forbidden']=$m[2];$text=$m[1].' can '.$m[3];}
    elseif(preg_match('/^((?:(?!\bcan\b).)+?) (?:that is )?equipped with (.+?) can (.+)$/is',$text,$m)){$rule['requires']=$m[2];$text=$m[1].' can '.$m[3];}
    $text=preg_replace('/^(.*?) can (each )?replace (?:1 of )?(?:its|their) (.+?) with (.+)$/is','$1 can $2have their $3 replaced with $4',$text);
    $text=preg_replace('/\bcan each have their (.+?) can be replaced with /i','can each have their $1 replaced with ',$text);
    $text=preg_replace('/\bup to (\d+) additional /i','up to $1 ',$text);
    $text=preg_replace('/^Each (.+?)\'s (.+?) can be replaced with /is','Any number of $1 can each have their $2 replaced with ',$text);
    $text=preg_replace('/^All (?!of the )(.+?) models in this unit /i','Any number of $1 models ',$text,-1,$namedAll);
    if($namedAll)$rule['all']=true;
    $text=preg_replace('/^Any numbers of /i','Any number of ',$text);
    if(preg_match('/^(All (?:of the )?models in this unit|Any number of (.+?)(?: in this unit)?|This model|Any model|The (.+?)|(?:Up to )?(\d+) (.+?)) can (?:each )?(?:have (?:its|their) (.+?) replaced with (.+)|be equipped (?:with )?(.+))$/is',$text,$m)){
        $rule['all']=$rule['all']||str_starts_with($m[1],'All ');
        $rule['target']=($m[2]??'')?:($m[3]??'')?:($m[5]??'')?:'model';
        if(!empty($m[4]))$rule['max']=(int)$m[4];
        $rule['from']=$m[6]??'';$rule['tail']=($m[8]??'')?:($m[7]??'');$rule['add']=!empty($m[8]);
    }elseif(preg_match('/^(This model|The (.+?)|(?:Up to )?(\d+) (.+?))\'(?:s)? (.+?) can (?:each )?be replaced with (.+)$/is',$text,$m)){
        $rule['target']=($m[2]??'')?:($m[4]??'')?:'model';if(!empty($m[3]))$rule['max']=(int)$m[3];$rule['from']=$m[5];$rule['tail']=$m[6];
    }elseif(preg_match('/^Any number of models\' (.+?) can each be replaced with (.+)$/is',$text,$m)){
        $rule['from']=$m[1];$rule['tail']=$m[2];
    }else return null;
    // Optional slots are expanded as complete per-model choices (not aggregate slots).
    if($rule['add']&&preg_match('/^up to (\d+) (.+)$/is',$rule['tail'],$m)){
        $rule['slots']=(int)$m[1];$rule['duplicates']=!preg_match('/cannot take duplicates/i',$rule['tail']);
        $rule['tail']=preg_replace('/^of the following[^:\n]*:?\s*/i','',$m[2]);
    }
    $rule['other']=preg_match('/^other /i',$rule['target'])===1;
    $rule['target']=preg_replace('/^other /i','',$rule['target']);
    $rule['target']=preg_replace('/\s+models?$/i','',$rule['target']);
    return $rule;
}

function builderLoadoutContains(array $bundle,array $need): bool {
    foreach($need as $id=>$n)if(($bundle[$id]??0)<$n)return false;
    return true;
}
function builderLoadoutSum(array $a,array $b): array {
    foreach($b as $id=>$n)$a[$id]=($a[$id]??0)+$n;
    ksort($a);return array_filter($a,static fn($n)=>$n!==0);
}
function builderLoadoutModelCounts(array $recipe,int $models,?array $requested=null): array {
    if(empty($recipe['flexibleModels']))return [];
    $types=$recipe['models'];$counts=$requested??array_column($types,'min','id');
    if($requested===null)foreach($recipe['layouts']??[] as $layout)if(array_sum($layout['counts'])===$models){$counts=$layout['counts'];break;}
    if($requested===null){
        $left=$models-array_sum($counts);
        usort($types,static fn($a,$b)=>($b['max']-$b['min'])<=>($a['max']-$a['min']));
        foreach($types as $type){$add=min(max(0,$left),$type['max']-$counts[$type['id']]);$counts[$type['id']]+=$add;$left-=$add;}
    }
    if(count($counts)!==count($types)||array_diff(array_keys($counts),array_column($types,'id')))builderInvalid('Tipi di modello non validi.');
    foreach($types as $type)$counts[$type['id']]=builderInt($counts[$type['id']]??null,'quantità '.$type['name'],$type['min'],$type['max']);
    if(array_sum($counts)!==$models)builderInvalid('La composizione non corrisponde al totale dei modelli.');
    if(!empty($recipe['layouts'])&&!array_filter($recipe['layouts'],static fn($l)=>$l['counts']==$counts))builderInvalid('Questa formazione non è prevista dalla scheda.');
    foreach($recipe['compositionRules']??[] as $rule)if($counts[$rule['model']]>=$rule['count']&&$counts[$rule['requires']]<$rule['minimum'])builderInvalid('Composizione non consentita dalla scheda.');
    return $counts;
}
function builderEntryBasePrice(array $unit,array $entry,int $ordinal): ?int {
    $models=$entry['models']??0;$price=null;
    $layouts=$unit['loadoutRecipe']['layouts']??[];
    if(array_filter($layouts,static fn($l)=>isset($l['prices']))){
        $counts=$entry['loadoutSelections']['_models']??null;if(!is_array($counts))return null;
        foreach($layouts as $layout)if($layout['counts']==$counts)foreach($layout['prices']??[] as $p)if($ordinal>=$p['first']&&$ordinal<=$p['last'])$price=$p['points'];
        return $price;
    }
    foreach($unit['points']??[] as $p)if($p['models']===$models&&$ordinal>=($p['first']??1)&&$ordinal<=($p['last']??200))$price=$p['points'];
    return $price;
}

function builderLoadoutApply(array &$groups,array $models,array $rule,array $original,array $alternatives,string $tag,array $weaponNames=[]): bool {
    $applied=false;
    foreach($models as $model){
        $modelName=$model['baseName']??$model['name'];$targetName=builderLoadoutName($rule['target']);
        $matches=$targetName===builderLoadoutName($modelName)||($targetName==='terminator'&&builderLoadoutName($modelName)==='chaosterminator');
        if(!in_array(strtolower($rule['target']),['model','models'],true)&&!$matches)continue;
        $conflicts=[];
        foreach($groups as $i=>$g)if($g['model']===$model['id'])foreach($g['choices'] as $c){
            if(array_intersect_key($c['weapons'],$rule['forbiddenBundle']??[])||array_intersect($c['exclusive']??[],$rule['exclusive']??[]))$conflicts[$i]=true;
            foreach($alternatives as $a)if(array_intersect_key($a['weapons'],$c['forbidden']??[]))$conflicts[$i]=true;
        }
        if($rule['add']&&!$original&&empty($rule['requiresBundle'])&&!$conflicts){
            $choices=[['id'=>'none','name'=>'Nessuna','weapons'=>[]]];
            foreach($alternatives as $a){$a['rules']=array_merge([$tag],$a['rules']??[]);$a['forbidden']=$rule['forbiddenBundle']??[];$a['exclusive']=$rule['exclusive']??[];$choices[]=$a;}
            $group=['id'=>$model['id'].'_extra'.count($groups),'model'=>$model['id'],'name'=>$model['name'].' · '.trim($rule['tail']),'per'=>0,'default'=>'none','choices'=>$choices];
            if(!empty($rule['unit'])){$group['unitGear']=true;$group['per']=$rule['per'];$group['name']='Squadra · '.trim($rule['tail']);if(isset($rule['perModel']))$group['perModel']=$rule['perModel'];}
            if($rule['per']&&($rule['max']??1)===1&&!isset($rule['perModel'])){$group['sharedKey']=$tag;$group['sharedPer']=$rule['per'];}
            $groups[]=$group;$applied=true;if(!empty($rule['unit']))break;continue;
        }
        // Merge only groups needed by the source bundle, preserving independent choices.
        $indexes=[];$remaining=$original;
        foreach($rule['requiresBundle']??[] as $id=>$n)$remaining[$id]=max($remaining[$id]??0,$n);
        foreach($alternatives as $alternative)foreach($alternative['locks']??[] as $id=>$n)if(!isset($alternative['weapons'][$id]))$remaining[$id]=max($remaining[$id]??0,$n);
        foreach($groups as $i=>$group){
            if($group['model']!==$model['id'])continue;
            $base=$group['choices'][0]['weapons'];
            if(!array_intersect_key($base,$remaining)&&!isset($conflicts[$i]))continue;
            $indexes[]=$i;
            foreach($base as $id=>$n)if(isset($remaining[$id])){$remaining[$id]-=$n;if($remaining[$id]<=0)unset($remaining[$id]);}
        }
        // Use possible alternative inventories only after consuming all actual defaults.
        // Otherwise a rifle's optional sword can hide a separate standard sword group.
        if($remaining)foreach($groups as $i=>$group){
            if($group['model']!==$model['id'])continue;$possible=[];
            foreach($group['choices'] as $choice)foreach($choice['weapons'] as $id=>$n)$possible[$id]=max($possible[$id]??0,$n);
            $selected=in_array($i,$indexes,true);if($selected)foreach($group['choices'][0]['weapons'] as $id=>$n)$possible[$id]=max(0,($possible[$id]??0)-$n);
            if(!array_intersect_key($possible,$remaining))continue;if(!$selected)$indexes[]=$i;
            foreach($possible as $id=>$n)if(isset($remaining[$id])){$remaining[$id]-=$n;if($remaining[$id]<=0)unset($remaining[$id]);}
        }
        sort($indexes);
        if($remaining||!$indexes)continue;
        $combined=[['id'=>'base','name'=>'','weapons'=>[],'rules'=>[]]];
        foreach($indexes as $i){
            if(count($combined)*count($groups[$i]['choices'])>512)continue 2;
            $next=[];
            foreach($combined as $a)foreach($groups[$i]['choices'] as $b){
                $weapons=builderLoadoutSum($a['weapons'],$b['weapons']);$forbidden=array_replace($a['forbidden']??[],$b['forbidden']??[]);
                if(array_intersect_key($weapons,$forbidden))continue;
                if(array_intersect($a['exclusive']??[],$b['exclusive']??[]))continue;
                $next[]=['name'=>trim($a['name'].'; '.$b['name'],'; '),'weapons'=>$weapons,'rules'=>array_values(array_unique(array_merge($a['rules'],$b['rules']??[]))),'locks'=>array_replace($a['locks']??[],$b['locks']??[]),'forbidden'=>$forbidden,'exclusive'=>array_merge($a['exclusive']??[],$b['exclusive']??[])];
            }
            $combined=$next;
        }
        // Do not expand an unbounded combinatorial product into the catalog.
        if(count($combined)*(count($alternatives)+1)>512)continue;
        $choices=$combined;
        $pending=$combined;$rounds=!empty($rule['repeat'])?16:1;
        while($pending&&$rounds-->0){$new=[];foreach($pending as $choice){
            if(!builderLoadoutContains($choice['weapons'],$original)||!builderLoadoutContains($choice['weapons'],$rule['requiresBundle']??[])||empty($rule['repeat'])&&in_array($tag,$choice['rules'],true))continue;
            if(array_intersect_key($choice['weapons'],$rule['forbiddenBundle']??[]))continue;
            if(array_intersect($choice['exclusive']??[],$rule['exclusive']??[]))continue;
            if(!$rule['add']){foreach($original as $id=>$n)if(($choice['weapons'][$id]??0)-$n<($choice['locks'][$id]??0))continue 2;}
            foreach($alternatives as $alternative){
                $weapons=$rule['add']?$choice['weapons']:builderLoadoutSum($choice['weapons'],array_map(static fn($n)=>-$n,$original));
                $weapons=builderLoadoutSum($weapons,$alternative['weapons']);
                $rules=array_values(array_unique(array_merge($choice['rules'],[$tag],$alternative['rules']??[])));
                if(array_filter($choices,static fn($c)=>$c['weapons']===$weapons&&($c['rules']??[])===$rules))continue;
                $locks=array_replace($choice['locks']??[],$alternative['locks']??[]);
                if(!builderLoadoutContains($weapons,$locks))continue;
                $forbidden=array_replace($choice['forbidden']??[],array_diff_key($rule['forbiddenBundle']??[],$alternative['weapons']));
                if(array_intersect_key($weapons,$forbidden))continue;
                $name=$alternative['name'];if(!empty($rule['repeat']))$name=implode('; ',array_map(static fn($id,$n)=>$n.'× '.($weaponNames[$id]??$id),array_keys($weapons),array_values($weapons)));
                $nextChoice=['name'=>$name,'weapons'=>$weapons,'rules'=>$rules,'locks'=>$locks,'forbidden'=>$forbidden,'exclusive'=>array_merge($choice['exclusive']??[],$rule['exclusive']??[])];$choices[]=$nextChoice;$new[]=$nextChoice;
            }
        }$pending=$new;if(count($choices)>512)break;}
        if(count($choices)===count($combined))continue;
        foreach($choices as $i=>&$choice)$choice['id']=$i===0?'base':'choice'.$i;unset($choice);
        $first=$indexes[0];$group=$groups[$first];$group['choices']=$choices;
        $group['default']='base';
        if(count($indexes)>1)$group['name']=$model['name'].' · '.implode(' + ',array_map(static fn($i)=>preg_replace('/^.*? · /','',$groups[$i]['name']),$indexes));
        // Legacy limits belong to a row, never to the entire merged group.
        unset($group['choicePer'],$group['sharedPer'],$group['sharedKey']);
        if($rule['per']&&($rule['max']??1)===1&&!isset($rule['perModel'])&&count(array_unique(array_merge(...array_map(static fn($c)=>$c['rules']??[],$choices))))===1){$group['sharedKey']=$tag;$group['sharedPer']=$rule['per'];$group['choicePer']=$rule['per'];}
        $groups[$first]=$group;
        foreach(array_slice($indexes,1) as $i)unset($groups[$i]);
        $applied=true;
    }
    $groups=array_values($groups);return $applied;
}

function builderLoadoutRuleLimit(array $rule,int $models,?int $population=null): int {
    if($models<($rule['minimum']??0)||isset($rule['maximum'])&&$models>$rule['maximum'])return 0;
    if(isset($rule['maxAt'])&&$models>=$rule['maxAt']['models'])return $rule['maxAt']['max'];
    return !empty($rule['per'])?(int)floor(($population??$models)/$rule['per'])*($rule['max']??1):($rule['max']??1000);
}
// Join inventories only when a rule needs proof that gear shares the same bearer.
function builderLoadoutConstrain(array &$groups,array $models,array $weights,int $max,array $weaponNames,?array $activeTags=null): bool {
    $updated=$groups;
    foreach($models as $model){
        $indexes=[];foreach($updated as $i=>$g)if($g['model']===$model['id']&&array_filter($g['choices'],static fn($c)=>array_intersect_key($c['weapons'],$weights)))$indexes[]=$i;
        if(!$indexes)continue;
        foreach($indexes as $i)if(!empty($updated[$i]['unitGear']))return false;
        $base=0;foreach($indexes as $i)foreach($weights as $id=>$weight)$base+=($updated[$i]['choices'][0]['weapons'][$id]??0)*$weight;
        if($base>$max)return false;
        $choices=[['weapons'=>[],'rules'=>[],'locks'=>[],'forbidden'=>[],'exclusive'=>[]]];
        foreach($indexes as $i){$next=[];$seen=[];
            foreach($choices as $a)foreach($updated[$i]['choices'] as $b){
                $weapons=builderLoadoutSum($a['weapons'],$b['weapons']);$count=0;foreach($weights as $id=>$weight)$count+=($weapons[$id]??0)*$weight;if($count>$max)continue;
                $forbidden=array_replace($a['forbidden'],$b['forbidden']??[]);if(array_intersect_key($weapons,$forbidden)||array_intersect($a['exclusive'],$b['exclusive']??[]))continue;
                $tags=array_values(array_unique(array_merge($a['rules'],$b['rules']??[])));if($activeTags!==null)$tags=array_values(array_intersect($tags,$activeTags));sort($tags);
                $choice=['weapons'=>$weapons,'rules'=>$tags,'locks'=>array_replace($a['locks'],$b['locks']??[]),'forbidden'=>$forbidden,'exclusive'=>array_merge($a['exclusive'],$b['exclusive']??[])];
                $key=json_encode($choice);if(isset($seen[$key]))continue;$seen[$key]=true;$next[]=$choice;
                if(count($next)>8192)return false;
            }$choices=$next;
        }
        if(!$choices)return false;
        foreach($choices as $i=>&$choice){$choice['id']=$i===0?'base':'choice'.$i;$choice['name']=implode('; ',array_map(static fn($id,$n)=>$n.'× '.($weaponNames[$id]??$id),array_keys($choice['weapons']),array_values($choice['weapons'])));}unset($choice);
        $first=$indexes[0];$g=$updated[$first];$g['choices']=$choices;$g['default']='base';$g['name']=$model['name'].' · Equipaggiamento';unset($g['choicePer'],$g['sharedPer'],$g['sharedKey']);$updated[$first]=$g;
        foreach(array_slice($indexes,1) as $i)unset($updated[$i]);
    }
    $groups=array_values($updated);return true;
}
function builderLoadoutRuleErrors(array $recipe,array $selections,int $models): array {
    $errors=[];
    foreach($recipe['rules']??[] as $rule){
        $used=0;$capacity=0;
        foreach($recipe['groups'] as $group){
            if(!array_filter($group['choices'],static fn($c)=>in_array($rule['id'],$c['rules']??[],true)))continue;
            $capacity+=builderLoadoutCapacity($recipe,$group,$models,$selections['_models']??[]);
            foreach($group['choices'] as $choice)if(in_array($rule['id'],$choice['rules']??[],true))$used+=$selections[$group['id']][$choice['id']]??0;
        }
        if(isset($rule['weapon'])){$used=0;foreach($recipe['groups'] as $group)foreach($group['choices'] as $choice)$used+=($selections[$group['id']][$choice['id']]??0)*($choice['weapons'][$rule['weapon']]??0);}
        $population=isset($rule['perModel'])?builderLoadoutCapacity($recipe,['model'=>$rule['perModel'],'per'=>0],$models,$selections['_models']??[]):null;
        if($used>builderLoadoutRuleLimit($rule,$models,$population))$errors[]='Limite condiviso della dotazione superato: '.$rule['name'];
        if(!empty($rule['all'])&&$used!==0&&$used!==$capacity)$errors[]='La sostituzione deve riguardare tutti i modelli: '.$rule['name'];
    }
    foreach($recipe['links']??[] as $link){$a=0;$b=0;foreach($recipe['groups'] as $g)foreach($g['choices'] as $c){$n=$selections[$g['id']][$c['id']]??0;if(in_array($link['a'],$c['rules']??[],true))$a+=$n;if(in_array($link['b'],$c['rules']??[],true))$b+=$n;}if($a!==$b)$errors[]='Il team armi deve comprendere entrambi i modelli.';}
    return $errors;
}
