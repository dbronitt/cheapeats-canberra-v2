# SEO Improvements Guide

This document outlines the SEO improvements implemented for CheapEats Canberra.

## ✅ Implemented Improvements

### 1. Enhanced Metadata
- **Open Graph tags** for better social media sharing
- **Twitter Card** metadata for Twitter sharing
- **Comprehensive meta tags** including keywords, authors, and descriptions
- **Dynamic metadata** with template support for page-specific titles

### 2. Sitemap Generation
- **Automatic sitemap.xml** generation at `/sitemap.xml`
- Includes all static pages (home, map, submit)
- Can be extended to include individual restaurant pages

### 3. Robots.txt
- **Proper robots.txt** at `/robots.txt`
- Allows search engines to index public pages
- Blocks admin, API, and backup directories
- Points to sitemap location

### 4. Structured Data (JSON-LD)
- **Schema.org structured data** for better search engine understanding
- WebSite schema on homepage
- SearchAction schema for search functionality
- Restaurant schema utilities available for future use

### 5. Semantic HTML
- **Proper HTML5 semantic elements** (header, main, etc.)
- Better accessibility and SEO

## 📋 Additional Recommendations

### 1. Google Search Console
- Set up Google Search Console
- Add verification code to `app/layout.tsx` metadata.verification.google
- Submit sitemap: `https://your-domain.com/sitemap.xml`

### 2. Individual Restaurant Pages
Consider creating individual restaurant detail pages:
- Route: `/restaurant/[slug]`
- Dynamic metadata per restaurant
- Restaurant-specific structured data
- Better internal linking

### 3. Image Optimization
- Add proper alt text to all images
- Use Next.js Image component for optimization
- Consider WebP format for better performance

### 4. Performance Optimization
- Implement lazy loading for images
- Optimize bundle size
- Use Next.js Image optimization
- Consider implementing ISR (Incremental Static Regeneration)

### 5. Content Strategy
- Add more descriptive content to pages
- Create blog/content section for restaurant reviews
- Add FAQ section
- Include location-specific content

### 6. Local SEO
- Add Google Business Profile integration
- Include local business schema
- Add location-specific landing pages
- Implement local keywords

### 7. Technical SEO
- Ensure fast page load times
- Implement proper error handling (404, 500 pages)
- Add canonical URLs (already in metadata)
- Ensure mobile responsiveness

### 8. Analytics
- Set up Google Analytics
- Track user behavior
- Monitor search performance
- Track conversions

## 🔧 Configuration

### Environment Variables
Add to `.env.local`:
```
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### Google Search Console Verification
1. Go to Google Search Console
2. Add property
3. Copy verification code
4. Add to `app/layout.tsx`:
```typescript
verification: {
  google: 'your-verification-code',
},
```

## 📊 Monitoring

### Tools to Use
1. **Google Search Console** - Monitor search performance
2. **Google Analytics** - Track user behavior
3. **PageSpeed Insights** - Monitor performance
4. **Schema Markup Validator** - Validate structured data
5. **Rich Results Test** - Test rich snippets

### Key Metrics to Track
- Organic search traffic
- Keyword rankings
- Click-through rates (CTR)
- Page load times
- Mobile usability
- Core Web Vitals

## 🚀 Next Steps

1. ✅ Enhanced metadata - DONE
2. ✅ Sitemap generation - DONE
3. ✅ Robots.txt - DONE
4. ✅ Structured data - DONE
5. ⏳ Set up Google Search Console
6. ⏳ Create individual restaurant pages
7. ⏳ Add Google Analytics
8. ⏳ Optimize images
9. ⏳ Add more content
10. ⏳ Implement local SEO strategies
