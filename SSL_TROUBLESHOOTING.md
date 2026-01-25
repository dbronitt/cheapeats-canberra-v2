# SSL Certificate Troubleshooting for cheapeatscanberra.au

## Current Issue: ERR_CERT_COMMON_NAME_INVALID

This error means the SSL certificate doesn't match the domain name. Here's how to fix it:

## Step 1: Verify Domain in Vercel Dashboard

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Domains**
3. Check if `cheapeatscanberra.au` is listed
4. If not, add it:
   - Click **Add Domain**
   - Enter `cheapeatscanberra.au`
   - Also add `www.cheapeatscanberra.au` (if you want www support)

## Step 2: Verify DNS Configuration

Your DNS records should point to Vercel. Check your domain registrar:

### Required DNS Records:

**For root domain (cheapeatscanberra.au):**
```
Type: A
Name: @
Value: 76.76.21.21
```

**OR use CNAME (recommended by Vercel):**
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
```

**For www subdomain (www.cheapeatscanberra.au):**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### How to Check Current DNS:

Use these tools to verify your DNS:
- [DNS Checker](https://dnschecker.org/#A/cheapeatscanberra.au)
- [MXToolbox](https://mxtoolbox.com/DNSLookup.aspx)

## Step 3: Wait for SSL Certificate Provisioning

After adding the domain to Vercel:
- SSL certificate provisioning usually takes **5-60 minutes**
- Vercel uses Let's Encrypt to automatically provision certificates
- You'll see the status in Vercel dashboard (Settings → Domains)

### Certificate Status in Vercel:
- ✅ **Valid**: Certificate is active
- ⏳ **Pending**: Certificate is being provisioned (wait 5-60 minutes)
- ❌ **Invalid**: DNS not configured correctly

## Step 4: Clear Browser HSTS Cache

Since you're seeing HSTS errors, clear the browser's HSTS cache:

### Chrome/Edge:
1. Go to `chrome://net-internals/#hsts`
2. Under "Delete domain security policies", enter: `cheapeatscanberra.au`
3. Click **Delete**
4. Also try: `www.cheapeatscanberra.au`

### Firefox:
1. Go to `about:config`
2. Search for `security.tls.insecure_fallback_hosts`
3. Add `cheapeatscanberra.au` to the list

### Opera:
1. Go to `opera://net-internals/#hsts`
2. Delete domain: `cheapeatscanberra.au`

## Step 5: Verify SSL Certificate

Once the certificate is provisioned, verify it:

1. **Check in Browser:**
   - Visit `https://cheapeatscanberra.au`
   - Click the padlock icon
   - View certificate details

2. **Use Online Tools:**
   - [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/analyze.html?d=cheapeatscanberra.au)
   - [SSL Checker](https://www.sslshopper.com/ssl-checker.html#hostname=cheapeatscanberra.au)

## Step 6: Update Environment Variables

Make sure your environment variables use the correct domain:

In Vercel Dashboard → Settings → Environment Variables:
```
NEXT_PUBLIC_SITE_URL=https://cheapeatscanberra.au
```

## Common Issues and Solutions

### Issue: Certificate for wrong domain
**Solution:** Make sure both `cheapeatscanberra.au` and `www.cheapeatscanberra.au` are added to Vercel if you want to support both.

### Issue: DNS not propagated
**Solution:** DNS changes can take up to 48 hours. Use DNS checker tools to verify propagation.

### Issue: Certificate still pending after 1 hour
**Solution:** 
1. Remove domain from Vercel
2. Wait 5 minutes
3. Re-add domain
4. Verify DNS is correct

### Issue: HSTS blocking access
**Solution:** Clear browser HSTS cache (see Step 4 above)

## Testing After Fix

1. **Test HTTP to HTTPS redirect:**
   - Visit `http://cheapeatscanberra.au`
   - Should redirect to `https://cheapeatscanberra.au`

2. **Test SSL certificate:**
   - Visit `https://cheapeatscanberra.au`
   - Should show valid certificate with padlock icon

3. **Test www subdomain (if configured):**
   - Visit `https://www.cheapeatscanberra.au`
   - Should also work with valid certificate

## Quick Checklist

- [ ] Domain added to Vercel dashboard
- [ ] DNS records configured correctly
- [ ] DNS propagated (check with DNS checker)
- [ ] SSL certificate status is "Valid" in Vercel
- [ ] Browser HSTS cache cleared
- [ ] Environment variable `NEXT_PUBLIC_SITE_URL` updated
- [ ] Tested HTTPS access in browser
- [ ] Tested HTTP to HTTPS redirect

## Still Having Issues?

1. **Check Vercel Status:** [status.vercel.com](https://status.vercel.com)
2. **Vercel Support:** Contact Vercel support through dashboard
3. **Domain Registrar:** Contact your domain registrar if DNS issues persist

## Additional Notes

- Vercel automatically renews SSL certificates
- Certificates are valid for 90 days and auto-renew
- Both www and non-www versions need separate certificates if you support both
- HSTS preload requires both www and non-www to work correctly
