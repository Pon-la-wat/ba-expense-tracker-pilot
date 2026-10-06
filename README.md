# ba-expense-tracker-pilot
ใช้ลองให้ BA ช่วยร่างเว็บบันทึกรายรับรายจ่าย ขอบเขตเข้าใจง่ายและคุยต่อได้หลายเรื่อง

## Running it

```
npm ci
npm run build
OWNER_EMAIL=you@example.com OWNER_PASSWORD=choose-a-password npm start
```

`OWNER_EMAIL` and `OWNER_PASSWORD` create the single account on the first start only
(the server refuses to start without an account). Settings, all optional after that:

| Variable | Meaning | Default |
| --- | --- | --- |
| `PORT`, `HOST` | where the server listens | `3000`, `127.0.0.1` |
| `DATA_FILE` | JSON file holding the account and entries (`:memory:` keeps nothing) | `data/ledger.json` |
| `PUBLIC_URL` | origin used in the password reset link | `http://127.0.0.1:<PORT>` |
| `MAIL_WEBHOOK_URL` | the reset mail is POSTed here as `{to, subject, text}` | none (the mail is only logged) |

Checks: `npm test`, `npm run lint`, `npm run build`, `npm run e2e`.

## Known limitations

- No mail is sent unless `MAIL_WEBHOOK_URL` points at a relay that sends it.
- Data lives in one JSON file on the server's disk; the host must keep that disk between restarts, and
  there is no separate backup (out of scope by choice).
- Sessions are kept in memory: restarting the server, or reloading the page, asks for the password again.
- No limit on wrong-password attempts yet; serve it over HTTPS.
- The delete confirmation does not trap keyboard focus inside the dialog.
