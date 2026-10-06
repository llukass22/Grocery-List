# Basket

A mobile-first grocery list built with HTML, CSS, and JavaScript. No build step or dependencies.

Run `npm start` and open http://127.0.0.1:5187. Run `npm run check` to check JavaScript syntax.

- Add free-text items and choose quantities from 1–10.
- Toggle dark mode in the header; your preference is saved on this device. The first visit follows your system theme.
- Tap an item to check or uncheck it; checked items stay on the list.
- Remove individual items with the × button.
- Clear the list when every item is checked.
- Select items and quantities across all eight categories, then add them together.
- Lists are saved in this browser's local storage and synchronized between tabs. Storage is device-local; lists do not sync between devices.

The static app is in `dist`. Serve that folder with any static web server. Google Fonts is optional; the app falls back to system fonts if unavailable.
