# MiddlemanSafePlace.com

A small Express website for submitting middleman transaction requests with live chat support.

## Getting started

1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
npm start
```

3. Open the site

```text
http://localhost:3000
```

## Features

- Account creation and login required before requesting a middleman
- Transaction request form available after login
- Live chat support for customer questions
- Optional email notifications when a request is submitted

## Email setup

To enable email notifications, set the following environment variables before running the app:

```bash
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=smtp-user@example.com
export SMTP_PASS=your-smtp-password
export SMTP_SECURE=false
export SMTP_FROM=noreply@middlemansafeplace.com
export ADMIN_EMAIL=richardmadrid12@proton.me
export ADMIN_PASSWORD=richardmadrid12@proton.me
```

By default, the admin dashboard account uses:

- Email: `richardmadrid12@proton.me`
- Password: `richardmadrid12@proton.me`

If SMTP is not configured, the server still accepts requests and logs notification details to the console.

## Deployment

This app includes a `Dockerfile` and GitHub Actions workflow for automated builds.

To deploy:

1. Build the Docker image locally:

```bash
docker build -t middlemansafeplace:latest .
```

2. Run it locally:

```bash
docker run -p 3000:3000 middlemansafeplace:latest
```

3. Push to a host or Docker registry and configure a server to run the container.

4. Register `MiddlemanSafePlace.com`, then point DNS to your host:

- `A` record for `@` → your server IP
- `A` record for `www` → your server IP

If you prefer managed hosting, I can also add provider-specific config for Render, Vercel, Railway, or DigitalOcean.
