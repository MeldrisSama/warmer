<?php
declare(strict_types=1);

// Narrow, idempotent repairs for omissions in the CSV. Source and verification are
// recorded in docs/builder-dotazioni.md; importing a saved catalog never edits old lists.
function builderApplySourceFixes(array $unit): array {
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
    return $unit;
}
