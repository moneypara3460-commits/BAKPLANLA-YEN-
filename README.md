# BAKPLANLA — Development Source

**Source snapshot:** `429a74895ca3bb5a50dec080afb654745007a651`

This package contains the application source and assets, locked dependencies, focused tests, versioned Supabase migrations, Edge Function sources, and an isolated cashier development module. It is prepared for independent technical review and controlled development setup.

## Requirements

- Node.js 24.x
- npm

## Install and run

1. Extract the package and open a terminal in this folder.
2. Copy `.env.example` to `.env.development.local`.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the isolated development project's values. Use only its publishable key in the app; keep service-role and provider credentials out of Expo configuration.
4. Install dependencies and run the project checks:

   ```sh
   npm ci
   npm run check
   npm run test:config
   npm run check:expo
   ```

5. Start the Expo development server:

   ```sh
   npm start
   ```

## Reproduce the full automated test set

PowerShell:

```powershell
$tests = Get-ChildItem scripts -Filter '*.test.cjs' | ForEach-Object { $_.FullName }
node --test $tests
```

POSIX shell:

```sh
node --test scripts/*.test.cjs
```

The accepted regression receipt for the application source reports 393 passed, 0 failed and 0 skipped. See `HANDOFF/TEST-AND-DEV-EVIDENCE.md` and `MANIFEST.sha256`.

## Backend setup

The package includes ordered, versioned migrations and function source. Before using a target environment, review its existing migration history and schema, then apply only the changes that are appropriate for that environment. Do not reset an existing project or replay migrations blindly. Hosted provider and device checks are summarized in the handoff evidence.

## Native verification

Camera, QR, OS notification, cold restart, backup/restore and push receipt require an appropriate development build and physical device. An Expo JavaScript start does not substitute for those checks.

## Integrity

`MANIFEST.sha256` lists the SHA-256 hash of each packaged file other than the manifest itself. The ZIP also has a separately recorded SHA-256 value in the delivery message.
