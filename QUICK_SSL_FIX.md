# Quick SSL Fix for cheapeatscanberra.au

## Immediate Steps to Fix ERR_CERT_COMMON_NAME_INVALID

### 1. Add Domain to Vercel (5 minutes)

1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Domains**
4. Click **Add Domain**
5. Enter: `cheapeatscanberra.au`
6. Click **Add**
7. Also add: `www.cheapeatscanberra.au` (optional but recommended)

### 2. Configure DNS (10 minutes)

Go to your domain registrar (where you bought cheapeatscanberra.au) and add:

**For root domain:**
```
Type: A
Name: @
Value: 76.76.21.21
TTL: Auto (or 3600)
```

**OR use CNAME (easier):**
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
TTL: Auto (or 3600)
```

**For www subdomain:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: Auto (or 3600)
```

### 3. Wait for SSL Certificate (5-60 minutes)

- Vercel will automatically provision SSL certificate
- Check status in Vercel dashboard: Settings → Domains
- Status should change from "Pending" to "Valid"

### 4. Clear Browser HSTS Cache

**Chrome/Edge:**
1. Open: `chrome://net-internals/#hsts`
2. Under "Delete domain security policies"
3. Enter: `cheapeatscanberra.au`
4. Click **Delete**
5. Close and reopen browser

**Opera:**
1. Open: `opera://net-internals/#hsts`
2. Delete domain: `cheapeatscanberra.au`
3. Close and reopen browser

### 5. Set Environment Variable in Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add or update:
   ```
   NEXT_PUBLIC_SITE_URL=https://cheapeatscanberra.au
   ```
3. Redeploy your project (or wait for next deployment)

### 6. Test

1. Wait 5-60 minutes after adding domain
2. Visit: `https://cheapeatscanberra.au`
3. Should see padlock icon ✅
4. No certificate errors

## If Still Not Working After 1 Hour

1. **Verify DNS propagation:**
   - Use: https://dnschecker.org/#A/cheapeatscanberra.au
   - Should show: `76.76.21.21` or CNAME pointing to Vercel

2. **Remove and re-add domain in Vercel:**
   - Remove domain from Vercel
   - Wait 5 minutes
   - Re-add domain
   - Verify DNS is correct

3. **Check Vercel domain status:**
   - Settings → Domains
   - Look for error messages
   - Certificate status should be "Valid"

## Common Domain Registrars DNS Settings

### GoDaddy
- Login → My Products → DNS
- Add A record: `@` → `76.76.21.21`
- Add CNAME: `www` → `cname.vercel-dns.com`

### Namecheap
- Login → Domain List → Manage → Advanced DNS
- Add A record: `@` → `76.76.21.21`
- Add CNAME: `www` → `cname.vercel-dns.com`

### Cloudflare
- Login → Select domain → DNS
- Add A record: `@` → `76.76.21.21` (Proxy: Off)
- Add CNAME: `www` → `cname.vercel-dns.com` (Proxy: Off)

## Need Help?

- Check full guide: `SSL_TROUBLESHOOTING.md`
- Vercel Docs: https://vercel.com/docs/concepts/projects/domains
- Vercel Support: Available in dashboard
