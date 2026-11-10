# Tajweed Flashcards

A flashcard app for the Tajweed rules. There's nothing to install: open `index.html` (the home page) in a browser, or host the folder on any static web host (GitHub Pages, Netlify and so on).

## Features
- Tap the card (or press Space) to flip it, then mark it **Got it** or **Still learning**.
- Shows your progress through the set, with counts of known cards and cards still being learned.
- **Shuffle** mixes the cards you haven't answered yet. **Undo** takes back your last answer.
- When a set ends you can **Redo mistakes only**. This round uses only the cards you missed, and you can repeat it until none are left.
- **Optional sign-in.** Add a student by name to save their progress: what they got right and wrong on each card, their finished sets, and which cards need more work. Guests can use everything. Guest progress lasts until the tab is closed, and it's kept if the guest signs in partway through.
- Keyboard: Space flips the card, → means got it, ← means still learning, Z undoes, S shuffles.

## Updating the questions
The cards come from `cards.js`, which is generated from the spreadsheet. Once you've edited the spreadsheet, run:

```bash
python tools/import_spreadsheet.py "C:/Users/user/Downloads/Tajwid Rules Test.xlsx"
```

The script reads the first sheet that has a **Question** header and an **Answer** column. Any question with an empty answer becomes a card with a blank back. Cards that aren't in the spreadsheet yet, such as the current blank card 76, are listed in `tools/extra_cards.json` and added to the end of the set. Once that question is in the spreadsheet, delete its entry from that file. Each card's ID comes from its question text, so students keep their saved progress for a question as long as you don't reword it.

## About sign-in
Student profiles are saved in the browser on the device being used. That suits a classroom computer or a student's own device. Profiles don't sync between devices, and there's no password. Real accounts that work on any device would need a hosted backend such as Firebase or Supabase.
