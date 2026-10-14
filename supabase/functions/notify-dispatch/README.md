# notify-dispatch

Sends Web Push + email when a row is inserted into `public.notifications`, so
creators get alerts even when the PWA is fully closed.

## One-time setup

1. **Deploy the function**
   ```bash
   supabase functions deploy notify-dispatch --no-verify-jwt
   ```

2. **Set the secrets**
   ```bash
   supabase secrets set \
     VAPID_PUBLIC_KEY=<public key in src/lib/push.js> \
     VAPID_PRIVATE_KEY=<private key - kept out of git; ask the team> \
     APP_URL=https://trypcreators.vercel.app
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
   The VAPID private key is not committed; it is stored with the team / in the
   project's secret store.)

3. There is no email provider: this function sends web push only (Resend was set up once, never used, and removed on
   14 Oct 2026).

4. **Create the Database Webhook**: Supabase Dashboard → Database → Webhooks →
   *Create*, table `public.notifications`, event **INSERT**, type **HTTP Request**,
   method **POST**, URL = this function's URL. That fires the function for every
   new notification.

## Behaviour
- Web push: sent to every device in `push_subscriptions` for the recipient.
  Expired subscriptions (404/410) are deleted automatically.
- Email: only for `announcement`, `challenge`, `event`, `results`, `application`
  and only when the creator has `email_opt_in = true`.
