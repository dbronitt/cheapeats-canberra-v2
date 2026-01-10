import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-white/95 backdrop-blur-md shadow-lg sticky top-0 z-50 border-b border-gray-200/50">
      <div className="container mx-auto px-4 py-4">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:scale-105 transition-transform duration-200 group">
            <div className="relative w-10 h-10 flex-shrink-0">
              <Image
                src="/logo.svg"
                alt="CheapEats Canberra Logo"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              CheapEats Canberra
            </span>
          </Link>
          <div className="flex gap-6">
            <Link href="/" className="text-gray-700 hover:text-blue-600 transition-colors font-medium relative group">
              Home
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link href="/map" className="text-gray-700 hover:text-blue-600 transition-colors font-medium relative group">
              Map
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link href="/submit" className="text-gray-700 hover:text-blue-600 transition-colors font-medium relative group">
              Submit
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 group-hover:w-full transition-all duration-300"></span>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

