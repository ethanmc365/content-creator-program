// DEUTSCH (DEUTSCHLAND).
//
// Keyed on the English source sentence - see lib/i18n.js for why there are no
// invented keys anywhere in this file, and why a string that is missing here
// simply renders in English rather than breaking a screen.
//
// THE DECISIONS THIS TRANSLATION MAKES, written down so the next contributor
// follows the same ones rather than inventing their own. A product that says
// "Challenge" on one screen and "Wettbewerb" on the next reads as two products.
//
//  * DU, NEVER SIE. This is a community of creators talking to each other, and
//    the English is already informal ("Nothing here yet", "Give it another
//    try"). `Sie` would make the same sentences sound like a bank, and every
//    other creator platform in Germany uses `du`.
//  * GERMANY, NOT AUSTRIA OR SWITZERLAND: "ß" is used (not "ss"), and the
//    vocabulary is the one a Berlin creator would use.
//  * ENGLISH WHERE GERMAN CREATORS ACTUALLY USE ENGLISH. This is the judgement
//    that makes or breaks a German product translation: nobody in this industry
//    says "Anhänger" for followers or "Rückmeldung" for feedback. So:
//      Challenge    -> Challenge       (universal in German creator culture;
//                                       "Wettbewerb" is a raffle at a fair)
//      Views        -> Views           (what TikTok and Instagram say in German)
//      Story        -> Story
//      Feed, Post, Reel, Upload, Link, Voucher -> kept where the German word
//                                       would be the odd one out on the screen
//    But NOT English where German is natural: "Einstellungen" not "Settings",
//    "Anmelden" not "Login", "Teilen" not "Sharen".
//  * THE GLOSSARY, fixed:
//      challenge      -> Challenge
//      market         -> Markt
//      room           -> Raum
//      DMs            -> Nachrichten
//      leaderboard    -> Rangliste
//      entry/submission -> Beitrag
//      prize          -> Preis
//      reward         -> Belohnung
//      streak         -> Serie
//      flight log     -> Flugbuch
//      settings       -> Einstellungen
//      creator        -> Creator        (the word the industry uses; "Ersteller"
//                                        is a file property, not a person)
//      voucher        -> Gutschein
//      badge          -> Abzeichen
//      referral       -> Empfehlung
//  * NOUNS ARE CAPITALISED, always, including inside a sentence. Getting this
//    wrong is the fastest way to look machine-translated.
//  * PLACEHOLDERS ARE NEVER TRANSLATED: {n}, {name}, {market} stay exactly as
//    they are or the string throws.

export default {
  '({n} filmed)': '({n} gefilmt)',
  '(none filmed)': '(keine gefilmt)',
  '(optional)': '(optional)',
  '(outside the prize places)': '(außerhalb der Preisränge)',
  '(you)': '(du)',
  '{d} days {h} hours {m} minutes remaining': 'noch {d} Tage {h} Stunden {m} Minuten',
  '{d} days {h} hours remaining': 'noch {d} Tage {h} Stunden',
  '{n} {unit} to the voucher': '{n} {unit} bis zum Gutschein',
  '{n} ahead of where a steady pace would be by today. {left} to go.': '{n} vor dem, was ein gleichmäßiges Tempo bis heute erreicht hätte. Noch {left}.',
  '{n} answers': '{n} Antworten',
  '{n} behind a steady pace for today. {left} to go.': '{n} hinter einem gleichmäßigen Tempo für heute. Noch {left}.',
  '{n} countries': '{n} Länder',
  '{n} countries and counting': '{n} Länder und es werden mehr',
  '{n} countries filmed in between us': '{n} Länder, in denen wir zusammen gefilmt haben',
  '{n} countries visited': '{n} Länder besucht',
  '{n} country and counting': '{n} Land und es werden mehr',
  '{n} creators from around the world': '{n} Creator aus aller Welt',
  '{n} creators match your filters': '{n} Creator passen zu deinen Filtern',
  '{n} creators reached it': '{n} Creator haben es geschafft',
  '{n} days left.': 'Noch {n} Tage.',
  '{n} earned so far': '{n} bisher verdient',
  '{n} entries in': '{n} Beiträge eingegangen',
  '{n} entries so far': '{n} Beiträge bisher',
  '{n} flights': '{n} Flüge',
  '{n} hours ago': 'vor {n} Stunden',
  '{n} joined in total': '{n} insgesamt beigetreten',
  '{n} logged flights have no aircraft recorded, so they are not on this wall.': 'Bei {n} erfassten Flügen ist kein Flugzeug hinterlegt, deshalb sind sie nicht auf dieser Wand.',
  '{n} min ago': 'vor {n} Min.',
  '{n} more points to go.': 'Noch {n} Punkte.',
  '{n} more to go.': 'Noch {n}.',
  '{n} more videos to go.': 'Noch {n} Videos.',
  '{n} of {total} done today': '{n} von {total} heute erledigt',
  '{n} of {total} freezes left this month. Streak freezes reset monthly.': '{n} von {total} Freezes diesen Monat übrig. Serien-Freezes werden monatlich zurückgesetzt.',
  '{n} of {total} left this month. A freeze is spent automatically on a day you miss, and they reset on the 1st.': '{n} von {total} diesen Monat übrig. Ein Freeze wird an einem verpassten Tag automatisch eingesetzt, und am 1. gibt es wieder neue.',
  '{n} of {total} streak freezes left this month': '{n} von {total} Serien-Freezes diesen Monat übrig',
  '{n} of {total} targets for {scope} are on track or already met.': '{n} von {total} Zielen für {scope} sind auf Kurs oder schon erreicht.',
  '{n} of 3 done. The rest expire at midnight.': '{n} von 3 erledigt. Der Rest verfällt um Mitternacht.',
  '{n} places left.': 'Noch {n} Plätze.',
  '{n} played today': '{n} haben heute gespielt',
  '{n} points in total, however many times you do it': '{n} Punkte insgesamt, egal wie oft du es machst',
  '{n} pts': '{n} Pkt.',
  '{n} rooms with new messages': '{n} Räume mit neuen Nachrichten',
  '{n} saved': '{n} gespeichert',
  '{n} thing still to fill in.': 'Noch {n} Angabe fehlt.',
  '{n} things still to fill in.': 'Noch {n} Angaben fehlen.',
  '{n} to win': '{n} zu gewinnen',
  '{n} videos': '{n} Videos',
  '{n} years old': '{n} Jahre alt',
  '{n}-week posting streak. What is this?': '{n} Wochen Post-Serie. Was ist das?',
  '{n}d left': 'noch {n} T.',
  '{name} flies most': '{name} fliegt am meisten',
  '{name} is heading to {country} too.': '{name} reist auch nach {country}.',
  '{name} is in {city}, same as you.': '{name} ist in {city}, genau wie du.',
  '{name} is in {place} now': '{name} ist jetzt in {place}',
  '{name} is off to {country}, and you have been.': '{name} reist nach {country}, und du warst schon dort.',
  '{name} leaves for {place} in {days} days': '{name} reist in {days} Tagen nach {place}',
  '{name}\'s local time': 'Ortszeit von {name}',
  '{name}’s portfolio': 'Portfolio von {name}',
  '{name}\'s travel map': 'Reisekarte von {name}',
  '{p}% through · a steady pace would be at {n} today': '{p}% vorbei · ein gleichmäßiges Tempo wäre heute bei {n}',
  '{r} of the {t} who joined were referred; the other {a} found the programme on their own.': '{r} der {t} Beigetretenen kamen über eine Empfehlung, die anderen {a} haben das Programm selbst gefunden.',
  '@handle': '@handle',
  '+ Add another entry': '+ Weiteren Beitrag hinzufügen',
  '+{n} more': '+{n} weitere',
  '+{n} more prizes': '+{n} weitere Preise',
  '+1 more prize': '+1 weiterer Preis',
  '1 answer': '1 Antwort',
  '1 country': '1 Land',
  '1 country visited': '1 Land besucht',
  '1 creator from around the world': '1 Creator aus aller Welt',
  '1 creator matches your filters': '1 Creator passt zu deinen Filtern',
  '1 creator reached it': '1 Creator hat es geschafft',
  '1 day left.': 'Noch 1 Tag.',
  '1 entry in': '1 Beitrag eingegangen',
  '1 entry so far': '1 Beitrag bisher',
  '1 flight': '1 Flug',
  '1 graphic': '1 Grafik',
  '1 hour ago': 'vor 1 Stunde',
  '1 more point to go.': 'Noch 1 Punkt.',
  '1 played today': '1 hat heute gespielt',
  '1 room with new messages': '1 Raum mit neuen Nachrichten',
  '1 saved': '1 gespeichert',
  '1 video': '1 Video',
  '10 phrases.': '10 Sätze.',
  '1st place wins {prize}': 'Platz 1 gewinnt {prize}',
  '30 minutes on Google Meet, agenda to follow': '30 Minuten auf Google Meet, Agenda folgt',
  '8 digits': '8 Ziffern',
  '8 or 11 characters': '8 oder 11 Zeichen',
  'A bit about you': 'Ein bisschen über dich',
  'A blank start': 'Leer anfangen',
  'A boarding pass barcode carries the day of the year but not the year, so check the date. Everything else came straight off the pass.': 'Ein Bordkarten-Barcode enthält den Tag des Jahres, aber nicht das Jahr – prüf also das Datum. Alles andere kommt direkt von der Bordkarte.',
  'A challenge is live': 'Eine Challenge läuft',
  'A challenge needs a start and an end date.': 'Eine Challenge braucht ein Start- und ein Enddatum.',
  'A creator who has left': 'Ein Creator, der nicht mehr dabei ist',
  'A custom KPI needs a name.': 'Ein eigener KPI braucht einen Namen.',
  'A few lines about you': 'Ein paar Zeilen über dich',
  'A flight coming up': 'Ein Flug steht an',
  'A freeze is holding today for you.': 'Ein Freeze hält den heutigen Tag für dich.',
  'A gentle reminder around 10am each day to play the daily puzzles.': 'Eine sanfte Erinnerung jeden Tag gegen 10 Uhr, die täglichen Rätsel zu spielen.',
  'A global brief. Enter from any market, anywhere in the world.': 'Ein weltweites Briefing. Mach mit aus jedem Markt, überall auf der Welt.',
  'A hidden talent or a fun fact about you': 'Ein verstecktes Talent oder ein lustiger Fakt über dich',
  'A link is the one thing this cannot be without.': 'Ohne Link geht es nicht.',
  'A lit flame means you have posted in the last 7 days.': 'Eine brennende Flamme heißt, du hast in den letzten 7 Tagen gepostet.',
  'A map of every flight you have logged': 'Eine Karte aller Flüge, die du erfasst hast',
  'A market is where the work happens: its own briefs, its own challenges, its own rooms. Everything social stays worldwide, so joining one never cuts you off from anybody.': 'In einem Markt passiert die Arbeit: eigene Briefings, eigene Challenges, eigene Räume. Alles Soziale bleibt weltweit, du verlierst also nie den Kontakt zu jemandem.',
  'A media kit you can send to a brand, share as a link, or download as a PDF. Every word on it is yours to change.': 'Ein Media-Kit, das du an eine Marke schicken, als Link teilen oder als PDF herunterladen kannst. Jedes Wort darin kannst du ändern.',
  'A message is how most things here actually start: a meet-up, a collab, a question about a brief.': 'Die meisten Dinge fangen hier mit einer Nachricht an: ein Treffen, eine Kollaboration, eine Frage zu einem Briefing.',
  'A nudge before a live challenge closes, so you can get your entries in.': 'Ein Hinweis, bevor eine laufende Challenge endet, damit du deine Beiträge noch einreichen kannst.',
  'A past admin': 'Ein früherer Admin',
  'A photo from the trip': 'Ein Foto von der Reise',
  'A photo just for your portfolio cover.': 'Ein Foto nur für dein Portfolio-Cover.',
  'A photo, or a screenshot from Apple Wallet': 'Ein Foto oder ein Screenshot aus Apple Wallet',
  'A pinned video stays first whatever the sort or the filter, and never retires.': 'Ein angepinntes Video bleibt immer vorne, egal wie sortiert oder gefiltert wird, und verschwindet nie.',
  'A point per video capped at ten, plus 5k / 10k / 50k view milestones.': 'Ein Punkt pro Video, maximal zehn, plus Meilensteine bei 5k / 10k / 50k Views.',
  'A project you\'re working on, a question for the community, something you\'re proud of.': 'Ein Projekt, an dem du arbeitest, eine Frage an die Community, etwas, worauf du stolz bist.',
  'A short walk through the platform, pointing at where everything is. Takes about two minutes and you can stop at any point.': 'Ein kurzer Rundgang durch die Plattform, der zeigt, wo alles ist. Dauert etwa zwei Minuten und du kannst jederzeit aufhören.',
  'A travel quote you live by…': 'Ein Reisezitat, nach dem du lebst …',
  'A video that passes several milestones scores every one of them.': 'Ein Video, das mehrere Meilensteine erreicht, bekommt Punkte für jeden davon.',
  'A wedding, a move, a layover you turned into a trip': 'Eine Hochzeit, ein Umzug, ein Zwischenstopp, aus dem du eine Reise gemacht hast',
  'About': 'Über',
}
