/** @type {import('tailwindcss').Config} */
module.exports = {
  // Указываем пути ко всем файлам, где могут использоваться классы Tailwind.
  // Это позволяет Tailwind удалять неиспользуемые стили в продакшн-сборке.
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      // Здесь мы расширяем стандартную тему Tailwind.
      // Например, добавляем кастомные анимации, которые вы определили в index.css.
      animation: {
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
      },
      // Здесь же можно было бы добавить свои цвета, шрифты, брейкпоинты и т.д.
      // colors: {
      //   'brand-blue': '#1992d4',
      // },
    },
  },
  // Плагины, которые расширяют функциональность Tailwind.
  plugins: [],
}
