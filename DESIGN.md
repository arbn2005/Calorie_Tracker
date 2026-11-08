Calorie Tracker App: Design and Architecture
A simple web app, installable on a phone and usable on a laptop, that logs what you eat, tracks calories and nutrients, and keeps all data on your device. This doc records the design and the reason behind each choice.
Goals and constraints
The app counts calories and nutrients for one person on a phone or laptop, and it must stay under 1 GB in total after a year of daily logging.
• Log food fast: search by name, scan a barcode, or enter values by hand, then set the quantity.
• Show the day and the trend: today's calories and nutrients, plus the past 7 and 30 days.
• Support many cuisines: Indian, Italian, Western and Chinese first, with room to add more.
• Phone and laptop: one web app (PWA) hosted on Vercel and installable from the browser. No account, no server, no cloud database. Data stays in the browser on each device, and the app works offline after the first load except when looking up an unknown barcode.
• Clean and simple: four screens and one large add button.
• Small: the app and a year of data should take roughly 15–30 MB of browser storage (see the storage budget), far under the 1 GB cap.
• Estimates only: the app gives general guidance and is not medical advice.
Architecture decisions
Each row is one decision, the reason for it, and the option that was passed over.
Area
Decision
Why
Rejected
Platform
Progressive web app (PWA) hosted on Vercel
One codebase for phone and laptop, installable from Chrome, free HTTPS, no Android Studio needed
Native Android: needs Android Studio and a separate build
Frontend
React with Vite and TypeScript, responsive CSS
Fast to build, produces static files that Vercel hosts
Next.js: works, but its server features go unused
Structure
Screen components plus one data module that owns all database access
Simple, and screens never touch the database directly
Heavy state-management setup: too much for this size
Storage
IndexedDB through Dexie, in the browser only
Offline, private, no running costs, plenty of space
Cloud database: needs login and network
Persistence
Request persistent storage and offer JSON/CSV export and import
Browsers can clear site data, so backup matters
Relying on default storage
Offline
Service worker caches the app files and the seed food list
Opens and searches with no network after the first load
Online-only app
Food data
Seed JSON bundled with the app, plus custom foods and cached barcode results
Search works offline and covers home-style dishes
API only: misses regional and home-cooked food
Barcode
Browser BarcodeDetector where supported, html5-qrcode or ZXing as fallback
Decodes on the device with no server; fallback covers browsers without it
Server-side decoding: needs uploads and a backend
Product lookup
Open Food Facts, only for barcodes not already stored
Free, covers many packaged products; result is saved so it is fetched once
Paid nutrition API: usage terms and cost
History
Each log entry stores a copy of its nutrient totals
Past days never change when a food is edited, and charts need no joins
Recalculate from the food at read time
Images
No photos stored
Product photos are the biggest risk to the size cap
Caching product images
Charts
Chart.js (or Recharts) for all nine charts
Ring, donut, bar and line charts are built in
Hand-drawn charts: more work
Language
All text in translation files from the start
Adding Tamil or Chinese later is only new files
Hard-coded text: painful to retrofit
System at a glance
Screens only talk to the data layer, which reads and writes IndexedDB in the browser. A service worker caches the app files so it also opens offline. The dashed box is the only network call, and its result is saved locally so it is fetched once.
Storage budget
After one year of daily logging the app should use roughly 15–30 MB of browser storage, a few percent of the 1 GB limit. All sizes below are approximate estimates; check them in your browser's storage inspector.
Part
Estimated size
Basis
App files in the offline cache
1–3 MB
React, Chart.js, Dexie and a barcode library, minified
Seed list in the offline cache
5–10 MB
The bundled JSON file, stored by the service worker
Seed food database in IndexedDB
5–10 MB
About 10,000 foods with aliases and serving units, around 1 KB each
Foods saved from barcode scans
Under 1 MB per 1,000 products
About 1 KB each, no images
Log entries for one year
1–2 MB
About 10 entries a day for 365 days, around 250 bytes each, plus indexes
Total after one year
About 15–30 MB
Ten years of logs would add only about 20 MB
Three rules keep it small:
1. Store no photos. Show a text-only product page.
2. Keep only the most recent 2,000 scanned products that you have not logged. Anything you have logged stays.
3. Show a "Storage used" line on the Profile screen, read from the browser's storage estimate, so growth is visible.
Data model
Five IndexedDB stores hold everything. Nutrient values on FoodItem are per 100 g (sodium in mg, the rest in g, calories in kcal).
Table
Columns
Notes
UserProfile
age, sex, heightCm, weightKg, activityLevel, goal, dietType
One row. goal is lose, maintain or gain. dietType is vegetarian, non-vegetarian or vegan, so hints fit the person
FoodItem
id, name, barcode, cuisine, category, source, kcal, protein, carbs, fat, fiber, sugar, sodium
source is seed, scanned or custom. category drives the food-type charts. barcode is indexed
FoodAlias
foodId, name, language
One food, many names, e.g. curd, yogurt, thayir. name is indexed for search
ServingUnit
foodId, unitName, grams
idli, slice, katori, cup, plate, packet. The whole-packet total uses the packet row
LogEntry
id, foodId, foodName, category, quantityG, mealType, loggedAt, kcal, protein, carbs, fat, fiber, sugar, sodium
The nutrient columns are this entry's totals, copied when logged
History is a sum grouped by day, written here as SUM(kcal) GROUP BY date. Home recipes are saved as custom FoodItem rows with a per-serving ServingUnit, so they need no extra tables.
Screens
Four screens keep the app uncluttered. Each has one obvious next action.
1. Today: a calorie ring (eaten vs. goal), a macro donut, today's meals grouped by breakfast, lunch, dinner and snacks, and one large "+" button.
2. Add food: a search box, a scan button and a manual tab. Then a quantity field (grams, a serving unit or "whole packet") with the totals updating as you type.
3. History: a 7-day / 30-day toggle with three tabs: Calories, Foods and Nutrients.
4. Profile and goal: body stats, activity level, goal, diet type, "Storage used" and backup export and import.
Charts
Nine charts answer two questions: what kinds of food you eat, and which nutrients you get. All are drawn from LogEntry rows, so none need extra storage.
Chart
Type
Shows
Where
Calorie ring
Ring
Calories eaten against today's goal
Today
Macro split
Donut
Share of calories from protein, carbs and fat
Today
Calories per day
Bars with a goal line
Each day of the last 7 or 30 days, plus the average
History, Calories
Nutrient targets
Horizontal bars
Percent of target for protein, carbs, fat, fiber, sugar and sodium
History, Nutrients
Nutrient trend
Line
One chosen nutrient across the period
History, Nutrients
Food types
Donut
Share of calories by category: grains, vegetables, fruit, protein foods, dairy, sweets and snacks, drinks, oils
History, Foods
Cuisine mix
Bars
Calories by cuisine: Indian, Italian, Western, Chinese and others
History, Foods
Meal timing
Bars
Calories by breakfast, lunch, dinner and snacks
History, Foods
Top foods
Horizontal bars
The 10 foods that gave the most calories
History, Foods
All nine charts can use one library such as Chart.js, which has ring, donut, bar and line charts built in.
Goal and nutrient logic
The app works out a daily calorie target from the profile, then compares each nutrient with a target. These are common estimates, not medical advice.
1. BMR (Mifflin-St Jeor): 10 × kg + 6.25 × cm − 5 × age + 5 for men, or − 161 for women.
2. TDEE = BMR × activity factor, from 1.2 (sedentary) to 1.725 (very active).
3. Daily target: lose = TDEE − 300 to 500, maintain = TDEE, gain = TDEE + 250 to 500.
4. Calorie floor: never suggest less than a minimum. About 1,200 kcal for women and 1,500 kcal for men is commonly used; confirm this against a reputable source before release.
5. Macro targets: protein 1.6–2.2 g/kg when losing or gaining and about 0.8–1 g/kg when maintaining; fat 25–30% of calories; the rest carbs.
6. Other nutrients: fiber about 14 g per 1,000 kcal, added sugar under 10% of calories, sodium under 2,300 mg a day.
7. "What you missed": compare today with the targets and show one short hint, such as "Protein is 30 g short." Suggest foods that match the diet type, for example dal or paneer for vegetarians, eggs or chicken otherwise.
Food data and cuisines
Generic APIs are weak on regional and home-style dishes such as sambar, idiyappam, risotto or Chinese fried rice, so the app ships its own food list.
• Seed database: a JSON file bundled with the app and loaded into IndexedDB on first visit, so search works offline.
• Sources: IFCT 2017 for Indian foods, USDA FoodData Central for Italian, Western and Chinese foods, and Open Food Facts for packaged products. Common dishes can be added by hand.
• One file per cuisine: a new cuisine is a new data file and a cuisine tag, with no code change.
• Dish-level entries: cooked dishes such as idli, dosa, biryani, pasta, pizza, burger, noodles and momos carry calories per piece or per serving, not just per 100 g.
• Serving units: idli, chapati, pizza slice, katori, cup, plate, packet. Calories = quantity × grams per unit ÷ 100 × kcal per 100 g.
• Recipe builder: the user combines ingredients ("2 cups rice + 1 tbsp oil + dal") and saves the per-serving result as a custom food.
• Names: each food has aliases in several languages (curd, thayir, தயிர், 酸奶), and search should use Unicode normalization. Tamil or Chinese screens only need an extra translation file per language.
Barcode scan flow
Packaged foods carry a barcode (EAN/UPC) rather than a QR code. The scanner reads both.
1. The user taps scan and the browser asks for camera permission. This needs HTTPS, which Vercel provides.
2. The camera preview opens and the barcode is decoded in the browser, using the built-in BarcodeDetector where available and a JavaScript library otherwise.
3. The app looks the barcode up in IndexedDB.
4. If it is missing and the device is online, the app asks Open Food Facts and saves the result.
5. If it is still missing, the manual form opens with the barcode filled in.
6. The result page shows per-100 g values and the "If you eat the whole packet" total: per-100 g × packet weight ÷ 100. If the packet weight is unknown, it asks for it.
7. The user confirms the quantity and the entry is logged.
Risks and open questions
• Licenses: Open Food Facts data is under ODbL, which needs attribution and has share-alike terms. USDA FoodData Central is public domain. Check the IFCT terms before bundling it.
• Barcode coverage: it varies by country, so the manual fallback is essential.
• Data quality: crowd-sourced packaged-food values can be wrong or incomplete, so show the source on the product page.
• Browser support: BarcodeDetector is not available in every browser, so the fallback library is required. Test scanning in your phone's browser.
• Browser storage can be cleared: clearing site data or very low storage can wipe the database. Request persistent storage and remind the user to export a backup regularly.
• No sync: the phone and the laptop keep separate data until a backend is added.
• Calorie floor and targets: confirm the numbers in the goal logic before release.
Build order
1. Create a Vite + React project, deploy the empty app to Vercel, and add the PWA manifest and service worker.
2. Set up the Dexie database, the profile and the goal calculation.
3. Manual add and the Today screen with the ring and macro donut.
4. Seed food database and name search with aliases and serving units.
5. Barcode scan, Open Food Facts lookup and the whole-packet view.
6. History tabs and the remaining charts.
7. Missed-nutrient hints, export and import, storage line and UI polish (spacing, empty states, dark mode).
