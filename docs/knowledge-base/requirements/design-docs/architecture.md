# MVP architecture

## Application

Next.js App Router with TypeScript and Tailwind CSS. Server components render catalog and roadmap data. Client components are limited to filtering and interest-form interactions.

## Firebase

Cloud Firestore is the persistent backend.

- `targets/{slug}` stores ranked catalog entries.
- `roadmap/{id}` stores ordered mission phases.
- `interest/{autoId}` stores validated builder or design-partner interest.

Firebase Admin initializes lazily from server-only environment variables. Catalog reads fall back to checked-in seed data when the backend is not configured or temporarily unavailable. Interest writes never pretend to succeed without Firestore.

The live Firebase project is `saasassin-net`. The default Firestore database is
in `eur3` with deletion protection. The local runtime uses a dedicated
`saasassin-web` service account granted only `roles/datastore.user`; its key stays
outside the repository and is referenced through `GOOGLE_APPLICATION_CREDENTIALS`.

## Security

Firestore rules deny direct client access for the MVP. All writes pass through a server route with field allowlists, length limits, consent validation, target validation, and a honeypot. Service-account credentials remain server-only.

## Deployment

The app is ready for a Node-compatible deployment. The canonical URL remains environment-controlled until `saasassin.net` resolves over HTTPS; local metadata defaults to `http://localhost:3000`.
