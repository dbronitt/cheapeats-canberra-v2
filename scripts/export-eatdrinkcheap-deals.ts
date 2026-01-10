import * as fs from 'fs';
import * as path from 'path';

interface Deal {
  restaurantName: string;
  dealTitle: string;
  description: string;
  days: string;
  hours: string;
  suburb: string;
  address: string;
  price?: string;
  updated?: string;
  website?: string;
}

// Parse the deals from the provided text
const deals: Deal[] = [
  {
    restaurantName: 'Carlotta',
    dealTitle: 'Aperitivo Hour',
    description: 'Selection of $9.5 bites, including Arancini Bolognese, a Mozzarella & Basil Flatbread, Polenta Chips with Parmigiano Reggiano, and more. To match, you\'ll find a lineup of $15 drinks, ranging from a Limoncello Spritz to the Sicilian Cala Cala Nero d\'Avola.',
    days: 'Friday and Saturday',
    hours: '4pm to 6pm',
    suburb: 'Canberra',
    address: '20 Scotts Crossing Canberra',
    updated: 'Updated 2 weeks ago, but still check'
  },
  {
    restaurantName: 'Carlotta',
    dealTitle: 'Aperitivo Hour',
    description: 'Selection of $9.5 bites, including Arancini Bolognese, a Mozzarella & Basil Flatbread, Polenta Chips with Parmigiano Reggiano, and more. To match, you\'ll find a lineup of $15 drinks, ranging from a Limoncello Spritz to the Sicilian Cala Cala Nero d\'Avola.',
    days: 'Monday to Thursday, Sunday',
    hours: '5pm to 6pm',
    suburb: 'Canberra',
    address: '20 Scotts Crossing Canberra',
    updated: 'Updated 2 weeks ago, but still check'
  },
  {
    restaurantName: 'The RUC',
    dealTitle: 'Cheap Taps',
    description: 'Get the good times rolling after work with 12 Taps for $5',
    days: 'Monday to Friday',
    hours: '4pm to 5pm',
    suburb: 'Turner',
    address: '54 McCaughey St Turner',
    price: '$5',
    updated: 'Updated 2 weeks ago, but still check'
  },
  {
    restaurantName: 'The Duxton',
    dealTitle: 'Schooners & Wines Happy Hour',
    description: '$6 selected schooners & $6 glasses of house red, white & sparkling',
    days: 'Monday to Friday',
    hours: '3pm to 5pm',
    suburb: 'O\'Connor',
    address: '8 Macpherson St O\'Connor',
    price: '$6',
    updated: 'Updated 2 months ago, but still check'
  },
  {
    restaurantName: 'Dickson Taphouse',
    dealTitle: 'Taps Wines Spirits',
    description: 'Selected beers on tap, select spirits and wines all $7',
    days: 'Monday to Saturday',
    hours: '4pm to 6pm',
    suburb: 'Dickson',
    address: '30 Woolley St Dickson',
    price: '$7',
    updated: 'Updated 3 months ago and it\'s silly season - always check'
  },
  {
    restaurantName: 'Helix Bar & Dining',
    dealTitle: 'Beer & Wine Happy Hour',
    description: 'Choose your tipple with $8 house wines and beers and take your evenings to new heights where every sip comes with amazing atrium views.',
    days: 'Monday to Friday',
    hours: '4pm to 6pm',
    suburb: 'Canberra',
    address: '1 Rogan St Canberra',
    price: '$8',
    updated: 'Updated 5 months ago and it\'s silly season - always check'
  },
  {
    restaurantName: 'The Valley Pub',
    dealTitle: 'Happy Hour',
    description: 'The Valley Pub invites guests to enjoy $5 schooners and house wines.',
    days: 'Thursday and Friday',
    hours: '4pm to 6pm',
    suburb: 'Wanniassa',
    address: '9/38 Gartside Street Wanniassa',
    price: '$5',
    updated: 'Updated 1 week ago, but still check'
  },
  {
    restaurantName: 'The Southern Pub',
    dealTitle: '20% off Happy Hour',
    description: '20% discount on beers and house wines for happy hour',
    days: 'Monday to Thursday',
    hours: '4:30pm to 6pm',
    suburb: 'Phillip',
    address: '4 Irving Street Phillip',
    updated: 'Updated 4 months ago and it\'s silly season - always check'
  },
  {
    restaurantName: 'Loquita',
    dealTitle: 'Taco Tuesday',
    description: 'Loquita\'s famous taco Tuesday $4 all night (down from $7)',
    days: 'Tuesday',
    hours: '5pm to 9pm',
    suburb: 'Canberra',
    address: '17 Garema Place Canberra',
    price: '$4',
    updated: 'Updated 4 months ago and it\'s silly season - always check'
  },
  {
    restaurantName: 'Loquita',
    dealTitle: 'Beer Spirits Cocktails',
    description: '$7.50 balter cerveza and $7.50 house spirits, $15.50 frozen margaritas $15 tommy\'s margaritas, $15 little crazy girl and $15 espresso yourself',
    days: 'Tuesday to Sunday',
    hours: '5pm to 7pm',
    suburb: 'Canberra',
    address: '17 Garema Place Canberra',
    price: '$7.50',
    updated: 'Updated 4 months ago and it\'s silly season - always check'
  },
  {
    restaurantName: 'Hopscotch',
    dealTitle: 'Hoppy hour',
    description: 'Cheap drinks, good vibes, and zero excuses to miss out. Guests can enjoy beers, wines and ciders for $7',
    days: 'Wednesday',
    hours: '4pm to 6pm',
    suburb: 'Braddon',
    address: '5 Lonsdale Street Braddon',
    price: '$7',
    updated: 'Updated 4 months ago and it\'s silly season - always check'
  }
];

// Convert to CSV
function escapeCSV(value: string | undefined): string {
  if (!value) return '';
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function generateCSV(deals: Deal[]): string {
  const headers = [
    'Restaurant Name',
    'Deal Title',
    'Description',
    'Days',
    'Hours',
    'Suburb',
    'Address',
    'Price',
    'Updated',
    'Website'
  ];

  const rows = deals.map(deal => [
    escapeCSV(deal.restaurantName),
    escapeCSV(deal.dealTitle),
    escapeCSV(deal.description),
    escapeCSV(deal.days),
    escapeCSV(deal.hours),
    escapeCSV(deal.suburb),
    escapeCSV(deal.address),
    escapeCSV(deal.price),
    escapeCSV(deal.updated),
    escapeCSV(deal.website)
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
}

// Main execution
try {
  const csvContent = generateCSV(deals);
  const outputPath = path.join(process.cwd(), 'EATDRINKCHEAP deals.csv');
  
  fs.writeFileSync(outputPath, csvContent, 'utf-8');
  
  console.log(`✅ Successfully exported ${deals.length} deals to: ${outputPath}`);
  console.log(`\nDeals exported:`);
  deals.forEach((deal, index) => {
    console.log(`${index + 1}. ${deal.restaurantName} - ${deal.dealTitle} (${deal.days} ${deal.hours})`);
  });
} catch (error) {
  console.error('Error exporting deals:', error);
  process.exit(1);
}
