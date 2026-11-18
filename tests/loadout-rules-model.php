<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
function ensureLoadout(bool $value,string $message): void {if(!$value)throw new RuntimeException($message);}
function sampleLoadout(array $options,string $composition='3-6 Troopers',string $loadout='Every model is equipped with: rifle; sword.'): array {
    $u=['weapons'=>[],'abilities'=>[],'costs'=>[],'points'=>[['models'=>3],['models'=>6]],'composition'=>[['description'=>$composition]],'loadout'=>$loadout,'options'=>array_map(static fn($t)=>['description'=>$t],$options)];
    foreach(['Rifle','Sword','Cannon','Pistol','Axe','Icon','Horn'] as $i=>$name)$u['weapons'][]=['line'=>(string)($i+1),'name'=>$name];
    $u['loadoutRecipe']=builderCompileLoadout($u,static fn($r)=>$r['description']);return $u;
}
function selectLoadout(array $recipe,array $need,int $n,int $size): array {
    $state=builderLoadoutCounts($recipe,[],$size)['selections'];
    foreach($recipe['groups'] as $g)foreach($g['choices'] as $c)if(builderLoadoutContains($c['weapons'],$need)){$state[$g['id']]=[$g['default']=>builderLoadoutCapacity($recipe,$g,$size)-$n,$c['id']=>$n];return $state;}
    throw new RuntimeException('Test choice missing');
}
function rejectLoadout(array $r,array $s,int $size): void {try{builderLoadoutCounts($r,$s,$size);}catch(BuilderInputError){return;}throw new RuntimeException('Invalid loadout accepted');}
$bundle=sampleLoadout(['For every 3 models in this unit, 1 Trooper’s rifle and sword can be replaced with 1 cannon and 1 axe.']);$r=$bundle['loadoutRecipe'];
ensureLoadout(count($r['groups'])===1&&$r['optionsCovered']===1,'Bundle not compiled');
$s=selectLoadout($r,['w_3'=>1],1,3);$n=builderLoadoutCounts($r,$s,3)['weaponCounts'];ensureLoadout($n[1]===2&&$n[2]===2&&$n[3]===1&&$n[5]===1,'Bundle did not consume both original weapons');
rejectLoadout($r,selectLoadout($r,['w_3'=>1],2,3),3);
$limits=sampleLoadout(['1 Trooper’s rifle can be replaced with 1 cannon.','1 Trooper’s rifle can be replaced with 1 pistol.']);$r=$limits['loadoutRecipe'];
rejectLoadout($r,selectLoadout($r,['w_3'=>1],2,3),3);rejectLoadout($r,selectLoadout($r,['w_4'=>1],2,3),3);
$g=$r['groups'][0];$s=builderLoadoutCounts($r,[],3)['selections'];$s[$g['id']]=['base'=>1,'choice1'=>1,'choice2'=>1];builderLoadoutCounts($r,$s,3);
$all=sampleLoadout(['All models in this unit can each have their rifle replaced with 1 cannon.']);$r=$all['loadoutRecipe'];rejectLoadout($r,selectLoadout($r,['w_3'=>1],1,3),3);builderLoadoutCounts($r,selectLoadout($r,['w_3'=>1],3,3),3);
$duplicate=sampleLoadout(["For every 3 models in this unit, up to 2 Troopers can each have their rifle replaced with one of the following*:\n• 1 cannon\n• 1 pistol",'* You cannot select the same weapon from this list more than once per unit, unless this unit contains 6 models, in which case you cannot select the same weapon more than twice per unit.']);$r=$duplicate['loadoutRecipe'];
ensureLoadout($r['optionsCovered']===2,'Footnote not compiled');rejectLoadout($r,selectLoadout($r,['w_3'=>1],2,3),3);builderLoadoutCounts($r,selectLoadout($r,['w_3'=>1],2,6),6);
$locked=sampleLoadout(['1 Trooper equipped with a rifle can be equipped with 1 icon (that model’s rifle cannot be replaced).','Any number of models can each have their rifle replaced with 1 cannon.']);$r=$locked['loadoutRecipe'];
foreach($r['groups'] as $g)foreach($g['choices'] as $c)ensureLoadout(!isset($c['weapons']['w_6'])||isset($c['weapons']['w_1']),'Locked rifle can be replaced');
$negative=sampleLoadout(['1 Trooper that is not equipped with an icon can be equipped with 1 horn.','1 Trooper that is not equipped with a horn can be equipped with 1 icon.']);$r=$negative['loadoutRecipe'];
ensureLoadout($r['optionsCovered']===2&&count($r['groups'])===3,'Exclusive gear not compiled');
foreach($r['groups'] as $g)foreach($g['choices'] as $c)ensureLoadout(!isset($c['weapons']['w_6'],$c['weapons']['w_7']),'Exclusive gear can share a bearer');
$slots=sampleLoadout(["This model can be equipped with up to two of the following, but cannot take duplicates:\n• 1 cannon\n• 1 pistol"],'1 Trooper');$r=$slots['loadoutRecipe'];
ensureLoadout($r['optionsCovered']===1,'Optional slots not compiled');foreach($r['groups'] as $g)foreach($g['choices'] as $c)ensureLoadout(max(array_merge([0],array_values($c['weapons'])))<=1,'Duplicate slot gear allowed');
$repeated=sampleLoadout(["Each of this model’s rifles can be replaced with 1 cannon."],'1 Trooper','This model is equipped with: 2 rifles; sword.');$r=$repeated['loadoutRecipe'];
$s=selectLoadout($r,['w_3'=>2],1,1);ensureLoadout((builderLoadoutCounts($r,$s,1)['weaponCounts'][1]??0)===0,'Second weapon could not be replaced');
$unit=sampleLoadout(['For every 3 models in this unit, this unit can be equipped with 1 icon.']);$r=$unit['loadoutRecipe'];$g=$r['groups'][2];ensureLoadout(builderLoadoutCapacity($r,$g,3)===1&&builderLoadoutCapacity($r,$g,6)===2,'Unit equipment duplicated per model');
echo json_encode(compact('bundle','limits','all','duplicate','locked','negative','slots','repeated','unit'),JSON_THROW_ON_ERROR);
