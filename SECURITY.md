# Security

## What this project handles

3D anatomy camera is a static site. Camera video and tracking landmarks are processed in the browser and are not sent anywhere: the app has no server, no accounts, no analytics and no upload endpoint, and its Content Security Policy allows connections to its own origin only. Settings are kept in the browser's `localStorage`.

The repository contains no credentials. Deployment uses the maintainer's own Cloudflare login, which is not stored here. If you find a key, token or other secret in the repository or its history, please report it as below instead of opening a public issue.

## Reporting a problem

Please use GitHub's private reporting: **Security → Report a vulnerability** on <https://github.com/keanu77/3D_anatomy_camera>. Describe what you did, what happened and what you expected. Do not include other people's images or personal data.

Problems worth reporting include anything that sends video, landmarks or settings off the device, a way around the Content Security Policy or the other response headers in `public/_headers`, a tampered model or anatomy file that passes the checksum checks, and script injection through stored settings, URL parameters or the reference text.

An anatomical error is not a security problem. Please open an ordinary issue for it and name a source.

## Supported version

Only the version served at <https://3danatomycamera.sportsmedicine.tw/> is maintained. Its commit is shown at `/version.json`.
