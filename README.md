# CheapEats Canberra

A comprehensive restaurant discovery platform for Canberra, Australia. Find restaurants, deals, happy hours, and weekly specials - all built with **100% free services**.

## 🚀 Features

- **Restaurant Discovery**: Browse restaurants by cuisine, suburb, price range
- **Real-Time Status**: See which restaurants are open right now
- **Interactive Map**: Leaflet + OpenStreetMap (100% free)
- **Deals & Specials**: Happy hours, weekly specials, and time-limited deals
- **Community Submissions**: Users can submit new restaurants and deals
- **Admin Panel**: Review and manage submissions
- **Mobile Responsive**: Works great on all devices

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL (Neon - free tier)
- **ORM**: Drizzle ORM
- **Maps**: Leaflet + OpenStreetMap (free)
- **Places API**: Foursquare (100k free calls/month)
- **Styling**: Tailwind CSS
- **Hosting**: Vercel (free tier)

## 📋 Prerequisites

- Node.js 18+
- A Neon PostgreSQL database (free at [neon.tech](https://neon.tech))
- (Optional) Foursquare API key ([developer.foursquare.com](https://developer.foursquare.com))

## 🏗️ Quick Start

### 1. Clone and Install

```bash
# Install dependencies
npm install

# Or with legacy peer deps if needed
npm install --legacy-peer-deps
```

### 2. Set Up Environment Variables

Create `.env.local`:

```env
# Database (from Neon)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Admin password
NEXT_PUBLIC_ADMIN_PASSWORD=your-secure-password-here

# Optional: Foursquare API
FOURSQUARE_API_KEY=your_foursquare_key_here
```

### 3. Set Up Database

```bash
# Generate migration files
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Open Drizzle Studio to view database
npm run db:studio
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
cheapeats_canberra_v2/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   ├── components/           # React components
│   ├── page.tsx             # Home page
│   ├── map/                 # Map view
│   ├── submit/              # Submission form
│   └── admin/               # Admin panel
├── src/
│   └── lib/
│       ├── db.ts            # Database connection
│       ├── schema/          # Database schemas
│       ├── utils.ts         # Utility functions
│       └── foursquare.ts    # Foursquare API integration
├── drizzle/                 # Database migrations
└── public/                  # Static assets
```

## 🗄️ Database Schema

- **restaurants**: Main restaurant data
- **restaurant_submissions**: Pending restaurant submissions
- **deal_submissions**: Pending deal submissions
- **restaurant_flags**: User-reported issues
- **page_views**: Analytics
- **unique_visitors**: Visitor tracking

## 🚀 Deployment

### Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

Vercel will automatically:
- Build your Next.js app
- Run database migrations (if configured)
- Deploy to edge network

## 📝 Adding Restaurants

### Option 1: User Submissions
Users can submit restaurants via `/submit` page

### Option 2: Admin Entry
Use the admin panel at `/admin` to add restaurants manually

### Option 3: Script (Coming Soon)
Use Foursquare API scripts to bulk import restaurants

## 🔧 Development

### Database Migrations

```bash
# Generate migration after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# View database in browser
npm run db:studio
```

### Adding New Features

1. Update database schema in `src/lib/schema/`
2. Generate migration: `npm run db:generate`
3. Run migration: `npm run db:migrate`
4. Update components/API routes as needed

## 🎨 Customization

### Colors
Edit `tailwind.config.ts` to customize colors

### Styling
All styles use Tailwind CSS - edit components directly

### Map
Leaflet map configuration in `app/components/RestaurantMap.tsx`

## 📚 Documentation

- [BUILD_FROM_SCRATCH.md](./BUILD_FROM_SCRATCH.md) - Complete build guide
- [IMPROVEMENTS_AND_OPTIMIZATIONS.md](./IMPROVEMENTS_AND_OPTIMIZATIONS.md) - Optimization guide
- [MIGRATION_GUIDE_FREE_APIS.md](./MIGRATION_GUIDE_FREE_APIS.md) - API migration guide
- [DATABASE_OPTIMIZATION_GUIDE.md](./DATABASE_OPTIMIZATION_GUIDE.md) - Performance guide

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - feel free to use this project for your own city!

## 💡 Tips

- **Free Tier Limits**: Foursquare allows 100k calls/month - plenty for regular updates
- **Database**: Neon free tier includes 3GB storage - enough for thousands of restaurants
- **Hosting**: Vercel free tier is generous - perfect for this project
- **Maps**: Leaflet + OpenStreetMap has no limits - use freely!

## 🆘 Troubleshooting

### Database Connection Issues
- Check `DATABASE_URL` is correct
- Ensure Neon database is active
- Try connection pooling URL (add `?pgbouncer=true`)

### Map Not Loading
- Ensure Leaflet CSS is imported (done in `globals.css`)
- Check browser console for errors
- Verify `react-leaflet` is installed

### API Errors
- Check environment variables are set
- Verify API keys are valid
- Check rate limits (Foursquare: 100k/month)

## 🎯 Next Steps

1. Add database indexes (see `DATABASE_OPTIMIZATION_GUIDE.md`)
2. Implement caching (Upstash Redis free tier)
3. Add more features (reviews, favorites, etc.)
4. Optimize performance
5. Deploy to production

---

Built with ❤️ for Canberra food lovers

