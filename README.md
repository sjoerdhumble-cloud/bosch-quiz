# Brouwerij Bosch quiz

Telefoonquiz voor het vrijwilligersuitje van 16 oktober 2026. Deelnemers spelen op hun eigen telefoon, alleen of met z'n tweeën. De quizmaster bestuurt alles vanaf de eigen telefoon.

- **Spelers:** `index.html` (via QR-code of link)
- **Quizmaster:** `host.html` (deze link niet delen)

## Eenmalig instellen

1. **Firebase:** maak een gratis project op [console.firebase.google.com](https://console.firebase.google.com), zet *Realtime Database* aan (Europa, testmodus) en registreer een web-app. Plak de config in [`js/firebase-config.js`](js/firebase-config.js). Plak de regels uit [`database.rules.json`](database.rules.json) onder *Realtime Database > Regels*, zodat de database na 30 dagen niet dichtgaat.
2. **Hosting:** in deze repository *Settings > Pages*, bron *Deploy from a branch*, branch `main`, map `/ (root)`. De quiz staat dan op `https://sjoerdhumble-cloud.github.io/bosch-quiz/`.

## Vragen invoeren

Maak een Google Sheet met deze kolommen in de eerste regel (zie [`voorbeeld-vragen.csv`](voorbeeld-vragen.csv); importeer die in Sheets als startpunt):

| kolom | verplicht | uitleg |
|---|---|---|
| ronde | ja | 1, 2, 3 … |
| rondenaam | nee | op de eerste regel van een ronde, bijv. "Bierkennis" |
| blok | nee | vragen in dezelfde ronde met hetzelfde blok-label komen samen op één scherm |
| type | nee | `mc` of `open`; leeg = `mc` als er opties zijn |
| vraag | ja | de vraag |
| opties | bij mc | scheiden met `\|`, bijv. `Gist\|Hop\|Mout` |
| antwoord | ja | bij mc de letter (A, B …) of de tekst van de optie |
| alternatieven | nee | ook goed, scheiden met `\|` |
| punten | nee | standaard 10 |
| seconden | nee | standaard 60; bij een blok worden ze opgeteld |
| foto | nee | link naar een afbeelding; Google Drive-deellinks werken als het bestand gedeeld is met "iedereen met de link" |

Deel de Sheet als *Iedereen met de link kan bekijken*, plak de link op de quizmasterpagina onder *Vragen en instellingen* en klik *Vragen laden uit Sheet*. Lukt dat niet, gebruik dan *Bestand > Delen > Publiceren op internet* en plak die link, of download de Sheet als CSV en kies dat bestand.

## Spelregels in de app

- Goed antwoord = de punten van de vraag, plus een snelheidsbonus tot 50% (instelbaar) die afneemt naarmate de tijd loopt.
- Ingevulde maar niet verstuurde antwoorden tellen mee, zonder bonus.
- Open vragen: kleine spelfouten worden automatisch goed gerekend. Twijfelgevallen staan bovenaan bij de quizmaster; één tik rekent ze goed of fout.
- Valt het bereik weg, dan wordt het antwoord verstuurd zodra er weer verbinding is. Het telt mee als het binnen de tijd is ingevuld.
- Na elke ronde ziet iedereen de top 10 plus de eigen plek; aan het eind een podium.

## Testen zonder Firebase

```
npm run serve
```

Open `http://localhost:8080/host.html?local` en in andere tabbladen `http://localhost:8080/index.html?local`. Alle tabbladen delen dan de data in de browser. `npm test` draait de unit-tests; `npm run e2e` speelt een hele quiz na met drie teams (Playwright nodig).
