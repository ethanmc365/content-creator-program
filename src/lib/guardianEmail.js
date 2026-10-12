// THE EMAIL THE TEAM SENDS A PARENT OR GUARDIAN (12 Oct 2026).
//
// Ethan sends it himself from ethan@tryp.com: the platform cannot mail outside addresses until mail.tryp.com is
// verified, and he asked to do it. Admin > Agreements > Register copies it with the creator's own link filled in, in
// the parent's likely language (the creator's app language, else their country), English otherwise.

const T = {
  en: {
    subject: (c) => `${c} and the Tryp.com Creator Community: please confirm the terms`,
    body: ({ parent, creator, url }) => `Hi ${parent},

${creator} is a member of the Tryp.com Creator Community, where creators make travel videos for TikTok, Instagram and YouTube, take part in challenges and can win prizes.

The community is for people aged 18 and over. ${creator} joined before that rule came in, while under 18, so we ask a parent or guardian to read our Community Terms and confirm that you agree to ${creator} taking part.

You can read the terms and confirm here (it takes a minute and you do not need an account):
${url}

The page shows the full terms ${creator} accepted. In short: taking part is free, and any prize goes to ${creator} under the rules of each challenge. You can withdraw your agreement at any time by replying to this email.

If you have any questions, just reply and I will be happy to help.

Best wishes,
Ethan
Tryp.com Creator Community
ethan@tryp.com`,
  },
  es: {
    subject: (c) => `${c} y la Comunidad de Creadores de Tryp.com: confirma las condiciones`,
    body: ({ parent, creator, url }) => `Hola, ${parent}:

${creator} forma parte de la Comunidad de Creadores de Tryp.com, donde los creadores hacen vídeos de viajes para TikTok, Instagram y YouTube, participan en retos y pueden ganar premios.

La comunidad es para personas de 18 años o más. ${creator} se unió antes de que existiera esta norma, siendo menor de edad, por eso pedimos a su padre, madre o tutor legal que lea nuestras Condiciones de la Comunidad y confirme que está de acuerdo con que ${creator} participe.

Puedes leer las condiciones y confirmarlas aquí (es un minuto y no necesitas cuenta):
${url}

La página muestra las condiciones completas que aceptó ${creator}. En resumen: participar es gratis y cualquier premio es para ${creator} según las reglas de cada reto. Puedes retirar tu consentimiento en cualquier momento respondiendo a este correo.

Si tienes cualquier pregunta, responde a este correo y te ayudaré encantado.

Un saludo,
Ethan
Comunidad de Creadores de Tryp.com
ethan@tryp.com`,
  },
  de: {
    subject: (c) => `${c} und die Tryp.com Creator Community: Bitte bestätigen Sie die Bedingungen`,
    body: ({ parent, creator, url }) => `Hallo ${parent},

${creator} ist Mitglied der Tryp.com Creator Community, in der Creator Reisevideos für TikTok, Instagram und YouTube drehen, an Challenges teilnehmen und Preise gewinnen können.

Die Community ist für Personen ab 18 Jahren. ${creator} ist beigetreten, bevor diese Regel galt, und ist noch unter 18. Deshalb bitten wir einen Elternteil oder Erziehungsberechtigten, unsere Community-Bedingungen zu lesen und zu bestätigen, dass Sie mit der Teilnahme von ${creator} einverstanden sind.

Hier können Sie die Bedingungen lesen und bestätigen (das dauert eine Minute, ein Konto ist nicht nötig):
${url}

Die Seite zeigt die vollständigen Bedingungen, die ${creator} akzeptiert hat. Kurz gesagt: Die Teilnahme ist kostenlos, und Preise gehen nach den Regeln der jeweiligen Challenge an ${creator}. Sie können Ihr Einverständnis jederzeit widerrufen, indem Sie auf diese E-Mail antworten.

Wenn Sie Fragen haben, antworten Sie einfach auf diese E-Mail.

Viele Grüße
Ethan
Tryp.com Creator Community
ethan@tryp.com`,
  },
}

const BY_COUNTRY = { Spain: 'es', Mexico: 'es', Argentina: 'es', Colombia: 'es', Germany: 'de', Austria: 'de', Switzerland: 'de' }

/** The language to write to this creator's parent in. */
export function guardianEmailLang({ locale, country } = {}) {
  if (T[locale]) return locale
  return BY_COUNTRY[country] || 'en'
}

/** { subject, body, lang } for one parent. `url` is the creator's /guardian/<token> link. */
export function guardianEmail({ parent, creator, url, lang = 'en' }) {
  const t = T[lang] || T.en
  const first = String(creator || '').trim().split(/\s+/)[0] || creator
  return { lang, subject: t.subject(first), body: t.body({ parent: String(parent || '').trim().split(/\s+/)[0] || parent, creator: first, url }) }
}
