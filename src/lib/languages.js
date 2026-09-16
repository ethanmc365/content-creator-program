// "Say Hello": a phrase in another language, guess which language it is.
//
// WHY A PHRASE AND NOT A FLAG.
//
// A language is not a country and the game should not teach that it is. Spanish
// is not Spain, Portuguese is not Portugal, and Arabic is not any single flag on
// a map. So a question shows WORDS, the choices are LANGUAGES, and the country
// only ever appears afterwards as "where it is spoken" - a fact about the
// language, not its identity.
//
// ACCURACY, AND WHAT IS DELIBERATELY NOT HERE
//
// Every phrase below is a common, everyday greeting or courtesy in its standard
// written form, with the diacritics it is actually written with. Scripts that
// are not Latin are given in their own script - Greek, Cyrillic, Japanese,
// Korean, Thai, Arabic, Hebrew, Hindi - because transliterating them would both
// give the answer away and misrepresent the language.
//
// A romanisation is provided for those so a reader can say it out loud, shown
// only AFTER the answer, never as part of the question.
//
// Languages with fewer than a handful of phrases I could write with confidence
// are not included at all. A quiz that is confidently wrong about somebody's
// language is worse than a quiz with fewer languages in it.
//
// `region` is used only to let the game offer a smaller round; it is the region
// the language is most associated with for a traveller, not a claim about where
// its speakers live.

export const LANGUAGES = [
  {
    code: 'es', name: 'Spanish', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'Spain and most of Latin America',
    phrases: [
      { text: 'Hola', meaning: 'Hello', level: 'easy' },
      { text: 'Buenos días', meaning: 'Good morning', level: 'easy' },
      { text: 'Gracias', meaning: 'Thank you', level: 'easy' },
      { text: 'Por favor', meaning: 'Please', level: 'medium' },
      { text: '¿Cómo estás?', meaning: 'How are you?', level: 'medium' },
      { text: 'Hasta luego', meaning: 'See you later', level: 'medium' },
      { text: 'Lo siento', meaning: 'I am sorry', level: 'medium' },
      { text: '¿Cuánto cuesta?', meaning: 'How much does it cost?', level: 'hard' },
      { text: 'Buenas noches', meaning: 'Good night', level: 'medium' },
      { text: 'Salud', meaning: 'Cheers', level: 'medium' },
      { text: 'Buenas tardes', meaning: 'Good afternoon', level: 'easy' },
      { text: '¿Dónde está el baño?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'No entiendo', meaning: 'I do not understand', level: 'medium' },
      { text: '¿Hablas inglés?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'La cuenta, por favor', meaning: 'The bill, please', level: 'medium' },
      { text: 'Me llamo…', meaning: 'My name is…', level: 'medium' },
      { text: 'Mucho gusto', meaning: 'Nice to meet you', level: 'medium' },
      { text: '¿Qué hora es?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Hasta mañana', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Buen viaje', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Está delicioso', meaning: 'It is delicious', level: 'medium' },
      { text: 'Tengo hambre', meaning: 'I am hungry', level: 'hard' },
      { text: 'No hay problema', meaning: 'No problem', level: 'hard' },
      { text: '¡Feliz cumpleaños!', meaning: 'Happy birthday!', level: 'medium' },
    ],
  },
  {
    code: 'pt', name: 'Portuguese', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'Portugal, Brazil, Angola and Mozambique',
    phrases: [
      { text: 'Olá', meaning: 'Hello', level: 'easy' },
      { text: 'Bom dia', meaning: 'Good morning', level: 'easy' },
      { text: 'Obrigado', meaning: 'Thank you (said by a man)', level: 'easy' },
      { text: 'Por favor', meaning: 'Please', level: 'medium' },
      { text: 'Tudo bem?', meaning: 'All good? / How are you?', level: 'medium' },
      { text: 'Até logo', meaning: 'See you soon', level: 'medium' },
      { text: 'Desculpe', meaning: 'Sorry', level: 'medium' },
      { text: 'Quanto custa?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Boa noite', meaning: 'Good night', level: 'medium' },
      { text: 'Saúde', meaning: 'Cheers', level: 'medium' },
      { text: 'Boa tarde', meaning: 'Good afternoon', level: 'easy' },
      { text: 'Onde fica a casa de banho?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Não percebo', meaning: 'I do not understand', level: 'medium' },
      { text: 'Fala inglês?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'A conta, por favor', meaning: 'The bill, please', level: 'medium' },
      { text: 'Chamo-me…', meaning: 'My name is…', level: 'medium' },
      { text: 'Muito prazer', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'Que horas são?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Até amanhã', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Boa viagem', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Está delicioso', meaning: 'It is delicious', level: 'hard' },
      { text: 'Tenho fome', meaning: 'I am hungry', level: 'hard' },
      { text: 'Não faz mal', meaning: 'Never mind / no harm done', level: 'hard' },
      { text: 'Parabéns!', meaning: 'Congratulations!', level: 'medium' },
      { text: 'Com licença', meaning: 'Excuse me', level: 'medium' },
    ],
  },
  {
    code: 'fr', name: 'French', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'France, Belgium, Canada and much of West Africa',
    phrases: [
      { text: 'Bonjour', meaning: 'Hello / Good day', level: 'easy' },
      { text: 'Merci beaucoup', meaning: 'Thank you very much', level: 'easy' },
      { text: "S'il vous plaît", meaning: 'Please', level: 'medium' },
      { text: 'Ça va ?', meaning: 'How are you?', level: 'medium' },
      { text: 'Au revoir', meaning: 'Goodbye', level: 'medium' },
      { text: 'Excusez-moi', meaning: 'Excuse me', level: 'medium' },
      { text: "C'est combien ?", meaning: 'How much is it?', level: 'hard' },
      { text: 'Bonne nuit', meaning: 'Good night', level: 'medium' },
      { text: 'Santé', meaning: 'Cheers', level: 'medium' },
      { text: 'De rien', meaning: "You're welcome", level: 'medium' },
      { text: 'Bonsoir', meaning: 'Good evening', level: 'easy' },
      { text: 'Où sont les toilettes ?', meaning: 'Where are the toilets?', level: 'medium' },
      { text: 'Je ne comprends pas', meaning: 'I do not understand', level: 'medium' },
      { text: 'Parlez-vous anglais ?', meaning: 'Do you speak English?', level: 'medium' },
      { text: "L'addition, s'il vous plaît", meaning: 'The bill, please', level: 'medium' },
      { text: "Je m'appelle…", meaning: 'My name is…', level: 'medium' },
      { text: 'Enchanté', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Quelle heure est-il ?', meaning: 'What time is it?', level: 'medium' },
      { text: 'À demain', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Bon voyage', meaning: 'Have a good trip', level: 'easy' },
      { text: "C'est délicieux", meaning: 'It is delicious', level: 'medium' },
      { text: "J'ai faim", meaning: 'I am hungry', level: 'hard' },
      { text: 'Pas de problème', meaning: 'No problem', level: 'hard' },
      { text: 'Bon appétit', meaning: 'Enjoy your meal', level: 'easy' },
    ],
  },
  {
    code: 'it', name: 'Italian', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'Italy, San Marino and parts of Switzerland',
    phrases: [
      { text: 'Ciao', meaning: 'Hi / Bye', level: 'easy' },
      { text: 'Buongiorno', meaning: 'Good morning', level: 'easy' },
      { text: 'Grazie mille', meaning: 'Thanks a lot', level: 'easy' },
      { text: 'Per favore', meaning: 'Please', level: 'medium' },
      { text: 'Come stai?', meaning: 'How are you?', level: 'medium' },
      { text: 'Arrivederci', meaning: 'Goodbye', level: 'medium' },
      { text: 'Mi scusi', meaning: 'Excuse me', level: 'medium' },
      { text: 'Quanto costa?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Buonanotte', meaning: 'Good night', level: 'medium' },
      { text: 'Salute', meaning: 'Cheers', level: 'medium' },
      { text: 'Buonasera', meaning: 'Good evening', level: 'easy' },
      { text: "Dov'è il bagno?", meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Non capisco', meaning: 'I do not understand', level: 'medium' },
      { text: 'Parla inglese?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Il conto, per favore', meaning: 'The bill, please', level: 'medium' },
      { text: 'Mi chiamo…', meaning: 'My name is…', level: 'medium' },
      { text: 'Piacere', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Che ore sono?', meaning: 'What time is it?', level: 'medium' },
      { text: 'A domani', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Buon viaggio', meaning: 'Have a good trip', level: 'medium' },
      { text: 'È squisito', meaning: 'It is delicious', level: 'hard' },
      { text: 'Ho fame', meaning: 'I am hungry', level: 'hard' },
      { text: 'Nessun problema', meaning: 'No problem', level: 'hard' },
      { text: 'Buon appetito', meaning: 'Enjoy your meal', level: 'easy' },
      { text: 'Andiamo!', meaning: 'Let us go!', level: 'medium' },
    ],
  },
  {
    code: 'de', name: 'German', region: 'Europe', family: 'Germanic', script: 'Latin',
    where: 'Germany, Austria and Switzerland',
    phrases: [
      { text: 'Hallo', meaning: 'Hello', level: 'easy' },
      { text: 'Guten Morgen', meaning: 'Good morning', level: 'easy' },
      { text: 'Danke schön', meaning: 'Thank you kindly', level: 'easy' },
      { text: 'Bitte', meaning: 'Please / You are welcome', level: 'medium' },
      { text: 'Wie geht es dir?', meaning: 'How are you?', level: 'medium' },
      { text: 'Auf Wiedersehen', meaning: 'Goodbye', level: 'medium' },
      { text: 'Entschuldigung', meaning: 'Excuse me / Sorry', level: 'medium' },
      { text: 'Was kostet das?', meaning: 'What does that cost?', level: 'hard' },
      { text: 'Gute Nacht', meaning: 'Good night', level: 'medium' },
      { text: 'Prost', meaning: 'Cheers', level: 'medium' },
      { text: 'Guten Abend', meaning: 'Good evening', level: 'easy' },
      { text: 'Wo ist die Toilette?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Ich verstehe nicht', meaning: 'I do not understand', level: 'medium' },
      { text: 'Sprechen Sie Englisch?', meaning: 'Do you speak English?', level: 'easy' },
      { text: 'Die Rechnung, bitte', meaning: 'The bill, please', level: 'medium' },
      { text: 'Ich heiße…', meaning: 'My name is…', level: 'medium' },
      { text: 'Freut mich', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Wie spät ist es?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Bis morgen', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Gute Reise', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Das schmeckt gut', meaning: 'That tastes good', level: 'medium' },
      { text: 'Ich habe Hunger', meaning: 'I am hungry', level: 'hard' },
      { text: 'Kein Problem', meaning: 'No problem', level: 'medium' },
      { text: 'Alles Gute!', meaning: 'All the best!', level: 'medium' },
      { text: 'Tschüss', meaning: 'Bye', level: 'easy' },
    ],
  },
  {
    code: 'nl', name: 'Dutch', region: 'Europe', family: 'Germanic', script: 'Latin',
    where: 'the Netherlands, Belgium and Suriname',
    phrases: [
      { text: 'Hallo', meaning: 'Hello', level: 'easy' },
      { text: 'Goedemorgen', meaning: 'Good morning', level: 'easy' },
      { text: 'Dank je wel', meaning: 'Thank you', level: 'easy' },
      { text: 'Alsjeblieft', meaning: 'Please / Here you go', level: 'medium' },
      { text: 'Hoe gaat het?', meaning: 'How is it going?', level: 'medium' },
      { text: 'Tot ziens', meaning: 'See you', level: 'medium' },
      { text: 'Sorry hoor', meaning: 'Sorry', level: 'medium' },
      { text: 'Wat kost het?', meaning: 'What does it cost?', level: 'hard' },
      { text: 'Welterusten', meaning: 'Sleep well', level: 'medium' },
      { text: 'Proost', meaning: 'Cheers', level: 'medium' },
      { text: 'Goedenavond', meaning: 'Good evening', level: 'medium' },
      { text: 'Waar is het toilet?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Ik begrijp het niet', meaning: 'I do not understand', level: 'medium' },
      { text: 'Spreekt u Engels?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'De rekening, alstublieft', meaning: 'The bill, please', level: 'medium' },
      { text: 'Ik heet…', meaning: 'My name is…', level: 'medium' },
      { text: 'Aangenaam', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Hoe laat is het?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Tot morgen', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Goede reis', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Het is lekker', meaning: 'It is tasty', level: 'medium' },
      { text: 'Ik heb honger', meaning: 'I am hungry', level: 'hard' },
      { text: 'Geen probleem', meaning: 'No problem', level: 'hard' },
      { text: 'Doei', meaning: 'Bye', level: 'hard' },
      { text: 'Gefeliciteerd!', meaning: 'Congratulations!', level: 'medium' },
    ],
  },
  {
    code: 'sv', name: 'Swedish', region: 'Europe', family: 'Germanic', script: 'Latin',
    where: 'Sweden and parts of Finland',
    phrases: [
      { text: 'Hej', meaning: 'Hello', level: 'easy' },
      { text: 'God morgon', meaning: 'Good morning', level: 'easy' },
      { text: 'Tack så mycket', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Hur mår du?', meaning: 'How are you?', level: 'medium' },
      { text: 'Hej då', meaning: 'Bye', level: 'medium' },
      { text: 'Förlåt', meaning: 'Sorry', level: 'medium' },
      { text: 'Vad kostar det?', meaning: 'What does it cost?', level: 'hard' },
      { text: 'God natt', meaning: 'Good night', level: 'medium' },
      { text: 'Skål', meaning: 'Cheers', level: 'medium' },
      { text: 'Varsågod', meaning: 'You are welcome', level: 'medium' },
      { text: 'God kväll', meaning: 'Good evening', level: 'medium' },
      { text: 'Var är toaletten?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Jag förstår inte', meaning: 'I do not understand', level: 'medium' },
      { text: 'Talar du engelska?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Notan, tack', meaning: 'The bill, please', level: 'hard' },
      { text: 'Jag heter…', meaning: 'My name is…', level: 'medium' },
      { text: 'Trevligt att träffas', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'Vad är klockan?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Vi ses i morgon', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Trevlig resa', meaning: 'Have a good trip', level: 'hard' },
      { text: 'Det smakar gott', meaning: 'It tastes good', level: 'medium' },
      { text: 'Jag är hungrig', meaning: 'I am hungry', level: 'hard' },
      { text: 'Ingen fara', meaning: 'No worries', level: 'hard' },
      { text: 'Grattis!', meaning: 'Congratulations!', level: 'medium' },
    ],
  },
  {
    code: 'no', name: 'Norwegian', region: 'Europe', family: 'Germanic', script: 'Latin',
    where: 'Norway',
    phrases: [
      { text: 'Hei', meaning: 'Hello', level: 'easy' },
      { text: 'God morgen', meaning: 'Good morning', level: 'easy' },
      { text: 'Tusen takk', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Hvordan går det?', meaning: 'How is it going?', level: 'medium' },
      { text: 'Ha det bra', meaning: 'Goodbye', level: 'medium' },
      { text: 'Unnskyld', meaning: 'Excuse me', level: 'medium' },
      { text: 'Hva koster det?', meaning: 'What does it cost?', level: 'hard' },
      { text: 'God natt', meaning: 'Good night', level: 'medium' },
      { text: 'Skål', meaning: 'Cheers', level: 'medium' },
      { text: 'Vær så snill', meaning: 'Please', level: 'medium' },
      { text: 'God kveld', meaning: 'Good evening', level: 'medium' },
      { text: 'Hvor er toalettet?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Jeg forstår ikke', meaning: 'I do not understand', level: 'medium' },
      { text: 'Snakker du engelsk?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Regningen, takk', meaning: 'The bill, please', level: 'hard' },
      { text: 'Jeg heter…', meaning: 'My name is…', level: 'medium' },
      { text: 'Hyggelig å møte deg', meaning: 'Nice to meet you', level: 'hard' },
      { text: 'Hva er klokka?', meaning: 'What time is it?', level: 'hard' },
      { text: 'Vi ses i morgen', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'God tur', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Det smaker godt', meaning: 'It tastes good', level: 'hard' },
      { text: 'Jeg er sulten', meaning: 'I am hungry', level: 'hard' },
      { text: 'Ingen problem', meaning: 'No problem', level: 'hard' },
      { text: 'Gratulerer!', meaning: 'Congratulations!', level: 'medium' },
    ],
  },
  {
    code: 'da', name: 'Danish', region: 'Europe', family: 'Germanic', script: 'Latin',
    where: 'Denmark, Greenland and the Faroe Islands',
    phrases: [
      { text: 'Hej med dig', meaning: 'Hello there', level: 'easy' },
      { text: 'Godmorgen', meaning: 'Good morning', level: 'easy' },
      { text: 'Mange tak', meaning: 'Many thanks', level: 'medium' },
      { text: 'Hvordan går det?', meaning: 'How is it going?', level: 'medium' },
      { text: 'Farvel', meaning: 'Goodbye', level: 'medium' },
      { text: 'Undskyld', meaning: 'Excuse me', level: 'medium' },
      { text: 'Hvad koster det?', meaning: 'What does it cost?', level: 'hard' },
      { text: 'Godnat', meaning: 'Good night', level: 'medium' },
      { text: 'Skål', meaning: 'Cheers', level: 'medium' },
      { text: 'Værsgo', meaning: 'Here you go', level: 'medium' },
      { text: 'God aften', meaning: 'Good evening', level: 'medium' },
      { text: 'Hvor er toilettet?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Jeg forstår ikke', meaning: 'I do not understand', level: 'hard' },
      { text: 'Taler du engelsk?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Regningen, tak', meaning: 'The bill, please', level: 'hard' },
      { text: 'Jeg hedder…', meaning: 'My name is…', level: 'medium' },
      { text: 'Hyggeligt at møde dig', meaning: 'Nice to meet you', level: 'hard' },
      { text: 'Hvad er klokken?', meaning: 'What time is it?', level: 'hard' },
      { text: 'Vi ses i morgen', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'God rejse', meaning: 'Have a good trip', level: 'hard' },
      { text: 'Det smager godt', meaning: 'It tastes good', level: 'hard' },
      { text: 'Jeg er sulten', meaning: 'I am hungry', level: 'hard' },
      { text: 'Tillykke!', meaning: 'Congratulations!', level: 'medium' },
      { text: 'Hej hej', meaning: 'Bye bye', level: 'medium' },
    ],
  },
  {
    code: 'fi', name: 'Finnish', region: 'Europe', family: 'Finnic', script: 'Latin',
    where: 'Finland',
    phrases: [
      { text: 'Moi', meaning: 'Hi', level: 'easy' },
      { text: 'Hyvää huomenta', meaning: 'Good morning', level: 'easy' },
      { text: 'Kiitos paljon', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Mitä kuuluu?', meaning: 'How are you?', level: 'medium' },
      { text: 'Näkemiin', meaning: 'Goodbye', level: 'medium' },
      { text: 'Anteeksi', meaning: 'Excuse me / Sorry', level: 'medium' },
      { text: 'Paljonko se maksaa?', meaning: 'How much does it cost?', level: 'hard' },
      { text: 'Hyvää yötä', meaning: 'Good night', level: 'medium' },
      { text: 'Kippis', meaning: 'Cheers', level: 'medium' },
      { text: 'Ole hyvä', meaning: 'Please / Here you go', level: 'medium' },
      { text: 'Hyvää iltaa', meaning: 'Good evening', level: 'medium' },
      { text: 'Missä on vessa?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'En ymmärrä', meaning: 'I do not understand', level: 'medium' },
      { text: 'Puhutko englantia?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Lasku, kiitos', meaning: 'The bill, please', level: 'medium' },
      { text: 'Nimeni on…', meaning: 'My name is…', level: 'medium' },
      { text: 'Hauska tavata', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'Paljonko kello on?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Nähdään huomenna', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Hyvää matkaa', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Tämä on hyvää', meaning: 'This is good', level: 'hard' },
      { text: 'Minulla on nälkä', meaning: 'I am hungry', level: 'medium' },
      { text: 'Ei hätää', meaning: 'No worries', level: 'hard' },
      { text: 'Onnea!', meaning: 'Good luck / congratulations!', level: 'medium' },
    ],
  },
  {
    code: 'pl', name: 'Polish', region: 'Europe', family: 'Slavic', script: 'Latin',
    where: 'Poland',
    phrases: [
      { text: 'Cześć', meaning: 'Hi', level: 'easy' },
      { text: 'Dzień dobry', meaning: 'Good day', level: 'medium' },
      { text: 'Dziękuję bardzo', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Proszę', meaning: 'Please', level: 'medium' },
      { text: 'Jak się masz?', meaning: 'How are you?', level: 'medium' },
      { text: 'Do widzenia', meaning: 'Goodbye', level: 'medium' },
      { text: 'Przepraszam', meaning: 'Excuse me / Sorry', level: 'medium' },
      { text: 'Ile to kosztuje?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Dobranoc', meaning: 'Good night', level: 'medium' },
      { text: 'Na zdrowie', meaning: 'Cheers / Bless you', level: 'medium' },
      { text: 'Dobry wieczór', meaning: 'Good evening', level: 'medium' },
      { text: 'Gdzie jest toaleta?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Nie rozumiem', meaning: 'I do not understand', level: 'medium' },
      { text: 'Czy mówisz po angielsku?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Rachunek, proszę', meaning: 'The bill, please', level: 'medium' },
      { text: 'Nazywam się…', meaning: 'My name is…', level: 'medium' },
      { text: 'Miło mi', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Która godzina?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Do jutra', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Szerokiej drogi', meaning: 'Have a good journey', level: 'hard' },
      { text: 'Jest pyszne', meaning: 'It is delicious', level: 'medium' },
      { text: 'Jestem głodny', meaning: 'I am hungry', level: 'medium' },
      { text: 'Nie ma sprawy', meaning: 'No problem', level: 'hard' },
      { text: 'Wszystkiego najlepszego!', meaning: 'All the best!', level: 'medium' },
    ],
  },
  {
    code: 'cs', name: 'Czech', region: 'Europe', family: 'Slavic', script: 'Latin',
    where: 'Czechia',
    phrases: [
      { text: 'Ahoj', meaning: 'Hi / Bye', level: 'easy' },
      { text: 'Dobrý den', meaning: 'Good day', level: 'medium' },
      { text: 'Děkuji mnohokrát', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Prosím', meaning: 'Please', level: 'medium' },
      { text: 'Jak se máš?', meaning: 'How are you?', level: 'medium' },
      { text: 'Na shledanou', meaning: 'Goodbye', level: 'medium' },
      { text: 'Promiňte', meaning: 'Excuse me', level: 'medium' },
      { text: 'Kolik to stojí?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Dobrou noc', meaning: 'Good night', level: 'medium' },
      { text: 'Na zdraví', meaning: 'Cheers', level: 'medium' },
      { text: 'Dobrý večer', meaning: 'Good evening', level: 'medium' },
      { text: 'Kde je záchod?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Nerozumím', meaning: 'I do not understand', level: 'medium' },
      { text: 'Mluvíte anglicky?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Účet, prosím', meaning: 'The bill, please', level: 'medium' },
      { text: 'Jmenuji se…', meaning: 'My name is…', level: 'medium' },
      { text: 'Těší mě', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Kolik je hodin?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Uvidíme se zítra', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'Šťastnou cestu', meaning: 'Have a good trip', level: 'hard' },
      { text: 'Je to výborné', meaning: 'It is excellent', level: 'medium' },
      { text: 'Mám hlad', meaning: 'I am hungry', level: 'hard' },
      { text: 'Žádný problém', meaning: 'No problem', level: 'hard' },
      { text: 'Všechno nejlepší!', meaning: 'All the best!', level: 'medium' },
    ],
  },
  {
    code: 'ro', name: 'Romanian', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'Romania and Moldova',
    phrases: [
      { text: 'Bună', meaning: 'Hi', level: 'easy' },
      { text: 'Bună dimineața', meaning: 'Good morning', level: 'easy' },
      { text: 'Mulțumesc mult', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Te rog', meaning: 'Please', level: 'medium' },
      { text: 'Ce mai faci?', meaning: 'How are you?', level: 'medium' },
      { text: 'La revedere', meaning: 'Goodbye', level: 'medium' },
      { text: 'Scuze', meaning: 'Sorry', level: 'medium' },
      { text: 'Cât costă?', meaning: 'How much does it cost?', level: 'hard' },
      { text: 'Noapte bună', meaning: 'Good night', level: 'medium' },
      { text: 'Noroc', meaning: 'Cheers', level: 'medium' },
      { text: 'Bună seara', meaning: 'Good evening', level: 'medium' },
      { text: 'Unde este baia?', meaning: 'Where is the bathroom?', level: 'medium' },
      { text: 'Nu înțeleg', meaning: 'I do not understand', level: 'medium' },
      { text: 'Vorbiți engleză?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Nota, vă rog', meaning: 'The bill, please', level: 'medium' },
      { text: 'Mă numesc…', meaning: 'My name is…', level: 'medium' },
      { text: 'Îmi pare bine', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Cât e ceasul?', meaning: 'What time is it?', level: 'hard' },
      { text: 'Pe mâine', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'Drum bun', meaning: 'Have a good trip', level: 'hard' },
      { text: 'Este delicios', meaning: 'It is delicious', level: 'medium' },
      { text: 'Mi-e foame', meaning: 'I am hungry', level: 'hard' },
      { text: 'Poftă bună', meaning: 'Enjoy your meal', level: 'medium' },
      { text: 'La mulți ani!', meaning: 'Happy birthday / many years!', level: 'medium' },
    ],
  },
  {
    code: 'hu', name: 'Hungarian', region: 'Europe', family: 'Uralic', script: 'Latin',
    where: 'Hungary',
    phrases: [
      { text: 'Szia', meaning: 'Hi', level: 'easy' },
      { text: 'Jó reggelt', meaning: 'Good morning', level: 'easy' },
      { text: 'Köszönöm szépen', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Kérem', meaning: 'Please', level: 'medium' },
      { text: 'Hogy vagy?', meaning: 'How are you?', level: 'medium' },
      { text: 'Viszontlátásra', meaning: 'Goodbye', level: 'medium' },
      { text: 'Elnézést', meaning: 'Excuse me', level: 'medium' },
      { text: 'Mennyibe kerül?', meaning: 'How much does it cost?', level: 'hard' },
      { text: 'Jó éjszakát', meaning: 'Good night', level: 'medium' },
      { text: 'Egészségedre', meaning: 'Cheers', level: 'medium' },
      { text: 'Jó estét', meaning: 'Good evening', level: 'medium' },
      { text: 'Hol van a mosdó?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Nem értem', meaning: 'I do not understand', level: 'medium' },
      { text: 'Beszélsz angolul?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'A számlát, kérem', meaning: 'The bill, please', level: 'medium' },
      { text: 'A nevem…', meaning: 'My name is…', level: 'medium' },
      { text: 'Örvendek', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Hány óra van?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Holnap találkozunk', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Jó utat', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Nagyon finom', meaning: 'Very tasty', level: 'medium' },
      { text: 'Éhes vagyok', meaning: 'I am hungry', level: 'hard' },
      { text: 'Semmi gond', meaning: 'No problem', level: 'hard' },
      { text: 'Boldog születésnapot!', meaning: 'Happy birthday!', level: 'medium' },
    ],
  },
  {
    code: 'hr', name: 'Croatian', region: 'Europe', family: 'Slavic', script: 'Latin',
    where: 'Croatia and Bosnia and Herzegovina',
    phrases: [
      { text: 'Bok', meaning: 'Hi', level: 'easy' },
      { text: 'Dobro jutro', meaning: 'Good morning', level: 'easy' },
      { text: 'Hvala lijepa', meaning: 'Thank you kindly', level: 'easy' },
      { text: 'Molim', meaning: 'Please', level: 'medium' },
      { text: 'Kako si?', meaning: 'How are you?', level: 'medium' },
      { text: 'Doviđenja', meaning: 'Goodbye', level: 'medium' },
      { text: 'Oprostite', meaning: 'Excuse me', level: 'medium' },
      { text: 'Koliko košta?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Laku noć', meaning: 'Good night', level: 'medium' },
      { text: 'Živjeli', meaning: 'Cheers', level: 'medium' },
      { text: 'Dobra večer', meaning: 'Good evening', level: 'medium' },
      { text: 'Gdje je WC?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Ne razumijem', meaning: 'I do not understand', level: 'medium' },
      { text: 'Govorite li engleski?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Račun, molim', meaning: 'The bill, please', level: 'medium' },
      { text: 'Zovem se…', meaning: 'My name is…', level: 'medium' },
      { text: 'Drago mi je', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Koliko je sati?', meaning: 'What time is it?', level: 'hard' },
      { text: 'Vidimo se sutra', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'Sretan put', meaning: 'Have a good trip', level: 'hard' },
      { text: 'Jako je ukusno', meaning: 'It is very tasty', level: 'hard' },
      { text: 'Gladan sam', meaning: 'I am hungry', level: 'hard' },
      { text: 'Nema problema', meaning: 'No problem', level: 'hard' },
      { text: 'Sve najbolje!', meaning: 'All the best!', level: 'medium' },
    ],
  },
  {
    code: 'tr', name: 'Turkish', region: 'Asia', family: 'Turkic', script: 'Latin',
    where: 'Türkiye and Cyprus',
    phrases: [
      { text: 'Merhaba', meaning: 'Hello', level: 'easy' },
      { text: 'Günaydın', meaning: 'Good morning', level: 'easy' },
      { text: 'Çok teşekkür ederim', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Lütfen', meaning: 'Please', level: 'medium' },
      { text: 'Nasılsın?', meaning: 'How are you?', level: 'medium' },
      { text: 'Hoşça kal', meaning: 'Goodbye', level: 'medium' },
      { text: 'Affedersiniz', meaning: 'Excuse me', level: 'medium' },
      { text: 'Ne kadar?', meaning: 'How much?', level: 'hard' },
      { text: 'İyi geceler', meaning: 'Good night', level: 'medium' },
      { text: 'Şerefe', meaning: 'Cheers', level: 'medium' },
      { text: 'İyi akşamlar', meaning: 'Good evening', level: 'medium' },
      { text: 'Tuvalet nerede?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Anlamıyorum', meaning: 'I do not understand', level: 'medium' },
      { text: 'İngilizce biliyor musunuz?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Hesap, lütfen', meaning: 'The bill, please', level: 'medium' },
      { text: 'Benim adım…', meaning: 'My name is…', level: 'medium' },
      { text: 'Memnun oldum', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Saat kaç?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Yarın görüşürüz', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'İyi yolculuklar', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Çok lezzetli', meaning: 'Very delicious', level: 'medium' },
      { text: 'Acıktım', meaning: 'I am hungry', level: 'hard' },
      { text: 'Sorun değil', meaning: 'No problem', level: 'hard' },
      { text: 'Hoş geldiniz', meaning: 'Welcome', level: 'easy' },
    ],
  },
  {
    code: 'el', name: 'Greek', region: 'Europe', family: 'Hellenic', script: 'Greek',
    where: 'Greece and Cyprus',
    phrases: [
      { text: 'Γειά σου', roman: 'Yia sou', meaning: 'Hello', level: 'easy' },
      { text: 'Καλημέρα', roman: 'Kalimera', meaning: 'Good morning', level: 'easy' },
      { text: 'Ευχαριστώ πολύ', roman: 'Efharisto poli', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Παρακαλώ', roman: 'Parakalo', meaning: 'Please / You are welcome', level: 'medium' },
      { text: 'Τι κάνεις;', roman: 'Ti kaneis?', meaning: 'How are you?', level: 'medium' },
      { text: 'Αντίο', roman: 'Adio', meaning: 'Goodbye', level: 'medium' },
      { text: 'Συγγνώμη', roman: 'Signomi', meaning: 'Sorry', level: 'medium' },
      { text: 'Πόσο κάνει;', roman: 'Poso kanei?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Καληνύχτα', roman: 'Kalinihta', meaning: 'Good night', level: 'medium' },
      { text: 'Στην υγειά μας', roman: 'Stin ygeia mas', meaning: 'Cheers', level: 'medium' },
      { text: 'Καλησπέρα', roman: 'Kalispera', meaning: 'Good evening', level: 'medium' },
      { text: 'Πού είναι η τουαλέτα;', roman: 'Pou einai i toualeta?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Δεν καταλαβαίνω', roman: 'Den katalaveno', meaning: 'I do not understand', level: 'medium' },
      { text: 'Μιλάτε αγγλικά;', roman: 'Milate anglika?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Τον λογαριασμό, παρακαλώ', roman: 'Ton logariasmo, parakalo', meaning: 'The bill, please', level: 'medium' },
      { text: 'Με λένε…', roman: 'Me lene…', meaning: 'My name is…', level: 'medium' },
      { text: 'Χαίρω πολύ', roman: 'Hero poli', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Τι ώρα είναι;', roman: 'Ti ora einai?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Τα λέμε αύριο', roman: 'Ta leme avrio', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Καλό ταξίδι', roman: 'Kalo taxidi', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Πολύ νόστιμο', roman: 'Poli nostimo', meaning: 'Very tasty', level: 'medium' },
      { text: 'Καλή όρεξη', roman: 'Kali orexi', meaning: 'Enjoy your meal', level: 'medium' },
    ],
  },
  {
    code: 'ru', name: 'Russian', region: 'Europe', family: 'Slavic', script: 'Cyrillic',
    where: 'Russia and much of Central Asia',
    phrases: [
      { text: 'Привет', roman: 'Privet', meaning: 'Hi', level: 'easy' },
      { text: 'Доброе утро', roman: 'Dobroye utro', meaning: 'Good morning', level: 'easy' },
      { text: 'Спасибо большое', roman: 'Spasibo bolshoye', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Пожалуйста', roman: 'Pozhaluysta', meaning: 'Please', level: 'medium' },
      { text: 'Как дела?', roman: 'Kak dela?', meaning: 'How are you?', level: 'medium' },
      { text: 'До свидания', roman: 'Do svidaniya', meaning: 'Goodbye', level: 'medium' },
      { text: 'Извините', roman: 'Izvinite', meaning: 'Excuse me', level: 'medium' },
      { text: 'Сколько стоит?', roman: 'Skolko stoit?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Спокойной ночи', roman: 'Spokoynoy nochi', meaning: 'Good night', level: 'medium' },
      { text: 'На здоровье', roman: 'Na zdorovye', meaning: 'You are welcome', level: 'medium' },
      { text: 'Добрый вечер', roman: 'Dobryy vecher', meaning: 'Good evening', level: 'medium' },
      { text: 'Где туалет?', roman: 'Gde tualet?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Я не понимаю', roman: 'Ya ne ponimayu', meaning: 'I do not understand', level: 'medium' },
      { text: 'Вы говорите по-английски?', roman: 'Vy govorite po-angliyski?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Счёт, пожалуйста', roman: 'Schyot, pozhaluysta', meaning: 'The bill, please', level: 'medium' },
      { text: 'Меня зовут…', roman: 'Menya zovut…', meaning: 'My name is…', level: 'medium' },
      { text: 'Очень приятно', roman: 'Ochen priyatno', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Который час?', roman: 'Kotoryy chas?', meaning: 'What time is it?', level: 'medium' },
      { text: 'До завтра', roman: 'Do zavtra', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Счастливого пути', roman: 'Schastlivogo puti', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Очень вкусно', roman: 'Ochen vkusno', meaning: 'Very tasty', level: 'medium' },
      { text: 'Ничего страшного', roman: 'Nichego strashnogo', meaning: 'Never mind', level: 'hard' },
    ],
  },
  {
    code: 'uk', name: 'Ukrainian', region: 'Europe', family: 'Slavic', script: 'Cyrillic',
    where: 'Ukraine',
    phrases: [
      { text: 'Привіт', roman: 'Pryvit', meaning: 'Hi', level: 'easy' },
      { text: 'Доброго ранку', roman: 'Dobroho ranku', meaning: 'Good morning', level: 'easy' },
      { text: 'Дуже дякую', roman: 'Duzhe diakuiu', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Будь ласка', roman: 'Bud laska', meaning: 'Please', level: 'medium' },
      { text: 'Як справи?', roman: 'Yak spravy?', meaning: 'How are you?', level: 'medium' },
      { text: 'До побачення', roman: 'Do pobachennia', meaning: 'Goodbye', level: 'medium' },
      { text: 'Вибачте', roman: 'Vybachte', meaning: 'Excuse me', level: 'medium' },
      { text: 'Скільки коштує?', roman: 'Skilky koshtuie?', meaning: 'How much is it?', level: 'hard' },
      { text: 'На добраніч', roman: 'Na dobranich', meaning: 'Good night', level: 'medium' },
      { text: 'Будьмо', roman: 'Budmo', meaning: 'Cheers', level: 'medium' },
      { text: 'Добрий вечір', roman: 'Dobryy vechir', meaning: 'Good evening', level: 'hard' },
      { text: 'Де туалет?', roman: 'De tualet?', meaning: 'Where is the toilet?', level: 'hard' },
      { text: 'Я не розумію', roman: 'Ya ne rozumiyu', meaning: 'I do not understand', level: 'hard' },
      { text: 'Ви говорите англійською?', roman: 'Vy hovoryte anhliyskoyu?', meaning: 'Do you speak English?', level: 'hard' },
      { text: 'Рахунок, будь ласка', roman: 'Rakhunok, bud laska', meaning: 'The bill, please', level: 'hard' },
      { text: 'Мене звати…', roman: 'Mene zvaty…', meaning: 'My name is…', level: 'hard' },
      { text: 'Дуже приємно', roman: 'Duzhe pryyemno', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Котра година?', roman: 'Kotra hodyna?', meaning: 'What time is it?', level: 'hard' },
      { text: 'До завтра', roman: 'Do zavtra', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'Щасливої дороги', roman: 'Shchaslyvoyi dorohy', meaning: 'Have a good journey', level: 'hard' },
      { text: 'Дуже смачно', roman: 'Duzhe smachno', meaning: 'Very tasty', level: 'hard' },
      { text: 'Ласкаво просимо', roman: 'Laskavo prosymo', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'ja', name: 'Japanese', region: 'Asia', family: 'Japonic', script: 'Japanese',
    where: 'Japan',
    phrases: [
      { text: 'こんにちは', roman: 'Konnichiwa', meaning: 'Hello', level: 'easy' },
      { text: 'おはようございます', roman: 'Ohayō gozaimasu', meaning: 'Good morning', level: 'easy' },
      { text: 'ありがとうございます', roman: 'Arigatō gozaimasu', meaning: 'Thank you very much', level: 'easy' },
      { text: 'お願いします', roman: 'Onegaishimasu', meaning: 'Please', level: 'medium' },
      { text: 'お元気ですか', roman: 'Ogenki desu ka', meaning: 'How are you?', level: 'medium' },
      { text: 'さようなら', roman: 'Sayōnara', meaning: 'Goodbye', level: 'medium' },
      { text: 'すみません', roman: 'Sumimasen', meaning: 'Excuse me / Sorry', level: 'medium' },
      { text: 'いくらですか', roman: 'Ikura desu ka', meaning: 'How much is it?', level: 'hard' },
      { text: 'おやすみなさい', roman: 'Oyasuminasai', meaning: 'Good night', level: 'medium' },
      { text: '乾杯', roman: 'Kanpai', meaning: 'Cheers', level: 'medium' },
      { text: 'こんばんは', roman: 'Konbanwa', meaning: 'Good evening', level: 'medium' },
      { text: 'トイレはどこですか', roman: 'Toire wa doko desu ka', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'わかりません', roman: 'Wakarimasen', meaning: 'I do not understand', level: 'medium' },
      { text: '英語を話せますか', roman: 'Eigo o hanasemasu ka', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'お会計お願いします', roman: 'O-kaikei onegaishimasu', meaning: 'The bill, please', level: 'medium' },
      { text: '私の名前は…です', roman: 'Watashi no namae wa … desu', meaning: 'My name is…', level: 'medium' },
      { text: 'はじめまして', roman: 'Hajimemashite', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'いただきます', roman: 'Itadakimasu', meaning: 'Said before eating', level: 'easy' },
      { text: 'ごちそうさまでした', roman: 'Gochisousama deshita', meaning: 'Thank you for the meal', level: 'medium' },
      { text: 'おいしいです', roman: 'Oishii desu', meaning: 'It is delicious', level: 'medium' },
      { text: 'いってらっしゃい', roman: 'Itterasshai', meaning: 'Have a good trip out', level: 'hard' },
      { text: 'お疲れさま', roman: 'Otsukaresama', meaning: 'Good work / thanks for your efforts', level: 'hard' },
    ],
  },
  {
    code: 'ko', name: 'Korean', region: 'Asia', family: 'Koreanic', script: 'Hangul',
    where: 'South and North Korea',
    phrases: [
      { text: '안녕하세요', roman: 'Annyeonghaseyo', meaning: 'Hello', level: 'easy' },
      { text: '좋은 아침이에요', roman: 'Joeun achimieyo', meaning: 'Good morning', level: 'easy' },
      { text: '감사합니다', roman: 'Gamsahamnida', meaning: 'Thank you', level: 'easy' },
      { text: '주세요', roman: 'Juseyo', meaning: 'Please give me', level: 'medium' },
      { text: '잘 지내세요?', roman: 'Jal jinaeseyo?', meaning: 'How are you?', level: 'medium' },
      { text: '안녕히 계세요', roman: 'Annyeonghi gyeseyo', meaning: 'Goodbye', level: 'medium' },
      { text: '죄송합니다', roman: 'Joesonghamnida', meaning: 'I am sorry', level: 'medium' },
      { text: '얼마예요?', roman: 'Eolmayeyo?', meaning: 'How much is it?', level: 'hard' },
      { text: '안녕히 주무세요', roman: 'Annyeonghi jumuseyo', meaning: 'Good night', level: 'medium' },
      { text: '건배', roman: 'Geonbae', meaning: 'Cheers', level: 'medium' },
      { text: '안녕히 가세요', roman: 'Annyeonghi gaseyo', meaning: 'Goodbye (to someone leaving)', level: 'medium' },
      { text: '화장실이 어디예요?', roman: 'Hwajangsiri eodiyeyo?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: '모르겠어요', roman: 'Moreugesseoyo', meaning: 'I do not understand', level: 'medium' },
      { text: '영어 할 줄 아세요?', roman: 'Yeongeo hal jul aseyo?', meaning: 'Do you speak English?', level: 'medium' },
      { text: '계산서 주세요', roman: 'Gyesanseo juseyo', meaning: 'The bill, please', level: 'medium' },
      { text: '제 이름은…이에요', roman: 'Je ireumeun … ieyo', meaning: 'My name is…', level: 'medium' },
      { text: '반갑습니다', roman: 'Bangapseumnida', meaning: 'Nice to meet you', level: 'medium' },
      { text: '맛있어요', roman: 'Masisseoyo', meaning: 'It is delicious', level: 'medium' },
      { text: '잘 먹겠습니다', roman: 'Jal meokgesseumnida', meaning: 'Said before eating', level: 'medium' },
      { text: '괜찮아요', roman: 'Gwaenchanayo', meaning: 'It is fine / no problem', level: 'medium' },
      { text: '화이팅!', roman: 'Hwaiting!', meaning: 'You can do it!', level: 'medium' },
    ],
  },
  {
    code: 'zh', name: 'Mandarin Chinese', region: 'Asia', family: 'Sinitic', script: 'Chinese',
    where: 'China, Taiwan and Singapore',
    phrases: [
      { text: '你好', roman: 'Nǐ hǎo', meaning: 'Hello', level: 'easy' },
      { text: '早上好', roman: 'Zǎoshang hǎo', meaning: 'Good morning', level: 'easy' },
      { text: '谢谢', roman: 'Xièxie', meaning: 'Thank you', level: 'easy' },
      { text: '请', roman: 'Qǐng', meaning: 'Please', level: 'medium' },
      { text: '你好吗？', roman: 'Nǐ hǎo ma?', meaning: 'How are you?', level: 'medium' },
      { text: '再见', roman: 'Zàijiàn', meaning: 'Goodbye', level: 'medium' },
      { text: '对不起', roman: 'Duìbùqǐ', meaning: 'Sorry', level: 'medium' },
      { text: '多少钱？', roman: 'Duōshǎo qián?', meaning: 'How much is it?', level: 'hard' },
      { text: '晚安', roman: 'Wǎn ān', meaning: 'Good night', level: 'medium' },
      { text: '干杯', roman: 'Gānbēi', meaning: 'Cheers', level: 'medium' },
      { text: '晚上好', roman: 'Wǎnshàng hǎo', meaning: 'Good evening', level: 'medium' },
      { text: '洗手间在哪里', roman: 'Xǐshǒujiān zài nǎlǐ', meaning: 'Where is the toilet?', level: 'medium' },
      { text: '我不明白', roman: 'Wǒ bù míngbái', meaning: 'I do not understand', level: 'medium' },
      { text: '你会说英语吗', roman: 'Nǐ huì shuō Yīngyǔ ma', meaning: 'Do you speak English?', level: 'medium' },
      { text: '买单', roman: 'Mǎidān', meaning: 'The bill, please', level: 'medium' },
      { text: '我叫…', roman: 'Wǒ jiào…', meaning: 'My name is…', level: 'medium' },
      { text: '很高兴认识你', roman: 'Hěn gāoxìng rènshi nǐ', meaning: 'Pleased to meet you', level: 'medium' },
      { text: '很好吃', roman: 'Hěn hǎochī', meaning: 'Very tasty', level: 'medium' },
      { text: '没关系', roman: 'Méi guānxi', meaning: 'It does not matter', level: 'medium' },
      { text: '一路平安', roman: 'Yīlù píngān', meaning: 'Safe journey', level: 'medium' },
      { text: '欢迎', roman: 'Huānyíng', meaning: 'Welcome', level: 'medium' },
      { text: '加油', roman: 'Jiāyóu', meaning: 'Keep going / you can do it', level: 'medium' },
    ],
  },
  {
    code: 'th', name: 'Thai', region: 'Asia', family: 'Tai', script: 'Thai',
    where: 'Thailand',
    phrases: [
      { text: 'สวัสดี', roman: 'Sawatdee', meaning: 'Hello', level: 'easy' },
      { text: 'ขอบคุณ', roman: 'Khop khun', meaning: 'Thank you', level: 'easy' },
      { text: 'สบายดีไหม', roman: 'Sabai dee mai', meaning: 'How are you?', level: 'medium' },
      { text: 'ลาก่อน', roman: 'La kon', meaning: 'Goodbye', level: 'medium' },
      { text: 'ขอโทษ', roman: 'Kho thot', meaning: 'Sorry / Excuse me', level: 'medium' },
      { text: 'เท่าไหร่', roman: 'Tao rai', meaning: 'How much?', level: 'hard' },
      { text: 'ราตรีสวัสดิ์', roman: 'Ratri sawat', meaning: 'Good night', level: 'medium' },
      { text: 'ไม่เป็นไร', roman: 'Mai pen rai', meaning: 'No worries', level: 'medium' },
      { text: 'อร่อย', roman: 'Aroi', meaning: 'Delicious', level: 'medium' },
      { text: 'ชนแก้ว', roman: 'Chon kaew', meaning: 'Cheers', level: 'medium' },
      { text: 'ห้องน้ำอยู่ที่ไหน', roman: 'Hong nam yu thi nai', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'ไม่เข้าใจ', roman: 'Mai khao jai', meaning: 'I do not understand', level: 'medium' },
      { text: 'พูดภาษาอังกฤษได้ไหม', roman: 'Phut phasa angkrit dai mai', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'เช็คบิล', roman: 'Chek bin', meaning: 'The bill, please', level: 'medium' },
      { text: 'ผมชื่อ…', roman: 'Phom chue…', meaning: 'My name is…', level: 'medium' },
      { text: 'ยินดีที่ได้รู้จัก', roman: 'Yin di thi dai ru chak', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'เดินทางปลอดภัย', roman: 'Doen thang plot phai', meaning: 'Safe travels', level: 'medium' },
    ],
  },
  {
    code: 'vi', name: 'Vietnamese', region: 'Asia', family: 'Austroasiatic', script: 'Latin',
    where: 'Vietnam',
    phrases: [
      { text: 'Xin chào', meaning: 'Hello', level: 'easy' },
      { text: 'Chào buổi sáng', meaning: 'Good morning', level: 'easy' },
      { text: 'Cảm ơn nhiều', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Làm ơn', meaning: 'Please', level: 'medium' },
      { text: 'Bạn khỏe không?', meaning: 'How are you?', level: 'medium' },
      { text: 'Tạm biệt', meaning: 'Goodbye', level: 'medium' },
      { text: 'Xin lỗi', meaning: 'Sorry / Excuse me', level: 'medium' },
      { text: 'Bao nhiêu tiền?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Chúc ngủ ngon', meaning: 'Good night', level: 'medium' },
      { text: 'Một hai ba dô', meaning: 'Cheers', level: 'medium' },
      { text: 'Chào buổi tối', meaning: 'Good evening', level: 'medium' },
      { text: 'Nhà vệ sinh ở đâu?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Tôi không hiểu', meaning: 'I do not understand', level: 'medium' },
      { text: 'Bạn có nói tiếng Anh không?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Tính tiền', meaning: 'The bill, please', level: 'medium' },
      { text: 'Tên tôi là…', meaning: 'My name is…', level: 'medium' },
      { text: 'Rất vui được gặp bạn', meaning: 'Very pleased to meet you', level: 'medium' },
      { text: 'Ngon quá', meaning: 'Very tasty', level: 'medium' },
      { text: 'Không sao', meaning: 'No problem', level: 'medium' },
      { text: 'Chúc mừng!', meaning: 'Congratulations!', level: 'medium' },
      { text: 'Hẹn gặp lại', meaning: 'See you again', level: 'medium' },
    ],
  },
  {
    code: 'id', name: 'Indonesian', region: 'Asia', family: 'Austronesian', script: 'Latin',
    where: 'Indonesia',
    phrases: [
      { text: 'Halo', meaning: 'Hello', level: 'easy' },
      { text: 'Selamat pagi', meaning: 'Good morning', level: 'easy' },
      { text: 'Terima kasih banyak', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Tolong', meaning: 'Please / Help', level: 'medium' },
      { text: 'Apa kabar?', meaning: 'How are you?', level: 'medium' },
      { text: 'Sampai jumpa', meaning: 'See you', level: 'medium' },
      { text: 'Maaf', meaning: 'Sorry', level: 'medium' },
      { text: 'Berapa harganya?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Selamat malam', meaning: 'Good evening / Good night', level: 'medium' },
      { text: 'Enak sekali', meaning: 'Very tasty', level: 'medium' },
      { text: 'Di mana toilet?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Saya tidak mengerti', meaning: 'I do not understand', level: 'medium' },
      { text: 'Bisa bahasa Inggris?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Minta bon', meaning: 'The bill, please', level: 'hard' },
      { text: 'Nama saya…', meaning: 'My name is…', level: 'medium' },
      { text: 'Senang berkenalan', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Tidak apa-apa', meaning: 'It is all right', level: 'medium' },
      { text: 'Hati-hati di jalan', meaning: 'Take care on the road', level: 'medium' },
    ],
  },
  {
    code: 'hi', name: 'Hindi', region: 'Asia', family: 'Indo-Aryan', script: 'Devanagari',
    where: 'northern India',
    phrases: [
      { text: 'नमस्ते', roman: 'Namaste', meaning: 'Hello', level: 'easy' },
      { text: 'सुप्रभात', roman: 'Suprabhat', meaning: 'Good morning', level: 'easy' },
      { text: 'धन्यवाद', roman: 'Dhanyavaad', meaning: 'Thank you', level: 'easy' },
      { text: 'कृपया', roman: 'Kripya', meaning: 'Please', level: 'medium' },
      { text: 'आप कैसे हैं?', roman: 'Aap kaise hain?', meaning: 'How are you?', level: 'medium' },
      { text: 'अलविदा', roman: 'Alvida', meaning: 'Goodbye', level: 'medium' },
      { text: 'माफ़ कीजिए', roman: 'Maaf kijiye', meaning: 'Excuse me', level: 'medium' },
      { text: 'यह कितने का है?', roman: 'Yeh kitne ka hai?', meaning: 'How much is this?', level: 'hard' },
      { text: 'शुभ रात्रि', roman: 'Shubh ratri', meaning: 'Good night', level: 'medium' },
      { text: 'बहुत अच्छा', roman: 'Bahut achha', meaning: 'Very good', level: 'medium' },
      { text: 'शुभ संध्या', roman: 'Shubh sandhya', meaning: 'Good evening', level: 'medium' },
      { text: 'शौचालय कहाँ है?', roman: 'Shauchalay kahan hai?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'मुझे समझ नहीं आया', roman: 'Mujhe samajh nahin aaya', meaning: 'I do not understand', level: 'medium' },
      { text: 'क्या आप अंग्रेज़ी बोलते हैं?', roman: 'Kya aap angrezi bolte hain?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'मेरा नाम… है', roman: 'Mera naam … hai', meaning: 'My name is…', level: 'medium' },
      { text: 'आपसे मिलकर खुशी हुई', roman: 'Aapse milkar khushi hui', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'बहुत स्वादिष्ट', roman: 'Bahut swadisht', meaning: 'Very tasty', level: 'medium' },
      { text: 'कोई बात नहीं', roman: 'Koi baat nahin', meaning: 'Never mind', level: 'medium' },
      { text: 'शुभ यात्रा', roman: 'Shubh yatra', meaning: 'Have a good journey', level: 'medium' },
      { text: 'स्वागत है', roman: 'Swagat hai', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'ar', name: 'Arabic', region: 'Asia', family: 'Semitic', script: 'Arabic',
    where: 'North Africa and the Middle East',
    phrases: [
      { text: 'مرحبا', roman: 'Marhaba', meaning: 'Hello', level: 'easy' },
      { text: 'صباح الخير', roman: 'Sabah al-khayr', meaning: 'Good morning', level: 'easy' },
      { text: 'شكرا جزيلا', roman: 'Shukran jazilan', meaning: 'Thank you very much', level: 'easy' },
      { text: 'من فضلك', roman: 'Min fadlik', meaning: 'Please', level: 'medium' },
      { text: 'كيف حالك؟', roman: 'Kayf halak?', meaning: 'How are you?', level: 'medium' },
      { text: 'مع السلامة', roman: "Ma'a as-salama", meaning: 'Goodbye', level: 'medium' },
      { text: 'آسف', roman: 'Asif', meaning: 'Sorry', level: 'medium' },
      { text: 'بكم هذا؟', roman: 'Bikam hatha?', meaning: 'How much is this?', level: 'hard' },
      { text: 'تصبح على خير', roman: "Tusbih 'ala khayr", meaning: 'Good night', level: 'medium' },
      { text: 'إن شاء الله', roman: 'In sha Allah', meaning: 'God willing', level: 'medium' },
      { text: 'مساء الخير', roman: 'Masaa al-khayr', meaning: 'Good evening', level: 'medium' },
      { text: 'أين الحمام؟', roman: 'Ayna al-hammam?', meaning: 'Where is the bathroom?', level: 'medium' },
      { text: 'لا أفهم', roman: 'La afham', meaning: 'I do not understand', level: 'medium' },
      { text: 'هل تتحدث الإنجليزية؟', roman: 'Hal tatahaddath al-injliziyya?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'الحساب من فضلك', roman: 'Al-hisab min fadlik', meaning: 'The bill, please', level: 'medium' },
      { text: 'اسمي…', roman: 'Ismi…', meaning: 'My name is…', level: 'medium' },
      { text: 'تشرفنا', roman: 'Tasharrafna', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'لذيذ جدا', roman: 'Ladhidh jiddan', meaning: 'Very delicious', level: 'medium' },
      { text: 'لا مشكلة', roman: 'La mushkila', meaning: 'No problem', level: 'medium' },
      { text: 'رحلة سعيدة', roman: 'Rihla saeeda', meaning: 'Have a good trip', level: 'medium' },
    ],
  },
  {
    code: 'he', name: 'Hebrew', region: 'Asia', family: 'Semitic', script: 'Hebrew',
    where: 'Israel',
    phrases: [
      { text: 'שלום', roman: 'Shalom', meaning: 'Hello / Peace', level: 'easy' },
      { text: 'בוקר טוב', roman: 'Boker tov', meaning: 'Good morning', level: 'easy' },
      { text: 'תודה רבה', roman: 'Toda raba', meaning: 'Thank you very much', level: 'easy' },
      { text: 'בבקשה', roman: 'Bevakasha', meaning: 'Please', level: 'medium' },
      { text: 'מה שלומך?', roman: 'Ma shlomkha?', meaning: 'How are you?', level: 'medium' },
      { text: 'להתראות', roman: "Lehitra'ot", meaning: 'See you', level: 'medium' },
      { text: 'סליחה', roman: 'Slicha', meaning: 'Excuse me', level: 'medium' },
      { text: 'כמה זה עולה?', roman: 'Kama ze ole?', meaning: 'How much is it?', level: 'hard' },
      { text: 'לילה טוב', roman: 'Layla tov', meaning: 'Good night', level: 'medium' },
      { text: 'לחיים', roman: 'Lechaim', meaning: 'Cheers / To life', level: 'medium' },
      { text: 'ערב טוב', roman: 'Erev tov', meaning: 'Good evening', level: 'medium' },
      { text: 'איפה השירותים?', roman: 'Eifo ha-sherutim?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'אני לא מבין', roman: 'Ani lo mevin', meaning: 'I do not understand', level: 'medium' },
      { text: 'אתה מדבר אנגלית?', roman: 'Ata medaber anglit?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'החשבון בבקשה', roman: 'Ha-kheshbon bevakasha', meaning: 'The bill, please', level: 'medium' },
      { text: 'קוראים לי…', roman: 'Korim li…', meaning: 'My name is…', level: 'medium' },
      { text: 'נעים מאוד', roman: 'Naim meod', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'טעים מאוד', roman: 'Taim meod', meaning: 'Very tasty', level: 'medium' },
      { text: 'אין בעיה', roman: 'Ein beaya', meaning: 'No problem', level: 'medium' },
      { text: 'נסיעה טובה', roman: 'Nesia tova', meaning: 'Have a good trip', level: 'medium' },
    ],
  },
  {
    code: 'sw', name: 'Swahili', region: 'Africa', family: 'Bantu', script: 'Latin',
    where: 'Kenya, Tanzania and Uganda',
    phrases: [
      { text: 'Jambo', meaning: 'Hello', level: 'easy' },
      { text: 'Habari za asubuhi', meaning: 'Good morning', level: 'easy' },
      { text: 'Asante sana', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Tafadhali', meaning: 'Please', level: 'medium' },
      { text: 'Habari yako?', meaning: 'How are you?', level: 'medium' },
      { text: 'Kwaheri', meaning: 'Goodbye', level: 'medium' },
      { text: 'Samahani', meaning: 'Excuse me / Sorry', level: 'medium' },
      { text: 'Bei gani?', meaning: 'What price?', level: 'hard' },
      { text: 'Usiku mwema', meaning: 'Good night', level: 'medium' },
      { text: 'Hakuna matata', meaning: 'No worries', level: 'medium' },
      { text: 'Habari za jioni', meaning: 'Good evening', level: 'medium' },
      { text: 'Choo kiko wapi?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Sielewi', meaning: 'I do not understand', level: 'medium' },
      { text: 'Unazungumza Kiingereza?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Bili, tafadhali', meaning: 'The bill, please', level: 'medium' },
      { text: 'Jina langu ni…', meaning: 'My name is…', level: 'medium' },
      { text: 'Nimefurahi kukutana nawe', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Ni tamu sana', meaning: 'It is very tasty', level: 'medium' },
      { text: 'Hakuna shida', meaning: 'No problem', level: 'medium' },
      { text: 'Safari njema', meaning: 'Have a good journey', level: 'medium' },
      { text: 'Karibu sana', meaning: 'You are very welcome', level: 'medium' },
    ],
  },
  {
    code: 'af', name: 'Afrikaans', region: 'Africa', family: 'Germanic', script: 'Latin',
    where: 'South Africa and Namibia',
    phrases: [
      { text: 'Hallo', meaning: 'Hello', level: 'easy' },
      { text: 'Goeie môre', meaning: 'Good morning', level: 'easy' },
      { text: 'Baie dankie', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Asseblief', meaning: 'Please', level: 'medium' },
      { text: 'Hoe gaan dit?', meaning: 'How is it going?', level: 'medium' },
      { text: 'Totsiens', meaning: 'Goodbye', level: 'medium' },
      { text: 'Verskoon my', meaning: 'Excuse me', level: 'medium' },
      { text: 'Hoeveel kos dit?', meaning: 'How much does it cost?', level: 'hard' },
      { text: 'Goeie nag', meaning: 'Good night', level: 'medium' },
      { text: 'Gesondheid', meaning: 'Cheers / Bless you', level: 'medium' },
      { text: 'Goeienaand', meaning: 'Good evening', level: 'medium' },
      { text: 'Waar is die toilet?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Ek verstaan nie', meaning: 'I do not understand', level: 'medium' },
      { text: 'Praat jy Engels?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Die rekening, asseblief', meaning: 'The bill, please', level: 'medium' },
      { text: 'My naam is…', meaning: 'My name is…', level: 'medium' },
      { text: 'Aangename kennis', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Dit is lekker', meaning: 'It is nice / tasty', level: 'medium' },
      { text: 'Geen probleem nie', meaning: 'No problem', level: 'medium' },
      { text: 'Goeie reis', meaning: 'Good journey', level: 'medium' },
    ],
  },
  {
    code: 'is', name: 'Icelandic', region: 'Europe', family: 'Germanic', script: 'Latin',
    where: 'Iceland',
    phrases: [
      { text: 'Halló', meaning: 'Hello', level: 'easy' },
      { text: 'Góðan daginn', meaning: 'Good day', level: 'medium' },
      { text: 'Takk fyrir', meaning: 'Thank you', level: 'easy' },
      { text: 'Gjörðu svo vel', meaning: 'Here you go / Please', level: 'medium' },
      { text: 'Hvað segirðu gott?', meaning: 'How are you?', level: 'medium' },
      { text: 'Bless', meaning: 'Bye', level: 'medium' },
      { text: 'Afsakið', meaning: 'Excuse me', level: 'medium' },
      { text: 'Hvað kostar þetta?', meaning: 'How much is this?', level: 'hard' },
      { text: 'Góða nótt', meaning: 'Good night', level: 'medium' },
      { text: 'Skál', meaning: 'Cheers', level: 'medium' },
      { text: 'Gott kvöld', meaning: 'Good evening', level: 'medium' },
      { text: 'Hvar er klósettið?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Ég skil ekki', meaning: 'I do not understand', level: 'medium' },
      { text: 'Talar þú ensku?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Reikninginn, takk', meaning: 'The bill, please', level: 'medium' },
      { text: 'Ég heiti…', meaning: 'My name is…', level: 'medium' },
      { text: 'Gaman að kynnast þér', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'Hvað er klukkan?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Sjáumst á morgun', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Góða ferð', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Þetta er gott', meaning: 'This is good', level: 'medium' },
      { text: 'Ég er svangur', meaning: 'I am hungry', level: 'medium' },
      { text: 'Til hamingju!', meaning: 'Congratulations!', level: 'medium' },
    ],
  },
  {
    code: 'ga', name: 'Irish', region: 'Europe', family: 'Celtic', script: 'Latin',
    where: 'Ireland',
    phrases: [
      { text: 'Dia duit', meaning: 'Hello (literally: God be with you)', level: 'easy' },
      { text: 'Maidin mhaith', meaning: 'Good morning', level: 'easy' },
      { text: 'Go raibh maith agat', meaning: 'Thank you', level: 'easy' },
      { text: 'Le do thoil', meaning: 'Please', level: 'medium' },
      { text: 'Conas atá tú?', meaning: 'How are you?', level: 'medium' },
      { text: 'Slán', meaning: 'Goodbye', level: 'medium' },
      { text: 'Gabh mo leithscéal', meaning: 'Excuse me', level: 'medium' },
      { text: 'Cé mhéad atá air?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Oíche mhaith', meaning: 'Good night', level: 'medium' },
      { text: 'Sláinte', meaning: 'Cheers / Health', level: 'medium' },
      { text: 'Tráthnóna maith', meaning: 'Good afternoon / evening', level: 'medium' },
      { text: 'Cá bhfuil an leithreas?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Ní thuigim', meaning: 'I do not understand', level: 'medium' },
      { text: 'An bhfuil Béarla agat?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Is mise…', meaning: 'I am…', level: 'medium' },
      { text: 'Deas bualadh leat', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'Cén t-am é?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Slán abhaile', meaning: 'Safe home', level: 'medium' },
      { text: 'Turas maith', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Tá sé go hálainn', meaning: 'It is lovely', level: 'medium' },
      { text: 'Céad míle fáilte', meaning: 'A hundred thousand welcomes', level: 'easy' },
      { text: 'Go n-éirí an t-ádh leat', meaning: 'Good luck to you', level: 'medium' },
    ],
  },
  {
    code: 'cy', name: 'Welsh', region: 'Europe', family: 'Celtic', script: 'Latin',
    where: 'Wales',
    phrases: [
      { text: 'Helô', meaning: 'Hello', level: 'easy' },
      { text: 'Bore da', meaning: 'Good morning', level: 'easy' },
      { text: 'Diolch yn fawr', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Os gwelwch yn dda', meaning: 'Please', level: 'medium' },
      { text: 'Sut wyt ti?', meaning: 'How are you?', level: 'medium' },
      { text: 'Hwyl fawr', meaning: 'Goodbye', level: 'medium' },
      { text: 'Esgusodwch fi', meaning: 'Excuse me', level: 'medium' },
      { text: 'Faint yw e?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Nos da', meaning: 'Good night', level: 'medium' },
      { text: 'Iechyd da', meaning: 'Cheers / Good health', level: 'medium' },
      { text: 'Noswaith dda', meaning: 'Good evening', level: 'medium' },
      { text: 'Ble mae’r tŷ bach?', meaning: 'Where is the toilet?', level: 'medium' },
      { text: 'Dw i ddim yn deall', meaning: 'I do not understand', level: 'medium' },
      { text: 'Ydych chi’n siarad Saesneg?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Fy enw i yw…', meaning: 'My name is…', level: 'medium' },
      { text: 'Neis cwrdd â chi', meaning: 'Nice to meet you', level: 'medium' },
      { text: 'Faint o’r gloch yw hi?', meaning: 'What time is it?', level: 'medium' },
      { text: 'Wela i chi yfory', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'Taith dda', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Mae’n flasus', meaning: 'It is tasty', level: 'medium' },
      { text: 'Croeso', meaning: 'Welcome', level: 'medium' },
      { text: 'Pob lwc', meaning: 'Good luck', level: 'medium' },
    ],
  },
  {
    code: 'tl', name: 'Filipino', region: 'Asia', family: 'Austronesian', script: 'Latin',
    where: 'the Philippines',
    phrases: [
      { text: 'Kumusta', meaning: 'Hello / How are you?', level: 'easy' },
      { text: 'Magandang umaga', meaning: 'Good morning', level: 'easy' },
      { text: 'Maraming salamat', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Pakiusap', meaning: 'Please', level: 'medium' },
      { text: 'Paalam', meaning: 'Goodbye', level: 'medium' },
      { text: 'Pasensya na', meaning: 'Sorry', level: 'medium' },
      { text: 'Magkano ito?', meaning: 'How much is this?', level: 'hard' },
      { text: 'Magandang gabi', meaning: 'Good evening', level: 'medium' },
      { text: 'Masarap', meaning: 'Delicious', level: 'medium' },
      { text: 'Ingat ka', meaning: 'Take care', level: 'medium' },
      { text: 'Magandang hapon', meaning: 'Good afternoon', level: 'medium' },
      { text: 'Nasaan ang banyo?', meaning: 'Where is the bathroom?', level: 'medium' },
      { text: 'Hindi ko maintindihan', meaning: 'I do not understand', level: 'medium' },
      { text: 'Marunong ka ba mag-Ingles?', meaning: 'Do you speak English?', level: 'medium' },
      { text: 'Ang bill, pakiusap', meaning: 'The bill, please', level: 'hard' },
      { text: 'Ako si…', meaning: 'I am…', level: 'medium' },
      { text: 'Ikinagagalak kong makilala ka', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Walang problema', meaning: 'No problem', level: 'medium' },
      { text: 'Ingat sa biyahe', meaning: 'Take care on your journey', level: 'medium' },
      { text: 'Maligayang bati!', meaning: 'Congratulations / best wishes!', level: 'medium' },
    ],
  },
  {
    code: 'ca', name: 'Catalan', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'Catalonia, Valencia, the Balearics and Andorra',
    phrases: [
      { text: 'Hola', meaning: 'Hello', level: 'easy' },
      { text: 'Bon dia', meaning: 'Good morning', level: 'easy' },
      { text: 'Moltes gràcies', meaning: 'Thank you very much', level: 'easy' },
      { text: 'Si us plau', meaning: 'Please', level: 'medium' },
      { text: 'Com estàs?', meaning: 'How are you?', level: 'medium' },
      { text: 'Adéu', meaning: 'Goodbye', level: 'medium' },
      { text: 'Bona nit', meaning: 'Good night', level: 'medium' },
      { text: 'Perdoni', meaning: 'Excuse me', level: 'medium' },
      { text: 'Quant costa?', meaning: 'How much is it?', level: 'medium' },
      { text: 'Em dic…', meaning: 'My name is…', level: 'medium' },
      { text: 'Molt de gust', meaning: 'Pleased to meet you', level: 'medium' },
      { text: 'Bon profit', meaning: 'Enjoy your meal', level: 'hard' },
      { text: 'Fins demà', meaning: 'See you tomorrow', level: 'medium' },
      { text: 'On és el bany?', meaning: 'Where is the bathroom?', level: 'medium' },
      { text: 'Bon viatge', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Salut!', meaning: 'Cheers!', level: 'medium' },
    ],
  },
  {
    code: 'bg', name: 'Bulgarian', region: 'Europe', family: 'Slavic', script: 'Cyrillic',
    where: 'Bulgaria',
    phrases: [
      { text: 'Здравей', roman: 'Zdravey', meaning: 'Hello', level: 'medium' },
      { text: 'Добро утро', roman: 'Dobro utro', meaning: 'Good morning', level: 'medium' },
      { text: 'Благодаря', roman: 'Blagodarya', meaning: 'Thank you', level: 'medium' },
      { text: 'Моля', roman: 'Molya', meaning: 'Please / you are welcome', level: 'medium' },
      { text: 'Как си?', roman: 'Kak si?', meaning: 'How are you?', level: 'medium' },
      { text: 'Довиждане', roman: 'Dovizhdane', meaning: 'Goodbye', level: 'medium' },
      { text: 'Лека нощ', roman: 'Leka nosht', meaning: 'Good night', level: 'medium' },
      { text: 'Извинете', roman: 'Izvinete', meaning: 'Excuse me', level: 'medium' },
      { text: 'Колко струва?', roman: 'Kolko struva?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Казвам се…', roman: 'Kazvam se…', meaning: 'My name is…', level: 'medium' },
      { text: 'Приятно ми е', roman: 'Priyatno mi e', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Много вкусно', roman: 'Mnogo vkusno', meaning: 'Very tasty', level: 'hard' },
      { text: 'Наздраве', roman: 'Nazdrave', meaning: 'Cheers', level: 'medium' },
      { text: 'Добър вечер', roman: 'Dobar vecher', meaning: 'Good evening', level: 'medium' },
    ],
  },
  {
    code: 'sr', name: 'Serbian', region: 'Europe', family: 'Slavic', script: 'Cyrillic',
    where: 'Serbia, Bosnia and Montenegro',
    phrases: [
      { text: 'Здраво', roman: 'Zdravo', meaning: 'Hello', level: 'medium' },
      { text: 'Добро јутро', roman: 'Dobro jutro', meaning: 'Good morning', level: 'medium' },
      { text: 'Хвала', roman: 'Hvala', meaning: 'Thank you', level: 'medium' },
      { text: 'Молим', roman: 'Molim', meaning: 'Please', level: 'medium' },
      { text: 'Како си?', roman: 'Kako si?', meaning: 'How are you?', level: 'medium' },
      { text: 'Довиђења', roman: 'Dovidjenja', meaning: 'Goodbye', level: 'medium' },
      { text: 'Лаку ноћ', roman: 'Laku noc', meaning: 'Good night', level: 'medium' },
      { text: 'Извините', roman: 'Izvinite', meaning: 'Excuse me', level: 'medium' },
      { text: 'Колико кошта?', roman: 'Koliko kosta?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Зовем се…', roman: 'Zovem se…', meaning: 'My name is…', level: 'hard' },
      { text: 'Драго ми је', roman: 'Drago mi je', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Живели', roman: 'Ziveli', meaning: 'Cheers', level: 'medium' },
      { text: 'Добро вече', roman: 'Dobro vece', meaning: 'Good evening', level: 'medium' },
      { text: 'Срећан пут', roman: 'Srecan put', meaning: 'Have a good trip', level: 'hard' },
    ],
  },
  {
    code: 'sk', name: 'Slovak', region: 'Europe', family: 'Slavic', script: 'Latin',
    where: 'Slovakia',
    phrases: [
      { text: 'Ahoj', meaning: 'Hi', level: 'medium' },
      { text: 'Dobré ráno', meaning: 'Good morning', level: 'medium' },
      { text: 'Ďakujem', meaning: 'Thank you', level: 'medium' },
      { text: 'Prosím', meaning: 'Please', level: 'medium' },
      { text: 'Ako sa máš?', meaning: 'How are you?', level: 'medium' },
      { text: 'Dovidenia', meaning: 'Goodbye', level: 'hard' },
      { text: 'Dobrú noc', meaning: 'Good night', level: 'medium' },
      { text: 'Prepáčte', meaning: 'Excuse me', level: 'hard' },
      { text: 'Koľko to stojí?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Volám sa…', meaning: 'My name is…', level: 'hard' },
      { text: 'Teší ma', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Na zdravie', meaning: 'Cheers', level: 'medium' },
      { text: 'Dobrý večer', meaning: 'Good evening', level: 'medium' },
      { text: 'Šťastnú cestu', meaning: 'Have a good trip', level: 'hard' },
    ],
  },
  {
    code: 'sl', name: 'Slovenian', region: 'Europe', family: 'Slavic', script: 'Latin',
    where: 'Slovenia',
    phrases: [
      { text: 'Živjo', meaning: 'Hi', level: 'medium' },
      { text: 'Dobro jutro', meaning: 'Good morning', level: 'medium' },
      { text: 'Hvala', meaning: 'Thank you', level: 'medium' },
      { text: 'Prosim', meaning: 'Please', level: 'medium' },
      { text: 'Kako si?', meaning: 'How are you?', level: 'medium' },
      { text: 'Nasvidenje', meaning: 'Goodbye', level: 'hard' },
      { text: 'Lahko noč', meaning: 'Good night', level: 'hard' },
      { text: 'Oprostite', meaning: 'Excuse me', level: 'hard' },
      { text: 'Koliko stane?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Ime mi je…', meaning: 'My name is…', level: 'hard' },
      { text: 'Me veseli', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Na zdravje', meaning: 'Cheers', level: 'medium' },
      { text: 'Dober večer', meaning: 'Good evening', level: 'medium' },
      { text: 'Srečno pot', meaning: 'Have a good trip', level: 'hard' },
    ],
  },
  {
    code: 'lt', name: 'Lithuanian', region: 'Europe', family: 'Baltic', script: 'Latin',
    where: 'Lithuania',
    phrases: [
      { text: 'Labas', meaning: 'Hello', level: 'medium' },
      { text: 'Labas rytas', meaning: 'Good morning', level: 'medium' },
      { text: 'Ačiū', meaning: 'Thank you', level: 'medium' },
      { text: 'Prašau', meaning: 'Please', level: 'medium' },
      { text: 'Kaip sekasi?', meaning: 'How are you?', level: 'hard' },
      { text: 'Viso gero', meaning: 'Goodbye', level: 'hard' },
      { text: 'Labanakt', meaning: 'Good night', level: 'medium' },
      { text: 'Atsiprašau', meaning: 'Excuse me / sorry', level: 'medium' },
      { text: 'Kiek kainuoja?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Mano vardas…', meaning: 'My name is…', level: 'medium' },
      { text: 'Malonu susipažinti', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Į sveikatą', meaning: 'Cheers', level: 'medium' },
      { text: 'Labas vakaras', meaning: 'Good evening', level: 'medium' },
      { text: 'Laimingos kelionės', meaning: 'Have a good journey', level: 'hard' },
    ],
  },
  {
    code: 'lv', name: 'Latvian', region: 'Europe', family: 'Baltic', script: 'Latin',
    where: 'Latvia',
    phrases: [
      { text: 'Sveiki', meaning: 'Hello', level: 'medium' },
      { text: 'Labrīt', meaning: 'Good morning', level: 'medium' },
      { text: 'Paldies', meaning: 'Thank you', level: 'medium' },
      { text: 'Lūdzu', meaning: 'Please', level: 'medium' },
      { text: 'Kā tev iet?', meaning: 'How are you?', level: 'hard' },
      { text: 'Uz redzēšanos', meaning: 'Goodbye', level: 'hard' },
      { text: 'Ar labu nakti', meaning: 'Good night', level: 'hard' },
      { text: 'Atvainojiet', meaning: 'Excuse me', level: 'hard' },
      { text: 'Cik maksā?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Mani sauc…', meaning: 'My name is…', level: 'hard' },
      { text: 'Priecājos iepazīties', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Priekā', meaning: 'Cheers', level: 'medium' },
      { text: 'Labvakar', meaning: 'Good evening', level: 'medium' },
      { text: 'Laimīgu ceļu', meaning: 'Have a good journey', level: 'hard' },
    ],
  },
  {
    code: 'et', name: 'Estonian', region: 'Europe', family: 'Finnic', script: 'Latin',
    where: 'Estonia',
    phrases: [
      { text: 'Tere', meaning: 'Hello', level: 'medium' },
      { text: 'Tere hommikust', meaning: 'Good morning', level: 'medium' },
      { text: 'Aitäh', meaning: 'Thank you', level: 'medium' },
      { text: 'Palun', meaning: 'Please', level: 'medium' },
      { text: 'Kuidas läheb?', meaning: 'How are you?', level: 'medium' },
      { text: 'Head aega', meaning: 'Goodbye', level: 'hard' },
      { text: 'Head ööd', meaning: 'Good night', level: 'medium' },
      { text: 'Vabandust', meaning: 'Excuse me', level: 'medium' },
      { text: 'Kui palju maksab?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Minu nimi on…', meaning: 'My name is…', level: 'medium' },
      { text: 'Meeldiv tutvuda', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Terviseks', meaning: 'Cheers', level: 'medium' },
      { text: 'Tere õhtust', meaning: 'Good evening', level: 'medium' },
      { text: 'Head reisi', meaning: 'Have a good trip', level: 'hard' },
    ],
  },
  {
    code: 'sq', name: 'Albanian', region: 'Europe', family: 'Albanian', script: 'Latin',
    where: 'Albania, Kosovo and North Macedonia',
    phrases: [
      { text: 'Përshëndetje', meaning: 'Hello', level: 'medium' },
      { text: 'Mirëmëngjes', meaning: 'Good morning', level: 'medium' },
      { text: 'Faleminderit', meaning: 'Thank you', level: 'medium' },
      { text: 'Ju lutem', meaning: 'Please', level: 'medium' },
      { text: 'Si je?', meaning: 'How are you?', level: 'hard' },
      { text: 'Mirupafshim', meaning: 'Goodbye', level: 'medium' },
      { text: 'Natën e mirë', meaning: 'Good night', level: 'medium' },
      { text: 'Më falni', meaning: 'Excuse me', level: 'hard' },
      { text: 'Sa kushton?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Unë quhem…', meaning: 'My name is…', level: 'hard' },
      { text: 'Gëzohem', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Gëzuar', meaning: 'Cheers', level: 'medium' },
      { text: 'Mirëmbrëma', meaning: 'Good evening', level: 'medium' },
      { text: 'Rrugë të mbarë', meaning: 'Have a good journey', level: 'hard' },
    ],
  },
  {
    code: 'mt', name: 'Maltese', region: 'Europe', family: 'Semitic', script: 'Latin',
    where: 'Malta',
    phrases: [
      { text: 'Bonġu', meaning: 'Good morning', level: 'medium' },
      { text: 'Grazzi', meaning: 'Thank you', level: 'medium' },
      { text: 'Jekk jogħġbok', meaning: 'Please', level: 'medium' },
      { text: 'Kif inti?', meaning: 'How are you?', level: 'hard' },
      { text: 'Saħħa', meaning: 'Goodbye / health', level: 'medium' },
      { text: 'Il-lejl it-tajjeb', meaning: 'Good night', level: 'hard' },
      { text: 'Skużi', meaning: 'Excuse me', level: 'medium' },
      { text: 'Kemm jiswa?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Jisimni…', meaning: 'My name is…', level: 'hard' },
      { text: 'Għandi pjaċir', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Bonswa', meaning: 'Good evening', level: 'medium' },
      { text: 'Merħba', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'fa', name: 'Persian', region: 'Asia', family: 'Iranian', script: 'Arabic',
    where: 'Iran, Afghanistan and Tajikistan',
    phrases: [
      { text: 'سلام', roman: 'Salaam', meaning: 'Hello', level: 'medium' },
      { text: 'صبح بخیر', roman: 'Sobh bekheyr', meaning: 'Good morning', level: 'medium' },
      { text: 'مرسی', roman: 'Merci', meaning: 'Thanks', level: 'medium' },
      { text: 'لطفا', roman: 'Lotfan', meaning: 'Please', level: 'medium' },
      { text: 'حال شما چطور است؟', roman: 'Haal-e shoma chetor ast?', meaning: 'How are you?', level: 'medium' },
      { text: 'خداحافظ', roman: 'Khodahafez', meaning: 'Goodbye', level: 'medium' },
      { text: 'شب بخیر', roman: 'Shab bekheyr', meaning: 'Good night', level: 'medium' },
      { text: 'ببخشید', roman: 'Bebakhshid', meaning: 'Excuse me', level: 'medium' },
      { text: 'چند است؟', roman: 'Chand ast?', meaning: 'How much is it?', level: 'hard' },
      { text: 'اسم من … است', roman: 'Esm-e man … ast', meaning: 'My name is…', level: 'medium' },
      { text: 'خوشبختم', roman: 'Khoshbakhtam', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'خیلی خوشمزه است', roman: 'Kheyli khoshmaze ast', meaning: 'It is very tasty', level: 'hard' },
      { text: 'سفر بخیر', roman: 'Safar bekheyr', meaning: 'Have a good trip', level: 'hard' },
      { text: 'خوش آمدید', roman: 'Khush aamdeed', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'ms', name: 'Malay', region: 'Asia', family: 'Austronesian', script: 'Latin',
    where: 'Malaysia, Brunei and Singapore',
    phrases: [
      { text: 'Selamat pagi', meaning: 'Good morning', level: 'medium' },
      { text: 'Terima kasih', meaning: 'Thank you', level: 'medium' },
      { text: 'Sila', meaning: 'Please', level: 'medium' },
      { text: 'Apa khabar?', meaning: 'How are you?', level: 'medium' },
      { text: 'Selamat tinggal', meaning: 'Goodbye', level: 'medium' },
      { text: 'Selamat malam', meaning: 'Good night', level: 'medium' },
      { text: 'Maafkan saya', meaning: 'Excuse me / sorry', level: 'medium' },
      { text: 'Berapa harganya?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Nama saya…', meaning: 'My name is…', level: 'hard' },
      { text: 'Sedap', meaning: 'Tasty', level: 'medium' },
      { text: 'Jumpa lagi', meaning: 'See you again', level: 'medium' },
      { text: 'Selamat datang', meaning: 'Welcome', level: 'medium' },
      { text: 'Saya tidak faham', meaning: 'I do not understand', level: 'medium' },
      { text: 'Di mana tandas?', meaning: 'Where is the toilet?', level: 'medium' },
    ],
  },
  {
    code: 'bn', name: 'Bengali', region: 'Asia', family: 'Indo-Aryan', script: 'Bengali',
    where: 'Bangladesh and eastern India',
    phrases: [
      { text: 'নমস্কার', roman: 'Nomoshkar', meaning: 'Hello', level: 'medium' },
      { text: 'সুপ্রভাত', roman: 'Suprobhat', meaning: 'Good morning', level: 'medium' },
      { text: 'ধন্যবাদ', roman: 'Dhonnobad', meaning: 'Thank you', level: 'medium' },
      { text: 'দয়া করে', roman: 'Doya kore', meaning: 'Please', level: 'medium' },
      { text: 'কেমন আছেন?', roman: 'Kemon achhen?', meaning: 'How are you?', level: 'medium' },
      { text: 'বিদায়', roman: 'Biday', meaning: 'Goodbye', level: 'medium' },
      { text: 'শুভ রাত্রি', roman: 'Shubho ratri', meaning: 'Good night', level: 'medium' },
      { text: 'মাফ করবেন', roman: 'Maf korben', meaning: 'Excuse me', level: 'medium' },
      { text: 'এটার দাম কত?', roman: 'Etar dam koto?', meaning: 'How much is this?', level: 'hard' },
      { text: 'আমার নাম…', roman: 'Amar nam…', meaning: 'My name is…', level: 'medium' },
      { text: 'খুব সুস্বাদু', roman: 'Khub sushadu', meaning: 'Very tasty', level: 'hard' },
      { text: 'স্বাগতম', roman: 'Swagotom', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'ur', name: 'Urdu', region: 'Asia', family: 'Indo-Aryan', script: 'Arabic',
    where: 'Pakistan and northern India',
    phrases: [
      { text: 'السلام علیکم', roman: 'Assalamu alaikum', meaning: 'Peace be upon you (hello)', level: 'medium' },
      { text: 'صبح بخیر', roman: 'Sobh bekheyr', meaning: 'Good morning', level: 'medium' },
      { text: 'شکریہ', roman: 'Shukriya', meaning: 'Thank you', level: 'medium' },
      { text: 'براہ کرم', roman: 'Barah-e-karam', meaning: 'Please', level: 'medium' },
      { text: 'آپ کیسے ہیں؟', roman: 'Aap kaise hain?', meaning: 'How are you?', level: 'medium' },
      { text: 'خدا حافظ', roman: 'Khuda hafiz', meaning: 'Goodbye', level: 'medium' },
      { text: 'شب بخیر', roman: 'Shab bekheyr', meaning: 'Good night', level: 'medium' },
      { text: 'معاف کیجیے', roman: 'Maaf kijiye', meaning: 'Excuse me', level: 'medium' },
      { text: 'یہ کتنے کا ہے؟', roman: 'Yeh kitne ka hai?', meaning: 'How much is this?', level: 'hard' },
      { text: 'میرا نام … ہے', roman: 'Mera naam … hai', meaning: 'My name is…', level: 'medium' },
      { text: 'بہت مزیدار', roman: 'Bohat mazedar', meaning: 'Very delicious', level: 'hard' },
      { text: 'خوش آمدید', roman: 'Khush aamdeed', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'am', name: 'Amharic', region: 'Africa', family: 'Semitic', script: "Ge'ez",
    where: 'Ethiopia',
    phrases: [
      { text: 'ሰላም', roman: 'Selam', meaning: 'Hello / peace', level: 'medium' },
      { text: 'እንደምን አደርክ', roman: 'Endemin aderk', meaning: 'Good morning', level: 'hard' },
      { text: 'አመሰግናለሁ', roman: 'Ameseginalehu', meaning: 'Thank you', level: 'medium' },
      { text: 'እባክህ', roman: 'Ebakih', meaning: 'Please', level: 'medium' },
      { text: 'ደህና ነህ?', roman: 'Dehna neh?', meaning: 'Are you well?', level: 'hard' },
      { text: 'ቻው', roman: 'Chaw', meaning: 'Bye', level: 'medium' },
      { text: 'ደህና እደር', roman: 'Dehna eder', meaning: 'Good night', level: 'hard' },
      { text: 'ይቅርታ', roman: 'Yiqirta', meaning: 'Excuse me / sorry', level: 'medium' },
      { text: 'ስንት ነው?', roman: 'Sint new?', meaning: 'How much is it?', level: 'hard' },
      { text: 'ስሜ … ነው', roman: 'Sime … new', meaning: 'My name is…', level: 'hard' },
      { text: 'በጣም ጣፋጭ ነው', roman: 'Betam tafach new', meaning: 'It is very tasty', level: 'hard' },
      { text: 'እንኳን ደህና መጡ', roman: 'Enkwan dehna metu', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'zu', name: 'Zulu', region: 'Africa', family: 'Bantu', script: 'Latin',
    where: 'South Africa',
    phrases: [
      { text: 'Sawubona', meaning: 'Hello', level: 'medium' },
      { text: 'Ngiyabonga', meaning: 'Thank you', level: 'medium' },
      { text: 'Uxolo', meaning: 'Sorry / excuse me', level: 'medium' },
      { text: 'Unjani?', meaning: 'How are you?', level: 'medium' },
      { text: 'Hamba kahle', meaning: 'Go well (goodbye)', level: 'medium' },
      { text: 'Sala kahle', meaning: 'Stay well', level: 'hard' },
      { text: 'Malini?', meaning: 'How much?', level: 'hard' },
      { text: 'Igama lami ngu…', meaning: 'My name is…', level: 'hard' },
      { text: 'Kumnandi', meaning: 'It is nice / tasty', level: 'hard' },
      { text: 'Siyakwamukela', meaning: 'We welcome you', level: 'hard' },
      { text: 'Usuku oluhle', meaning: 'Have a good day', level: 'hard' },
      { text: 'Yebo', meaning: 'Yes', level: 'medium' },
    ],
  },
  {
    code: 'yo', name: 'Yoruba', region: 'Africa', family: 'Niger-Congo', script: 'Latin',
    where: 'Nigeria, Benin and Togo',
    phrases: [
      { text: 'Ẹ káàbọ̀', meaning: 'Welcome', level: 'medium' },
      { text: 'Ẹ káàrọ̀', meaning: 'Good morning', level: 'medium' },
      { text: 'Ẹ ṣé', meaning: 'Thank you', level: 'medium' },
      { text: 'Jọ̀wọ́', meaning: 'Please', level: 'medium' },
      { text: 'Báwo ni?', meaning: 'How are you?', level: 'medium' },
      { text: 'Ó dàbọ̀', meaning: 'Goodbye', level: 'medium' },
      { text: 'Ẹ kúùrọ̀lẹ́', meaning: 'Good evening', level: 'hard' },
      { text: 'Mo wà dáadáa', meaning: 'I am fine', level: 'hard' },
      { text: 'Elòó ni?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Orúkọ mi ni…', meaning: 'My name is…', level: 'hard' },
      { text: 'Ó dùn', meaning: 'It is sweet / tasty', level: 'hard' },
      { text: 'Ẹ kú àárọ̀ ọjọ́', meaning: 'Good day', level: 'hard' },
    ],
  },
  {
    code: 'ne', name: 'Nepali', region: 'Asia', family: 'Indo-Aryan', script: 'Devanagari',
    where: 'Nepal',
    phrases: [
      { text: 'नमस्ते', roman: 'Namaste', meaning: 'Hello', level: 'medium' },
      { text: 'धन्यवाद', roman: 'Dhanyabad', meaning: 'Thank you', level: 'medium' },
      { text: 'कृपया', roman: 'Kripaya', meaning: 'Please', level: 'medium' },
      { text: 'तपाईंलाई कस्तो छ?', roman: 'Tapailai kasto chha?', meaning: 'How are you?', level: 'hard' },
      { text: 'फेरि भेटौंला', roman: 'Pheri bhetaunla', meaning: 'See you again', level: 'hard' },
      { text: 'शुभ रात्री', roman: 'Shubha ratri', meaning: 'Good night', level: 'medium' },
      { text: 'माफ गर्नुहोस्', roman: 'Maaf garnuhos', meaning: 'Excuse me', level: 'medium' },
      { text: 'यो कति हो?', roman: 'Yo kati ho?', meaning: 'How much is this?', level: 'hard' },
      { text: 'मेरो नाम … हो', roman: 'Mero naam … ho', meaning: 'My name is…', level: 'hard' },
      { text: 'मीठो छ', roman: 'Mitho chha', meaning: 'It is tasty', level: 'hard' },
      { text: 'स्वागत छ', roman: 'Swagat chha', meaning: 'Welcome', level: 'medium' },
      { text: 'शुभ यात्रा', roman: 'Shubh yatra', meaning: 'Have a good journey', level: 'medium' },
    ],
  },
  {
    code: 'km', name: 'Khmer', region: 'Asia', family: 'Austroasiatic', script: 'Khmer',
    where: 'Cambodia',
    phrases: [
      { text: 'សួស្តី', roman: 'Suostei', meaning: 'Hello', level: 'medium' },
      { text: 'អរគុណ', roman: 'Arkoun', meaning: 'Thank you', level: 'medium' },
      { text: 'សូម', roman: 'Som', meaning: 'Please', level: 'medium' },
      { text: 'សុខសប្បាយទេ?', roman: 'Sok sabbay te?', meaning: 'How are you?', level: 'hard' },
      { text: 'លាហើយ', roman: 'Lea haey', meaning: 'Goodbye', level: 'medium' },
      { text: 'រាត្រីសួស្តី', roman: 'Reatrei suostei', meaning: 'Good night', level: 'hard' },
      { text: 'សុំទោស', roman: 'Som tos', meaning: 'Excuse me / sorry', level: 'medium' },
      { text: 'ថ្លៃប៉ុន្មាន?', roman: 'Thlai ponman?', meaning: 'How much is it?', level: 'hard' },
      { text: 'ខ្ញុំឈ្មោះ…', roman: 'Khnhom chhmuoh…', meaning: 'My name is…', level: 'hard' },
      { text: 'ឆ្ងាញ់ណាស់', roman: 'Chhnganh nas', meaning: 'Very tasty', level: 'hard' },
      { text: 'សូមស្វាគមន៍', roman: 'Som swakum', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'ka', name: 'Georgian', region: 'Europe', family: 'Kartvelian', script: 'Georgian',
    where: 'Georgia',
    phrases: [
      { text: 'გამარჯობა', roman: 'Gamarjoba', meaning: 'Hello', level: 'medium' },
      { text: 'დილა მშვიდობისა', roman: 'Dila mshvidobisa', meaning: 'Good morning', level: 'medium' },
      { text: 'მადლობა', roman: 'Madloba', meaning: 'Thank you', level: 'medium' },
      { text: 'თუ შეიძლება', roman: 'Tu sheidzleba', meaning: 'Please', level: 'medium' },
      { text: 'როგორ ხარ?', roman: 'Rogor khar?', meaning: 'How are you?', level: 'hard' },
      { text: 'ნახვამდის', roman: 'Nakhvamdis', meaning: 'Goodbye', level: 'medium' },
      { text: 'ღამე მშვიდობისა', roman: 'Ghame mshvidobisa', meaning: 'Good night', level: 'hard' },
      { text: 'უკაცრავად', roman: 'Ukatsravad', meaning: 'Excuse me', level: 'hard' },
      { text: 'რა ღირს?', roman: 'Ra ghirs?', meaning: 'How much is it?', level: 'hard' },
      { text: 'მე მქვია…', roman: 'Me mkvia…', meaning: 'My name is…', level: 'hard' },
      { text: 'ძალიან გემრიელია', roman: 'Dzalian gemrielia', meaning: 'It is very tasty', level: 'hard' },
      { text: 'გაუმარჯოს', roman: 'Gaumarjos', meaning: 'Cheers', level: 'medium' },
    ],
  },
  {
    code: 'hy', name: 'Armenian', region: 'Europe', family: 'Armenian', script: 'Armenian',
    where: 'Armenia',
    phrases: [
      { text: 'Բարև', roman: 'Barev', meaning: 'Hello', level: 'medium' },
      { text: 'Բարի լույս', roman: 'Bari luys', meaning: 'Good morning', level: 'medium' },
      { text: 'Շնորհակալություն', roman: 'Shnorhakalutyun', meaning: 'Thank you', level: 'medium' },
      { text: 'Խնդրեմ', roman: 'Khndrem', meaning: 'Please / you are welcome', level: 'medium' },
      { text: 'Ինչպե՞ս ես', roman: 'Inchpes es', meaning: 'How are you?', level: 'hard' },
      { text: 'Ցտեսություն', roman: 'Tstesutyun', meaning: 'Goodbye', level: 'medium' },
      { text: 'Բարի գիշեր', roman: 'Bari gisher', meaning: 'Good night', level: 'medium' },
      { text: 'Ներեցեք', roman: 'Neretsek', meaning: 'Excuse me', level: 'hard' },
      { text: 'Ի՞նչ արժե', roman: 'Inch arzhe', meaning: 'How much is it?', level: 'hard' },
      { text: 'Իմ անունը… է', roman: 'Im anun@ … e', meaning: 'My name is…', level: 'hard' },
      { text: 'Շատ համեղ է', roman: 'Shat hamegh e', meaning: 'It is very tasty', level: 'hard' },
      { text: 'Կենաց', roman: 'Kenats', meaning: 'Cheers', level: 'medium' },
    ],
  },
  {
    code: 'eu', name: 'Basque', region: 'Europe', family: 'Isolate', script: 'Latin',
    where: 'the Basque Country in Spain and France',
    phrases: [
      { text: 'Kaixo', meaning: 'Hello', level: 'medium' },
      { text: 'Egun on', meaning: 'Good morning', level: 'medium' },
      { text: 'Eskerrik asko', meaning: 'Thank you very much', level: 'medium' },
      { text: 'Mesedez', meaning: 'Please', level: 'medium' },
      { text: 'Zer moduz?', meaning: 'How are you?', level: 'hard' },
      { text: 'Agur', meaning: 'Goodbye', level: 'medium' },
      { text: 'Gabon', meaning: 'Good night', level: 'medium' },
      { text: 'Barkatu', meaning: 'Excuse me / sorry', level: 'medium' },
      { text: 'Zenbat balio du?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Nire izena … da', meaning: 'My name is…', level: 'hard' },
      { text: 'Oso gozoa', meaning: 'Very tasty', level: 'hard' },
      { text: 'Osasuna!', meaning: 'Cheers / health!', level: 'medium' },
      { text: 'Ongi etorri', meaning: 'Welcome', level: 'medium' },
      { text: 'Bihar arte', meaning: 'See you tomorrow', level: 'hard' },
    ],
  },
  {
    code: 'gl', name: 'Galician', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'Galicia in north-west Spain',
    phrases: [
      { text: 'Ola', meaning: 'Hello', level: 'medium' },
      { text: 'Bos días', meaning: 'Good morning', level: 'medium' },
      { text: 'Grazas', meaning: 'Thank you', level: 'medium' },
      { text: 'Por favor', meaning: 'Please', level: 'medium' },
      { text: 'Como estás?', meaning: 'How are you?', level: 'hard' },
      { text: 'Adeus', meaning: 'Goodbye', level: 'medium' },
      { text: 'Boas noites', meaning: 'Good night', level: 'medium' },
      { text: 'Perdoa', meaning: 'Excuse me', level: 'hard' },
      { text: 'Canto custa?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Chámome…', meaning: 'My name is…', level: 'hard' },
      { text: 'Moito gusto', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Boa viaxe', meaning: 'Have a good trip', level: 'hard' },
      { text: 'Ata mañá', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'Saúde', meaning: 'Cheers', level: 'medium' },
    ],
  },
  {
    code: 'oc', name: 'Occitan', region: 'Europe', family: 'Romance', script: 'Latin',
    where: 'southern France, and valleys in Italy and Spain',
    phrases: [
      { text: 'Bonjorn', meaning: 'Good day', level: 'medium' },
      { text: 'Mercé', meaning: 'Thank you', level: 'medium' },
      { text: 'Se vos plai', meaning: 'Please', level: 'hard' },
      { text: 'Cossí vas?', meaning: 'How are you?', level: 'hard' },
      { text: 'Al reveire', meaning: 'Goodbye', level: 'hard' },
      { text: 'Bona nuèch', meaning: 'Good night', level: 'hard' },
      { text: 'Perdon', meaning: 'Excuse me', level: 'medium' },
      { text: 'Quant còsta?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Me sòni…', meaning: 'My name is…', level: 'hard' },
      { text: 'Plan content', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Bon viatge', meaning: 'Have a good trip', level: 'medium' },
      { text: 'Santat', meaning: 'Cheers', level: 'medium' },
    ],
  },
  {
    code: 'be', name: 'Belarusian', region: 'Europe', family: 'Slavic', script: 'Cyrillic',
    where: 'Belarus',
    phrases: [
      { text: 'Прывітанне', roman: 'Pryvitannie', meaning: 'Hello', level: 'medium' },
      { text: 'Добрай раніцы', roman: 'Dobray ranitsy', meaning: 'Good morning', level: 'hard' },
      { text: 'Дзякуй', roman: 'Dziakuj', meaning: 'Thank you', level: 'medium' },
      { text: 'Калі ласка', roman: 'Kali laska', meaning: 'Please', level: 'medium' },
      { text: 'Як справы?', roman: 'Yak spravy?', meaning: 'How are you?', level: 'hard' },
      { text: 'Да пабачэння', roman: 'Da pabachennia', meaning: 'Goodbye', level: 'hard' },
      { text: 'Дабранач', roman: 'Dabranach', meaning: 'Good night', level: 'hard' },
      { text: 'Выбачайце', roman: 'Vybachaytse', meaning: 'Excuse me', level: 'hard' },
      { text: 'Колькі каштуе?', roman: 'Kolki kashtuye?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Мяне завуць…', roman: 'Miane zavuts…', meaning: 'My name is…', level: 'hard' },
      { text: 'Вельмі прыемна', roman: 'Vielmi pryyemna', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Вельмі смачна', roman: 'Vielmi smachna', meaning: 'Very tasty', level: 'hard' },
      { text: 'Будзьма', roman: 'Budzma', meaning: 'Cheers', level: 'medium' },
      { text: 'Добры вечар', roman: 'Dobry vechar', meaning: 'Good evening', level: 'medium' },
    ],
  },
  {
    code: 'kk', name: 'Kazakh', region: 'Asia', family: 'Turkic', script: 'Cyrillic',
    where: 'Kazakhstan',
    phrases: [
      { text: 'Сәлеметсіз бе', roman: 'Salemetsiz be', meaning: 'Hello', level: 'medium' },
      { text: 'Қайырлы таң', roman: 'Qayyrly tan', meaning: 'Good morning', level: 'medium' },
      { text: 'Рахмет', roman: 'Rakhmet', meaning: 'Thank you', level: 'medium' },
      { text: 'Өтінемін', roman: 'Otinemin', meaning: 'Please', level: 'medium' },
      { text: 'Қалыңыз қалай?', roman: 'Qalynyz qalay?', meaning: 'How are you?', level: 'hard' },
      { text: 'Сау болыңыз', roman: 'Sau bolynyz', meaning: 'Goodbye', level: 'hard' },
      { text: 'Қайырлы түн', roman: 'Qayyrly tun', meaning: 'Good night', level: 'medium' },
      { text: 'Кешіріңіз', roman: 'Keshirinyz', meaning: 'Excuse me', level: 'medium' },
      { text: 'Қанша тұрады?', roman: 'Qansha turady?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Менің атым…', roman: 'Menin atym…', meaning: 'My name is…', level: 'hard' },
      { text: 'Танысқаныма қуаныштымын', roman: 'Tanysqanyma quanyshtymyn', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Өте дәмді', roman: 'Ote damdi', meaning: 'Very tasty', level: 'hard' },
      { text: 'Қош келдіңіз', roman: 'Qosh keldinyz', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'uz', name: 'Uzbek', region: 'Asia', family: 'Turkic', script: 'Latin',
    where: 'Uzbekistan',
    phrases: [
      { text: 'Salom', meaning: 'Hello', level: 'medium' },
      { text: 'Xayrli tong', meaning: 'Good morning', level: 'medium' },
      { text: 'Rahmat', meaning: 'Thank you', level: 'medium' },
      { text: 'Iltimos', meaning: 'Please', level: 'medium' },
      { text: 'Qalaysiz?', meaning: 'How are you?', level: 'hard' },
      { text: 'Xayr', meaning: 'Goodbye', level: 'medium' },
      { text: 'Xayrli tun', meaning: 'Good night', level: 'medium' },
      { text: 'Kechirasiz', meaning: 'Excuse me', level: 'medium' },
      { text: 'Qancha turadi?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Mening ismim…', meaning: 'My name is…', level: 'hard' },
      { text: 'Tanishganimdan xursandman', meaning: 'Pleased to meet you', level: 'hard' },
      { text: 'Juda mazali', meaning: 'Very tasty', level: 'hard' },
      { text: 'Xush kelibsiz', meaning: 'Welcome', level: 'medium' },
      { text: 'Ertaga ko‘rishguncha', meaning: 'See you tomorrow', level: 'hard' },
    ],
  },
  {
    code: 'si', name: 'Sinhala', region: 'Asia', family: 'Indo-Aryan', script: 'Sinhala',
    where: 'Sri Lanka',
    phrases: [
      { text: 'ආයුබෝවන්', roman: 'Ayubowan', meaning: 'Hello / may you live long', level: 'medium' },
      { text: 'සුබ උදෑසනක්', roman: 'Suba udaesanak', meaning: 'Good morning', level: 'hard' },
      { text: 'ස්තුතියි', roman: 'Sthuthiyi', meaning: 'Thank you', level: 'medium' },
      { text: 'කරුණාකර', roman: 'Karunakara', meaning: 'Please', level: 'medium' },
      { text: 'කොහොමද?', roman: 'Kohomada?', meaning: 'How are you?', level: 'hard' },
      { text: 'ගිහින් එන්නම්', roman: 'Gihin ennam', meaning: 'Goodbye', level: 'hard' },
      { text: 'සුබ රාත්‍රියක්', roman: 'Suba rathriyak', meaning: 'Good night', level: 'hard' },
      { text: 'සමාවෙන්න', roman: 'Samawenna', meaning: 'Excuse me', level: 'medium' },
      { text: 'කීයද?', roman: 'Keeyada?', meaning: 'How much?', level: 'hard' },
      { text: 'මගේ නම…', roman: 'Mage nama…', meaning: 'My name is…', level: 'hard' },
      { text: 'ඉතා රසයි', roman: 'Itha rasai', meaning: 'Very tasty', level: 'hard' },
      { text: 'සාදරයෙන් පිළිගනිමු', roman: 'Sadarayen piliganimu', meaning: 'Welcome', level: 'hard' },
    ],
  },
  {
    code: 'ta', name: 'Tamil', region: 'Asia', family: 'Dravidian', script: 'Tamil',
    where: 'Tamil Nadu, Sri Lanka and Singapore',
    phrases: [
      { text: 'வணக்கம்', roman: 'Vanakkam', meaning: 'Hello', level: 'medium' },
      { text: 'காலை வணக்கம்', roman: 'Kaalai vanakkam', meaning: 'Good morning', level: 'medium' },
      { text: 'நன்றி', roman: 'Nandri', meaning: 'Thank you', level: 'medium' },
      { text: 'தயவுசெய்து', roman: 'Thayavu seydhu', meaning: 'Please', level: 'medium' },
      { text: 'எப்படி இருக்கீங்க?', roman: 'Eppadi irukkeenga?', meaning: 'How are you?', level: 'hard' },
      { text: 'போய் வருகிறேன்', roman: 'Poi varugiren', meaning: 'Goodbye', level: 'hard' },
      { text: 'இனிய இரவு', roman: 'Iniya iravu', meaning: 'Good night', level: 'hard' },
      { text: 'மன்னிக்கவும்', roman: 'Mannikkavum', meaning: 'Excuse me', level: 'medium' },
      { text: 'எவ்வளவு?', roman: 'Evvalavu?', meaning: 'How much?', level: 'hard' },
      { text: 'என் பெயர்…', roman: 'En peyar…', meaning: 'My name is…', level: 'hard' },
      { text: 'மிகவும் சுவையாக இருக்கிறது', roman: 'Migavum suvaiyaga irukkirathu', meaning: 'Very tasty', level: 'hard' },
      { text: 'வரவேற்கிறோம்', roman: 'Varaverkirom', meaning: 'Welcome', level: 'hard' },
    ],
  },
  {
    code: 'te', name: 'Telugu', region: 'Asia', family: 'Dravidian', script: 'Telugu',
    where: 'Andhra Pradesh and Telangana in India',
    phrases: [
      { text: 'నమస్కారం', roman: 'Namaskaram', meaning: 'Hello', level: 'medium' },
      { text: 'శుభోదయం', roman: 'Shubhodayam', meaning: 'Good morning', level: 'medium' },
      { text: 'ధన్యవాదాలు', roman: 'Dhanyavadalu', meaning: 'Thank you', level: 'medium' },
      { text: 'దయచేసి', roman: 'Dayachesi', meaning: 'Please', level: 'medium' },
      { text: 'ఎలా ఉన్నారు?', roman: 'Ela unnaru?', meaning: 'How are you?', level: 'hard' },
      { text: 'వెళ్ళొస్తాను', roman: 'Vellostanu', meaning: 'Goodbye', level: 'hard' },
      { text: 'శుభరాత్రి', roman: 'Shubharatri', meaning: 'Good night', level: 'medium' },
      { text: 'క్షమించండి', roman: 'Kshaminchandi', meaning: 'Excuse me', level: 'medium' },
      { text: 'ఎంత?', roman: 'Entha?', meaning: 'How much?', level: 'hard' },
      { text: 'నా పేరు…', roman: 'Naa peru…', meaning: 'My name is…', level: 'hard' },
      { text: 'చాలా రుచిగా ఉంది', roman: 'Chala ruchiga undi', meaning: 'Very tasty', level: 'hard' },
      { text: 'స్వాగతం', roman: 'Swagatam', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'ha', name: 'Hausa', region: 'Africa', family: 'Afro-Asiatic', script: 'Latin',
    where: 'Nigeria, Niger and across the Sahel',
    phrases: [
      { text: 'Sannu', meaning: 'Hello', level: 'medium' },
      { text: 'Ina kwana', meaning: 'Good morning', level: 'hard' },
      { text: 'Na gode', meaning: 'Thank you', level: 'medium' },
      { text: 'Don Allah', meaning: 'Please', level: 'medium' },
      { text: 'Yaya kake?', meaning: 'How are you?', level: 'hard' },
      { text: 'Sai anjima', meaning: 'See you later', level: 'hard' },
      { text: 'Mu kwana lafiya', meaning: 'Good night', level: 'hard' },
      { text: 'Yi hakuri', meaning: 'Sorry', level: 'hard' },
      { text: 'Nawa ne?', meaning: 'How much is it?', level: 'hard' },
      { text: 'Sunana…', meaning: 'My name is…', level: 'hard' },
      { text: 'Yana da dadi', meaning: 'It is tasty', level: 'hard' },
      { text: 'Barka da zuwa', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'so', name: 'Somali', region: 'Africa', family: 'Afro-Asiatic', script: 'Latin',
    where: 'Somalia, Djibouti and eastern Ethiopia',
    phrases: [
      { text: 'Salaan', meaning: 'Greetings', level: 'medium' },
      { text: 'Subax wanaagsan', meaning: 'Good morning', level: 'medium' },
      { text: 'Mahadsanid', meaning: 'Thank you', level: 'medium' },
      { text: 'Fadlan', meaning: 'Please', level: 'medium' },
      { text: 'Sidee tahay?', meaning: 'How are you?', level: 'hard' },
      { text: 'Nabadgelyo', meaning: 'Goodbye', level: 'medium' },
      { text: 'Habeen wanaagsan', meaning: 'Good night', level: 'hard' },
      { text: 'Raali ahow', meaning: 'Excuse me', level: 'hard' },
      { text: 'Immisa?', meaning: 'How much?', level: 'hard' },
      { text: 'Magacaygu waa…', meaning: 'My name is…', level: 'hard' },
      { text: 'Aad iyo aad u macaan', meaning: 'Very tasty', level: 'hard' },
      { text: 'Soo dhawoow', meaning: 'Welcome', level: 'medium' },
    ],
  },
  {
    code: 'mg', name: 'Malagasy', region: 'Africa', family: 'Austronesian', script: 'Latin',
    where: 'Madagascar',
    phrases: [
      { text: 'Salama', meaning: 'Hello', level: 'medium' },
      { text: 'Manao ahoana', meaning: 'How are you? / hello', level: 'hard' },
      { text: 'Misaotra', meaning: 'Thank you', level: 'medium' },
      { text: 'Azafady', meaning: 'Please / excuse me', level: 'medium' },
      { text: 'Veloma', meaning: 'Goodbye', level: 'medium' },
      { text: 'Tafandria mandry', meaning: 'Good night', level: 'hard' },
      { text: 'Ohatrinona?', meaning: 'How much?', level: 'hard' },
      { text: 'Ny anarako dia…', meaning: 'My name is…', level: 'hard' },
      { text: 'Matsiro be', meaning: 'Very tasty', level: 'hard' },
      { text: 'Tongasoa', meaning: 'Welcome', level: 'medium' },
      { text: 'Rahampitso', meaning: 'See you tomorrow', level: 'hard' },
      { text: 'Mazotoa homana', meaning: 'Enjoy your meal', level: 'hard' },
    ],
  },
  {
    code: 'haw', name: 'Hawaiian', region: 'Oceania', family: 'Austronesian', script: 'Latin',
    where: 'Hawaii',
    phrases: [
      { text: 'Aloha', meaning: 'Hello, goodbye and love', level: 'easy' },
      { text: 'Mahalo', meaning: 'Thank you', level: 'easy' },
      { text: 'E kala mai', meaning: 'Excuse me', level: 'medium' },
      { text: 'Pehea ʻoe?', meaning: 'How are you?', level: 'hard' },
      { text: 'A hui hou', meaning: 'Until we meet again', level: 'medium' },
      { text: 'Aloha kakahiaka', meaning: 'Good morning', level: 'medium' },
      { text: 'Aloha ahiahi', meaning: 'Good evening', level: 'medium' },
      { text: 'ʻOno', meaning: 'Delicious', level: 'hard' },
      { text: 'ʻEhia?', meaning: 'How much?', level: 'hard' },
      { text: 'ʻO wau ʻo…', meaning: 'I am…', level: 'hard' },
      { text: 'E komo mai', meaning: 'Welcome, come in', level: 'medium' },
      { text: 'Mālama pono', meaning: 'Take care', level: 'medium' },
    ],
  },
]

export const LANGUAGE_REGIONS = ['World', 'Europe', 'Asia', 'Africa']

/** Languages available for a round in this region. */
export function languagesForRegion(region) {
  return region === 'World' ? LANGUAGES : LANGUAGES.filter((l) => l.region === region)
}

// PHRASE LEVELS, AND WHY THEY ARE ON THE PHRASE AND NOT THE LANGUAGE.
//
// "Hola" and "¿Dónde está el baño?" are both Spanish and they are not remotely
// the same question: one is known by people who have never been to Spain, the
// other takes a moment even if you speak some. Grading the LANGUAGE would put
// them in the same bucket, which is exactly the flatness the bigger bank exists
// to fix.
export const PHRASE_LEVELS = ['easy', 'medium', 'hard']

// A PHRASE THAT TWO LANGUAGES BOTH USE IS NOT A QUESTION.
//
// This was broken before the bank grew and nobody had noticed: "Por favor" is
// Spanish AND Portuguese, "Hallo" is German AND Dutch, "Skål" is Swedish,
// Norwegian AND Danish. Ask one of those with the other on the grid and the
// player is being marked wrong for a right answer.
//
// Deleting them would be the wrong fix - they are among the most common things
// anybody says in those languages, and they are perfectly good questions as long
// as the OTHER claimant is not one of the four buttons. So the index below is
// consulted when the distractors are chosen, and the test asserts that no
// question can ever be built with two languages on it that both use the phrase.
let SHARED = null
function sharedBy(text) {
  if (!SHARED) {
    SHARED = new Map()
    for (const l of LANGUAGES) {
      for (const p of l.phrases) {
        if (!SHARED.has(p.text)) SHARED.set(p.text, new Set())
        SHARED.get(p.text).add(l.code)
      }
    }
  }
  return SHARED.get(text) ?? new Set()
}

/**
 * Build one question: a phrase, and four languages to choose between.
 *
 * `rand` is injected rather than reaching for Math.random, so the page can pass
 * a seeded generator for the daily round and everybody gets the same one - and
 * so it is testable, which a function that calls Math.random inside itself is
 * not.
 *
 * `opts.level` asks for a phrase of a given difficulty, which is how the daily
 * round builds a mix rather than ten questions of whatever fell out.
 *
 * WHERE THE WRONG ANSWERS COME FROM, AND WHY IT IS NOT JUST "SAME REGION".
 *
 * Offering Japanese, Swahili and Welsh against a Spanish phrase is not a
 * question, it is a formality. Region was the first answer to that and it is a
 * blunt one: it put Japanese against Thai, which share a continent and nothing
 * else, while Spanish and Catalan - the actual near miss - only met by accident.
 *
 * So a HARD question draws its wrong answers from the same language FAMILY
 * first, which is where the real confusions live (Czech against Slovak, Danish
 * against Norwegian, Indonesian against Malay). Region is the fallback, and
 * anywhere is the fallback after that, because four buttons matter more than
 * four perfect buttons.
 */
export function buildQuestion(pool, rand = Math.random, opts = {}) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]

  // Choose the phrase first when a level was asked for: picking the language
  // and then hoping it has a hard phrase is how you end up quietly serving
  // whatever it does have.
  const want = opts.level
  const withLevel = want ? pool.filter((l) => l.phrases.some((p) => p.level === want)) : pool
  const answer = pick(withLevel.length ? withLevel : pool)
  const atLevel = want ? answer.phrases.filter((p) => p.level === want) : answer.phrases
  const phrase = pick(atLevel.length ? atLevel : answer.phrases)

  return questionFor(pool, answer, phrase, rand, want)
}

/**
 * The four options around a phrase whose language is already decided. Split out
 * of `buildQuestion` because the daily round chooses its own phrases - it deals
 * them from a deck so nothing comes back for months - and still needs exactly
 * this logic to surround them.
 */
function questionFor(pool, answer, phrase, rand, want) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const alsoSays = sharedBy(phrase.text)
  const eligible = pool.filter((l) => l.code !== answer.code && !alsoSays.has(l.code))
  const sameFamily = eligible.filter((l) => l.family && l.family === answer.family)
  const sameRegion = eligible.filter((l) => l.region === answer.region && l.family !== answer.family)
  const elsewhere = eligible.filter((l) => l.region !== answer.region && l.family !== answer.family)

  const distractors = []
  const takeFrom = (from) => {
    const remaining = from.filter((l) => !distractors.some((d) => d.code === l.code))
    if (!remaining.length) return false
    distractors.push(pick(remaining))
    return true
  }

  // ALWAYS FOUR OPTIONS, AND THE OLD LOOP COULD NOT PROMISE THAT.
  //
  // Ethan: "sometimes it only shows up two options". The previous version asked
  // for a language from `sameRegion` while `sameRegion.length` was non-zero -
  // but the length it tested was of the WHOLE region list, not of what was left
  // after removing the ones already chosen. Answer a phrase from a region
  // holding two languages and the second pass found nothing new, hit the
  // no-progress guard, and broke out with one distractor and a two-button
  // question.
  //
  // Each source is tried until it is genuinely exhausted, and the loop only
  // gives up when all of them are. With 56 languages in the bank it never does.
  const order = want === 'hard'
    ? [sameFamily, sameFamily, sameRegion, elsewhere]
    : want === 'easy'
      ? [sameRegion, elsewhere, elsewhere, sameFamily]
      : [sameFamily, sameRegion, sameRegion, elsewhere]
  while (distractors.length < 3) {
    const preferred = order[distractors.length] || elsewhere
    const got = takeFrom(preferred) || takeFrom(sameFamily) || takeFrom(sameRegion) || takeFrom(elsewhere)
    if (!got) break
  }

  const choices = [answer, ...distractors]
  // Fisher-Yates, so the right answer is not always first.
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }

  return { phrase, answer, choices, level: phrase.level ?? 'medium' }
}

// ---------------------------------------------------------------- daily round
//
// THE SAME TEN PHRASES FOR EVERYBODY, ALL DAY.
//
// Guess the language is a daily puzzle now, which means the round has to be a
// pure function of the date and nothing else: two creators comparing scores at
// lunchtime must have answered the same questions, and a leaderboard ranking
// people who played different rounds is not a leaderboard.
//
// mulberry32 seeded from the UK day index, which is the generator the other two
// dailies already use. `rand` was designed to be injected for exactly this (see
// buildQuestion above), so there is no second code path for the questions
// themselves - the daily round is the ordinary round with a different clock.

/** A small, fast, seedable PRNG. Same seed, same sequence, on every device. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DAILY_LANGUAGE_ROUNDS = 10

// THE SHAPE OF A DAY, WRITTEN DOWN.
//
// Ethan: "this one is mostly difficult enough for me but again have that range
// of difficulty, don't want it too easy or impossible."
//
// So a round is not ten random phrases out of a thousand - it is two you should
// get, five that take a moment, and three that are a real test, dealt in a
// different order every day. Written as a list rather than as weights because
// a weighted draw can hand somebody ten hard ones, and the day that happens is
// the day they stop playing.
const DAILY_SHAPE = ['easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard']

// THE DAY DEALS FROM A DECK, IT DOES NOT DRAW AT RANDOM.
//
// Drawing ten phrases at random every day looks like variety and is not: over
// two hundred days it dealt the SAME PHRASE ON CONSECUTIVE DAYS more than once,
// and the median gap between two sightings of a phrase was thirty days. That is
// the complaint, measured - "a lot of repetition in words while playing over
// the last few weeks" - and a bigger bank on its own does not fix it, because a
// random draw has no memory of what it drew yesterday.
//
// So the phrases are dealt off three fixed shuffled decks, one per difficulty,
// and the day is the CURSOR into them. Day d takes the two easy phrases at
// positions 2d and 2d+1, the five medium ones at 5d..5d+4, and so on. A phrase
// therefore cannot come back until its whole deck has been dealt: 56 days for
// the easy ones, 71 for the hard, 145 for the medium. No memory needed, and it
// is still a pure function of the date, which is what makes everybody's round
// the same.
let DECKS = null
function decks() {
  if (DECKS) return DECKS
  const rng = mulberry32(0x1a2b3c)
  const by = { easy: [], medium: [], hard: [] }
  LANGUAGES.forEach((l, li) => {
    l.phrases.forEach((p, pi) => (by[p.level] || by.medium).push([li, pi]))
  })
  for (const key of Object.keys(by)) {
    const deck = by[key]
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
  }
  DECKS = by
  return DECKS
}

/** How long a level's deck takes to come round, in days. */
export function phraseCycleDays(level) {
  const per = DAILY_SHAPE.filter((l) => l === level).length
  return per ? Math.floor(decks()[level].length / per) : 0
}

/**
 * The ten questions for one UK day. Never asks the same language twice in a
 * round: with ten questions out of a bank of fifty-six, a repeat is both likely
 * and reads as the puzzle having run out of ideas.
 */
export function dailyLanguageRound(day, count = DAILY_LANGUAGE_ROUNDS) {
  // A large odd multiplier keeps consecutive days far apart in the sequence, so
  // Tuesday's round is not Monday's with one phrase swapped. This seeds the
  // ORDER of the round and its wrong answers; the phrases themselves come off
  // the decks.
  const rand = mulberry32(day * 2654435761)

  const shape = DAILY_SHAPE.slice()
  for (let i = shape.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shape[i], shape[j]] = [shape[j], shape[i]]
  }
  while (shape.length < count) shape.push('medium')
  const wanted = shape.slice(0, count)

  const perDay = {}
  for (const l of DAILY_SHAPE) perDay[l] = (perDay[l] || 0) + 1

  const d = decks()
  const taken = { easy: 0, medium: 0, hard: 0 }
  const usedLanguages = new Set()
  const out = []

  for (const level of wanted) {
    const deck = d[level].length ? d[level] : d.medium
    const lvl = d[level].length ? level : 'medium'
    const base = day * (perDay[lvl] || 1) + taken[lvl]
    taken[lvl] = (taken[lvl] || 0) + 1
    // A LANGUAGE CLASH IS RESOLVED SOMEWHERE ELSE ENTIRELY, NOT ONE STEP ALONG.
    //
    // When the phrase the cursor lands on belongs to a language this round has
    // already used, something else has to be dealt. Stepping forward by one is
    // the obvious move and it is wrong: it consumes tomorrow's phrase, and
    // tomorrow's cursor then lands on it anyway - which measured as one repeat
    // in ten coming back THE NEXT DAY, the exact fault the deck exists to
    // prevent. A fixed jump of half a deck fixed most of that and left a
    // handful, because a fixed offset just moves the collision somewhere else
    // predictable.
    //
    // A random jump is worse still - measured, four times as many short gaps -
    // because a uniform landing spot has a real chance of hitting the stretch
    // just BEHIND the cursor, which is exactly what was dealt last week.
    //
    // What works is the middle of the deck: far from the phrases about to be
    // dealt (just ahead of the cursor) and far from the ones lately dealt (just
    // behind it), with a small day-dependent stagger so two clashes on
    // consecutive days do not land on the same phrase.
    const at = (n) => deck[(((n) % deck.length) + deck.length) % deck.length]
    let entry = at(base)
    if (usedLanguages.has(LANGUAGES[entry[0]].code)) {
      entry = null
      const half = Math.floor(deck.length / 2)
      const far = half + ((day * 7) % Math.max(1, Math.floor(deck.length / 4)))
      for (let k = 0; k < deck.length; k++) {
        const cand = at(base + far + k)
        if (!usedLanguages.has(LANGUAGES[cand[0]].code)) { entry = cand; break }
      }
    }
    if (!entry) break
    const answer = LANGUAGES[entry[0]]
    const phrase = answer.phrases[entry[1]]
    usedLanguages.add(answer.code)
    out.push(questionFor(LANGUAGES, answer, phrase, rand, lvl))
  }
  return out
}
