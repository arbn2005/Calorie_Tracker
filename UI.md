Calorie Tracker: UI/UX Design Doc
Mobile-first web app (PWA) · Theme: The Daily Label · Version 1
1. Design intent
Logging a meal should take under 10 seconds, and the home screen should answer one question at a glance: how is my day going?
Principles
• One number per screen. Each screen has a single hero figure; everything else supports it.
• Thumb first. Every frequent action sits in the bottom 40% of the screen. Targets are at least 44px.
• Calm, not guilt. Going over the goal is information, not failure. No red alarms or scolding copy.
• Fewer taps than a notes app. Recent foods, remembered quantities, and time-based meal guessing do the work.
• Break rules in a few chosen places (see section 11) and follow them everywhere else.
2. Theme: The Daily Label
Every packaged food has a nutrition facts label: thick black rules, tight rows, bold condensed numerals, percentage bars. The app borrows that language, so your whole day looks like one label you fill in as you eat.
Most trackers use progress rings, green gradients and rounded cards. A label-style UI is instantly recognisable, extremely scannable, and fits the subject perfectly.
Signature moves
• The day is a label: an 8px ink rule at the top, 3px rules between meals, 1px hairlines between items.
• Huge condensed calorie numeral as the focal point.
• Macros as thick horizontal bars with the numbers beside them, no pie charts.
• Warm paper background with ink-black type, like printed packaging.
• Over-goal is shown with a diagonal hatch pattern on the bar, never red.
3. Colour
Four working colours plus one accent. Light mode is paper and ink; dark mode inverts it.
Role
Light
Dark
Use
Paper (background)
#F4EFE4
#12110E
Page background
Surface
#FBF8F1
#1C1A16
Sheets, input fields
Ink (text and rules)
#16140F
#F4EFE4
All text, all rules
Muted
#6E675A
#9A927F
Captions, units
Saffron (accent)
#F0A202
#F0A202
Add button, active tab, focus ring
Protein
#3A4FB5
#8C9CFF
Protein bar and chart segment
Carbs
#4C8C4A
#8CC98A
Carbs bar and chart segment
Fat
#D9482B
#FF8A6B
Fat bar and chart segment
Rules:
• Text on saffron is always dark ink (#16140F), in both modes. Never white on saffron.
• Macro colours appear only in bars and charts, nowhere else.
• Colour never carries meaning alone: bars have labels, over-goal has a hatch pattern.
4. Typography
Three fonts, all from Google Fonts. Self-host the .woff2 files so the app looks right offline.
• Barlow Condensed (700, 800): numerals, headings, uppercase labels. This is the label look.
• DM Sans (400, 500, 700): body text and buttons.
• IBM Plex Mono (400): quantities and units ("150 g", "1 katori").
Style
Font
Size / line height
Notes
Hero numeral
Barlow Condensed 800
96 / 0.9
Calories on Today screen
Title
Barlow Condensed 700
32 / 1.1
Screen titles
Section label
Barlow Condensed 700
14 / 1
UPPERCASE, +0.08em tracking
Body
DM Sans 400
16 / 1.4
Food names, copy
Quantity
IBM Plex Mono
14 / 1.3
Units and amounts
Caption
DM Sans 400
13 / 1.3
Muted colour
Use rem units so the layout respects the phone's font size setting.
5. Shape, spacing, layout
• Corners: 2px radius on inputs and buttons, 0 on blocks. Sharp edges are part of the theme.
• Rules: 1px hairline, 3px section rule, 8px heavy rule (top of day only).
• Spacing: 4px base scale: 4, 8, 12, 16, 24, 32. Page margin 16px.
• Shadows: none. Depth comes from rules and the surface colour.
• Laptop: content stays in a centred 480px column so it still looks like the phone layout.
• Safe areas: respect env(safe-area-inset-bottom) for the bottom bar.
6. Navigation
A bottom bar with two tabs and one raised action:
Today · [ + ] · Trends
• The + button is a 64px saffron square that rises above the bar. It is the most reachable and most used control.
• Settings (goal, units, export data) open from a gear icon at the top right of Today. They are used rarely, so they stay out of the bar.
• Adding food opens a bottom sheet over the current screen, not a new page, so you never lose your place.
7. Screens
7.1 Today
┌──────────────────────────┐
│ SUN 8 NOV             ⚙  │
│ ████████████████████████ │  8px rule
│ CALORIES                 │
│ 1,240        of 2,100    │  hero numeral
│ 860 left                 │
│ ▓▓▓▓▓▓▓▓░░░░░░░          │
│ ──────────────────────── │
│ Protein  48 / 90 g  ▓▓░░ │
│ Carbs   160 / 250 g ▓▓▓░ │
│ Fat      42 / 70 g  ▓▓░░ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━ │  3px rule
│ BREAKFAST            420 │
│  Poha          1 plate 310│
│  Chai          1 cup   110│
│ ━━━━━━━━━━━━━━━━━━━━━━━━ │
│ LUNCH                820 │
│  Dal rice      1 plate 820│
│ ┌──────────────────────┐ │
│ │ Protein is 42 g short│ │
│ │ Try eggs, paneer, dal│ │
│ └──────────────────────┘ │
│  Today      [ + ]  Trends│
└──────────────────────────┘
• The hero shows calories left, large; the goal total is small beside it.
• Meals are grouped by rules, not cards. Each item row is: name, quantity in mono, calories right-aligned.
• The nudge card appears only when a nutrient is clearly low, and shows at most one suggestion.
• Tap a row to edit quantity. Swipe left to delete, with a 5-second undo toast.
7.2 Add food (bottom sheet)
1. Sheet opens with recent and frequent foods listed first, search field on top, a camera icon inside the field for barcode scan.
2. Cuisine chips under the search: All · Indian · Italian · Western · Asian · more. Tapping filters results.
3. Tap a food: the sheet shows the quantity step. Calories update live in the hero font as you change amount.
4. Quantity uses a stepper plus unit chips (g, cup, katori, piece, slice). The last-used quantity for that food is pre-filled.
5. Meal is auto-picked from the time of day and can be changed with one tap.
6. A full-width Add button sits at the bottom, above the keyboard.
Fastest path: tap a recent food, tap Add. Two taps.
Barcode scan: camera opens inside the sheet. A result shows the product with a Per serving | Whole packet toggle. Whole packet shows the consequence line: "Whole packet = 540 kcal, 26% of your day."
Manual entry: "Can't find it?" opens four fields: name, calories, protein, carbs, fat. Only name and calories are required.
7.3 Trends
Segmented control at the top: Week | Month. A one-line summary sits under it, for example "Average 1,950 kcal, 150 under your goal."
• Week: seven bars with a dashed goal line. Days over goal use the hatch pattern.
• Month: a calendar grid where each day is a square shaded by percentage of goal.
• Food types: one stacked horizontal bar showing calorie share by food group (grains, vegetables, protein, dairy, sweets, other), with a labelled list beneath.
• Nutrient breakdown: a three-segment bar of protein, carbs and fat share.
• Goal check: one plain line for the selected goal (lose, maintain, gain) comparing the average to the target.
Build charts with plain SVG or CSS. A charting library adds weight the app does not need.
7.4 Settings
Goal type, daily calorie target, units, export and import data, clear data. One scrolling list with hairline separators and no nested pages.
8. Interaction and motion
• On load, the hero number counts up in 400ms and bars fill in 300ms, ease-out. This is the one moment of showiness.
• All other transitions are 150ms.
• Adding food gives a short haptic tick (navigator.vibrate(10) where supported).
• Bottom sheets slide up with drag-to-dismiss.
• Respect prefers-reduced-motion: skip count-up and bar fills.
• Optional delight: long-press + to repeat a previous meal ("Same as yesterday's breakfast").
9. States and feedback
State
Treatment
Empty day
Label with zeros and one line: "Nothing logged yet. Start with breakfast."
Over goal
Hatch pattern on the bar, neutral copy: "240 over. Tomorrow starts fresh."
Offline
Small ink badge: "Offline, saved on this phone." Everything keeps working.
Scan fails
"Couldn't read that code. Try again or enter it manually."
Food not found
Offer manual entry directly under the search results.
Loading
None needed for local data. Avoid spinners entirely.
10. Accessibility
• All text meets WCAG AA contrast on its background.
• Touch targets at least 44 by 44px.
• Focus ring is 3px saffron.
• Dark mode follows the system setting.
• Never rely on colour alone: use labels, numbers and the hatch pattern.
• Charts get a text summary for screen readers.
11. Where we break the rules on purpose
1. Oversized 96px calorie numeral. It ignores a balanced type hierarchy, because one number matters most.
2. Raised + button overlapping the bar. It breaks clean alignment but makes the main action unmissable.
3. Square corners in a world of rounded UI. It gives the app its identity.
4. Dense log rows, generous empty space elsewhere. Density is intentional where scanning matters.
5. Uppercase condensed labels. They cost a little readability but sell the label look.
Anything not on this list follows the principles above. If a new idea breaks a rule, it has to earn a place here.
12. Design tokens
:root {
  --paper: #F4EFE4;
  --surface: #FBF8F1;
  --ink: #16140F;
  --muted: #6E675A;
  --rule: #16140F;
  --saffron: #F0A202;
  --on-accent: #16140F;
  --protein: #3A4FB5;
  --carbs: #4C8C4A;
  --fat: #D9482B;

  --font-display: 'Barlow Condensed', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;

  --radius: 2px;
  --s1: 4px; --s2: 8px; --s3: 12px;
  --s4: 16px; --s6: 24px; --s8: 32px;
  --rule-thin: 1px; --rule-mid: 3px; --rule-heavy: 8px;
  --t-fast: 150ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #12110E;
    --surface: #1C1A16;
    --ink: #F4EFE4;
    --muted: #9A927F;
    --rule: #F4EFE4;
    --protein: #8C9CFF;
    --carbs: #8CC98A;
    --fat: #FF8A6B;
  }
}
13. Build notes for OpenCode
Put this in AGENTS.md at the project root so free models follow the design every session:
## UI rules
- Follow the Daily Label design doc. Use only CSS variables from tokens.css.
- Fonts: Barlow Condensed (numerals, headings), DM Sans (body), IBM Plex Mono (quantities). Self-hosted.
- Never use: Inter, Roboto, gradients, glassmorphism, rounded cards, shadows, emoji icons.
- Corners 2px max. Separate sections with rules, not boxes.
- Mobile first, 480px max content width. Touch targets 44px minimum.
- Over-goal uses a hatch pattern, never red.
- Charts are hand-built SVG/CSS, no chart libraries.
- Every interactive element needs hover, focus and active states.
Suggested build order: tokens.css and a style-guide page, then Today screen, then the Add sheet, then Trends, then Settings. Review each before moving to the next.
