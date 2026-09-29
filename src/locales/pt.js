// PORTUGUÊS (PORTUGAL).
//
// Keyed on the English source sentence - see lib/i18n.js for why there are no
// invented keys anywhere in this file, and why a string that is missing here
// simply renders in English rather than breaking a screen.
//
// THE DECISIONS THIS TRANSLATION MAKES, written down so the next contributor
// follows the same ones rather than inventing their own.
//
//  * PORTUGAL, NOT BRAZIL, AND IT MATTERS ON EVERY SCREEN. Portugal is the
//    market that is running. The two are different enough that mixing them is
//    immediately obvious to a Portuguese reader:
//      "ecrã" not "tela", "telemóvel" not "celular", "utilizador" not
//      "usuário", "ficheiro" not "arquivo", "equipa" not "time",
//      "gerir" not "gerenciar", "registo" not "registro".
//  * TU, NEVER VOCÊ AS A FORM OF ADDRESS. European Portuguese uses `tu` between
//    people of the same standing, and this is a community of creators talking
//    to each other. The English is already informal.
//  * THE VERB FORM IS SECOND PERSON SINGULAR: "Partilha o teu link", not
//    "Partilhe o seu link". The second is Brazilian or formal, and it is the
//    single most common tell in a bad European Portuguese translation.
//  * "PARTILHAR", NEVER "COMPARTILHAR". This one word appears on dozens of
//    screens here and it is Brazilian in the second form.
//  * THE GLOSSARY, fixed:
//      challenge      -> desafio
//      market         -> mercado
//      room           -> sala
//      DMs            -> Mensagens
//      leaderboard    -> classificação
//      views          -> visualizações
//      entry/submission -> participação
//      prize          -> prémio        (with the accent; "prêmio" is Brazilian)
//      reward         -> recompensa
//      streak         -> sequência
//      flight log     -> registo de voos
//      settings       -> definições    ("configurações" is Brazilian)
//      creator        -> criador
//      voucher        -> voucher       (what the market itself says)
//      badge          -> distintivo
//      referral       -> indicação
//  * PLACEHOLDERS ARE NEVER TRANSLATED: {n}, {name}, {market} stay exactly as
//    they are or the string throws.

export default {
  '({n} filmed)': '({n} filmaram)',
  '(none filmed)': '(nenhum filmou)',
  '(optional)': '(opcional)',
  '(outside the prize places)': '(fora dos lugares premiados)',
  '(you)': '(tu)',
  '{d} days {h} hours {m} minutes remaining': 'faltam {d} dias {h} horas {m} minutos',
  '{d} days {h} hours remaining': 'faltam {d} dias {h} horas',
  '{n} {unit} to the voucher': '{n} {unit} até ao voucher',
  '{n} ahead of where a steady pace would be by today. {left} to go.': '{n} à frente do que um ritmo constante teria atingido até hoje. Faltam {left}.',
  '{n} answers': '{n} respostas',
  '{n} behind a steady pace for today. {left} to go.': '{n} atrás de um ritmo constante para hoje. Faltam {left}.',
  '{n} countries': '{n} países',
  '{n} countries and counting': '{n} países e a contar',
  '{n} countries filmed in between us': '{n} países filmados entre todos',
  '{n} countries visited': '{n} países visitados',
  '{n} country and counting': '{n} país e a contar',
  '{n} creators from around the world': '{n} criadores de todo o mundo',
  '{n} creators match your filters': '{n} criadores correspondem aos teus filtros',
  '{n} creators reached it': '{n} criadores chegaram lá',
  '{n} days left.': 'Faltam {n} dias.',
  '{n} earned so far': '{n} ganhos até agora',
  '{n} entries in': '{n} participações recebidas',
  '{n} entries so far': '{n} participações até agora',
  '{n} flights': '{n} voos',
  '{n} hours ago': 'há {n} horas',
  '{n} joined in total': '{n} entraram no total',
  '{n} logged flights have no aircraft recorded, so they are not on this wall.': '{n} voos registados não têm aeronave associada, por isso não aparecem nesta parede.',
  '{n} min ago': 'há {n} min',
  '{n} more points to go.': 'Faltam {n} pontos.',
  '{n} more to go.': 'Faltam {n}.',
  '{n} more videos to go.': 'Faltam {n} vídeos.',
  '{n} of {total} done today': '{n} de {total} feitos hoje',
  '{n} of {total} freezes left this month. Streak freezes reset monthly.': 'Restam {n} de {total} congelamentos este mês. Os congelamentos de sequência renovam todos os meses.',
  '{n} of {total} left this month. A freeze is spent automatically on a day you miss, and they reset on the 1st.': 'Restam {n} de {total} este mês. Um congelamento é usado automaticamente num dia que falhes, e renovam no dia 1.',
  '{n} of {total} streak freezes left this month': 'Restam {n} de {total} congelamentos de sequência este mês',
  '{n} of {total} targets for {scope} are on track or already met.': '{n} de {total} metas de {scope} estão no caminho certo ou já atingidas.',
  '{n} of 3 done. The rest expire at midnight.': '{n} de 3 feitos. O resto expira à meia-noite.',
  '{n} places left.': 'Faltam {n} lugares.',
  '{n} played today': '{n} jogaram hoje',
  '{n} points in total, however many times you do it': '{n} pontos no total, por mais vezes que o faças',
  '{n} pts': '{n} pts',
  '{n} rooms with new messages': '{n} salas com mensagens novas',
  '{n} saved': '{n} guardados',
  '{n} thing still to fill in.': 'Falta {n} campo por preencher.',
  '{n} things still to fill in.': 'Faltam {n} campos por preencher.',
  '{n} to win': '{n} para ganhar',
  '{n} videos': '{n} vídeos',
  '{n} years old': '{n} anos',
  '{n}-week posting streak. What is this?': 'Sequência de {n} semanas a publicar. O que é isto?',
  '{n}d left': 'faltam {n}d',
  '{name} flies most': '{name} é quem mais voa',
  '{name} is heading to {country} too.': '{name} também vai a {country}.',
  '{name} is in {city}, same as you.': '{name} está em {city}, tal como tu.',
  '{name} is in {place} now': '{name} está agora em {place}',
  '{name} is off to {country}, and you have been.': '{name} vai a {country}, e tu já lá estiveste.',
  '{name} leaves for {place} in {days} days': '{name} parte para {place} daqui a {days} dias',
  '{name}\'s local time': 'Hora local de {name}',
  '{name}’s portfolio': 'Portefólio de {name}',
  '{name}\'s travel map': 'Mapa de viagens de {name}',
  '{p}% through · a steady pace would be at {n} today': '{p}% decorrido · um ritmo constante estaria hoje em {n}',
  '{r} of the {t} who joined were referred; the other {a} found the programme on their own.': '{r} dos {t} que entraram vieram por indicação; os outros {a} encontraram o programa sozinhos.',
  '@handle': '@utilizador',
  '+ Add another entry': '+ Adicionar outra participação',
  '+{n} more': '+{n} mais',
  '+{n} more prizes': '+{n} prémios',
  '+1 more prize': '+1 prémio',
  '1 answer': '1 resposta',
  '1 country': '1 país',
  '1 country visited': '1 país visitado',
  '1 creator from around the world': '1 criador de todo o mundo',
  '1 creator matches your filters': '1 criador corresponde aos teus filtros',
  '1 creator reached it': '1 criador chegou lá',
  '1 day left.': 'Falta 1 dia.',
  '1 entry in': '1 participação recebida',
  '1 entry so far': '1 participação até agora',
  '1 flight': '1 voo',
  '1 graphic': '1 gráfico',
  '1 hour ago': 'há 1 hora',
  '1 more point to go.': 'Falta 1 ponto.',
  '1 played today': '1 jogou hoje',
  '1 room with new messages': '1 sala com mensagens novas',
  '1 saved': '1 guardado',
  '1 video': '1 vídeo',
  '10 phrases.': '10 frases.',
  '1st place wins {prize}': 'O 1.º lugar ganha {prize}',
  '30 minutes on Google Meet, agenda to follow': '30 minutos no Google Meet, agenda a seguir',
  '8 digits': '8 dígitos',
  '8 or 11 characters': '8 ou 11 caracteres',
  'A bit about you': 'Um pouco sobre ti',
  'A blank start': 'Começar em branco',
  'A boarding pass barcode carries the day of the year but not the year, so check the date. Everything else came straight off the pass.': 'O código de barras de um cartão de embarque traz o dia do ano mas não o ano, por isso confirma a data. Tudo o resto veio diretamente do cartão.',
  'A challenge is live': 'Há um desafio a decorrer',
  'A challenge needs a start and an end date.': 'Um desafio precisa de uma data de início e de fim.',
  'A creator who has left': 'Um criador que já saiu',
  'A custom KPI needs a name.': 'Um KPI personalizado precisa de um nome.',
  'A few lines about you': 'Umas linhas sobre ti',
  'A flight coming up': 'Um voo a aproximar-se',
  'A freeze is holding today for you.': 'Um congelamento está a segurar o dia de hoje por ti.',
  'A gentle reminder around 10am each day to play the daily puzzles.': 'Um lembrete suave por volta das 10h todos os dias para jogares os puzzles diários.',
  'A global brief. Enter from any market, anywhere in the world.': 'Um briefing global. Participa a partir de qualquer mercado, em qualquer parte do mundo.',
  'A hidden talent or a fun fact about you': 'Um talento escondido ou um facto curioso sobre ti',
  'A link is the one thing this cannot be without.': 'Sem link não dá.',
  'A lit flame means you have posted in the last 7 days.': 'Uma chama acesa significa que publicaste nos últimos 7 dias.',
  'A map of every flight you have logged': 'Um mapa de todos os voos que registaste',
  'A market is where the work happens: its own briefs, its own challenges, its own rooms. Everything social stays worldwide, so joining one never cuts you off from anybody.': 'É no mercado que o trabalho acontece: briefings próprios, desafios próprios, salas próprias. Tudo o que é social mantém-se mundial, por isso entrar num nunca te afasta de ninguém.',
  'A media kit you can send to a brand, share as a link, or download as a PDF. Every word on it is yours to change.': 'Um media kit que podes enviar a uma marca, partilhar como link ou descarregar em PDF. Cada palavra é tua para mudares.',
  'A message is how most things here actually start: a meet-up, a collab, a question about a brief.': 'É com uma mensagem que quase tudo começa por aqui: um encontro, uma colaboração, uma dúvida sobre um briefing.',
  'A nudge before a live challenge closes, so you can get your entries in.': 'Um aviso antes de um desafio a decorrer fechar, para conseguires enviar as tuas participações.',
  'A past admin': 'Um antigo administrador',
  'A photo from the trip': 'Uma foto da viagem',
  'A photo just for your portfolio cover.': 'Uma foto só para a capa do teu portefólio.',
  'A photo, or a screenshot from Apple Wallet': 'Uma foto, ou uma captura de ecrã da Apple Wallet',
  'A pinned video stays first whatever the sort or the filter, and never retires.': 'Um vídeo fixado fica sempre em primeiro, seja qual for a ordenação ou o filtro, e nunca sai.',
  'A point per video capped at ten, plus 5k / 10k / 50k view milestones.': 'Um ponto por vídeo até ao máximo de dez, mais marcos de 5k / 10k / 50k visualizações.',
  'A project you\'re working on, a question for the community, something you\'re proud of.': 'Um projeto em que estás a trabalhar, uma pergunta para a comunidade, algo de que te orgulhas.',
  'A short walk through the platform, pointing at where everything is. Takes about two minutes and you can stop at any point.': 'Uma visita rápida à plataforma, a mostrar onde está tudo. Demora cerca de dois minutos e podes parar quando quiseres.',
  'A travel quote you live by…': 'Uma frase sobre viagens que te define…',
  'A video that passes several milestones scores every one of them.': 'Um vídeo que atinge vários marcos pontua em todos eles.',
  'A wedding, a move, a layover you turned into a trip': 'Um casamento, uma mudança, uma escala que transformaste em viagem',
  'About': 'Sobre',
}
