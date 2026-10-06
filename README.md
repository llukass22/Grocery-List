# Basket

A mobile-first grocery list using a Node.js API and a Hostinger MySQL-compatible (MariaDB) database. One private household list is shared by everyone who knows the household password. There are no separate user accounts.

## Hostinger setup

1. In hPanel, create a database and database user under **Websites → Dashboard → Databases → Management**. Copy the full database name and username, including Hostinger's prefixes, and the database host provided for your application.
2. Open phpMyAdmin for that database and import `schema.sql`. This creates the tables without deleting existing data.
3. Deploy the **basket directory as a Node.js application**, including `dist`, `server.cjs`, `app.cjs`, `database.cjs`, `package.json`, and `package-lock.json`. Select Node.js 22 or newer, set the application root to this directory, install with `npm ci`, and start with `npm start` (`server.cjs` is the entry point). There is no frontend build step. This now requires a running Node.js backend; uploading only `dist` is insufficient.
4. Set environment variables in the application's deployment settings using `.env.example` as a reference:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: use your Hostinger database details. Port is normally 3306; verify the host in hPanel.
   - `SHARED_PASSWORD`: a long private household password, at least 12 characters.
   - `SESSION_SECRET`: at least 32 random characters. Generate it locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `APP_ORIGIN`: your full public HTTPS origin, e.g. `https://groceries.example.com` (no path). Use the canonical domain; writes from another origin are rejected.
   - `NODE_ENV=production`. Hostinger may supply `PORT`; the server uses it automatically.
5. Enable HTTPS and restart the application after configuring environment variables. The entry point starts listening immediately, including when Hostinger loads it as a module. It then checks the database/schema and shuts down with a logged error if they are unavailable.
6. Open the website on two devices, unlock both with the household password, add an item on one device, and confirm it appears on the other within roughly five seconds. Check the row in phpMyAdmin. Test quantity changes, checking off, deleting, and clearing.

Official Hostinger connection instructions: https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/

Never place database credentials or the session secret in `dist` or frontend JavaScript. Only the Node.js server connects to the database. `.env` files are ignored by Git. Keep backups using your hosting account's backup tools.

## Local development

Install dependencies with `npm ci`, copy `.env.example` to `.env`, configure a local/test MySQL-compatible database, import `schema.sql`, then run `npm start`. The local URL is `http://localhost:5187`; `APP_ORIGIN` must match it. Use a separate test database rather than your production household list.

Run `npm run check` for syntax checks and `npm test` for API tests. API tests use an in-memory store to check access control, input validation, shared item operations, and error handling; they do not verify a real MySQL deployment. Finish the two-device database smoke test above after deploying.

## Sharing and existing device lists

- Add free-text items or category selections, choose quantities from 1–10, check off items, remove individual items, and clear when every item is checked.
- Other open devices refresh every five seconds while the page is visible. Changes to separate fields/items are saved separately. Simultaneous changes to the same field use the last committed value.
- Writes are confirmed by the server before appearing as saved. Offline writes are not queued; connection failures are shown and the user can retry. Refresh resumes on reconnection. A timed-out write may have reached the database: refresh before retrying an add.
- The old device-local list is preserved until you tap **Import the list saved on this device**. Import keeps each item's ID to avoid duplication on retries. It adds to the shared list and does not replace it. For more than 100 saved items, tap again to import the next batch.
- Local browser data belongs to its original origin. If you move to a different domain, import from the old origin before migrating or export those items separately; the new domain cannot access the old domain's local storage.
- Theme preferences stay on each device.
- Unlock sessions last seven days. **Lock list** removes this browser's session. Changing the household password or session secret invalidates all sessions after the server restarts.
- Database transactions serialize writes to protect clearing against concurrent additions or unchecking.

This configuration serves one household. To host unrelated households, extend the schema and authorization with separate accounts and memberships first. Login attempts are capped globally at 30/minute per server process; use hosting-level protection if exposing the application at a larger scale.

## Windows local development helpers

The optional scripts in `scripts` run a local MariaDB 11.8.9 instance from `.local-db` on `127.0.0.1:3307` and start the app for Windows development. The database is `basket_local`; the app uses a limited `basket_app` account. `.env` and `.local-db` contain local configuration and credentials and are excluded from Git. Do not upload them to hosting.

These helpers are Windows-only and are separate from cloud deployment. The cloud host should start the app with `npm start`; do not configure it to run `scripts/local.ps1`.

From the `basket` directory, use PowerShell 7 (`pwsh`):

```powershell
pwsh -File .\scripts\local.ps1 start
pwsh -File .\scripts\local.ps1 status
pwsh -File .\scripts\local.ps1 stop
```

The start command runs MariaDB and Basket in hidden background processes, checks readiness, and uses the bundled Node.js runtime when available (otherwise it requires installed Node.js 22+). Closing the terminal does not stop them. They are not Windows services and do not start automatically after restarting the computer. The stop command shuts the database down cleanly. Data stays in `.local-db/data` across restarts. Local runtime logs are in `.local-db`.

To unlock the app, open `.env` and copy the value after `SHARED_PASSWORD=`. Changing it requires stopping and starting the app. `scripts/local-admin.cjs` is strictly local setup tooling and reads the local root credential in `.local-db/admin.json`; the application itself never uses that credential.

The portable installation follows the official Windows ZIP instructions: https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-windows-zip-packages

### Additional development origins

To open the development app through another host or port, add its full origin to `APP_ALLOWED_ORIGINS` in `.env` and restart the app. Origins must match exactly; production additional origins must use HTTPS.
