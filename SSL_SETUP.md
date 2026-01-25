# SSL/HTTPS Configuration

This document describes the SSL/HTTPS implementation for CheapEats Canberra.

## Automatic SSL on Vercel

Vercel automatically provides SSL certificates for all deployments:

- **All deployments** get HTTPS by default (e.g., `https://cheapeats-canberra.vercel.app`)
- **Custom domains** automatically receive SSL certificates via Let's Encrypt
- **Certificate renewal** is handled automatically by Vercel
- **No manual configuration** required for SSL certificates

## Security Headers

The application enforces security headers to ensure secure connections:

### Headers Implemented

1. **Strict-Transport-Security (HSTS)**
   - Forces browsers to use HTTPS for all future requests
   - Max age: 1 year (31536000 seconds)
   - Includes subdomains and preload support

2. **X-Content-Type-Options: nosniff**
   - Prevents MIME type sniffing attacks

3. **X-Frame-Options: DENY**
   - Prevents clickjacking attacks

4. **X-XSS-Protection: 1; mode=block**
   - Enables XSS filtering in browsers

5. **Referrer-Policy: strict-origin-when-cross-origin**
   - Controls referrer information sent with requests

6. **Permissions-Policy**
   - Restricts access to browser features (camera, microphone, geolocation)

## Implementation Details

### Middleware (`middleware.ts`)
- Automatically redirects HTTP to HTTPS in production
- Applies security headers to all requests
- Skips redirect for localhost (development)

### Vercel Configuration (`vercel.json`)
- Defines security headers at the Vercel edge level
- Provides HTTP to HTTPS rewrite rules

### Next.js Configuration (`next.config.js`)
- Adds security headers via Next.js headers API
- Ensures headers are applied to all routes

## Database SSL

The PostgreSQL connection already includes SSL configuration:

```typescript
// src/lib/db.ts
if (connectionString.includes('sslmode=require') || connectionString.includes('neon.tech')) {
  sslConfig.ssl = { rejectUnauthorized: false };
}
```

This ensures encrypted connections to the database.

## Verification

To verify SSL is working:

1. **Check HTTPS in browser**: Visit your site and verify the padlock icon
2. **Test redirect**: Try accessing `http://your-domain.com` - should redirect to HTTPS
3. **Check headers**: Use browser DevTools or tools like [SecurityHeaders.com](https://securityheaders.com)
4. **SSL Labs**: Test with [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/)

## Custom Domain Setup

If you add a custom domain:

1. Add domain in Vercel dashboard: Settings → Domains
2. Vercel automatically provisions SSL certificate (usually within minutes)
3. DNS records will be provided by Vercel
4. SSL certificate is automatically renewed

## Local Development

- Local development uses HTTP (`http://localhost:3000`)
- HTTPS redirect is disabled for localhost
- Security headers are still applied but HTTPS redirect is skipped

## Troubleshooting

### SSL Certificate Not Working
- Check domain DNS settings in Vercel dashboard
- Wait a few minutes for certificate provisioning
- Verify DNS records are correct

### Mixed Content Warnings
- Ensure all external resources use HTTPS
- Check image URLs and API endpoints
- Update any hardcoded HTTP URLs to HTTPS

### HSTS Issues
- Clear browser cache if HSTS is causing issues
- Use incognito mode to test
- Check browser console for security warnings

## Additional Resources

- [Vercel SSL Documentation](https://vercel.com/docs/security/encryption)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/next-config-js/headers)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
