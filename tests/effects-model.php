<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
if(isset($argv[1])){echo json_encode(builderRefreshEnhancementEffects(json_decode(file_get_contents($argv[1]),true,40,JSON_THROW_ON_ERROR)),JSON_THROW_ON_ERROR);exit;}
$cases=[
 'furious'=>'Adeptus Astartes Infantry unit only. This unit’s melee attacks have [Sustained Hits 1: non-Monster/Vehicle].',
 'precision'=>'HERETIC ASTARTES model (excluding Damned models) only. The bearer’s melee weapons have the [PRECISION] ability.',
 'multi'=>'Haemonculus model only. The bearer’s weapons have the [anti-beast 2+] and [anti-monster 4+] abilities.',
 'damage'=>'Autarch model only. Add 1 to the Damage characteristic of melee weapons equipped by the bearer, and those weapons have the [PRECISION] ability.',
 'ap'=>'HERETIC ASTARTES INFANTRY model only. Improve the Armour Penetration characteristic of the bearer’s melee weapons by 1, and the bearer’s melee weapons have the [PRECISION] ability.',
 'oc'=>'Asuryani model only. The bearer has an Objective Control characteristic of 5.',
 'stealth'=>'TECH-PRIEST model only. This unit has Stealth.',
 'scouts'=>'HARLEQUINS model only. This unit has Scouts 6"',
 'leading'=>'ADEPTUS ASTARTES model only. While the bearer is leading a unit, this unit’s melee attacks have [LETHAL HITS].',
 'situational'=>'DEATH GUARD model only. Ranged weapons equipped by models in the bearer’s unit have the [ignores cover] ability while targeting an Afflicted enemy unit.',
 'charge'=>'The bearer’s melee attacks have +1 A while this unit charged this turn.',
 'choice'=>'At the start of the battle, select one melee weapon equipped by the bearer; add 1 to the Attacks characteristic of that weapon.',
 'conditional_paragraph'=>'Once per battle, at the start of your Command phase, you can use this Enhancement. This unit’s melee attacks have [LETHAL HITS].',
 'combined_stats'=>'Death Guard model only. Add 1 to the Strength and Attacks characteristics of the bearers melee weapons, and the bearer’s melee weapons have the [DEVASTATING WOUNDS] ability.',
 'mixed'=>'Emperor’s Children model only. The bearer’s melee weapons have the [PRECISION] ability, and each time the bearer makes a melee attack that targets a CHARACTER unit, improve the Strength and Armour Penetration characteristics of that attack by 1.'
];
$out=[];foreach($cases as $id=>$text)$out[$id]=builderCompileEnhancementEffects(['id'=>$id,'name'=>$id,'description'=>$text],static fn($r)=>$r['description']);
foreach(['situational','charge','choice','conditional_paragraph'] as $id)if($out[$id])throw new RuntimeException('Conditional effect treated as permanent: '.$id);
if(count($out['combined_stats'])!==3)throw new RuntimeException('Combined stat boost lost');
if(count($out['furious'])!==1||$out['furious'][0]['value']!=='SUSTAINED HITS 1: NON-MONSTER/VEHICLE')throw new RuntimeException('Qualified upgrade lost');
if(count($out['mixed'])!==1||$out['mixed'][0]['field']!=='keywords')throw new RuntimeException('Conditional clause escaped');
if(count($out['damage'])!==2||count($out['ap'])!==2||count($out['multi'])!==2)throw new RuntimeException('Compound enhancement not compiled');
$raw=json_decode(file_get_contents(__DIR__.'/workbench-fixture.json'),true,40,JSON_THROW_ON_ERROR);$raw['featuresVersion']=3;
foreach($raw['units'] as &$u){$u['factionId']='sm';$u['sourceUrl']='https://example.test/source';}$raw['units'][0]['enhancements']=[['id'=>'furious','name'=>'Furious Assault','description'=>$cases['furious'],'upgrade'=>'true','cost'=>'10']];unset($u);
$pdo=new PDO('sqlite::memory:');builderSchema($pdo,'sqlite');$me=['id'=>'owner','admin'=>true];
$id=builderHandle($pdo,'builderImport',$me,['catalog'=>$raw])['catalogId'];
$payload=$pdo->query('SELECT payload FROM w40k_builder_catalogs')->fetchColumn();$old=json_decode($payload,true,40,JSON_THROW_ON_ERROR);$old['units'][0]['enhancements'][0]['effectsJson']='[]';$payload=json_encode($old,JSON_THROW_ON_ERROR);
$pdo->prepare('UPDATE w40k_builder_catalogs SET payload=?')->execute([$payload]);
$loaded=builderGetCatalog($pdo,'11',$id)['catalog'];if((json_decode($loaded['units'][0]['enhancements'][0]['effectsJson'],true)[0]['value']??null)!==$out['furious'][0]['value'])throw new RuntimeException('Old catalog effects not refreshed');
if($pdo->query('SELECT payload FROM w40k_builder_catalogs')->fetchColumn()!==$payload)throw new RuntimeException('Stored catalog rewritten');
echo json_encode($out,JSON_THROW_ON_ERROR);
