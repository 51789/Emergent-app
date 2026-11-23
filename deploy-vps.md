# Consulens on the VPS

The Compose project lives in `/opt/customers/consulens`. Its `docker-compose.yml` comes
from `compose.vps.yaml`, with the `mobile` and `server` source trees in `app/` and
`CONSULENS_SOURCE_DIR=./app` in the private server-side `.env`.

Run the following from the project directory after updating the sources.

```sh
docker compose build consulens-api consulens-web
docker compose up -d --no-build
docker compose ps -a
```

PostgreSQL stores accounts, sessions and searches in the `consulens_pgdata` volume.
The migration service upgrades the schema before the API and monitoring worker start.
Preserve the volume and the server-side `.env` across deployments.

Docker resolves the project's service names internally. The API and worker use public
DNS resolvers for external source pages because the VPS resolver timed out on listing sites.

In Nginx Proxy Manager add a Proxy Host for the chosen domain. Select **http**, set
**Forward Hostname / IP** to **consulens-web** and **Forward Port** to **80**. Both
containers join the external Docker network `proxy`. Point the domain's DNS at the VPS,
request a certificate and enable **Force SSL**. The PWA and `/api/v1` share that origin.
HTTPS enables installation and the offline connection screen.

Email/password registration and login use the local PostgreSQL database. The deployment
creates its initial administrator when both bootstrap variables are present. To enable
Google sign-in later, set the web client ID in both `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and
`GOOGLE_CLIENT_IDS`, register the HTTPS origin with the OAuth client, and rebuild.
