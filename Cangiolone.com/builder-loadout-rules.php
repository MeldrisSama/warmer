<?php
declare(strict_types=1);

function builderLoadoutName(string $name): string {
    $name=preg_replace('/\s+models?$/i','',trim($name));
    $name=preg_replace('/^(?:the|every|each|a|an) /i','',$name);
    $key=builderWeaponKey($name);
    $key=preg_replace('/men$/','man',$key);$key=preg_replace('/ies$/','y',$key);
    return rtrim($key,'s');
}

// Parse syntax separately from applying it. Unparsed clauses are never silently discarded.
function builderLoadoutRule(string $text): ?array {
    $rule=['per'=>0,'max'=>null,'all'=>false,'target'=>'model','from'=>'','tail'=>'','add'=>false,'slots'=>1,'minimum'=>0,'maximum'=>null,'requires'=>'','forbidden'=>''];
    $text=str_replace(['’','‘',"\u{2011}"],["'","'",'-'],trim($text));
    $text=preg_replace_callback('/\b(one|two|three|four)\b/i',static fn($m)=>['one'=>1,'two'=>2,'three'=>3,'four'=>4][strtolower($m[1])],$text);
    if(preg_match('/^(?:Each of|Any number of) this model\'s (.+?) can (?:each )?be replaced with (.+)$/is',$text,$m)){$rule['repeat']=true;$text="This model's ".$m[1].' can be replaced with '.$m[2];}
    if(preg_match('/^Each model can have each (.+?) it is equipped with replaced with (.+)$/is',$text,$m)){$rule['repeat']=true;$text='Any number of models can each have their '.$m[1].' replaced with '.$m[2];}
    $text=preg_replace('/^(\d+|Both) of this model\'s (.+?) can be replaced with /is',"This model's $1 $2 can be replaced with ",$text);
    $text=preg_replace('/^This model\'s Both /i',"This model's 2 ",$text);
    if(preg_match('/^For every (\d+) models in (?:this|the) unit,\s*(.+)$/is',$text,$m)){$rule['per']=(int)$m[1];$text=$m[2];}
    if(preg_match('/^If this unit contains (?:only )?(\d+) models,\s*(.+)$/is',$text,$m)){$rule['minimum']=$rule['maximum']=(int)$m[1];$text=$m[2];}
    if(preg_match('/^If this unit contains (\d+) or (fewer|more) models,\s*(.+)$/is',$text,$m)){$rule[$m[2]==='fewer'?'maximum':'minimum']=(int)$m[1];$text=$m[3];}
    if(preg_match('/^(?:it|this unit) can (?:have|be equipped with) (.+)$/is',$text,$m)){$rule['unit']=true;$text='This model can be equipped with '.$m[1];$rule['max']=1;}
    if(preg_match('/^If this model is equipped with (.+?), (?:it|its (.+?)) can (?:be equipped with (.+)|be replaced with (.+))$/is',$text,$m)){
        $rule['requires']=$m[1];$text=empty($m[2])?'This model can be equipped with '.$m[3]:"This model's ".$m[2].' can be replaced with '.$m[4];
    }
    if(preg_match('/^((?:(?!\bcan\b).)+?) (?:that is )?not equipped with (.+?) can (.+)$/is',$text,$m)){$rule['forbidden']=$m[2];$text=$m[1].' can '.$m[3];}
    elseif(preg_match('/^((?:(?!\bcan\b).)+?) (?:that is )?equipped with (.+?) can (.+)$/is',$text,$m)){$rule['requires']=$m[2];$text=$m[1].' can '.$m[3];}
    $text=preg_replace('/^(.*?) can (each )?replace (?:its|their) (.+?) with (.+)$/is','$1 can $2have their $3 replaced with $4',$text);
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

function builderLoadoutApply(array &$groups,array $models,array $rule,array $original,array $alternatives,string $tag,array $weaponNames=[]): bool {
    $applied=false;
    foreach($models as $model){
        if(!in_array(strtolower($rule['target']),['model','models'],true)&&builderLoadoutName($rule['target'])!==builderLoadoutName($model['name']))continue;
        $conflicts=[];
        foreach($groups as $i=>$g)if($g['model']===$model['id'])foreach($g['choices'] as $c){
            if(array_intersect_key($c['weapons'],$rule['forbiddenBundle']??[])||array_intersect($c['exclusive']??[],$rule['exclusive']??[]))$conflicts[$i]=true;
            foreach($alternatives as $a)if(array_intersect_key($a['weapons'],$c['forbidden']??[]))$conflicts[$i]=true;
        }
        if($rule['add']&&!$original&&empty($rule['requiresBundle'])&&!$conflicts){
            $choices=[['id'=>'none','name'=>'Nessuna','weapons'=>[]]];
            foreach($alternatives as $a){$a['rules']=array_merge([$tag],$a['rules']??[]);$a['forbidden']=$rule['forbiddenBundle']??[];$a['exclusive']=$rule['exclusive']??[];$choices[]=$a;}
            $group=['id'=>$model['id'].'_extra'.count($groups),'model'=>$model['id'],'name'=>$model['name'].' · '.trim($rule['tail']),'per'=>0,'default'=>'none','choices'=>$choices];
            if(!empty($rule['unit'])){$group['unitGear']=true;$group['per']=$rule['per'];$group['name']='Squadra · '.trim($rule['tail']);}
            if($rule['per']&&($rule['max']??1)===1){$group['sharedKey']=$tag;$group['sharedPer']=$rule['per'];}
            $groups[]=$group;$applied=true;if(!empty($rule['unit']))break;continue;
        }
        // Merge only groups needed by the source bundle, preserving independent choices.
        $indexes=[];$remaining=$original;
        foreach($rule['requiresBundle']??[] as $id=>$n)$remaining[$id]=max($remaining[$id]??0,$n);
        foreach($alternatives as $alternative)foreach($alternative['locks']??[] as $id=>$n)if(!isset($alternative['weapons'][$id]))$remaining[$id]=max($remaining[$id]??0,$n);
        foreach($groups as $i=>$group){
            if($group['model']!==$model['id'])continue;
            $base=$group['choices'][0]['weapons'];$possible=$base;
            foreach($group['choices'] as $choice)foreach($choice['weapons'] as $id=>$n)$possible[$id]=max($possible[$id]??0,$n);
            if(!array_intersect_key($possible,$remaining)&&!isset($conflicts[$i]))continue;
            $indexes[]=$i;
            foreach($possible as $id=>$n)if(isset($remaining[$id])){$remaining[$id]-=$n;if($remaining[$id]<=0)unset($remaining[$id]);}
        }
        if($remaining||!$indexes)continue;
        $combined=[['id'=>'base','name'=>'','weapons'=>[],'rules'=>[]]];
        foreach($indexes as $i){
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
            if(!$rule['add']&&array_intersect_key($original,$choice['locks']??[]))continue;
            foreach($alternatives as $alternative){
                $weapons=$rule['add']?$choice['weapons']:builderLoadoutSum($choice['weapons'],array_map(static fn($n)=>-$n,$original));
                $weapons=builderLoadoutSum($weapons,$alternative['weapons']);
                $rules=array_values(array_unique(array_merge($choice['rules'],[$tag],$alternative['rules']??[])));
                if(array_filter($choices,static fn($c)=>$c['weapons']===$weapons&&($c['rules']??[])===$rules))continue;
                $locks=array_replace($choice['locks']??[],$alternative['locks']??[]);
                if(!builderLoadoutContains($weapons,$locks))continue;
                $forbidden=array_replace($choice['forbidden']??[],$rule['forbiddenBundle']??[]);
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
        if($rule['per']&&($rule['max']??1)===1&&count(array_unique(array_merge(...array_map(static fn($c)=>$c['rules']??[],$choices))))===1){$group['sharedKey']=$tag;$group['sharedPer']=$rule['per'];$group['choicePer']=$rule['per'];}
        $groups[$first]=$group;
        foreach(array_slice($indexes,1) as $i)unset($groups[$i]);
        $applied=true;
    }
    $groups=array_values($groups);return $applied;
}

function builderLoadoutRuleLimit(array $rule,int $models): int {
    if($models<($rule['minimum']??0)||isset($rule['maximum'])&&$models>$rule['maximum'])return 0;
    if(isset($rule['maxAt'])&&$models>=$rule['maxAt']['models'])return $rule['maxAt']['max'];
    return !empty($rule['per'])?(int)floor($models/$rule['per'])*($rule['max']??1):($rule['max']??1000);
}
function builderLoadoutRuleErrors(array $recipe,array $selections,int $models): array {
    $errors=[];
    foreach($recipe['rules']??[] as $rule){
        $used=0;$capacity=0;
        foreach($recipe['groups'] as $group){
            if(!array_filter($group['choices'],static fn($c)=>in_array($rule['id'],$c['rules']??[],true)))continue;
            $capacity+=builderLoadoutCapacity($recipe,$group,$models);
            foreach($group['choices'] as $choice)if(in_array($rule['id'],$choice['rules']??[],true))$used+=$selections[$group['id']][$choice['id']]??0;
        }
        if($used>builderLoadoutRuleLimit($rule,$models))$errors[]='Limite condiviso della dotazione superato: '.$rule['name'];
        if(!empty($rule['all'])&&$used!==0&&$used!==$capacity)$errors[]='La sostituzione deve riguardare tutti i modelli: '.$rule['name'];
    }
    return $errors;
}
