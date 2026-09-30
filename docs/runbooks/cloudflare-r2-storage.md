# Cloudflare R2 storage

Every file the platform stores lives in Cloudflare R2, in two buckets:

| Bucket | Holds | Access |
|---|---|---|
| **Public** (`R2_PUBLIC_BUCKET`) | Photos guests see: stay, rental and review photos | Served unsigned from your domain (`R2_PUBLIC_BASE_URL`) |
| **Private** (`R2_PRIVATE_BUCKET`) | Résumés and every private document: partner KYC, crew IDs, job evidence, requirement attachments | Never public. Opened only through signed links that expire in minutes |

Inside the private bucket, each kind of document has its own folder: `partner-kyc/`, `crew-identity/`, `fulfilment-evidence/`, `requirement-attachments/`, and `files/listing-resumes/` for résumés.

## 1. Create the buckets (Cloudflare dashboard → R2)

1. Create two buckets, for example `vsolve-public` and `vsolve-private`.
2. **Public bucket → Settings → Custom Domains:** connect a domain such as `media.vsolvehub.com`. That address is `R2_PUBLIC_BASE_URL`. The bucket's `r2.dev` link also works, but Cloudflare rate-limits it, so use a custom domain in production.
3. **Leave the private bucket with public access off.**
4. **Private bucket → Settings → CORS policy:** browsers upload documents straight to it with a signed `PUT`, so allow your app origins:

   ```json
   [
     {
       "AllowedOrigins": ["https://partner.vsolvehub.com", "https://vsolvehub.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. **R2 → Manage API tokens:** create a token with **Object Read & Write** on both buckets. Note the Access Key ID and Secret Access Key. The Account ID is shown on the R2 overview page.

## 2. Set the environment (backend, never in git)

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BUCKET=vsolve-public
R2_PUBLIC_BASE_URL=https://media.vsolvehub.com
R2_PRIVATE_BUCKET=vsolve-private
DOCUMENT_STORAGE_PROVIDER=r2
# optional: how long private signed links last, in seconds (default 300)
R2_PRIVATE_URL_TTL_SECONDS=300
```

Production refuses to start without these. Local development and tests keep using the local disk when they are unset.

## 3. Move files that already exist

Run once, after deploying with the settings above:

```
python manage.py copy_files_to_r2 --dry-run
python manage.py copy_files_to_r2 --api-base-url https://api.vsolvehub.com
python manage.py copy_files_to_r2 --include-supabase   # only if Supabase held private documents
```

- **Photos:** copied to the public bucket, and saved links (property, rental and listing photos, review photos) are repointed to the R2 domain.
- **Résumés:** copied to the private bucket. Applications get a signed résumé link on the API.
- **With `--include-supabase`:** private documents are copied from Supabase into the matching private-bucket folders. The keys stored in the database don't change.

The command can safely be run again. Anything already in R2 is skipped.

## Photo rules

JPEG, PNG or WebP, at most **10 MB** per photo, checked by the file's contents. A review can have up to 5 photos, and only the reviewer's own uploads.
