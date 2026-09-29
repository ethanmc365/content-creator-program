// ROMÂNĂ (ROMÂNIA).
//
// Keyed on the English source sentence - see lib/i18n.js for why there are no
// invented keys anywhere in this file, and why a string that is missing here
// simply renders in English rather than breaking a screen.
//
// THE DECISIONS THIS TRANSLATION MAKES, written down so the next contributor
// follows the same ones rather than inventing their own.
//
//  * TU, NEVER DUMNEAVOASTRĂ. A community of creators talking to each other.
//    `dumneavoastră` is what a utility company writes to you.
//  * THE COMMA-BELOW DIACRITICS, ALWAYS: ș and ț (U+0219, U+021B), not ş and ţ
//    with cedillas. Both render, one is correct Romanian, and the wrong one is
//    a recognisable sign that nobody Romanian looked at the file.
//    Also ă, â, î wherever they belong - "adauga" instead of "adaugă" is the
//    other immediate tell.
//  * ENGLISH WHERE ROMANIAN CREATORS ACTUALLY USE ENGLISH, which in this
//    industry is a great deal:
//      challenge    -> challenge       (universal; "provocare" is what a
//                                       dictionary says and nobody in the
//                                       creator scene writes)
//      views        -> vizualizări     (this one IS used in Romanian)
//      story, reel, feed, link, post   -> kept
//  * THE GLOSSARY, fixed:
//      challenge      -> challenge
//      market         -> piață
//      room           -> cameră
//      DMs            -> Mesaje
//      leaderboard    -> clasament
//      entry/submission -> participare
//      prize          -> premiu
//      reward         -> recompensă
//      streak         -> serie
//      flight log     -> jurnal de zboruri
//      settings       -> setări
//      creator        -> creator
//      voucher        -> voucher
//      badge          -> insignă
//      referral       -> recomandare
//  * PLACEHOLDERS ARE NEVER TRANSLATED: {n}, {name}, {market} stay exactly as
//    they are or the string throws.

export default {
  '({n} filmed)': '({n} au filmat)',
  '(none filmed)': '(niciunul nu a filmat)',
  '(optional)': '(opțional)',
  '(outside the prize places)': '(în afara locurilor premiate)',
  '(you)': '(tu)',
  '{d} days {h} hours {m} minutes remaining': 'au mai rămas {d} zile {h} ore {m} minute',
  '{d} days {h} hours remaining': 'au mai rămas {d} zile {h} ore',
  '{n} {unit} to the voucher': '{n} {unit} până la voucher',
  '{n} ahead of where a steady pace would be by today. {left} to go.': '{n} peste ce ar fi atins un ritm constant până azi. Au mai rămas {left}.',
  '{n} answers': '{n} răspunsuri',
  '{n} behind a steady pace for today. {left} to go.': '{n} sub un ritm constant pentru azi. Au mai rămas {left}.',
  '{n} countries': '{n} țări',
  '{n} countries and counting': '{n} țări și tot crește',
  '{n} countries filmed in between us': '{n} țări filmate de noi toți',
  '{n} countries visited': '{n} țări vizitate',
  '{n} country and counting': '{n} țară și tot crește',
  '{n} creators from around the world': '{n} creatori din toată lumea',
  '{n} creators match your filters': '{n} creatori corespund filtrelor tale',
  '{n} creators reached it': '{n} creatori au reușit',
  '{n} days left.': 'Au mai rămas {n} zile.',
  '{n} earned so far': '{n} câștigați până acum',
  '{n} entries in': '{n} participări primite',
  '{n} entries so far': '{n} participări până acum',
  '{n} flights': '{n} zboruri',
  '{n} hours ago': 'acum {n} ore',
  '{n} joined in total': '{n} s-au alăturat în total',
  '{n} logged flights have no aircraft recorded, so they are not on this wall.': '{n} zboruri înregistrate nu au o aeronavă asociată, așa că nu apar pe acest perete.',
  '{n} min ago': 'acum {n} min',
  '{n} more points to go.': 'Au mai rămas {n} puncte.',
  '{n} more to go.': 'Au mai rămas {n}.',
  '{n} more videos to go.': 'Au mai rămas {n} videoclipuri.',
  '{n} of {total} done today': '{n} din {total} făcute azi',
  '{n} of {total} freezes left this month. Streak freezes reset monthly.': 'Au mai rămas {n} din {total} înghețări luna aceasta. Înghețările de serie se resetează lunar.',
  '{n} of {total} left this month. A freeze is spent automatically on a day you miss, and they reset on the 1st.': 'Au mai rămas {n} din {total} luna aceasta. O înghețare se consumă automat într-o zi pe care o ratezi, iar pe 1 primești altele.',
  '{n} of {total} streak freezes left this month': 'Au mai rămas {n} din {total} înghețări de serie luna aceasta',
  '{n} of {total} targets for {scope} are on track or already met.': '{n} din {total} obiective pentru {scope} sunt pe drumul cel bun sau deja atinse.',
  '{n} of 3 done. The rest expire at midnight.': '{n} din 3 făcute. Restul expiră la miezul nopții.',
  '{n} places left.': 'Au mai rămas {n} locuri.',
  '{n} played today': '{n} au jucat azi',
  '{n} points in total, however many times you do it': '{n} puncte în total, oricâte dăți ai face-o',
  '{n} pts': '{n} pct.',
  '{n} rooms with new messages': '{n} camere cu mesaje noi',
  '{n} saved': '{n} salvate',
  '{n} thing still to fill in.': 'Mai este {n} câmp de completat.',
  '{n} things still to fill in.': 'Mai sunt {n} câmpuri de completat.',
  '{n} to win': '{n} de câștigat',
  '{n} videos': '{n} videoclipuri',
  '{n} years old': '{n} ani',
  '{n}-week posting streak. What is this?': 'Serie de {n} săptămâni de postări. Ce înseamnă asta?',
  '{n}d left': 'mai sunt {n}z',
  '{name} flies most': '{name} zboară cel mai mult',
  '{name} is heading to {country} too.': '{name} merge și el în {country}.',
  '{name} is in {city}, same as you.': '{name} este în {city}, la fel ca tine.',
  '{name} is in {place} now': '{name} este acum în {place}',
  '{name} is off to {country}, and you have been.': '{name} pleacă în {country}, iar tu ai fost deja acolo.',
  '{name} leaves for {place} in {days} days': '{name} pleacă spre {place} peste {days} zile',
  '{name}\'s local time': 'Ora locală a lui {name}',
  '{name}’s portfolio': 'Portofoliul lui {name}',
  '{name}\'s travel map': 'Harta de călătorii a lui {name}',
  '{p}% through · a steady pace would be at {n} today': '{p}% parcurs · un ritm constant ar fi azi la {n}',
  '{r} of the {t} who joined were referred; the other {a} found the programme on their own.': '{r} din cei {t} care s-au alăturat au venit prin recomandare, ceilalți {a} au găsit programul singuri.',
  '@handle': '@nume',
  '+ Add another entry': '+ Adaugă altă participare',
  '+{n} more': '+{n} în plus',
  '+{n} more prizes': '+{n} premii în plus',
  '+1 more prize': '+1 premiu în plus',
  '1 answer': '1 răspuns',
  '1 country': '1 țară',
  '1 country visited': '1 țară vizitată',
  '1 creator from around the world': '1 creator din toată lumea',
  '1 creator matches your filters': '1 creator corespunde filtrelor tale',
  '1 creator reached it': '1 creator a reușit',
  '1 day left.': 'A mai rămas 1 zi.',
  '1 entry in': '1 participare primită',
  '1 entry so far': '1 participare până acum',
  '1 flight': '1 zbor',
  '1 graphic': '1 grafic',
  '1 hour ago': 'acum 1 oră',
  '1 more point to go.': 'A mai rămas 1 punct.',
  '1 played today': '1 a jucat azi',
  '1 room with new messages': '1 cameră cu mesaje noi',
  '1 saved': '1 salvat',
  '1 video': '1 videoclip',
  '10 phrases.': '10 expresii.',
  '1st place wins {prize}': 'Locul 1 câștigă {prize}',
  '30 minutes on Google Meet, agenda to follow': '30 de minute pe Google Meet, agenda urmează',
  '8 digits': '8 cifre',
  '8 or 11 characters': '8 sau 11 caractere',
  'A bit about you': 'Câteva cuvinte despre tine',
  'A blank start': 'Pornește de la zero',
  'A boarding pass barcode carries the day of the year but not the year, so check the date. Everything else came straight off the pass.': 'Codul de bare al unei cărți de îmbarcare conține ziua din an, dar nu și anul, așa că verifică data. Tot restul a venit direct de pe carte.',
  'A challenge is live': 'Un challenge este în desfășurare',
  'A challenge needs a start and an end date.': 'Un challenge are nevoie de o dată de început și una de final.',
  'A creator who has left': 'Un creator care a plecat',
  'A custom KPI needs a name.': 'Un KPI personalizat are nevoie de un nume.',
  'A few lines about you': 'Câteva rânduri despre tine',
  'A flight coming up': 'Urmează un zbor',
  'A freeze is holding today for you.': 'O înghețare îți ține ziua de azi.',
  'A gentle reminder around 10am each day to play the daily puzzles.': 'O reamintire blândă în fiecare zi pe la 10 dimineața, ca să joci puzzle-urile zilnice.',
  'A global brief. Enter from any market, anywhere in the world.': 'Un brief global. Participă din orice piață, de oriunde din lume.',
  'A hidden talent or a fun fact about you': 'Un talent ascuns sau un lucru amuzant despre tine',
  'A link is the one thing this cannot be without.': 'Fără link nu se poate.',
  'A lit flame means you have posted in the last 7 days.': 'O flacără aprinsă înseamnă că ai postat în ultimele 7 zile.',
  'A map of every flight you have logged': 'O hartă cu toate zborurile pe care le-ai înregistrat',
  'A market is where the work happens: its own briefs, its own challenges, its own rooms. Everything social stays worldwide, so joining one never cuts you off from anybody.': 'În piață se întâmplă munca: briefuri proprii, challenge-uri proprii, camere proprii. Tot ce ține de socializare rămâne global, așa că intrarea într-o piață nu te rupe niciodată de nimeni.',
  'A media kit you can send to a brand, share as a link, or download as a PDF. Every word on it is yours to change.': 'Un media kit pe care îl poți trimite unui brand, partaja ca link sau descărca în PDF. Fiecare cuvânt din el îți aparține și îl poți schimba.',
  'A message is how most things here actually start: a meet-up, a collab, a question about a brief.': 'Aici aproape totul începe cu un mesaj: o întâlnire, o colaborare, o întrebare despre un brief.',
  'A nudge before a live challenge closes, so you can get your entries in.': 'Un semnal înainte ca un challenge activ să se închidă, ca să apuci să îți trimiți participările.',
  'A past admin': 'Un fost administrator',
  'A photo from the trip': 'O fotografie din călătorie',
  'A photo just for your portfolio cover.': 'O fotografie doar pentru coperta portofoliului tău.',
  'A photo, or a screenshot from Apple Wallet': 'O fotografie sau o captură din Apple Wallet',
  'A pinned video stays first whatever the sort or the filter, and never retires.': 'Un videoclip fixat rămâne primul indiferent de sortare sau filtru și nu dispare niciodată.',
  'A point per video capped at ten, plus 5k / 10k / 50k view milestones.': 'Un punct pe videoclip, maximum zece, plus praguri la 5k / 10k / 50k vizualizări.',
  'A project you\'re working on, a question for the community, something you\'re proud of.': 'Un proiect la care lucrezi, o întrebare pentru comunitate, ceva cu care te mândrești.',
  'A short walk through the platform, pointing at where everything is. Takes about two minutes and you can stop at any point.': 'O scurtă plimbare prin platformă, care îți arată unde se află fiecare lucru. Durează cam două minute și te poți opri oricând.',
  'A travel quote you live by…': 'Un citat despre călătorii după care te ghidezi…',
  'A video that passes several milestones scores every one of them.': 'Un videoclip care trece mai multe praguri punctează la fiecare dintre ele.',
  'A wedding, a move, a layover you turned into a trip': 'O nuntă, o mutare, o escală pe care ai transformat-o în călătorie',
  'About': 'Despre',
}
