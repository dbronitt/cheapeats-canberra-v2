import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          blue: '#3b82f6',
          purple: '#9333ea',
          canberra: {
            blue: '#003366',
            gold: '#ffcc00',
          },
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)',
        'gradient-canberra': 'linear-gradient(135deg, #003366 0%, #ffcc00 100%)',
      },
    },
  },
  plugins: [],
};
export default config;

