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
    code: 'es', name: 'Spanish', region: 'Europe', script: 'Latin',
    where: 'Spain and most of Latin America',
    phrases: [
      { text: 'Hola', meaning: 'Hello' },
      { text: 'Buenos días', meaning: 'Good morning' },
      { text: 'Gracias', meaning: 'Thank you' },
      { text: 'Por favor', meaning: 'Please' },
      { text: '¿Cómo estás?', meaning: 'How are you?' },
      { text: 'Hasta luego', meaning: 'See you later' },
      { text: 'Lo siento', meaning: 'I am sorry' },
      { text: '¿Cuánto cuesta?', meaning: 'How much does it cost?' },
      { text: 'Buenas noches', meaning: 'Good night' },
      { text: 'Salud', meaning: 'Cheers' },
    ],
  },
  {
    code: 'pt', name: 'Portuguese', region: 'Europe', script: 'Latin',
    where: 'Portugal, Brazil, Angola and Mozambique',
    phrases: [
      { text: 'Olá', meaning: 'Hello' },
      { text: 'Bom dia', meaning: 'Good morning' },
      { text: 'Obrigado', meaning: 'Thank you (said by a man)' },
      { text: 'Por favor', meaning: 'Please' },
      { text: 'Tudo bem?', meaning: 'All good? / How are you?' },
      { text: 'Até logo', meaning: 'See you soon' },
      { text: 'Desculpe', meaning: 'Sorry' },
      { text: 'Quanto custa?', meaning: 'How much is it?' },
      { text: 'Boa noite', meaning: 'Good night' },
      { text: 'Saúde', meaning: 'Cheers' },
    ],
  },
  {
    code: 'fr', name: 'French', region: 'Europe', script: 'Latin',
    where: 'France, Belgium, Canada and much of West Africa',
    phrases: [
      { text: 'Bonjour', meaning: 'Hello / Good day' },
      { text: 'Merci beaucoup', meaning: 'Thank you very much' },
      { text: "S'il vous plaît", meaning: 'Please' },
      { text: 'Ça va ?', meaning: 'How are you?' },
      { text: 'Au revoir', meaning: 'Goodbye' },
      { text: 'Excusez-moi', meaning: 'Excuse me' },
      { text: "C'est combien ?", meaning: 'How much is it?' },
      { text: 'Bonne nuit', meaning: 'Good night' },
      { text: 'Santé', meaning: 'Cheers' },
      { text: 'De rien', meaning: "You're welcome" },
    ],
  },
  {
    code: 'it', name: 'Italian', region: 'Europe', script: 'Latin',
    where: 'Italy, San Marino and parts of Switzerland',
    phrases: [
      { text: 'Ciao', meaning: 'Hi / Bye' },
      { text: 'Buongiorno', meaning: 'Good morning' },
      { text: 'Grazie mille', meaning: 'Thanks a lot' },
      { text: 'Per favore', meaning: 'Please' },
      { text: 'Come stai?', meaning: 'How are you?' },
      { text: 'Arrivederci', meaning: 'Goodbye' },
      { text: 'Mi scusi', meaning: 'Excuse me' },
      { text: 'Quanto costa?', meaning: 'How much is it?' },
      { text: 'Buonanotte', meaning: 'Good night' },
      { text: 'Salute', meaning: 'Cheers' },
    ],
  },
  {
    code: 'de', name: 'German', region: 'Europe', script: 'Latin',
    where: 'Germany, Austria and Switzerland',
    phrases: [
      { text: 'Hallo', meaning: 'Hello' },
      { text: 'Guten Morgen', meaning: 'Good morning' },
      { text: 'Danke schön', meaning: 'Thank you kindly' },
      { text: 'Bitte', meaning: 'Please / You are welcome' },
      { text: 'Wie geht es dir?', meaning: 'How are you?' },
      { text: 'Auf Wiedersehen', meaning: 'Goodbye' },
      { text: 'Entschuldigung', meaning: 'Excuse me / Sorry' },
      { text: 'Was kostet das?', meaning: 'What does that cost?' },
      { text: 'Gute Nacht', meaning: 'Good night' },
      { text: 'Prost', meaning: 'Cheers' },
    ],
  },
  {
    code: 'nl', name: 'Dutch', region: 'Europe', script: 'Latin',
    where: 'the Netherlands, Belgium and Suriname',
    phrases: [
      { text: 'Hallo', meaning: 'Hello' },
      { text: 'Goedemorgen', meaning: 'Good morning' },
      { text: 'Dank je wel', meaning: 'Thank you' },
      { text: 'Alsjeblieft', meaning: 'Please / Here you go' },
      { text: 'Hoe gaat het?', meaning: 'How is it going?' },
      { text: 'Tot ziens', meaning: 'See you' },
      { text: 'Sorry hoor', meaning: 'Sorry' },
      { text: 'Wat kost het?', meaning: 'What does it cost?' },
      { text: 'Welterusten', meaning: 'Sleep well' },
      { text: 'Proost', meaning: 'Cheers' },
    ],
  },
  {
    code: 'sv', name: 'Swedish', region: 'Europe', script: 'Latin',
    where: 'Sweden and parts of Finland',
    phrases: [
      { text: 'Hej', meaning: 'Hello' },
      { text: 'God morgon', meaning: 'Good morning' },
      { text: 'Tack så mycket', meaning: 'Thank you very much' },
      { text: 'Hur mår du?', meaning: 'How are you?' },
      { text: 'Hej då', meaning: 'Bye' },
      { text: 'Förlåt', meaning: 'Sorry' },
      { text: 'Vad kostar det?', meaning: 'What does it cost?' },
      { text: 'God natt', meaning: 'Good night' },
      { text: 'Skål', meaning: 'Cheers' },
      { text: 'Varsågod', meaning: 'You are welcome' },
    ],
  },
  {
    code: 'no', name: 'Norwegian', region: 'Europe', script: 'Latin',
    where: 'Norway',
    phrases: [
      { text: 'Hei', meaning: 'Hello' },
      { text: 'God morgen', meaning: 'Good morning' },
      { text: 'Tusen takk', meaning: 'Thank you very much' },
      { text: 'Hvordan går det?', meaning: 'How is it going?' },
      { text: 'Ha det bra', meaning: 'Goodbye' },
      { text: 'Unnskyld', meaning: 'Excuse me' },
      { text: 'Hva koster det?', meaning: 'What does it cost?' },
      { text: 'God natt', meaning: 'Good night' },
      { text: 'Skål', meaning: 'Cheers' },
      { text: 'Vær så snill', meaning: 'Please' },
    ],
  },
  {
    code: 'da', name: 'Danish', region: 'Europe', script: 'Latin',
    where: 'Denmark, Greenland and the Faroe Islands',
    phrases: [
      { text: 'Hej med dig', meaning: 'Hello there' },
      { text: 'Godmorgen', meaning: 'Good morning' },
      { text: 'Mange tak', meaning: 'Many thanks' },
      { text: 'Hvordan går det?', meaning: 'How is it going?' },
      { text: 'Farvel', meaning: 'Goodbye' },
      { text: 'Undskyld', meaning: 'Excuse me' },
      { text: 'Hvad koster det?', meaning: 'What does it cost?' },
      { text: 'Godnat', meaning: 'Good night' },
      { text: 'Skål', meaning: 'Cheers' },
      { text: 'Værsgo', meaning: 'Here you go' },
    ],
  },
  {
    code: 'fi', name: 'Finnish', region: 'Europe', script: 'Latin',
    where: 'Finland',
    phrases: [
      { text: 'Moi', meaning: 'Hi' },
      { text: 'Hyvää huomenta', meaning: 'Good morning' },
      { text: 'Kiitos paljon', meaning: 'Thank you very much' },
      { text: 'Mitä kuuluu?', meaning: 'How are you?' },
      { text: 'Näkemiin', meaning: 'Goodbye' },
      { text: 'Anteeksi', meaning: 'Excuse me / Sorry' },
      { text: 'Paljonko se maksaa?', meaning: 'How much does it cost?' },
      { text: 'Hyvää yötä', meaning: 'Good night' },
      { text: 'Kippis', meaning: 'Cheers' },
      { text: 'Ole hyvä', meaning: 'Please / Here you go' },
    ],
  },
  {
    code: 'pl', name: 'Polish', region: 'Europe', script: 'Latin',
    where: 'Poland',
    phrases: [
      { text: 'Cześć', meaning: 'Hi' },
      { text: 'Dzień dobry', meaning: 'Good day' },
      { text: 'Dziękuję bardzo', meaning: 'Thank you very much' },
      { text: 'Proszę', meaning: 'Please' },
      { text: 'Jak się masz?', meaning: 'How are you?' },
      { text: 'Do widzenia', meaning: 'Goodbye' },
      { text: 'Przepraszam', meaning: 'Excuse me / Sorry' },
      { text: 'Ile to kosztuje?', meaning: 'How much is it?' },
      { text: 'Dobranoc', meaning: 'Good night' },
      { text: 'Na zdrowie', meaning: 'Cheers / Bless you' },
    ],
  },
  {
    code: 'cs', name: 'Czech', region: 'Europe', script: 'Latin',
    where: 'Czechia',
    phrases: [
      { text: 'Ahoj', meaning: 'Hi / Bye' },
      { text: 'Dobrý den', meaning: 'Good day' },
      { text: 'Děkuji mnohokrát', meaning: 'Thank you very much' },
      { text: 'Prosím', meaning: 'Please' },
      { text: 'Jak se máš?', meaning: 'How are you?' },
      { text: 'Na shledanou', meaning: 'Goodbye' },
      { text: 'Promiňte', meaning: 'Excuse me' },
      { text: 'Kolik to stojí?', meaning: 'How much is it?' },
      { text: 'Dobrou noc', meaning: 'Good night' },
      { text: 'Na zdraví', meaning: 'Cheers' },
    ],
  },
  {
    code: 'ro', name: 'Romanian', region: 'Europe', script: 'Latin',
    where: 'Romania and Moldova',
    phrases: [
      { text: 'Bună', meaning: 'Hi' },
      { text: 'Bună dimineața', meaning: 'Good morning' },
      { text: 'Mulțumesc mult', meaning: 'Thank you very much' },
      { text: 'Te rog', meaning: 'Please' },
      { text: 'Ce mai faci?', meaning: 'How are you?' },
      { text: 'La revedere', meaning: 'Goodbye' },
      { text: 'Scuze', meaning: 'Sorry' },
      { text: 'Cât costă?', meaning: 'How much does it cost?' },
      { text: 'Noapte bună', meaning: 'Good night' },
      { text: 'Noroc', meaning: 'Cheers' },
    ],
  },
  {
    code: 'hu', name: 'Hungarian', region: 'Europe', script: 'Latin',
    where: 'Hungary',
    phrases: [
      { text: 'Szia', meaning: 'Hi' },
      { text: 'Jó reggelt', meaning: 'Good morning' },
      { text: 'Köszönöm szépen', meaning: 'Thank you very much' },
      { text: 'Kérem', meaning: 'Please' },
      { text: 'Hogy vagy?', meaning: 'How are you?' },
      { text: 'Viszontlátásra', meaning: 'Goodbye' },
      { text: 'Elnézést', meaning: 'Excuse me' },
      { text: 'Mennyibe kerül?', meaning: 'How much does it cost?' },
      { text: 'Jó éjszakát', meaning: 'Good night' },
      { text: 'Egészségedre', meaning: 'Cheers' },
    ],
  },
  {
    code: 'hr', name: 'Croatian', region: 'Europe', script: 'Latin',
    where: 'Croatia and Bosnia and Herzegovina',
    phrases: [
      { text: 'Bok', meaning: 'Hi' },
      { text: 'Dobro jutro', meaning: 'Good morning' },
      { text: 'Hvala lijepa', meaning: 'Thank you kindly' },
      { text: 'Molim', meaning: 'Please' },
      { text: 'Kako si?', meaning: 'How are you?' },
      { text: 'Doviđenja', meaning: 'Goodbye' },
      { text: 'Oprostite', meaning: 'Excuse me' },
      { text: 'Koliko košta?', meaning: 'How much is it?' },
      { text: 'Laku noć', meaning: 'Good night' },
      { text: 'Živjeli', meaning: 'Cheers' },
    ],
  },
  {
    code: 'tr', name: 'Turkish', region: 'Asia', script: 'Latin',
    where: 'Türkiye and Cyprus',
    phrases: [
      { text: 'Merhaba', meaning: 'Hello' },
      { text: 'Günaydın', meaning: 'Good morning' },
      { text: 'Çok teşekkür ederim', meaning: 'Thank you very much' },
      { text: 'Lütfen', meaning: 'Please' },
      { text: 'Nasılsın?', meaning: 'How are you?' },
      { text: 'Hoşça kal', meaning: 'Goodbye' },
      { text: 'Affedersiniz', meaning: 'Excuse me' },
      { text: 'Ne kadar?', meaning: 'How much?' },
      { text: 'İyi geceler', meaning: 'Good night' },
      { text: 'Şerefe', meaning: 'Cheers' },
    ],
  },
  {
    code: 'el', name: 'Greek', region: 'Europe', script: 'Greek',
    where: 'Greece and Cyprus',
    phrases: [
      { text: 'Γειά σου', roman: 'Yia sou', meaning: 'Hello' },
      { text: 'Καλημέρα', roman: 'Kalimera', meaning: 'Good morning' },
      { text: 'Ευχαριστώ πολύ', roman: 'Efharisto poli', meaning: 'Thank you very much' },
      { text: 'Παρακαλώ', roman: 'Parakalo', meaning: 'Please / You are welcome' },
      { text: 'Τι κάνεις;', roman: 'Ti kaneis?', meaning: 'How are you?' },
      { text: 'Αντίο', roman: 'Adio', meaning: 'Goodbye' },
      { text: 'Συγγνώμη', roman: 'Signomi', meaning: 'Sorry' },
      { text: 'Πόσο κάνει;', roman: 'Poso kanei?', meaning: 'How much is it?' },
      { text: 'Καληνύχτα', roman: 'Kalinihta', meaning: 'Good night' },
      { text: 'Στην υγειά μας', roman: 'Stin ygeia mas', meaning: 'Cheers' },
    ],
  },
  {
    code: 'ru', name: 'Russian', region: 'Europe', script: 'Cyrillic',
    where: 'Russia and much of Central Asia',
    phrases: [
      { text: 'Привет', roman: 'Privet', meaning: 'Hi' },
      { text: 'Доброе утро', roman: 'Dobroye utro', meaning: 'Good morning' },
      { text: 'Спасибо большое', roman: 'Spasibo bolshoye', meaning: 'Thank you very much' },
      { text: 'Пожалуйста', roman: 'Pozhaluysta', meaning: 'Please' },
      { text: 'Как дела?', roman: 'Kak dela?', meaning: 'How are you?' },
      { text: 'До свидания', roman: 'Do svidaniya', meaning: 'Goodbye' },
      { text: 'Извините', roman: 'Izvinite', meaning: 'Excuse me' },
      { text: 'Сколько стоит?', roman: 'Skolko stoit?', meaning: 'How much is it?' },
      { text: 'Спокойной ночи', roman: 'Spokoynoy nochi', meaning: 'Good night' },
      { text: 'На здоровье', roman: 'Na zdorovye', meaning: 'You are welcome' },
    ],
  },
  {
    code: 'uk', name: 'Ukrainian', region: 'Europe', script: 'Cyrillic',
    where: 'Ukraine',
    phrases: [
      { text: 'Привіт', roman: 'Pryvit', meaning: 'Hi' },
      { text: 'Доброго ранку', roman: 'Dobroho ranku', meaning: 'Good morning' },
      { text: 'Дуже дякую', roman: 'Duzhe diakuiu', meaning: 'Thank you very much' },
      { text: 'Будь ласка', roman: 'Bud laska', meaning: 'Please' },
      { text: 'Як справи?', roman: 'Yak spravy?', meaning: 'How are you?' },
      { text: 'До побачення', roman: 'Do pobachennia', meaning: 'Goodbye' },
      { text: 'Вибачте', roman: 'Vybachte', meaning: 'Excuse me' },
      { text: 'Скільки коштує?', roman: 'Skilky koshtuie?', meaning: 'How much is it?' },
      { text: 'На добраніч', roman: 'Na dobranich', meaning: 'Good night' },
      { text: 'Будьмо', roman: 'Budmo', meaning: 'Cheers' },
    ],
  },
  {
    code: 'ja', name: 'Japanese', region: 'Asia', script: 'Japanese',
    where: 'Japan',
    phrases: [
      { text: 'こんにちは', roman: 'Konnichiwa', meaning: 'Hello' },
      { text: 'おはようございます', roman: 'Ohayō gozaimasu', meaning: 'Good morning' },
      { text: 'ありがとうございます', roman: 'Arigatō gozaimasu', meaning: 'Thank you very much' },
      { text: 'お願いします', roman: 'Onegaishimasu', meaning: 'Please' },
      { text: 'お元気ですか', roman: 'Ogenki desu ka', meaning: 'How are you?' },
      { text: 'さようなら', roman: 'Sayōnara', meaning: 'Goodbye' },
      { text: 'すみません', roman: 'Sumimasen', meaning: 'Excuse me / Sorry' },
      { text: 'いくらですか', roman: 'Ikura desu ka', meaning: 'How much is it?' },
      { text: 'おやすみなさい', roman: 'Oyasuminasai', meaning: 'Good night' },
      { text: '乾杯', roman: 'Kanpai', meaning: 'Cheers' },
    ],
  },
  {
    code: 'ko', name: 'Korean', region: 'Asia', script: 'Hangul',
    where: 'South and North Korea',
    phrases: [
      { text: '안녕하세요', roman: 'Annyeonghaseyo', meaning: 'Hello' },
      { text: '좋은 아침이에요', roman: 'Joeun achimieyo', meaning: 'Good morning' },
      { text: '감사합니다', roman: 'Gamsahamnida', meaning: 'Thank you' },
      { text: '주세요', roman: 'Juseyo', meaning: 'Please give me' },
      { text: '잘 지내세요?', roman: 'Jal jinaeseyo?', meaning: 'How are you?' },
      { text: '안녕히 계세요', roman: 'Annyeonghi gyeseyo', meaning: 'Goodbye' },
      { text: '죄송합니다', roman: 'Joesonghamnida', meaning: 'I am sorry' },
      { text: '얼마예요?', roman: 'Eolmayeyo?', meaning: 'How much is it?' },
      { text: '안녕히 주무세요', roman: 'Annyeonghi jumuseyo', meaning: 'Good night' },
      { text: '건배', roman: 'Geonbae', meaning: 'Cheers' },
    ],
  },
  {
    code: 'zh', name: 'Mandarin Chinese', region: 'Asia', script: 'Chinese',
    where: 'China, Taiwan and Singapore',
    phrases: [
      { text: '你好', roman: 'Nǐ hǎo', meaning: 'Hello' },
      { text: '早上好', roman: 'Zǎoshang hǎo', meaning: 'Good morning' },
      { text: '谢谢', roman: 'Xièxie', meaning: 'Thank you' },
      { text: '请', roman: 'Qǐng', meaning: 'Please' },
      { text: '你好吗？', roman: 'Nǐ hǎo ma?', meaning: 'How are you?' },
      { text: '再见', roman: 'Zàijiàn', meaning: 'Goodbye' },
      { text: '对不起', roman: 'Duìbùqǐ', meaning: 'Sorry' },
      { text: '多少钱？', roman: 'Duōshǎo qián?', meaning: 'How much is it?' },
      { text: '晚安', roman: 'Wǎn ān', meaning: 'Good night' },
      { text: '干杯', roman: 'Gānbēi', meaning: 'Cheers' },
    ],
  },
  {
    code: 'th', name: 'Thai', region: 'Asia', script: 'Thai',
    where: 'Thailand',
    phrases: [
      { text: 'สวัสดี', roman: 'Sawatdee', meaning: 'Hello' },
      { text: 'ขอบคุณ', roman: 'Khop khun', meaning: 'Thank you' },
      { text: 'สบายดีไหม', roman: 'Sabai dee mai', meaning: 'How are you?' },
      { text: 'ลาก่อน', roman: 'La kon', meaning: 'Goodbye' },
      { text: 'ขอโทษ', roman: 'Kho thot', meaning: 'Sorry / Excuse me' },
      { text: 'เท่าไหร่', roman: 'Tao rai', meaning: 'How much?' },
      { text: 'ราตรีสวัสดิ์', roman: 'Ratri sawat', meaning: 'Good night' },
      { text: 'ไม่เป็นไร', roman: 'Mai pen rai', meaning: 'No worries' },
      { text: 'อร่อย', roman: 'Aroi', meaning: 'Delicious' },
      { text: 'ชนแก้ว', roman: 'Chon kaew', meaning: 'Cheers' },
    ],
  },
  {
    code: 'vi', name: 'Vietnamese', region: 'Asia', script: 'Latin',
    where: 'Vietnam',
    phrases: [
      { text: 'Xin chào', meaning: 'Hello' },
      { text: 'Chào buổi sáng', meaning: 'Good morning' },
      { text: 'Cảm ơn nhiều', meaning: 'Thank you very much' },
      { text: 'Làm ơn', meaning: 'Please' },
      { text: 'Bạn khỏe không?', meaning: 'How are you?' },
      { text: 'Tạm biệt', meaning: 'Goodbye' },
      { text: 'Xin lỗi', meaning: 'Sorry / Excuse me' },
      { text: 'Bao nhiêu tiền?', meaning: 'How much is it?' },
      { text: 'Chúc ngủ ngon', meaning: 'Good night' },
      { text: 'Một hai ba dô', meaning: 'Cheers' },
    ],
  },
  {
    code: 'id', name: 'Indonesian', region: 'Asia', script: 'Latin',
    where: 'Indonesia',
    phrases: [
      { text: 'Halo', meaning: 'Hello' },
      { text: 'Selamat pagi', meaning: 'Good morning' },
      { text: 'Terima kasih banyak', meaning: 'Thank you very much' },
      { text: 'Tolong', meaning: 'Please / Help' },
      { text: 'Apa kabar?', meaning: 'How are you?' },
      { text: 'Sampai jumpa', meaning: 'See you' },
      { text: 'Maaf', meaning: 'Sorry' },
      { text: 'Berapa harganya?', meaning: 'How much is it?' },
      { text: 'Selamat malam', meaning: 'Good evening / Good night' },
      { text: 'Enak sekali', meaning: 'Very tasty' },
    ],
  },
  {
    code: 'hi', name: 'Hindi', region: 'Asia', script: 'Devanagari',
    where: 'northern India',
    phrases: [
      { text: 'नमस्ते', roman: 'Namaste', meaning: 'Hello' },
      { text: 'सुप्रभात', roman: 'Suprabhat', meaning: 'Good morning' },
      { text: 'धन्यवाद', roman: 'Dhanyavaad', meaning: 'Thank you' },
      { text: 'कृपया', roman: 'Kripya', meaning: 'Please' },
      { text: 'आप कैसे हैं?', roman: 'Aap kaise hain?', meaning: 'How are you?' },
      { text: 'अलविदा', roman: 'Alvida', meaning: 'Goodbye' },
      { text: 'माफ़ कीजिए', roman: 'Maaf kijiye', meaning: 'Excuse me' },
      { text: 'यह कितने का है?', roman: 'Yeh kitne ka hai?', meaning: 'How much is this?' },
      { text: 'शुभ रात्रि', roman: 'Shubh ratri', meaning: 'Good night' },
      { text: 'बहुत अच्छा', roman: 'Bahut achha', meaning: 'Very good' },
    ],
  },
  {
    code: 'ar', name: 'Arabic', region: 'Asia', script: 'Arabic',
    where: 'North Africa and the Middle East',
    phrases: [
      { text: 'مرحبا', roman: 'Marhaba', meaning: 'Hello' },
      { text: 'صباح الخير', roman: 'Sabah al-khayr', meaning: 'Good morning' },
      { text: 'شكرا جزيلا', roman: 'Shukran jazilan', meaning: 'Thank you very much' },
      { text: 'من فضلك', roman: 'Min fadlik', meaning: 'Please' },
      { text: 'كيف حالك؟', roman: 'Kayf halak?', meaning: 'How are you?' },
      { text: 'مع السلامة', roman: "Ma'a as-salama", meaning: 'Goodbye' },
      { text: 'آسف', roman: 'Asif', meaning: 'Sorry' },
      { text: 'بكم هذا؟', roman: 'Bikam hatha?', meaning: 'How much is this?' },
      { text: 'تصبح على خير', roman: "Tusbih 'ala khayr", meaning: 'Good night' },
      { text: 'إن شاء الله', roman: 'In sha Allah', meaning: 'God willing' },
    ],
  },
  {
    code: 'he', name: 'Hebrew', region: 'Asia', script: 'Hebrew',
    where: 'Israel',
    phrases: [
      { text: 'שלום', roman: 'Shalom', meaning: 'Hello / Peace' },
      { text: 'בוקר טוב', roman: 'Boker tov', meaning: 'Good morning' },
      { text: 'תודה רבה', roman: 'Toda raba', meaning: 'Thank you very much' },
      { text: 'בבקשה', roman: 'Bevakasha', meaning: 'Please' },
      { text: 'מה שלומך?', roman: 'Ma shlomkha?', meaning: 'How are you?' },
      { text: 'להתראות', roman: "Lehitra'ot", meaning: 'See you' },
      { text: 'סליחה', roman: 'Slicha', meaning: 'Excuse me' },
      { text: 'כמה זה עולה?', roman: 'Kama ze ole?', meaning: 'How much is it?' },
      { text: 'לילה טוב', roman: 'Layla tov', meaning: 'Good night' },
      { text: 'לחיים', roman: 'Lechaim', meaning: 'Cheers / To life' },
    ],
  },
  {
    code: 'sw', name: 'Swahili', region: 'Africa', script: 'Latin',
    where: 'Kenya, Tanzania and Uganda',
    phrases: [
      { text: 'Jambo', meaning: 'Hello' },
      { text: 'Habari za asubuhi', meaning: 'Good morning' },
      { text: 'Asante sana', meaning: 'Thank you very much' },
      { text: 'Tafadhali', meaning: 'Please' },
      { text: 'Habari yako?', meaning: 'How are you?' },
      { text: 'Kwaheri', meaning: 'Goodbye' },
      { text: 'Samahani', meaning: 'Excuse me / Sorry' },
      { text: 'Bei gani?', meaning: 'What price?' },
      { text: 'Usiku mwema', meaning: 'Good night' },
      { text: 'Hakuna matata', meaning: 'No worries' },
    ],
  },
  {
    code: 'af', name: 'Afrikaans', region: 'Africa', script: 'Latin',
    where: 'South Africa and Namibia',
    phrases: [
      { text: 'Hallo', meaning: 'Hello' },
      { text: 'Goeie môre', meaning: 'Good morning' },
      { text: 'Baie dankie', meaning: 'Thank you very much' },
      { text: 'Asseblief', meaning: 'Please' },
      { text: 'Hoe gaan dit?', meaning: 'How is it going?' },
      { text: 'Totsiens', meaning: 'Goodbye' },
      { text: 'Verskoon my', meaning: 'Excuse me' },
      { text: 'Hoeveel kos dit?', meaning: 'How much does it cost?' },
      { text: 'Goeie nag', meaning: 'Good night' },
      { text: 'Gesondheid', meaning: 'Cheers / Bless you' },
    ],
  },
  {
    code: 'is', name: 'Icelandic', region: 'Europe', script: 'Latin',
    where: 'Iceland',
    phrases: [
      { text: 'Halló', meaning: 'Hello' },
      { text: 'Góðan daginn', meaning: 'Good day' },
      { text: 'Takk fyrir', meaning: 'Thank you' },
      { text: 'Gjörðu svo vel', meaning: 'Here you go / Please' },
      { text: 'Hvað segirðu gott?', meaning: 'How are you?' },
      { text: 'Bless', meaning: 'Bye' },
      { text: 'Afsakið', meaning: 'Excuse me' },
      { text: 'Hvað kostar þetta?', meaning: 'How much is this?' },
      { text: 'Góða nótt', meaning: 'Good night' },
      { text: 'Skál', meaning: 'Cheers' },
    ],
  },
  {
    code: 'ga', name: 'Irish', region: 'Europe', script: 'Latin',
    where: 'Ireland',
    phrases: [
      { text: 'Dia duit', meaning: 'Hello (literally: God be with you)' },
      { text: 'Maidin mhaith', meaning: 'Good morning' },
      { text: 'Go raibh maith agat', meaning: 'Thank you' },
      { text: 'Le do thoil', meaning: 'Please' },
      { text: 'Conas atá tú?', meaning: 'How are you?' },
      { text: 'Slán', meaning: 'Goodbye' },
      { text: 'Gabh mo leithscéal', meaning: 'Excuse me' },
      { text: 'Cé mhéad atá air?', meaning: 'How much is it?' },
      { text: 'Oíche mhaith', meaning: 'Good night' },
      { text: 'Sláinte', meaning: 'Cheers / Health' },
    ],
  },
  {
    code: 'cy', name: 'Welsh', region: 'Europe', script: 'Latin',
    where: 'Wales',
    phrases: [
      { text: 'Helô', meaning: 'Hello' },
      { text: 'Bore da', meaning: 'Good morning' },
      { text: 'Diolch yn fawr', meaning: 'Thank you very much' },
      { text: 'Os gwelwch yn dda', meaning: 'Please' },
      { text: 'Sut wyt ti?', meaning: 'How are you?' },
      { text: 'Hwyl fawr', meaning: 'Goodbye' },
      { text: 'Esgusodwch fi', meaning: 'Excuse me' },
      { text: 'Faint yw e?', meaning: 'How much is it?' },
      { text: 'Nos da', meaning: 'Good night' },
      { text: 'Iechyd da', meaning: 'Cheers / Good health' },
    ],
  },
  {
    code: 'tl', name: 'Filipino', region: 'Asia', script: 'Latin',
    where: 'the Philippines',
    phrases: [
      { text: 'Kumusta', meaning: 'Hello / How are you?' },
      { text: 'Magandang umaga', meaning: 'Good morning' },
      { text: 'Maraming salamat', meaning: 'Thank you very much' },
      { text: 'Pakiusap', meaning: 'Please' },
      { text: 'Paalam', meaning: 'Goodbye' },
      { text: 'Pasensya na', meaning: 'Sorry' },
      { text: 'Magkano ito?', meaning: 'How much is this?' },
      { text: 'Magandang gabi', meaning: 'Good evening' },
      { text: 'Masarap', meaning: 'Delicious' },
      { text: 'Ingat ka', meaning: 'Take care' },
    ],
  },
]

export const LANGUAGE_REGIONS = ['World', 'Europe', 'Asia', 'Africa']

/** Languages available for a round in this region. */
export function languagesForRegion(region) {
  return region === 'World' ? LANGUAGES : LANGUAGES.filter((l) => l.region === region)
}

/**
 * Build one question: a phrase, and four languages to choose between.
 *
 * `rand` is injected rather than reaching for Math.random, so the page can pass
 * a seeded generator the day this becomes a daily puzzle and everybody gets the
 * same round - and so it is testable, which a function that calls Math.random
 * inside itself is not.
 *
 * The three wrong answers are drawn from the SAME REGION where there are enough
 * of them, then topped up from anywhere. Offering Japanese, Swahili and Welsh
 * against a Spanish phrase is not a question, it is a formality; Portuguese,
 * Italian and Romanian against it is a real one.
 */
export function buildQuestion(pool, rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const answer = pick(pool)
  const phrase = pick(answer.phrases)

  const sameRegion = pool.filter((l) => l.code !== answer.code && l.region === answer.region)
  const elsewhere = pool.filter((l) => l.code !== answer.code && l.region !== answer.region)
  const distractors = []

  // ALWAYS FOUR OPTIONS, AND THE OLD LOOP COULD NOT PROMISE THAT.
  //
  // Ethan: "sometimes it only shows up two options". The previous version asked
  // for a language from `sameRegion` while `sameRegion.length` was non-zero -
  // but the length it tested was of the WHOLE region list, not of what was left
  // after removing the ones already chosen. Answer a phrase from a region
  // holding two languages and the second pass found nothing new, hit the
  // no-progress guard, and broke out with one distractor and a two-button
  // question. It was not rare either: it happened every time the answer came
  // from a thin region, which is most of Africa in this bank.
  //
  // Each source is now tried until it is genuinely exhausted, and the loop only
  // gives up when BOTH are. With 34 languages in the bank it never does.
  const takeFrom = (from) => {
    const remaining = from.filter((l) => !distractors.some((d) => d.code === l.code))
    if (!remaining.length) return false
    distractors.push(pick(remaining))
    return true
  }
  while (distractors.length < 3) {
    // Two from next door where they exist, because a near-miss is the question;
    // after that anywhere will do rather than leave a gap in the grid.
    const wantSame = distractors.length < 2
    const got = (wantSame && takeFrom(sameRegion)) || takeFrom(elsewhere) || takeFrom(sameRegion)
    if (!got) break
  }

  const choices = [answer, ...distractors]
  // Fisher-Yates, so the right answer is not always first.
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }

  return { phrase, answer, choices }
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

/**
 * The ten questions for one UK day. Never asks the same language twice in a
 * round: with ten questions out of a bank of 34, a repeat is both likely and
 * reads as the puzzle having run out of ideas.
 */
export function dailyLanguageRound(day, count = DAILY_LANGUAGE_ROUNDS) {
  // A large odd multiplier keeps consecutive days far apart in the sequence, so
  // Tuesday's round is not Monday's with one phrase swapped.
  const rand = mulberry32(day * 2654435761)
  const out = []
  const usedLanguages = new Set()
  let guard = 0
  while (out.length < count && guard++ < count * 60) {
    const q = buildQuestion(LANGUAGES, rand)
    if (usedLanguages.has(q.answer.code)) continue
    usedLanguages.add(q.answer.code)
    out.push(q)
  }
  return out
}
