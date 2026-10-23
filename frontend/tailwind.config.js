/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fnbTeal: '#009688',
        fnbAmber: '#f59e0b',
      },
    },
  },
  plugins: [],
};
