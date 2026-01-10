import 'dotenv/config';

/**
 * Test what the API actually returns
 */
async function testApiResponse() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/restaurants?hasDeals=true&limit=50&page=1`;
  
  console.log('🔍 Testing API response...');
  console.log(`   URL: ${url}`);
  console.log('');
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('📊 API Response:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Restaurants returned: ${data.restaurants?.length || 0}`);
    console.log(`   Total count: ${data.pagination?.total || 0}`);
    console.log(`   Total pages: ${data.pagination?.totalPages || 0}`);
    console.log(`   Current page: ${data.pagination?.page || 0}`);
    console.log(`   Has next page: ${data.pagination?.hasNextPage || false}`);
    console.log('');
    
    if (data.restaurants && data.restaurants.length > 0) {
      console.log('📋 First 5 restaurants:');
      data.restaurants.slice(0, 5).forEach((r: any, i: number) => {
        console.log(`   ${i + 1}. ${r.name} (ID: ${r.id})`);
      });
    }
    
    if (data.pagination?.total !== 212) {
      console.log('⚠️  WARNING: Expected 212 restaurants, but API returned', data.pagination?.total);
      console.log('   This suggests a filtering issue in the API.');
    }
  } catch (error) {
    console.error('❌ Error testing API:', error);
  }
}

testApiResponse()
  .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
