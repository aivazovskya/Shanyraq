/** @type {import('tailwindcss').Config} */

// "Дом с открытым небом" palette (see docs/design/direction.html).
// `emerald` and `sky` keep their Tailwind names so existing classes pick up the
// brand colour (Tengri blue); `slate` is tinted towards the night-sky ink.
const tengri = {
  50: '#EAF4FB',
  100: '#D9ECF7',
  200: '#B7D9EE',
  300: '#8DC1E3',
  400: '#5FA5D6',
  500: '#3A88C2',
  600: '#1A6BAA',
  700: '#14568A',
  800: '#104469',
  900: '#0E3550',
  950: '#0A2638',
};

const ink = {
  50: '#F4F7F9',
  100: '#EAF0F3',
  200: '#DCE4E9',
  300: '#C3CFD7',
  400: '#8FA2B0',
  500: '#667C8C',
  600: '#4F6372',
  700: '#36495A',
  800: '#17303F',
  900: '#0F2231',
  950: '#08141E',
};

module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-onest)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geologica)', 'var(--font-onest)', 'system-ui', 'sans-serif'],
      },
      colors: {
        emerald: tengri,
        sky: tengri,
        slate: ink,
        sun: { 400: '#F4B63D', 500: '#E9A21B' },
        steppe: {
          50: '#E8F5EF',
          100: '#DDF0E8',
          200: '#A9D8C5',
          400: '#4CC49A',
          600: '#23765A',
          700: '#1A5C46',
          800: '#154A39',
          950: '#0F3A2D',
        },
        shanyraq: {
          50: '#EAF4FB',
          100: '#D9ECF7',
          500: '#1A6BAA',
          600: '#14568A',
          700: '#104469',
          900: '#0A2638',
          gold: '#F4B63D',
        },
      },
    },
  },
  plugins: [],
};
