/**
 * Throwaway-mailbox providers: addresses on these domains can't be used to sign up or switch to.
 * Not exhaustive (new ones appear constantly); add a domain here when one shows up in practice.
 * Subdomains are covered too (x.mailinator.com is blocked by mailinator.com).
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "mailinator.net", "mailinator2.com", "notmailinator.com", "reallymymail.com", "sogetthis.com",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "guerrillamailblock.com",
  "sharklasers.com", "grr.la", "pokemail.net", "spam4.me", "guerrilla.ml",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "10minemail.com", "20minutemail.com", "minutemail.com",
  "temp-mail.org", "temp-mail.io", "temp-mail.ru", "tempmail.com", "tempmail.net", "tempmail.org", "tempmail.dev", "tempmailo.com",
  "tempmailaddress.com", "tempail.com", "tempinbox.com", "tempr.email", "temporary-mail.net", "temporaryemail.net",
  "throwawaymail.com", "throwaway.email", "trashmail.com", "trashmail.net", "trashmail.de", "trashmail.org", "trash-mail.com",
  "yopmail.com", "yopmail.net", "yopmail.fr", "cool.fr.nf", "jetable.org", "nospam.ze.tc",
  "getnada.com", "nada.email", "maildrop.cc", "dispostable.com", "fakeinbox.com", "fakemail.net", "emailfake.com", "fake-mail.net",
  "mintemail.com", "mohmal.com", "emailondeck.com", "mytemp.email", "burnermail.io", "discard.email", "discardmail.com",
  "spamgourmet.com", "mailnesia.com", "mailcatch.com", "moakt.com", "moakt.cc", "tmail.ws", "tmpmail.org", "tmpmail.net",
  "mail.tm", "inboxkitten.com", "harakirimail.com", "anonbox.net", "mailforspam.com", "spambox.us", "spamex.com",
  "dropmail.me", "mailpoof.com", "getairmail.com", "mailtemp.info", "mailsac.com", "inboxbear.com", "luxusmail.org",
  "emltmp.com", "gufum.com", "mailbox92.biz", "mvrht.net", "tempsky.com", "linshiyouxiang.net", "e4ward.com",
]);

/** The message the app shows; kept here so the sign-up and e-mail-change checks agree. */
export const DISPOSABLE_MESSAGE = "Geçici (tek kullanımlık) e-posta adresleri kabul edilmiyor. Lütfen kalıcı bir e-posta adresi kullan.";

/** True when the address's domain, or a parent of it, is a known disposable-mail provider. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
