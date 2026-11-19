<?php
declare(strict_types=1);

// Narrow, idempotent repairs for omissions in the CSV. Source and verification are
// recorded in docs/builder-dotazioni.md; importing a saved catalog never edits old lists.
function builderApplySourceFixes(array $unit): array {
    if(in_array($unit['id']??'',['000002374','000004001'],true)){
        // The two published formations use the same unit cost; the heavy team is one model.
        // https://wahapedia.ru/wh40k11ed/factions/astra-militarum/Death-Korps-Grenadier-Squad
        $unit['composition']=[['description'=>'1 Grenadier Sergeant'],['description'=>'7-9 Grenadiers'],['description'=>'0-1 Heavy Weapons Team']];
        $unit['guidedLayouts']=[['name'=>'Squadra di Grenadiers','counts'=>['m0'=>1,'m1'=>9,'m2'=>0]],['name'=>'Squadra con Heavy Weapons Team','counts'=>['m0'=>1,'m1'=>7,'m2'=>1]]];
        foreach($unit['points'] as $price)if($price['models']===10){$price['models']=9;if(!in_array($price,$unit['points'],true))$unit['points'][]=$price;}
    }
    if(($unit['id']??'')==='000000436'){
        $unit['composition']=[['description'=>'1 Tidewall Shieldline'],['description'=>'0-1 Tidewall defence platform']];
        $unit['loadout']='Every model is equipped with: nothing.';
        if(count($unit['models']??[])===1){$profile=$unit['models'][0];$profile['line']='90001';$profile['name']='Tidewall defence platform';$unit['models'][]=$profile;}
    }
    if(in_array($unit['id']??'',['000004174','000004175'],true)){
        // Official faction packs: the xenophase bearer is present only in the ten-model unit.
        // Imperial Agents and Deathwatch, June 2026, Aquila/Decimus unit composition.
        $unit['composition'][0]['description']=preg_replace('/^1 /','0-1 ',$unit['composition'][0]['description']);
        $unit['guidedLayouts']=[['name'=>'Kill Team · 5 modelli','counts'=>['m0'=>0,'m1'=>1,'m2'=>1,'m3'=>1,'m4'=>1,'m5'=>1]],['name'=>'Kill Team · 10 modelli','counts'=>['m0'=>1,'m1'=>1,'m2'=>2,'m3'=>2,'m4'=>2,'m5'=>2]]];
    }
    if(($unit['id']??'')==='000004131'){
        $unit['composition'][0]['description']='0-6 Hunting Wolf models';
        $layouts=[['name'=>'3 Wolf Guard Headtakers','counts'=>['m0'=>0,'m1'=>3]],['name'=>'3 Headtakers + 3 Hunting Wolves','counts'=>['m0'=>3,'m1'=>3]],['name'=>'6 Wolf Guard Headtakers','counts'=>['m0'=>0,'m1'=>6]],['name'=>'6 Headtakers + 6 Hunting Wolves','counts'=>['m0'=>6,'m1'=>6]]];
        $tiers=[];foreach($unit['points'] as $p)$tiers[$p['first'].':'.$p['last']][]=$p;
        $valid=true;foreach($tiers as $prices){$bySize=[];foreach($prices as $p)$bySize[$p['models']][]=$p;if(count($bySize[3]??[])!==1||count($bySize[6]??[])!==2||count($bySize[12]??[])!==1){$valid=false;break;}
            foreach([$bySize[3][0],$bySize[6][0],$bySize[6][1],$bySize[12][0]] as $i=>$price)$layouts[$i]['prices'][]=$price;
        }
        if($valid)$unit['guidedLayouts']=$layouts;
    }
    if(($unit['id']??'')==='000000615'){
        // The single-model cost is the optional Exarch surcharge, not a one-model squad.
        $extra=array_values(array_filter($unit['points'],static fn($p)=>$p['models']===1));
        if(!$extra)foreach($unit['costs'] as $cost)if(preg_match('/^1 model$/i',$cost['description']??'')&&isset($cost['cost']))$extra[]=['points'=>(int)$cost['cost']];
        $base=array_values(array_filter($unit['points'],static fn($p)=>in_array($p['models'],[5,10],true)));
        if(count($extra)===1&&count($base)===2){$layouts=[];$prices=[];foreach($base as $p)foreach([0,1] as $exarch){$size=$p['models'];$price=$p;$price['models']+=$exarch;$price['points']+=$exarch*$extra[0]['points'];$prices[]=$price;$layouts[]=['name'=>$size.' Shadow Spectres'.($exarch?' + Exarch':''),'counts'=>['m0'=>$exarch,'m1'=>$size],'prices'=>[$price]];}$unit['points']=$prices;$unit['guidedLayouts']=$layouts;}
    }
    if(in_array($unit['id']??'',['000003821','000003875'],true)){
        // Official Imperial Agents faction pack, named members' fixed inventories.
        $members=[
            ['Chaplain Cassius','Chaplain Cassius',['Artificer crozius','Bolt pistol']],
            ['Vael Donatus','Kill Team Veteran',['Boltgun','Bolt pistol','Close combat weapon']],
            ['Zameon Gydrael','Kill Team Veteran',['Long Vigil ranged weapon','Long Vigil melee weapon']],
            ['Rodricus Grytt','Kill Team Veteran',['Frag cannon','Bolt pistol','Close combat weapon']],
            ['Antor Delassio','Kill Team Veteran',['Long Vigil ranged weapon','Long Vigil melee weapon','Jump Pack']],
            ['Edryc Setorax','Kill Team Veteran',['Twin lightning claws','Jump Pack']],
            ['Jensus Natorian','Kill Team Veteran',['Psychic Cleanse','Bolt pistol','Force weapon','Psychic Hood']],
            ['Drenn Redblade','Kill Team Veteran',['Long Vigil melee weapon','Boltgun']],
            ['Ennox Sorrlock','Kill Team Veteran',['Long Vigil ranged weapon','Close combat weapon']],
            ['Garran Branatar','Kill Team Terminator',['Heavy flamer','Long Vigil ranged weapon','Power fist']],
            ['Jetek Suberei','Kill Team Biker',['Deathwatch twin boltgun','Long Vigil melee weapon']],
        ];
        $profiles=[];$composition=[];$loadout=[];
        foreach($members as $i=>[$name,$type,$gear]){
            $composition[]=['description'=>'1 '.$name];$loadout[]='The '.$name.' is equipped with: '.implode('; ',array_map(static fn($w)=>'1 '.$w,$gear)).'.';
            foreach($unit['models'] as $profile)if(builderLoadoutName($profile['name'])===builderLoadoutName($type)){$profile['name']=$name;$profile['line']=(string)(90001+$i);$profiles[]=$profile;break;}
        }
        if(count($profiles)===11){$unit['composition']=$composition;$unit['models']=$profiles;$unit['loadout']=implode("\n\n",$loadout);}
        $unit['options']=[]; // CSV exports fixed WARGEAR inventories here; these are not choices.
        foreach($unit['abilities'] as &$ability)if(in_array($ability['name'],['Jump Pack','Psychic Hood'],true))$ability['type']='Wargear';unset($ability);
    }
    if(in_array($unit['id']??'',['000000680','000003942'],true)){
        // https://wahapedia.ru/wh40k11ed/factions/astra-militarum/Leman-Russ-Commander
        $names=array_map('builderWeaponKey',array_column($unit['weapons'],'name'));
        foreach([['90001','standard','7','-2','1','blast'],['90002','supercharge','8','-3','2','blast, hazardous']] as [$line,$mode,$s,$ap,$d,$keywords]){
            $name='Plasma cannon – '.$mode;if(in_array(builderWeaponKey($name),$names,true))continue;
            if(in_array($line,array_column($unit['weapons'],'line'),true))continue;
            $unit['weapons'][]=['line'=>$line,'name'=>$name,'type'=>'Ranged','range'=>'36','A'=>'D3','BS_WS'=>'4','S'=>$s,'AP'=>$ap,'D'=>$d,'description'=>$keywords];
        }
    }
    if(($unit['id']??'')==='000003833'&&!array_filter($unit['abilities'],static fn($a)=>builderWeaponKey($a['name'])==='relicshield')){
        // https://wahapedia.ru/wh40k11ed/factions/space-marines/Death-Company-Captain-with-Jump-Pack
        $unit['abilities'][]=['name'=>'Relic Shield','type'=>'Wargear','description'=>'This model has +1 W.'];
    }
    if(($unit['id']??'')==='000003824'&&!array_filter($unit['weapons'],static fn($w)=>builderWeaponKey($w['name']??'')==='boltpistol')){
        // Deathwatch Armoury, Imperial Agents faction pack (11 June 2026), shared profile.
        // https://assets.warhammer-community.com/eng_11-06_warhammer40000_faction_pack_imperial_agents-qhp2xzepry-gapdknla3x.pdf
        $unit['weapons'][]=['line'=>'90001','name'=>'Bolt pistol','type'=>'Ranged','range'=>'12','A'=>'1','BS_WS'=>'3','S'=>'4','AP'=>'0','D'=>'1','description'=>'pistol'];
    }
    // Some CSV weapon modes reuse a line number. Keep distinct profile identities;
    // the recipe still links their quantities through the common weapon name.
    $used=[];foreach($unit['weapons'] as $weapon)if(isset($weapon['line']))$used[$weapon['line']]=true;
    $seen=[];$nextLine=90000;
    foreach($unit['weapons'] as $index=>$weapon){
        if(!isset($weapon['line']))continue;
        if(isset($seen[$weapon['line']])){while(isset($used[(string)$nextLine]))$nextLine++;$weapon['line']=(string)$nextLine;$unit['weapons'][$index]['line']=$weapon['line'];$used[$weapon['line']]=true;}
        $seen[$weapon['line']]=true;
    }
    return $unit;
}
