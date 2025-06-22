/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class', // перемикання через клас 'dark' на <html>
  theme: {
   extend: {
      height: {
        'screen-minus-header': 'calc(100vh - 80px)', // якщо треба таку висоту часто
      },
    },
  },
  plugins: []
};

