/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f4f5f2',
          100: '#e9ebe5',
          200: '#d3d7cb',
          300: '#bdc3b1',
          400: '#a7af97',
          500: '#919b7d', // Base color (98, 111, 71)
          600: '#7a8568',
          700: '#636f53',
          800: '#4c593e',
          900: '#354329',
        },
        // Modern neutral palette
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
      },
    },
  },
  plugins: [],
} 