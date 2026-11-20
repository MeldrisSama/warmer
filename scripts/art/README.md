# Film Warp per gli accoppiamenti

`Cangiolone.com/assets/reveal/warp.mp4` è un asset statico muto: 640 × 360,
30 fps, 6 secondi. Non contiene nomi o numeri di giornata. Il browser sovrappone
testi DOM da `league-reveal.js` ai tempi 3,59 / 3,92 / 4,14 / 4,37 secondi.
Non occorre Python, ffmpeg o alcuna renderizzazione sul server.

`warp-portal.png` conserva il portale della preview approvata, convertito con
la skill pixel-art, preset SNES (32 colori). Per riesportare il solo film:

```text
python -B scripts/render-warp.py <pixel-art/scripts> <scratch> scripts/art/warp-portal.png Cangiolone.com/assets/reveal/warp.mp4
```

La cartella scratch deve esistere; Pillow e ffmpeg devono essere disponibili.
Il renderer usa `pixel_art_video.py` della skill pixel-art (MIT; effetti derivati
da Synero/pixel-art-studio), con scena Warp e seed 403000 della preview originale.
I file in questa cartella servono solo alla manutenzione e non vanno pubblicati.

## Bolter

`assets/reveal/bolter.mp4` riusa la preview v4, 640×360, 30 fps, 7 secondi,
senza i nomi di esempio. Aquila, rinculo, vampa e rotazione restano nel film.
Il browser disegna i testi su un canvas trasparente: stessa proiezione cilindrica,
posizione, rotazione e fotogrammi del renderer. La fascia dei nomi conserva il
testo completo leggibile anche con nomi lunghi e movimento ridotto.

```text
python -B scripts/render-bolter.py <pixel-art/scripts> <scratch> scripts/art/bolter-snes.png scripts/art/bolt-snes.png scripts/art/bolter-eagle.png Cangiolone.com/assets/reveal/bolter.mp4
```

I due riferimenti SNES sono già convertiti; l'Aquila è una maschera binaria.
Seed originale 4022. Il catalogo `revealAnimations` e `animationForFixture`
separano la scelta del film dall'ordine degli incontri. In questa versione
si usa il selettore; in futuro la scelta potrà essere casuale o legata a un player.
I riposi sono esclusi dalla playlist; restano indicati come testo e in calendario.

## Orki — Speed Freeks

`assets/reveal/orks.mp4` contiene la versione Speed Freeks approvata: 8 secondi,
240 fotogrammi a 30 fps, master 1024×576 da scena logica 256×144, palette SNES
di massimo 32 colori prima della compressione. Sostituisce l'officina Mek scartata.
Sprite originale in `speedfreaks-vehicle.png`, preparato con imagegen su riferimento
dell'utente; conversione e animazione con la skill pixel-art. Nessun nome nel video.

```text
python -B scripts/render-orks.py <pixel-art/scripts> <scratch> Cangiolone.com/assets/reveal/orks.mp4
```

Il renderer esporta anche `assets/reveal/orks.json`: i 240 quadrilateri della
lamiera, compresa la posizione sul buggy, i ribaltamenti verticali, il retro e
le scosse dell'impatto. Video e JSON vanno pubblicati insieme. `speedfreaks.js`
proietta i nomi dinamici sulla stessa superficie; `league-reveal.js` gestisce
gli incontri già salvati e scarta callback vecchi dopo seek/cambio coppia/chiusura.
Il movimento della lamiera inizia a 3,30 s, impatto a 4,40 s, accoppiamento
completo e prossimo incontro disponibili a 4,98 s. Nomi già presenti sulla
targa dal primo fotogramma, invisibili quando si vede il retro. Testi completi
anche nella fascia leggibile del dialog; movimento ridotto e file non disponibili
mostrano subito gli abbinamenti. Il server non renderizza nulla.
