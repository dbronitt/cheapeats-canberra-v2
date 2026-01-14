export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-4">CheapEats Canberra</h3>
            <p className="text-gray-300">
              Your guide to the best restaurant deals, happy hours, and weekly specials in Canberra.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-gray-300">
              <li><a href="/" className="hover:text-white">Home</a></li>
              <li><a href="/map" className="hover:text-white">Map View</a></li>
              <li><a href="/submit" className="hover:text-white">Submit Restaurant/Deals</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">About</h4>
            <p className="text-gray-300 mb-4">
              Community-driven platform helping Canberrans discover great food at great prices.
            </p>
            <div>
              <a 
                href="https://ko-fi.com/dbronitt" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#13C3FF] hover:bg-[#0ea5e9] text-white rounded-lg transition-colors font-medium"
              >
                <span>☕</span>
                <span>Buy me a coffee</span>
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; {new Date().getFullYear()} CheapEats Canberra. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

